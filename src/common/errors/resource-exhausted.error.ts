import { HttpStatus } from '@nestjs/common';

import { LlmError } from './llm-error.base.js';

/**
 * Error thrown when the LLM API quota has been exhausted.
 *
 * Maps to HTTP 503 Service Unavailable and is NOT retryable.
 * @remarks This error was previously a plain `Error` subclass at
 * `src/llm/resource-exhausted.error.ts`. It has been migrated to extend
 * {@link LlmError} with a hardcoded 503 status and `retryable = false`.
 */
export class ResourceExhaustedError extends LlmError {
  constructor(
    message: string,
    providerName: string = 'unknown',
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(
      HttpStatus.SERVICE_UNAVAILABLE,
      message,
      false,
      providerName,
      options,
    );
    this.name = 'ResourceExhaustedError';
  }
}
