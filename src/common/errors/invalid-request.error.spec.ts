import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { InvalidRequestError } from './invalid-request.error.js';
import { LlmError } from './llm-error.base.js';

describe('InvalidRequestError', () => {
  it('should create an instance with correct HTTP status (400) and retryable flag', () => {
    const error = new InvalidRequestError(
      'Invalid request parameters',
      'gemini',
    );

    expect(error).toBeInstanceOf(InvalidRequestError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.retryable).toBe(false);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('Bad request from provider');
    const error = new InvalidRequestError(
      'Invalid request parameters',
      'gemini',
      { originalError },
    );

    expect(error.originalError).toBe(originalError);
  });

  it('should default providerName to unknown', () => {
    const error = new InvalidRequestError('Invalid request parameters');

    expect(error.providerName).toBe('unknown');
  });

  it('should have retryable set to false', () => {
    const error = new InvalidRequestError(
      'Invalid request parameters',
      'gemini',
    );

    expect(error.retryable).toBe(false);
  });
});
