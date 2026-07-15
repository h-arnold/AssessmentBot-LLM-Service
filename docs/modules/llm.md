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

### ResourceExhaustedError

**Location:** `src/llm/resource-exhausted.error.ts`

Custom error class for API quota exhaustion scenarios:

```typescript
export class ResourceExhaustedError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) { ... }
}
```

**Error classification:**

| Condition                          | Pattern                                                            | Behaviour                                                                  |
| ---------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Resource exhausted (non-retryable) | HTTP 429 + `"resource_exhausted"` or `"quota exceeded"` in message | Immediately throws `ResourceExhaustedError`                                |
| Rate limit (retryable)             | HTTP 429 without quota patterns                                    | Exponential backoff (`base * 2^attempt + jitter`), up to `LLM_MAX_RETRIES` |
| Validation failure                 | Zod parse failure on response                                      | Immediate `BadRequestException`                                            |

## Dependencies

- **@google/genai** — Google Gemini API client
- **ConfigModule** — Environment configuration
- **CommonModule** — Shared utilities (`JsonParserUtil`)
- **zod** — Response validation schemas
- **jsonrepair** — JSON response repair

## Related Documentation

- [Assessor Module](assessor.md)
- [Prompt Module](prompt.md)
- [Common Module](common.md)
- [Configuration Guide](../configuration/environment.md)
