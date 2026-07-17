import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Error thrown when a network-level failure prevents communication with the
 * upstream LLM provider.
 *
 * Maps to HTTP 502 Bad Gateway and is retryable.
 * @remarks Subclasses {@link LlmError} with a hardcoded 502 status and
 * `retryable = true`. This error type is only reachable when no HTTP status
 * code is extractable from the error at all.
 */
export class NetworkError extends LlmError {
  constructor(
    message: string,
    providerName: string = 'unknown',
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(HttpStatus.BAD_GATEWAY, message, true, providerName, options);
    this.name = 'NetworkError';
  }
}
