import { HttpException } from '@nestjs/common';

/**
 * Abstract base class for all LLM-domain errors in the error hierarchy.
 *
 * Every concrete subclass MUST pass a bare `string` as the first argument to
 * `super(...)` (never an object). This ensures `getResponse()` returns a string
 * which the `HttpExceptionFilter`'s `typeof exceptionResponse === 'string'`
 * branch picks up for response-body extraction and production-sanitisation.
 *
 * Subclasses hardcode their HTTP status and `retryable` flag in the `super()`
 * call.
 * @remarks This class is abstract and cannot be instantiated directly.
 */
export abstract class LlmError extends HttpException {
  readonly retryable: boolean;
  readonly providerName: string;
  readonly originalError?: Error;

  constructor(
    httpStatus: number,
    message: string,
    retryable: boolean,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    // Pass a BARE STRING as the first super() arg so the filter's
    // typeof exceptionResponse === 'string' branch handles every LlmError.
    super(message, httpStatus, { cause: options?.cause });
    this.retryable = retryable;
    this.providerName = providerName;
    this.originalError = options?.originalError;
  }
}
