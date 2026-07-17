import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Error thrown when the input exceeds the LLM model's context window.
 *
 * Maps to HTTP 400 Bad Request and is NOT retryable.
 * @remarks Subclasses {@link LlmError} with a hardcoded 400 status and
 * `retryable = false`.
 */
export class ContextLengthExceededError extends LlmError {
  constructor(
    message: string,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(HttpStatus.BAD_REQUEST, message, false, providerName, options);
    this.name = 'ContextLengthExceededError';
  }
}
