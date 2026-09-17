# LLM Module

The LLM Module (`src/llm/`) provides Large Language Model integration services, implementing an abstract service layer that dispatches to one of two concrete provider implementations — Google Gemini (`GeminiService`) or Mistral AI (`MistralService`) — through a routing service (`RoutingLLMService`) bound to the `LLM_SERVICE_TOKEN`. Both task-specific model settings default to Mistral Small (`mistral-small-latest`).

## Module Structure

```typescript
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [
    GeminiService,
    MistralService,
    { provide: LLM_SERVICE_TOKEN, useClass: RoutingLLMService },
  ],
  exports: [LLM_SERVICE_TOKEN],
})
export class LlmModule {}
```

## Key Components

### LLMService (Abstract Base Class)

**Location:** `src/llm/llm.service.interface.ts`

Abstract base class providing the `send(payload: LlmPayload): Promise<LlmResponse>` interface and common retry logic. Implementations must provide `_sendInternal()`. `LlmPayload` is the union of `StringPromptPayload`, `ImagePromptPayload`, and `MultiPartPromptPayload`; the multi-part schemas live in `src/llm/multi-part-prompt.schema.ts` and are re-exported from this module.

### GeminiService (Concrete Implementation)

**Location:** `src/llm/gemini.service.ts`

Implements Google Gemini-specific functionality via the `@google/genai` client.

### MistralService (Concrete Implementation)

**Location:** `src/llm/mistral.service.ts`

Implements Mistral AI-specific functionality via the `@mistralai/mistralai` client.

### RoutingLLMService (Router / Dispatcher)

**Location:** `src/llm/routing-llm.service.ts`

Resolves the provider for each configured model (`DEFAULT_TEXT_TABLE_MODEL` / `DEFAULT_IMAGE_MODEL`) once at construction and binds `LLM_SERVICE_TOKEN` to itself via the module provider above. On `send()`, it normalises the payload, authoritatively sets `payload.model` and `payload.reasoningEffort` (overriding any caller values) based on the task type, and dispatches to the matching concrete provider.

**Model Selection Logic** (non-obvious):

`RoutingLLMService` selects the configured model and provider based on payload type:

- Text/table payloads use `DEFAULT_TEXT_TABLE_MODEL`, defaulting to `mistral-small-latest`.
- Image payloads use `DEFAULT_IMAGE_MODEL`, also defaulting to `mistral-small-latest`.
- Multi-part conversation payloads use the image or text setting depending on whether any message contains an image part (see [Multi-Part Conversation Payloads](#multi-part-conversation-payloads)).
- The model prefix determines the provider: Mistral prefixes route to `MistralService`, while Gemini prefixes route to `GeminiService`.

For legacy payloads, the distinction is made by checking whether the payload has an `images` array. The router creates a new payload and authoritatively sets its model and reasoning effort from server configuration, overriding caller-supplied values. Provider-specific reasoning parameters are then built by the selected provider. Gemini 2.5 models receive `thinkingConfig: { thinkingBudget }` (0 disables thinking), Gemini 2.0 models receive no `thinkingConfig` (the field is rejected with a 400 `INVALID_ARGUMENT`), and Gemini 3-series models (including the `gemini-flash-latest` alias) always receive an explicit `thinkingConfig: { thinkingLevel }` because omitting it defaults the model to _medium_ thinking (`off`/absent→`minimal`, `low`→`low`, `high`→`medium`, `max`→`high`).

### Centralised LLM Error Handling

All LLM-domain error classes now reside in `src/common/errors/` as a shared library,
extending the abstract `LlmError` (which itself extends `HttpException`). The barrel
has been removed; import each class from its concrete module, for example
`src/common/errors/resource-exhausted.error.ts`.

**`ResourceExhaustedError`** has migrated from `src/llm/resource-exhausted.error.ts` to
`src/common/errors/resource-exhausted.error.ts`. It now extends `LlmError` (not `Error`)
with a hardcoded HTTP 503 and `retryable = false`.

**Full error-classification table:**

| Error class                  | HTTP status | Retryable | Usage                                                           |
| ---------------------------- | ----------- | --------- | --------------------------------------------------------------- |
| `RateLimitError`             | 429         | Yes       | Upstream LLM rate-limited the request.                          |
| `ResourceExhaustedError`     | 503         | No        | LLM API quota exhausted.                                        |
| `ProviderServerError`        | 502         | Yes       | Upstream LLM returned a 5xx server error.                       |
| `NetworkError`               | 502         | Yes       | Network-level failure (no HTTP status available).               |
| `AuthenticationError`        | 502         | No        | Upstream authentication/credential failure.                     |
| `ContentFilteredError`       | 400         | No        | Request blocked by the provider's safety filters.               |
| `ContextLengthExceededError` | 400         | No        | Input exceeds the model's context window.                       |
| `InvalidRequestError`        | 400         | No        | Provider rejected the request as malformed — catch-all for 4xx. |
| `LlmServiceError`            | 500         | No        | Fallback for unclassifiable provider errors.                    |

For detailed documentation on the error hierarchy, mapping contracts, classification
priority rules, and how to add a new provider, see the dedicated guide:
**[`docs/llm/error-handling.md`](../llm/error-handling.md)**.

## Multi-Part Conversation Payloads

`MultiPartPromptPayload` is the third member of the `LlmPayload` union. It carries an ordered `messages` array whose messages have `system`, `user`, or `assistant` roles and whose parts are text (`{ kind: 'text', text }`) or image (`{ kind: 'image', mimeType, data }`). Image `data` is required base64. This is the transport-layer contract for conversation-style requests; no HTTP surface or prompt-layer producer exists yet (V2 workstream).

### Schema-first contract

The schema is the source of truth. `ReasoningEffortSchema`, `TextContentPartSchema`, `ImageContentPartSchema`, `LlmContentPartSchema`, `LlmConversationMessageSchema`, and `MultiPartPromptPayloadSchema` live in `src/llm/multi-part-prompt.schema.ts` and are re-exported, with their `z.infer`-derived types, from `src/llm/llm.service.interface.ts`.

The schema enforces the following structural rules:

- `messages` and each message's `parts` must be non-empty (`.min(1)`).
- System messages accept text parts only; image parts are restricted to `user` and `assistant` messages.
- `mimeType`, `data`, and `text` are strings with no format refinement. Provider-unsupported values fail loudly at the provider rather than being rewritten.

Legacy `StringPromptPayload` / `ImagePromptPayload` remain plain TypeScript types and gain no runtime validation.

### Boundary validation

The multi-part variant is parsed at both `ILlmService.send()` entry points:

| Entry point                                                              | When it validates                           | Failure behaviour                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------ |
| `RoutingLLMService.send()`                                               | Before any image-presence inspection        | Throws `ZodError`; no provider contact                                         |
| Base `LLMService.send()` (provider path, including direct instantiation) | Before `describePayload` and the retry loop | Throws `ZodError`; no summary, no `mapError()`, no retry, no provider SDK call |

The base-class parse is idempotent on the main path because routing has already validated the same schema. Legacy variants are never parsed. A failed parse propagates as a raw `ZodError`, consistent with the existing error contract in [LLM Error Handling](../llm/error-handling.md).

### Routing by image presence

`RoutingLLMService.send()` selects the task type for a multi-part payload by whether **any** message contains an image part, in any role or position:

- any image part → image provider, `DEFAULT_IMAGE_MODEL`, `IMAGE_REASONING_EFFORT`;
- otherwise → text provider, `DEFAULT_TEXT_TABLE_MODEL`, `TEXT_REASONING_EFFORT`.

The router builds a new payload via spread and authoritatively overwrites caller-supplied `model` and `reasoningEffort`; the caller's object is never mutated.

### Provider mapping

| Conversation feature         | `GeminiService`                                                                                       | `MistralService`                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Leading `system` message     | Consumed into `systemInstruction`; text parts joined with `'\n\n'` in order; excluded from `contents` | Native `system` message at its position                                                                                                               |
| Mid-conversation `system`    | `'user'` turn at its position (`contents` supports only `user` / `model` roles)                       | Native `system` message at its position                                                                                                               |
| `user` / `assistant` roles   | `'user'` / `'model'` roles                                                                            | Native `user` / `assistant` roles                                                                                                                     |
| Parts                        | One turn per message; text as `{ text }`, images as `inlineData { mimeType, data }`, in `parts` order | One content chunk array per message; text as `text` chunks, images as `image_url` data-URI chunks (`data:<mimeType>;base64,<data>`), in `parts` order |
| Text-only message            | Text-only turn                                                                                        | Text-chunk array (no string special case)                                                                                                             |
| Injected image instruction   | Not applicable                                                                                        | Not applied — caller content is used verbatim                                                                                                         |
| `promptCacheKey`             | Ignored (not forwarded)                                                                               | Forwarded as the SDK `promptCacheKey`                                                                                                                 |
| Assistant-first conversation | Positional mapping; the provider may reject it (expected provider-rejection mode)                     | Positional native mapping                                                                                                                             |

Both mappers are local private helpers (`GeminiService.mapConversation` and `MistralService.mapConversation`, the latter invoked from `buildMessages`). There is no cross-provider mapping utility: the providers' native shapes differ enough that a shared mapper would add indirection without reuse. Gemini's helper returns `{ contents, systemInstruction }`, so the leading-system join is computed exactly once.

A multi-part payload sent directly to `GeminiService` (bypassing `RoutingLLMService`) without an explicit `model` falls back to the existing text default `gemini-2.5-flash-lite`. Mistral falls back to `mistral-small-latest`. Both fallbacks are intentional: routing is the authoritative model supplier on the main path.

### Testing notes

- Base-class dispatch, boundary validation, and `describePayload` summaries: `src/llm/llm.service.interface.spec.ts`.
- Routing and routing-entry validation: `src/llm/routing-llm.service.spec.ts`.
- Provider mapping and log labelling: `src/llm/gemini.service.spec.ts` and `src/llm/mistral.service.spec.ts`.
- Legacy `StringPromptPayload` / `ImagePromptPayload` regression coverage, including the silent drop of data-less images, lives in the same provider suites.

## Prompt Cache Key

All three payload variants — `StringPromptPayload`, `ImagePromptPayload`, and `MultiPartPromptPayload` — accept an optional `promptCacheKey?: string`. It is a provider-agnostic prefix-cache routing hint that groups repeated requests for the same reference task. The key is derived server-side and is never accepted from clients.

### Derivation

The prompt layer owns derivation. `buildPromptCacheKey(referenceTask)` in `src/prompt/prompt.base.ts` returns the lowercase hexadecimal SHA-256 digest of the raw reference task string (64 characters). `Prompt.buildMessage()` (text and table) and `ImagePrompt.buildMessage()` both call it; for image payloads the reference task is the data-URI string held by the prompt, so multimodal payloads use the same rule as text payloads.

The rule is a single input — `sha256(referenceTask)` with no separator, prefix, or task-type component — and forms part of the documented contract. Changing it changes every effective cache key and therefore requires a deliberate contract revision. Keys are shared across task types by design: differing task types have differing reference content anyway.

Multi-part conversation payloads carry **no derivation rule** in v1: the field is accepted and forwarded when a caller supplies one, and derivation for conversations belongs to the future V2 multi-part prompt base class workstream.

### Provider Forwarding

| Provider         | Behaviour                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MistralService` | Forwards the key when present as the SDK `promptCacheKey` property (serialised to provider-native `prompt_cache_key`); omits the field entirely when absent — never sends `null`. |
| `GeminiService`  | Ignores the field: no request change, and no error when it is present.                                                                                                            |

The multi-part conversation variant follows the same matrix: Mistral forwards the key when present, and Gemini ignores it. `RoutingLLMService` preserves the field unchanged through its payload spread. Cache hits are best-effort: a prefix mismatch still yields a miss, never an incorrect assessment. Mistral reports hit counts externally via `usage.prompt_tokens_details.cached_tokens`; this service neither logs nor exposes them.

### EU Endpoint Pinning

`MistralService.getClient()` constructs the SDK client with `server: 'eu'`, resolving to `https://api.eu.mistral.ai` instead of the global default. This is fixed data-residency policy, not configuration: no environment variable overrides it, and every Mistral request — chat completions included — uses the pinned client.

## Dependencies

- **@google/genai** — Google Gemini API client
- **@mistralai/mistralai** — Mistral AI API client
- **ConfigModule** — Environment configuration
- **CommonModule** — Shared utilities (`JsonParserUtility`)
- **zod** — Response validation schemas
- **jsonrepair** — JSON response repair

## Related Documentation

- [Assessor Module](assessor.md)
- [Prompt Module](prompt.md)
- [Common Module](common.md)
- [Configuration Guide](../configuration/environment.md)
