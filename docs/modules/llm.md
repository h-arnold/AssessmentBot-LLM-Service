# LLM Module

The LLM Module (`src/llm/`) provides Large Language Model integration services, implementing an abstract service layer with Google Gemini as the concrete implementation.

## Module Structure

```typescript
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [GeminiService, { provide: LLMService, useClass: GeminiService }],
  exports: [LLMService],
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

**Model Selection Logic** (non-obvious):

The service selects the model based on payload type:

- `gemini-2.5-flash-lite` — used for text-only requests (cheaper, faster)
- `gemini-2.5-flash` — used for multimodal requests (images)

The distinction is made via `isImagePromptPayload()`: if the payload has an `images` array, the multimodal model is chosen. Both models use `thinkingConfig: { thinkingBudget: 0 }` to disable additional thinking budget per Gemini guidance.

### Centralised LLM Error Handling

All LLM-domain error classes now reside in `src/common/errors/` as a shared library,
extending the abstract `LlmError` (which itself extends `HttpException`). The barrel
`src/common/errors/index.ts` re-exports all nine subclasses for static import.

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
- **ConfigModule** — Environment configuration
- **CommonModule** — Shared utilities (`JsonParserUtility`)
- **zod** — Response validation schemas
- **jsonrepair** — JSON response repair

## Related Documentation

- [Assessor Module](assessor.md)
- [Prompt Module](prompt.md)
- [Common Module](common.md)
- [Configuration Guide](../configuration/environment.md)
