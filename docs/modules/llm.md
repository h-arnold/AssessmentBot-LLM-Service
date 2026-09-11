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

Abstract base class providing the `send(payload: LlmPayload): Promise<LlmResponse>` interface and common retry logic. Implementations must provide `_sendInternal()`.

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
- The model prefix determines the provider: Mistral prefixes route to `MistralService`, while Gemini prefixes route to `GeminiService`.

The distinction is made by checking whether the payload has an `images` array. The router creates a new payload and authoritatively sets its model and reasoning effort from server configuration, overriding caller-supplied values. Provider-specific reasoning parameters are then built by the selected provider. Gemini 2.5 models receive `thinkingConfig: { thinkingBudget }` (0 disables thinking), Gemini 2.0 models receive no `thinkingConfig` (the field is rejected with a 400 `INVALID_ARGUMENT`), and Gemini 3-series models (including the `gemini-flash-latest` alias) always receive an explicit `thinkingConfig: { thinkingLevel }` because omitting it defaults the model to _medium_ thinking (`off`/absent→`minimal`, `low`→`low`, `high`→`medium`, `max`→`high`).

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
