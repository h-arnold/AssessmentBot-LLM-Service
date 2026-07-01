/**
 * Custom error class for Gemini API resource exhausted errors.
 * This error is thrown when the API quota has been exceeded and should bubble up
 * to inform the calling code that no retries should be attempted.
 */
export class ResourceExhaustedError extends Error {
  public readonly originalError?: unknown;

  constructor(
    message: string,
    options?: ErrorOptions & { originalError?: unknown },
  ) {
    super(message, options);
    this.name = 'ResourceExhaustedError';
    this.originalError = options?.originalError;
  }
}
