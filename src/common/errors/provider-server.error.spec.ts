import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { LlmError } from './llm-error.base.js';
import { ProviderServerError } from './provider-server.error.js';

describe('ProviderServerError', () => {
  it('should create an instance with correct HTTP status (502) and retryable flag', () => {
    const error = new ProviderServerError('Upstream server error', 'gemini');

    expect(error).toBeInstanceOf(ProviderServerError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(error.retryable).toBe(true);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('HTTP 500 from provider');
    const error = new ProviderServerError('Upstream server error', 'gemini', {
      originalError,
    });

    expect(error.originalError).toBe(originalError);
  });

  it('requires an explicit providerName argument (compile-time contract)', () => {
    // @ts-expect-error providerName is a required positional argument
    const error = new ProviderServerError('Upstream server error');

    expect(error).toBeInstanceOf(ProviderServerError);
  });

  it('should have retryable set to true', () => {
    const error = new ProviderServerError('Upstream server error', 'gemini');

    expect(error.retryable).toBe(true);
  });
});
