import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Error thrown when the upstream LLM provider returns a server error (5xx).
 *
 * Maps to HTTP 502 Bad Gateway and is retryable.
 * @remarks Subclasses {@link LlmError} with a hardcoded 502 status and
 * `retryable = true`. Transient upstream 5xx failures trigger retry with
 * exponential backoff.
 */
export class ProviderServerError extends LlmError {
  constructor(
    message: string,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(HttpStatus.BAD_GATEWAY, message, true, providerName, options);
    this.name = 'ProviderServerError';
  }
}
