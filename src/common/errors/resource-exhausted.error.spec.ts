import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { LlmError } from './llm-error.base.js';
import { ResourceExhaustedError } from './resource-exhausted.error.js';

describe('ResourceExhaustedError', () => {
  it('should create an instance with correct HTTP status (503) and retryable flag', () => {
    const originalError = new Error('Original error');
    const error = new ResourceExhaustedError('Test message', 'test-provider', {
      originalError,
    });

    expect(error).toBeInstanceOf(ResourceExhaustedError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('Test message');
    expect(error.providerName).toBe('test-provider');
    expect(error.originalError).toBe(originalError);
  });

  it('should work without original error', () => {
    const error = new ResourceExhaustedError('Test message', 'test-provider');

    expect(error).toBeInstanceOf(ResourceExhaustedError);
    expect(error.message).toBe('Test message');
    expect(error.originalError).toBeUndefined();
  });

  it('should default providerName to unknown for single-arg constructor calls', () => {
    const error = new ResourceExhaustedError('Test message');

    expect(error.providerName).toBe('unknown');
  });

  it('should preserve original error with custom properties for debugging', () => {
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
      'test-provider',
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
      new ResourceExhaustedError('Quota exceeded', 'test-provider'),
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
      throw new ResourceExhaustedError('API quota exhausted', 'test-provider');
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

  it('should have retryable set to false', () => {
    const error = new ResourceExhaustedError('Quota exceeded', 'test-provider');

    expect(error.retryable).toBe(false);
  });
});
