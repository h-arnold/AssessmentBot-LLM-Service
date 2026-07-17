import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { ContextLengthExceededError } from './context-length-exceeded.error.js';
import { LlmError } from './llm-error.base.js';

describe('ContextLengthExceededError', () => {
  it('should create an instance with correct HTTP status (400) and retryable flag', () => {
    const error = new ContextLengthExceededError(
      'Input exceeds context window',
      'gemini',
    );

    expect(error).toBeInstanceOf(ContextLengthExceededError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.retryable).toBe(false);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('Token limit exceeded');
    const error = new ContextLengthExceededError(
      'Input exceeds context window',
      'gemini',
      { originalError },
    );

    expect(error.originalError).toBe(originalError);
  });

  it('requires an explicit providerName argument (compile-time contract)', () => {
    // @ts-expect-error providerName is a required positional argument
    const error = new ContextLengthExceededError(
      'Input exceeds context window',
    );

    expect(error).toBeInstanceOf(ContextLengthExceededError);
  });

  it('should have retryable set to false', () => {
    const error = new ContextLengthExceededError(
      'Input exceeds context window',
      'gemini',
    );

    expect(error.retryable).toBe(false);
  });
});
