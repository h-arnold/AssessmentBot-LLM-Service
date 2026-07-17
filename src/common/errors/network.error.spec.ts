import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { LlmError } from './llm-error.base.js';
import { NetworkError } from './network.error.js';

describe('NetworkError', () => {
  it('should create an instance with correct HTTP status (502) and retryable flag', () => {
    const error = new NetworkError('connect ECONNREFUSED', 'gemini');

    expect(error).toBeInstanceOf(NetworkError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(error.retryable).toBe(true);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('ETIMEDOUT');
    const error = new NetworkError('connect ECONNREFUSED', 'gemini', {
      originalError,
    });

    expect(error.originalError).toBe(originalError);
  });

  it('should default providerName to unknown', () => {
    const error = new NetworkError('connect ECONNREFUSED');

    expect(error.providerName).toBe('unknown');
  });

  it('should have retryable set to true', () => {
    const error = new NetworkError('connect ECONNREFUSED', 'gemini');

    expect(error.retryable).toBe(true);
  });
});
