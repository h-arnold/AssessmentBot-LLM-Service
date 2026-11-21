# Design Patterns

This page maps each pattern to the symbol that implements it and why the codebase uses it. It does not repeat implementation code; follow the links for contracts and behaviour.

## Pattern map

| Pattern               | Symbol                                                                                                                                                           | Why it is used                                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory               | [`PromptFactory.create`](../../src/prompt/prompt.factory.ts)                                                                                                     | Builds the correct prompt type from the task type, keeping construction out of `AssessorService`.                                            |
| Strategy and Provider | [`LLMService`](../../src/llm/llm.service.interface.ts), [`GeminiService`](../../src/llm/gemini.service.ts), [`MistralService`](../../src/llm/mistral.service.ts) | Makes provider implementations interchangeable behind one contract.                                                                          |
| Dispatcher            | [`RoutingLLMService`](../../src/llm/routing-llm.service.ts)                                                                                                      | Resolves each task's provider once from model configuration, then dispatches at send time.                                                   |
| Template Method       | [`Prompt`](../../src/prompt/prompt.base.ts), [`MultiPartPrompt`](../../src/prompt/multi-part.prompt.base.ts)                                                     | Fixes the message-building steps in the base class and lets subclasses supply task-specific parts.                                           |
| Adapter               | [`ConfigModule`](../../src/config/config.module.ts), [`ConfigService`](../../src/config/config.service.ts)                                                       | Exposes only the application's own `ConfigService`, hiding NestJS's ConfigModule and centralising Zod validation.                            |
| Provider token        | [`LLM_SERVICE_TOKEN`](../../src/llm/llm.service.interface.ts) bound in [`LlmModule`](../../src/llm/llm.module.ts)                                                | Lets consumers inject the dispatcher without depending on a concrete provider.                                                               |
| Guard                 | [`ApiKeyGuard`](../../src/auth/api-key.guard.ts), [`ApiKeyThrottlerGuard`](../../src/auth/api-key-throttler.guard.ts)                                            | Applies authentication to [`AssessorController`](../../src/v1/assessor/assessor.controller.ts) and throttling globally, before handlers run. |
| Pipe                  | [`ZodValidationPipe`](../../src/common/zod-validation.pipe.ts)                                                                                                   | Validates request bodies at the controller boundary before service code runs.                                                                |

## Retry and error classification

The base [`LLMService`](../../src/llm/llm.service.interface.ts) owns retry and error classification; provider subclasses supply the provider call and error mapping. `send()` classifies each failure once, retries errors flagged retryable with exponential backoff up to `LLM_MAX_RETRIES`, and throws non-retryable errors immediately. See [LLM error handling](../llm/error-handling.md) for the classification rules.

## Platform logging

Logging is provided by `nestjs-pino`, configured globally in [`app.module.ts`](../../src/app.module.ts). This is platform infrastructure rather than an application design pattern.

---

_For architectural context, see [Architecture Overview](overview.md) and [Module Responsibilities](modules.md)._
