import { HttpException, HttpStatus } from '@nestjs/common';
import { describe, it, expect } from 'vitest';

import { ContentFilteredError } from './content-filtered.error.js';
import { LlmError } from './llm-error.base.js';

describe('ContentFilteredError', () => {
  it('should create an instance with correct HTTP status (400) and retryable flag', () => {
    const error = new ContentFilteredError(
      'Content blocked by safety filter',
      'gemini',
    );

    expect(error).toBeInstanceOf(ContentFilteredError);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(error.retryable).toBe(false);
    expect(error.providerName).toBe('gemini');
    expect(error.originalError).toBeUndefined();
  });

  it('should store originalError when provided', () => {
    const originalError = new Error('Safety filter triggered');
    const error = new ContentFilteredError(
      'Content blocked by safety filter',
      'gemini',
      { originalError },
    );

    expect(error.originalError).toBe(originalError);
  });

  it('should require an explicit providerName argument', () => {
    const error = new ContentFilteredError('Content blocked');

    expect(error.providerName).toBeUndefined();
  });

  it('should have retryable set to false', () => {
    const error = new ContentFilteredError(
      'Content blocked by safety filter',
      'gemini',
    );

    expect(error.retryable).toBe(false);
  });
});
