import { ResourceExhaustedError } from './resource-exhausted.error.js';

describe('ResourceExhaustedError', () => {
  it('should create an instance', () => {
    const originalError = new Error('Original error');
    const error = new ResourceExhaustedError('Test message', { originalError });

    expect(error).toBeInstanceOf(ResourceExhaustedError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test message');
    expect(error.name).toBe('ResourceExhaustedError');
    expect(error.originalError).toBe(originalError);
  });

  it('should work without original error', () => {
    const error = new ResourceExhaustedError('Test message');

    expect(error).toBeInstanceOf(ResourceExhaustedError);
    expect(error.message).toBe('Test message');
    expect(error.originalError).toBeUndefined();
  });

  it('should preserve original error with fetch error name and status for debugging', () => {
    const originalError = new Error(
      'RESOURCE_EXHAUSTED: Free tier quota exceeded',
    );
    Object.defineProperty(originalError, 'name', {
      value: 'UpstreamQuotaFetchError',
      writable: true,
      configurable: true,
    });
    (originalError as Error & { status?: number }).status = 429;

    const resourceError = new ResourceExhaustedError(
      'API quota exhausted. Please try again later or upgrade your plan.',
      { originalError },
    );

    expect(resourceError.originalError).toBe(originalError);
    expect(resourceError.message).toBe(
      'API quota exhausted. Please try again later or upgrade your plan.',
    );
  });

  it('should support pattern matching for error handling', () => {
    // Tests that ResourceExhaustedError can be distinguished from other errors
    const errors = [
      new Error('Network error'),
      new ResourceExhaustedError('Quota exceeded'),
      new Error('Rate limit exceeded'),
    ];

    const quotaErrors = errors.filter(
      (error) => error instanceof ResourceExhaustedError,
    );
    expect(quotaErrors).toHaveLength(1);
    expect(quotaErrors[0].message).toBe('Quota exceeded');
  });

  it('should work in try-catch blocks', () => {
    const throwResourceExhaustedError = (): never => {
      throw new ResourceExhaustedError('API quota exhausted');
    };

    let caughtError: Error | null = null;

    try {
      throwResourceExhaustedError();
    } catch (error) {
      caughtError = error as Error;
    }

    expect(caughtError).not.toBeNull();
    const capturedError = caughtError as Error;
    expect(capturedError).toBeInstanceOf(ResourceExhaustedError);
    expect(capturedError.message).toBe('API quota exhausted');
  });
});
