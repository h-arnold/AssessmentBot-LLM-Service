import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { LlmError } from './llm-error.base.js';
import { LlmServiceError } from './llm-service.error.js';

describe('LlmServiceError', () => {
  it('should create an instance with correct HTTP status (500) and retryable flag', () => {
    const error = new LlmServiceError(
      'LLM service error: Unexpected error',
      'gemini',
    );

    expect(error).toBeInstanceOf(LlmServiceError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(error.retryable).toBe(false);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('Unclassified upstream failure');
    const error = new LlmServiceError(
      'LLM service error: Unclassified upstream failure',
      'gemini',
      { originalError },
    );

    expect(error.originalError).toBe(originalError);
  });

  it('should require an explicit providerName argument', () => {
    const error = new LlmServiceError(
      'LLM service error: Something went wrong',
    );

    expect(error.providerName).toBeUndefined();
  });

  it('should have retryable set to false', () => {
    const error = new LlmServiceError(
      'LLM service error: Unexpected error',
      'gemini',
    );

    expect(error.retryable).toBe(false);
  });
});
