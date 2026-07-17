import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { LlmError } from './llm-error.base.js';
import { RateLimitError } from './rate-limit.error.js';

describe('RateLimitError', () => {
  it('should create an instance with correct HTTP status (429) and retryable flag', () => {
    const error = new RateLimitError('Rate limit exceeded', 'gemini');

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(error.retryable).toBe(true);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store the provided message', () => {
    const error = new RateLimitError('Custom rate limit message', 'gemini');

    expect(error.message).toBe('Custom rate limit message');
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('Upstream rate limit');
    const error = new RateLimitError('Rate limit exceeded', 'gemini', {
      originalError,
    });

    expect(error.originalError).toBe(originalError);
  });

  it('should require an explicit providerName argument', () => {
    const error = new RateLimitError('Rate limit exceeded');

    expect(error.providerName).toBeUndefined();
  });

  it('should have retryable set to true', () => {
    const error = new RateLimitError('Rate limit exceeded', 'gemini');

    expect(error.retryable).toBe(true);
  });
});
