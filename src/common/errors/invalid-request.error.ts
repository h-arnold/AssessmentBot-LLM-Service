import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Error thrown when the LLM provider rejects the request as structurally or
 * semantically invalid.
 *
 * Maps to HTTP 400 Bad Request and is NOT retryable. This is the catch-all for
 * unrecognised 4xx errors from the provider.
 * @remarks Subclasses {@link LlmError} with a hardcoded 400 status and
 * `retryable = false`.
 */
export class InvalidRequestError extends LlmError {
  constructor(
    message: string,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(HttpStatus.BAD_REQUEST, message, false, providerName, options);
    this.name = 'InvalidRequestError';
  }
}
