import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Generic fallback error for unclassifiable upstream provider errors.
 *
 * Maps to HTTP 500 Internal Server Error and is NOT retryable. This is the
 * catch-all when a provider's `mapError()` returns `undefined` or throws.
 * @remarks Subclasses {@link LlmError} with a hardcoded 500 status and
 * `retryable = false`. Providers should return `undefined` rather than throw
 * {@link LlmServiceError} directly — the base class constructs this error
 * type automatically.
 */
export class LlmServiceError extends LlmError {
  constructor(
    message: string,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      false,
      providerName,
      options,
    );
    this.name = 'LlmServiceError';
  }
}
