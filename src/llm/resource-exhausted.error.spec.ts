import { ResourceExhaustedError } from './resource-exhausted.error.js';

describe('ResourceExhaustedError', () => {
  it('should create an instance', () => {
    const originalError = new Error('Original error');
    const error = new ResourceExhaustedError('Test message', { originalError });

    expect(error).toBeInstanceOf(ResourceExhaustedError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test message');
    expect(error.name).toBe('ResourceExhaustedError');
    expect(error.originalError).toBe(originalError);
  });

  it('should work without original error', () => {
    const error = new ResourceExhaustedError('Test message');

    expect(error).toBeInstanceOf(ResourceExhaustedError);
    expect(error.message).toBe('Test message');
    expect(error.originalError).toBeUndefined();
  });
});
