import { describe, it, expect } from 'vitest';

describe('concrete error modules', () => {
  it('should export LlmError', async () => {
    const module_ = await import('./llm-error.base.js');
    expect(module_.LlmError).toBeDefined();
    // LlmError is abstract — verify it is a class (constructor function)
    expect(typeof module_.LlmError).toBe('function');
  });

  it('should export RateLimitError', async () => {
    const module_ = await import('./rate-limit.error.js');
    expect(module_.RateLimitError).toBeDefined();
    expect(typeof module_.RateLimitError).toBe('function');
  });

  it('should export ResourceExhaustedError', async () => {
    const module_ = await import('./resource-exhausted.error.js');
    expect(module_.ResourceExhaustedError).toBeDefined();
    expect(typeof module_.ResourceExhaustedError).toBe('function');
  });

  it('should export ProviderServerError', async () => {
    const module_ = await import('./provider-server.error.js');
    expect(module_.ProviderServerError).toBeDefined();
    expect(typeof module_.ProviderServerError).toBe('function');
  });

  it('should export AuthenticationError', async () => {
    const module_ = await import('./authentication.error.js');
    expect(module_.AuthenticationError).toBeDefined();
    expect(typeof module_.AuthenticationError).toBe('function');
  });

  it('should export ContentFilteredError', async () => {
    const module_ = await import('./content-filtered.error.js');
    expect(module_.ContentFilteredError).toBeDefined();
    expect(typeof module_.ContentFilteredError).toBe('function');
  });

  it('should export NetworkError', async () => {
    const module_ = await import('./network.error.js');
    expect(module_.NetworkError).toBeDefined();
    expect(typeof module_.NetworkError).toBe('function');
  });

  it('should export ContextLengthExceededError', async () => {
    const module_ = await import('./context-length-exceeded.error.js');
    expect(module_.ContextLengthExceededError).toBeDefined();
    expect(typeof module_.ContextLengthExceededError).toBe('function');
  });

  it('should export InvalidRequestError', async () => {
    const module_ = await import('./invalid-request.error.js');
    expect(module_.InvalidRequestError).toBeDefined();
    expect(typeof module_.InvalidRequestError).toBe('function');
  });

  it('should export LlmServiceError', async () => {
    const module_ = await import('./llm-service.error.js');
    expect(module_.LlmServiceError).toBeDefined();
    expect(typeof module_.LlmServiceError).toBe('function');
  });
});
