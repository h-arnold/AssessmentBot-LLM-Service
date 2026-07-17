import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { AuthenticationError } from './authentication.error.js';
import { LlmError } from './llm-error.base.js';

describe('AuthenticationError', () => {
  it('should create an instance with correct HTTP status (502) and retryable flag', () => {
    const error = new AuthenticationError('Invalid API key', 'gemini');

    expect(error).toBeInstanceOf(AuthenticationError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(error.retryable).toBe(false);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('401 Unauthorized');
    const error = new AuthenticationError('Invalid API key', 'gemini', {
      originalError,
    });

    expect(error.originalError).toBe(originalError);
  });

  it('should require an explicit providerName argument', () => {
    const error = new AuthenticationError('Invalid API key');

    expect(error.providerName).toBeUndefined();
  });

  it('should have retryable set to false', () => {
    const error = new AuthenticationError('Invalid API key', 'gemini');

    expect(error.retryable).toBe(false);
  });
});
