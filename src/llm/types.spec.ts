import { LlmResponseSchema } from './types.js';

describe('LlmResponseSchema', () => {
  it('should validate a correct payload', () => {
    const validPayload = {
      completeness: { score: 5, reasoning: 'Perfect' },
      accuracy: { score: 4, reasoning: 'Good' },
      spag: { score: 3, reasoning: 'Okay' },
    };
    const result = LlmResponseSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should reject a payload with a missing criterion', () => {
    const invalidPayload = {
      completeness: { score: 5, reasoning: 'Perfect' },
      accuracy: { score: 4, reasoning: 'Good' },
    };
    const result = LlmResponseSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it.each([
    {
      description: 'an invalid score',
      payload: {
        completeness: { score: 6, reasoning: 'Too high' },
        accuracy: { score: 4, reasoning: 'Good' },
        spag: { score: 3, reasoning: 'Okay' },
      },
    },
    {
      description: 'a non-integer score',
      payload: {
        completeness: { score: 4.5, reasoning: 'Not an integer' },
        accuracy: { score: 4, reasoning: 'Good' },
        spag: { score: 3, reasoning: 'Okay' },
      },
    },
    {
      description: 'empty reasoning',
      payload: {
        completeness: { score: 5, reasoning: '' },
        accuracy: { score: 4, reasoning: 'Good' },
        spag: { score: 3, reasoning: 'Okay' },
      },
    },
  ])('should reject a payload with $description', ({ payload }) => {
    const result = LlmResponseSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with a missing score', () => {
    const invalidPayload = {
      completeness: { reasoning: 'No score' },
      accuracy: { score: 4, reasoning: 'Good' },
      spag: { score: 3, reasoning: 'Okay' },
    };
    const result = LlmResponseSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with missing reasoning', () => {
    const invalidPayload = {
      completeness: { score: 5 },
      accuracy: { score: 4, reasoning: 'Good' },
      spag: { score: 3, reasoning: 'Okay' },
    };
    const result = LlmResponseSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});
