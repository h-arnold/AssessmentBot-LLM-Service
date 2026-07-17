import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Error thrown when authentication with the upstream LLM provider fails.
 *
 * Maps to HTTP 502 Bad Gateway and is NOT retryable. The 502 (rather than 401)
 * indicates the authentication failure is between our service and the upstream
 * provider, not between the API consumer and our service.
 * @remarks Subclasses {@link LlmError} with a hardcoded 502 status and
 * `retryable = false`.
 */
export class AuthenticationError extends LlmError {
  constructor(
    message: string,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(HttpStatus.BAD_GATEWAY, message, false, providerName, options);
    this.name = 'AuthenticationError';
  }
}
