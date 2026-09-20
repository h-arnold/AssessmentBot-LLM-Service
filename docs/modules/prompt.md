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
- **`buildMessage()`:** Abstract method returning `LlmPayload`

### Prompt Implementations

| Class         | File                         | Behaviour                                                                                                                               |
| ------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `TextPrompt`  | `src/prompt/text.prompt.ts`  | Standard text tasks. Uses `text.user.prompt.md` template.                                                                               |
| `TablePrompt` | `src/prompt/table.prompt.ts` | Table-based tasks. Uses `table.user.prompt.md` template.                                                                                |
| `ImagePrompt` | `src/prompt/image.prompt.ts` | Multimodal tasks. Overrides `buildMessage()` to handle file-based and data URI images. No user template — images are embedded directly. |

### PromptFactory

**Location:** `src/prompt/prompt.factory.ts`

Instantiates the correct `Prompt` subclass based on `taskType` from the DTO.

**Template file mapping:**

| Task Type | System Prompt            | User Template                   |
| --------- | ------------------------ | ------------------------------- |
| TEXT      | `text.system.prompt.md`  | `text.user.prompt.md`           |
| TABLE     | `table.system.prompt.md` | `table.user.prompt.md`          |
| IMAGE     | `image.system.prompt.md` | None (images embedded directly) |

**Creation flow:**

1. Extracts `referenceTask`, `studentTask`, `emptyTask` from the DTO
2. Selects system prompt and user template files based on `taskType`
3. Loads the system prompt markdown file from `src/prompt/templates/`
4. Instantiates the appropriate prompt subclass

### Multi-Part Payload Construction

**Location:** `src/prompt/prompt.base.ts`

`buildMultiPartPromptPayload(input: unknown)` is the sole construction boundary for `MultiPartPromptPayload` conversations. It parses the input against `MultiPartPromptPayloadSchema` and returns the branded parsed object, or throws a raw `ZodError`. Routing and the provider LLM services consume the branded payload without re-parsing; the schema brand means a raw literal is rejected at compile time. The legacy prompt subclasses above do not produce multi-part payloads — that remains V2 workstream work. See [LLM Module](llm.md#construction-time-validation).

### ImagePrompt Security Measures

- **Path traversal protection:** Blocks `..` sequences in filenames
- **Directory restriction:** Only allows access to authorised image directories
- **MIME type validation:** Enforces `ALLOWED_IMAGE_MIME_TYPES` from config
- **Base64 conversion:** Supports both file-based and data URI images

## How to Extend (Adding a New Prompt Type)

1. **DTO:** Add the new type to `TaskType` enum and add a schema to the `z.discriminatedUnion` in `create-assessor.dto.ts`.
2. **Prompt class:** Create a new file extending `Prompt` (e.g., `src/prompt/exam-question.prompt.ts`).
3. **Templates:** Add `*.system.prompt.md` and `*.user.prompt.md` in `src/prompt/templates/`.
4. **Factory:** Add cases in `PromptFactory.getPromptFiles()` and `PromptFactory.instantiatePrompt()`.
5. **Tests:** Add unit, integration, and E2E tests.

## Dependencies

- **mustache** — Template rendering engine
- **@nestjs/common** — NestJS core and logging
- **zod** — Input validation schemas
- **fs/promises, path** — Template and image file operations

## Related Documentation

- [Assessor Module](assessor.md)
- [LLM Module](llm.md)
- [Prompt System](../prompts/README.md)
- [Prompt Templates](../prompts/templates.md)
- [Configuration Guide](../configuration/environment.md)
