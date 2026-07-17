import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { LlmError } from './llm-error.base.js';

/**
 * Concrete subclass of the abstract LlmError for testing purposes.
 */
class TestLlmError extends LlmError {
  constructor(
    message: string,
    providerName: string = 'unknown',
    options?: { originalError?: Error; cause?: Error },
  ) {
    super(
      HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      false,
      providerName,
      options,
    );
    this.name = 'TestLlmError';
  }
}

describe('LlmError (abstract base class)', () => {
  it('should be an abstract base class exposed as a constructor function', () => {
    // Abstract-ness is enforced at compile time by TypeScript. At runtime,
    // LlmError is a constructor function (typeof === 'function') because it
    // extends HttpException. The subclass tests above prove that subclassing
    // works correctly.
    expect(typeof LlmError).toBe('function');
  });

  it('should store retryable, providerName, and originalError when subclassed', () => {
    const originalError = new Error('Root cause');
    const error = new TestLlmError('Something went wrong', 'test-provider', {
      originalError,
    });

    expect(error.retryable).toBe(false);
    expect(error.providerName).toBe('test-provider');
    expect(error.originalError).toBe(originalError);
  });

  it('should set originalError to undefined when not provided', () => {
    const error = new TestLlmError('Something went wrong', 'test-provider');

    expect(error.originalError).toBeUndefined();
  });

  it('should extend HttpException with the correct message and status', () => {
    const error = new TestLlmError('Custom error message', 'test-provider');

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    // The getResponse() returns a bare string because the subclass passes
    // a string as the first super() argument (per the LlmError contract).
    expect(error.getResponse()).toBe('Custom error message');
  });

  it('should propagate cause to the error instance (ES2022 Error cause)', () => {
    const cause = new Error('Underlying cause');
    const error = new TestLlmError('Something went wrong', 'test-provider', {
      cause,
    });

    // Regression guard: HttpException's ES2022 cause mechanism makes
    // error.cause propagate from the options argument.
    expect(error.cause).toBe(cause);
  });

  it('should default providerName to unknown', () => {
    const error = new TestLlmError('Something went wrong');

    expect(error.providerName).toBe('unknown');
  });
});
