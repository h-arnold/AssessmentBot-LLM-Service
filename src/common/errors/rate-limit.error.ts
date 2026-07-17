import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Error thrown when the upstream LLM provider rate-limits the request.
 *
 * Maps to HTTP 429 Too Many Requests and is retryable.
 * @remarks Subclasses {@link LlmError} with a hardcoded 429 status and
 * `retryable = true`.
 */
export class RateLimitError extends LlmError {
  constructor(
    message: string,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(HttpStatus.TOO_MANY_REQUESTS, message, true, providerName, options);
    this.name = 'RateLimitError';
  }
}
