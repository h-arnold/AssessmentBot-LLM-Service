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

For legacy payloads, the distinction is made by checking for an `images` array first (image) and a `user` string next (text). The router creates a new payload and authoritatively sets its model and reasoning effort from server configuration, overriding caller-supplied values. Provider-specific reasoning parameters are then built by the selected provider. Gemini 2.5 models receive `thinkingConfig: { thinkingBudget }` (0 disables thinking), Gemini 2.0 models receive no `thinkingConfig` (the field is rejected with a 400 `INVALID_ARGUMENT`), and Gemini 3-series models (including the `gemini-flash-latest` alias) always receive an explicit `thinkingConfig: { thinkingLevel }` because omitting it defaults the model to _medium_ thinking (`off`/absent→`minimal`, `low`→`low`, `high`→`medium`, `max`→`high`).

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

`MultiPartPromptPayload` is the third member of the `LlmPayload` union. It carries an ordered `messages` array whose messages have `system`, `user`, or `assistant` roles and whose parts are text (`{ kind: 'text', text }`) or image (`{ kind: 'image', mimeType, data }`). Image `data` is required standard padded base64. Construct instances with `buildMultiPartPromptPayload()` (see [Construction-time validation](#construction-time-validation)). This is the transport-layer contract for conversation-style requests; no HTTP surface exists yet, and no prompt subclass produces one (V2 workstream).

### Schema-first contract

The schema is the source of truth. `ReasoningEffortSchema`, `TextContentPartSchema`, `ImageContentPartSchema`, `LlmContentPartSchema`, `LlmConversationMessageSchema`, and `MultiPartPromptPayloadSchema` live in `src/llm/multi-part-prompt.schema.ts` and are re-exported, with their `z.infer`-derived types, from `src/llm/llm.service.interface.ts`.

The schema enforces the following structural rules:

- `messages` and each message's `parts` must be non-empty (`.min(1)`).
- System messages accept text parts only; image parts are restricted to `user` and `assistant` messages.
- `mimeType` must match `image/<subtype>` (`/^image\/[a-zA-Z0-9.+-]+$/`). Parameters such as `; charset=utf-8`, whitespace, and non-lowercase `image/` prefixes are rejected.
- `data` must be non-empty standard padded base64: a length that is a multiple of four, alphabet `[A-Za-z0-9+/]` with at most two trailing `=`, and a decoded size of at most 1 MiB (1 048 576 bytes) per image part. There is no aggregate cap across parts.
- Validation is structural only. No magic-byte inspection is performed and no provider allowlist is applied, so a well-formed but provider-unsupported image fails loudly at the provider rather than being rewritten.
- `text` is a plain string with no non-empty constraint. Unknown keys are stripped by Zod's default object behaviour, and the input object is not mutated.

Legacy `StringPromptPayload` / `ImagePromptPayload` remain plain TypeScript types and gain no runtime validation. Legacy `ImagePromptPayload` images keep their existing behaviour: `data` is optional, and data-less entries are silently dropped by both providers.

### Construction-time validation

`buildMultiPartPromptPayload(input: unknown)` in `src/prompt/prompt.base.ts` is the **sole production schema-validation boundary** for multi-part payloads. It parses the input against `MultiPartPromptPayloadSchema` and returns the branded parsed object. The schema brand is a compile-time guarantee: only a builder-returned instance satisfies the `MultiPartPromptPayload` type.

| Stage                                          | Behaviour                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `buildMultiPartPromptPayload()` (construction) | Parses once; throws a raw `ZodError` on invalid structure; strips unknown keys and returns a new object |
| `RoutingLLMService.send()`                     | No parse; consumes the branded payload and inspects image-part presence only                            |
| Base `LLMService.send()` (provider path)       | No parse; consumes the branded payload and runs the existing summary/retry/classification flow          |

Routing and the provider base class trust the branded type and never re-parse. A `ZodError` raised while validating the provider **response** (`LlmResponseSchema`) is still re-thrown by the base `send()` loop without `mapError()` or retry. Legacy variants are never schema-validated.

A construction failure propagates as a raw `ZodError`, consistent with the error contract in [LLM Error Handling](../llm/error-handling.md). The brand is a compile-time guarantee only: a payload that bypasses the builder (for example via a cast) is outside the contract and may fail later as an unvalidated shape. A payload reaching `send()` with no recognisable discriminator is not parsed and falls through to the generic `'Unsupported payload type'` exception rather than a structural `ZodError`.

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

- Construction-time schema validation (`buildMultiPartPromptPayload()`) and the single-parse contract: `src/prompt/prompt.base.spec.ts`.
- Base-class dispatch and `describePayload` summaries: `src/llm/llm.service.interface.spec.ts`.
- Routing by image-part presence: `src/llm/routing-llm.service.spec.ts`.
- Provider mapping and log labelling: `src/llm/gemini.service.spec.ts` and `src/llm/mistral.service.spec.ts`.
- Legacy `StringPromptPayload` / `ImagePromptPayload` regression coverage, including the silent drop of data-less images, lives in the same provider suites.

## Prompt Cache Key

All three payload variants — `StringPromptPayload`, `ImagePromptPayload`, and `MultiPartPromptPayload` — accept an optional `promptCacheKey?: string`. It is a provider-agnostic prefix-cache routing hint that groups repeated requests for the same reference task. For the legacy variants the key is derived server-side and is never accepted from clients; the multi-part variant accepts a caller-supplied key (see [Multi-part cache-key contract](#multi-part-cache-key-contract)).

### Derivation

The prompt layer owns derivation. `buildPromptCacheKey(referenceTask)` in `src/prompt/prompt.base.ts` returns the lowercase hexadecimal SHA-256 digest of the raw reference task string (64 characters). `Prompt.buildMessage()` (text and table) and `ImagePrompt.buildMessage()` both call it; for image payloads the reference task is the data-URI string held by the prompt, so multimodal payloads use the same rule as text payloads.

The rule is a single input — `sha256(referenceTask)` with no separator, prefix, or task-type component — and forms part of the documented contract. Changing it changes every effective cache key and therefore requires a deliberate contract revision. Keys are shared across task types by design: differing task types have differing reference content anyway.

### Multi-part cache-key contract

**Contract decision (2026-09-17):** the multi-part variant accepts a caller-supplied `promptCacheKey`, in contrast to the legacy server-derived invariant. The value is forwarded verbatim to Mistral and ignored by Gemini. No derivation rule exists for conversations in v1; derivation belongs to the future V2 multi-part prompt base class workstream.

No HTTP surface constructs multi-part payloads today, so the key remains server-controlled. When the V2 endpoint wires a client payload to this field, the caller-supplied key becomes wire-controlled and introduces a cache-poisoning / cross-tenant hazard: a malicious caller could force cache collisions or probe another tenant's cached prefix. The V2 workstream must review this contract before exposing the field — derive the key server-side as the legacy variants do, restrict it to trusted callers, or explicitly accept the risk.

### Provider Forwarding

| Provider         | Behaviour                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MistralService` | Forwards the key when present as the SDK `promptCacheKey` property (serialised to provider-native `prompt_cache_key`); omits the field entirely when absent — never sends `null`. |
| `GeminiService`  | Ignores the field: no request change, and no error when it is present.                                                                                                            |

`RoutingLLMService` preserves the field unchanged through its payload spread. Cache hits are best-effort: a prefix mismatch still yields a miss, never an incorrect assessment. Mistral reports hit counts externally via `usage.prompt_tokens_details.cached_tokens`; this service neither logs nor exposes them.

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
