# Prompt Module

The Prompt Module (`src/prompt/`) provides prompt generation and management services, implementing a factory pattern to create task-specific prompts for LLM assessment requests.

## Module Structure

```typescript
@Module({
  imports: [ConfigModule],
  providers: [PromptFactory, Logger],
  exports: [PromptFactory],
})
export class PromptModule {}
```

## Key Components

### Prompt (Abstract Base Class)

**Location:** `src/prompt/prompt.base.ts`

Provides common functionality for all prompt implementations:

- **Input validation:** Uses Zod `PromptInputSchema` (`referenceTask`, `studentTask`, `emptyTask` — all strings)
- **Template rendering:** `Mustache.render()` for variable substitution
- **`buildMessage()`:** Default implementation returning a legacy `LlmPayload` for text and table prompts

### MultiPartPrompt (Abstract Multi-Part Base Class)

**Location:** `src/prompt/multi-part.prompt.base.ts`

Extends `Prompt` and adds conversation-style multi-part assessment:

- **`buildMessage()`:** Overrides the base method to return a branded `MultiPartPromptPayload`. It assembles an optional leading system message and exactly one user message.
- **System message:** Included verbatim as one text part when a system prompt is supplied (including an empty string); omitted when no system prompt is defined.
- **`buildUserParts()` hook:** A protected abstract method that subclasses implement to supply ordered user content parts. The base never parses images or invents task-specific content.
- **Cache key:** Derived server-side from the reference task via `buildPromptCacheKey()`, using the same `sha256(referenceTask)` rule as the legacy payloads.
- **Single validation boundary:** The assembled conversation is validated exactly once through `buildMultiPartPromptPayload()`. Empty or invalid parts fail there as a raw `ZodError`.
- **Stateless:** Every build derives parts afresh from the validated instance inputs; no conversation history or accumulated turns are retained.

The low-level `MultiPartPromptPayloadSchema` also accepts a caller-supplied `promptCacheKey` for trusted callers, but this base always derives the key server-side. See [LLM Module](llm.md#multi-part-cache-key-contract) for the key contract.

`PromptFactory` always supplies the image system template, so a factory-created `ImagePrompt` emits exactly two messages: one system message with the template text, then one user message with six parts — the reference, template, and student labels, each immediately followed by its corresponding image.

### Prompt Implementations

| Class         | File                         | Behaviour                                                                                                                          |
| ------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `TextPrompt`  | `src/prompt/text.prompt.ts`  | Standard text tasks. Uses the inherited `Prompt.buildMessage()` and the `text.user.prompt.md` template.                            |
| `TablePrompt` | `src/prompt/table.prompt.ts` | Table-based tasks. Uses the inherited `Prompt.buildMessage()` and the `table.user.prompt.md` template.                             |
| `ImagePrompt` | `src/prompt/image.prompt.ts` | Extends `MultiPartPrompt`. Parses data URI inputs into six ordered reference/template/student label-image parts. No user template. |

### PromptFactory

**Location:** `src/prompt/prompt.factory.ts`

Instantiates the correct `Prompt` subclass based on `taskType` from the DTO.

**Template file mapping:**

| Task Type | System Prompt            | User Template                                    |
| --------- | ------------------------ | ------------------------------------------------ |
| TEXT      | `text.system.prompt.md`  | `text.user.prompt.md`                            |
| TABLE     | `table.system.prompt.md` | `table.user.prompt.md`                           |
| IMAGE     | `image.system.prompt.md` | None — user message built from label/image parts |

**Creation flow:**

1. Extracts `referenceTask`, `studentTask`, `emptyTask` from the DTO
2. Selects system prompt and user template files based on `taskType`
3. Loads the system prompt markdown file from `src/prompt/templates/`
4. For IMAGE tasks, converts Buffer inputs to `data:<mimeType>;base64,<data>` URIs first, detecting each MIME type with `detectBufferMime()` and throwing `BadRequestException` when detection fails
5. Instantiates the appropriate prompt subclass

### Multi-Part Payload Construction

**Location:** `src/prompt/prompt.base.ts`

`buildMultiPartPromptPayload(input: unknown)` is the sole construction boundary for `MultiPartPromptPayload` conversations. It parses the input against `MultiPartPromptPayloadSchema` and returns the branded parsed object, or throws a raw `ZodError`. Routing and the provider LLM services consume the branded payload without re-parsing; the schema brand means a raw literal is rejected at compile time.

`ImagePrompt` is the first producer of multi-part payloads. Text and table prompts continue to produce legacy `LlmPayload` objects. See [LLM Module](llm.md#construction-time-validation).

Construction-time validation enforces:

- Standard padded base64 for image data. Exactly 1 MiB (1,048,576 bytes) decoded is accepted per image; 1 MiB plus one byte is rejected. There is no aggregate limit across the three images.
- At least one part per message, at least one non-system message, and text-only system messages.

A malformed data URI still throws `BadRequestException` with the existing message. Once data URIs are extracted, invalid base64, invalid structure, or an oversized image fails as a raw `ZodError`, which the global exception filter maps to HTTP 500 (sanitised in production). With the default 1 MiB upload limit, `ImageValidationPipe` rejects an oversized individual image earlier with HTTP 400; if operators configure a larger upload limit, images above 1 MiB that previously reached a provider now fail construction.

### ImagePrompt Data Handling

- **Data URI parsing only:** Extracts MIME type and base64 data from `data:image/<subtype>;base64,<data>` strings. It performs no file loading and no filesystem access.
- **Validation ownership:** Malformed data URIs, base64 defects, per-image size limits and upstream `ImageValidationPipe` behaviour all follow the shared construction rules above.

The migration to labelled multi-part messages does not change the system template's examples, rubric, or JSON output structure, and it does not establish score-quality gains — it establishes transport correctness.

## How to Extend (Adding a New Prompt Type)

1. **DTO:** Add the new type to `TaskType` enum and add a schema to the `z.discriminatedUnion` in `create-assessor.dto.ts`.
2. **Prompt class:** Create a new file extending `Prompt` (e.g., `src/prompt/exam-question.prompt.ts`). For conversation-style tasks requiring ordered mixed content, extend `MultiPartPrompt` and implement the `buildUserParts()` hook instead.
3. **Templates:** Add `*.system.prompt.md` and `*.user.prompt.md` in `src/prompt/templates/`.
4. **Factory:** Add cases in `PromptFactory.getPromptFiles()` and `PromptFactory.instantiatePrompt()`.
5. **Tests:** Add unit, integration, and E2E tests.

## Dependencies

- **mustache** — Template rendering engine
- **@nestjs/common** — NestJS core and logging
- **zod** — Input validation schemas
- **fs/promises, path** — Markdown template file operations (via `readMarkdown()`)

## Related Documentation

- [Assessor Module](assessor.md)
- [LLM Module](llm.md)
- [Prompt System](../prompts/README.md)
- [Prompt Templates](../prompts/templates.md)
- [Configuration Guide](../configuration/environment.md)
