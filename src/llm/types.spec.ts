import { LlmResponseSchema } from './types';
import type { GeminiModelParameters } from './types';

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

  it('should reject a payload with an invalid score', () => {
    const invalidPayload = {
      completeness: { score: 6, reasoning: 'Too high' },
      accuracy: { score: 4, reasoning: 'Good' },
      spag: { score: 3, reasoning: 'Okay' },
    };
    const result = LlmResponseSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with a non-integer score', () => {
    const invalidPayload = {
      completeness: { score: 4.5, reasoning: 'Not an integer' },
      accuracy: { score: 4, reasoning: 'Good' },
      spag: { score: 3, reasoning: 'Okay' },
    };
    const result = LlmResponseSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });

  it('should reject a payload with empty reasoning', () => {
    const invalidPayload = {
      completeness: { score: 5, reasoning: '' },
      accuracy: { score: 4, reasoning: 'Good' },
      spag: { score: 3, reasoning: 'Okay' },
    };
    const result = LlmResponseSchema.safeParse(invalidPayload);
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

describe('GeminiModelParameters type', () => {
  it('should accept a valid params object with thinking and systemInstruction', () => {
    const parameters: GeminiModelParameters = {
      model: 'gemini-2.5-flash-lite',
      generationConfig: { temperature: 0 },
      thinking: { budget: 100 },
      systemInstruction: 'Be concise',
    };

    expect(parameters).toMatchObject({
      model: 'gemini-2.5-flash-lite',
      generationConfig: { temperature: 0 },
      thinking: { budget: 100 },
      systemInstruction: 'Be concise',
    });
  });

  it('should allow params with thinking omitted', () => {
    const parameters: GeminiModelParameters = {
      model: 'gemini-2.5-flash',
      generationConfig: {},
    };
    expect(parameters).toMatchObject({
      model: 'gemini-2.5-flash',
      generationConfig: {},
    });
    expect(parameters).not.toHaveProperty('thinking');
  });

  it('should allow params with systemInstruction omitted', () => {
    const parameters: GeminiModelParameters = {
      model: 'gemini-2.5-flash',
    };
    expect(parameters).toMatchObject({
      model: 'gemini-2.5-flash',
    });
    expect(parameters).not.toHaveProperty('systemInstruction');
  });

  it('should enforce types at compile-time for common mistakes', () => {
    // @ts-expect-error - thinking.budget must be a number
    const bad1: GeminiModelParameters = {
      model: 'gemini-2.5-flash',
      thinking: { budget: 'not-a-number' },
    };

    // @ts-expect-error - systemInstruction must be a string
    const bad2: GeminiModelParameters = {
      model: 'gemini-2.5-flash',
      systemInstruction: 123,
    };

    // Add a runtime assertion so ESLint's jest/expect-expect rule is satisfied
    expect(bad1).toBeDefined();
    expect(bad2).toBeDefined();
  });
});
