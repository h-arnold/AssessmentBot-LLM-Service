import { GoogleGenAI, ApiError } from '@google/genai';
import { Mock } from 'vitest';
import { ZodError } from 'zod';

import { GeminiService } from './gemini.service.js';
import {
  ImagePromptPayload,
  StringPromptPayload,
} from './llm.service.interface.js';
import { ResourceExhaustedError } from './resource-exhausted.error.js';
import { LlmResponse } from './types.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { ConfigService } from '../config/config.service.js';

// Only mock the GoogleGenAI class, not the error classes (ApiError is preserved
// from the real SDK via the ...actual spread below).
vi.mock('@google/genai', async () => {
  const actual =
    await vi.importActual<typeof import('@google/genai')>('@google/genai');
  return {
    ...actual,
    GoogleGenAI: vi.fn(),
  };
});

const mockGenerateContent = vi.fn();

const mockGoogleGenAI = GoogleGenAI as Mock;
mockGoogleGenAI.mockImplementation(function () {
  return {
    models: { generateContent: mockGenerateContent },
  };
});

// Test fixtures and utilities
const createValidResponse = (score: number): { text: string } => ({
  text: `{"completeness": {"score": ${score}, "reasoning": "Test"}, "accuracy": {"score": ${score}, "reasoning": "Test"}, "spag": {"score": ${score}, "reasoning": "Test"}}`,
});

const createStringPayload = (user: string = 'test'): StringPromptPayload => ({
  system: 'system prompt',
  user,
});

const createImagePayload = (): ImagePromptPayload => ({
  system: 'system prompt',
  images: [{ mimeType: 'image/png', data: 'test-data' }],
});

const expectValidResponse = (result: LlmResponse, score: number): void => {
  expect(result).toEqual({
    completeness: { score, reasoning: 'Test' },
    accuracy: { score, reasoning: 'Test' },
    spag: { score, reasoning: 'Test' },
  });
};

describe('GeminiService', () => {
  let service: GeminiService;
  let configService: ConfigService;
  let mockParse: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ConfigService
    configService = {
      get: vi.fn((key: string): string | null => {
        if (key === 'GEMINI_API_KEY') return 'test-api-key';
        if (key === 'LLM_BACKOFF_BASE_MS') return '100';
        if (key === 'LLM_MAX_RETRIES') return '2';
        return null;
      }),
    } as unknown as ConfigService;

    // Mock JsonParserUtil
    mockParse = vi.fn((json: string): unknown => JSON.parse(json) as unknown);

    service = new GeminiService(configService, {
      parse: mockParse,
    } as unknown as JsonParserUtility);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialise the SDK correctly', () => {
    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
  });

  describe('basic functionality', () => {
    it('should send a string payload and return a valid response', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      const payload = createStringPayload('test prompt');
      const result = await service.send(payload);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-lite',
        contents: ['test prompt'],
        config: {
          systemInstruction: 'system prompt',
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      expectValidResponse(result, 1);
    });

    it('should send a multimodal payload and return a valid response', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(3));

      const payload = createImagePayload();
      const result = await service.send(payload);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: [
          '',
          { inlineData: { mimeType: 'image/png', data: 'test-data' } },
        ],
        config: {
          systemInstruction: 'system prompt',
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      expectValidResponse(result, 3);
    });

    it('should handle malformed JSON and still return a valid response', async () => {
      const malformedJson =
        '{"completeness": {"score": 4, "reasoning": "Test"}, "accuracy": {"score": 4, "reasoning": "Test"}, "spag": {"score": 4, "reasoning": "Test"},}';
      const repairedJson =
        '{"completeness": {"score": 4, "reasoning": "Test"}, "accuracy": {"score": 4, "reasoning": "Test"}, "spag": {"score": 4, "reasoning": "Test"}}';

      mockGenerateContent.mockResolvedValue({
        text: malformedJson,
      });

      mockParse.mockReturnValueOnce(JSON.parse(repairedJson));

      const payload = createStringPayload();
      await service.send(payload);

      expect(mockParse).toHaveBeenCalledWith(malformedJson);
    });
  });

  describe('error handling', () => {
    it('should throw an error if the SDK fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('SDK Error'));

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(
        'Failed to get a valid and structured response from the LLM.',
      );
    });

    it('should throw a ZodError for an invalid response structure', async () => {
      mockGenerateContent.mockResolvedValue({
        text: '{"invalid": "structure"}',
      });

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(ZodError);
    });

    it('should throw an error if JsonParserUtil fails to parse the response', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'This is not JSON.',
      });

      mockParse.mockImplementation(() => {
        throw new Error('Malformed or irreparable JSON string provided.');
      });

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(
        'Failed to get a valid and structured response from the LLM.',
      );
    });

    it('should log enriched context on failure', async () => {
      const geminiErrorSpy = vi.spyOn(
        (
          service as unknown as {
            geminiLogger: { error: (...a: unknown[]) => void };
          }
        ).geminiLogger,
        'error',
      );

      mockGenerateContent.mockRejectedValue(
        new ApiError({ message: 'Server error', status: 500 }),
      );

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow();

      expect(geminiErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash-lite',
          payloadType: 'text',
          statusCode: 500,
        }),
        'Error communicating with or validating response from Gemini API',
        expect.any(String),
      );
    });

    it('should not retry on non-429 errors', async () => {
      const serverError = new ApiError({
        message: 'Server error',
        status: 500,
      });
      mockGenerateContent.mockRejectedValue(serverError);

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(
        'Failed to get a valid and structured response from the LLM',
      );

      // Should only be called once, no retries
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });
  });

  const testRetryBehaviorSuccess = async (
    errors: Error[],
    expectedCallCount: number,
  ): Promise<void> => {
    const payload = createStringPayload();

    let mockChain = mockGenerateContent;
    for (const error of errors) {
      mockChain = mockChain.mockRejectedValueOnce(error);
    }
    mockChain.mockResolvedValueOnce(createValidResponse(2));

    const result = await service.send(payload);
    expectValidResponse(result, 2);
    expect(mockGenerateContent).toHaveBeenCalledTimes(expectedCallCount);
  };

  const testRetryBehaviorFailure = async (
    errors: Error[],
    expectedCallCount: number,
  ): Promise<void> => {
    const payload = createStringPayload();

    for (const error of errors) {
      mockGenerateContent.mockRejectedValueOnce(error);
    }

    await expect(service.send(payload)).rejects.toThrow();
    expect(mockGenerateContent).toHaveBeenCalledTimes(expectedCallCount);
  };

  describe('retry logic', () => {
    it('should retry on 429 errors and eventually succeed', async () => {
      await testRetryBehaviorSuccess(
        [new ApiError({ message: 'Rate limited', status: 429 })],
        2,
      );
    });

    it('should retry multiple times with exponential backoff', async () => {
      await testRetryBehaviorSuccess(
        [
          new ApiError({ message: 'Rate limited', status: 429 }),
          new ApiError({ message: 'Rate limited', status: 429 }),
        ],
        3,
      );
    });

    it('should retry on rate limit error messages', async () => {
      await testRetryBehaviorSuccess([new Error('Rate limit exceeded')], 2);
    });

    it('should retry on "too many requests" error messages', async () => {
      await testRetryBehaviorSuccess([new Error('Too many requests')], 2);
    });

    it('should throw error after max retries exceeded', async () => {
      const rateLimitError = new ApiError({
        message: 'Rate limited',
        status: 429,
      });
      await testRetryBehaviorFailure(
        [rateLimitError, rateLimitError, rateLimitError],
        3,
      );
    });
  });

  const testResourceExhaustedError = async (
    errorMessage: string,
    statusCode: number = 429,
  ): Promise<void> => {
    const payload = createStringPayload();

    const error = errorMessage.includes('RESOURCE_EXHAUSTED')
      ? new ApiError({ message: errorMessage, status: statusCode })
      : new Error(errorMessage);

    if (!(error instanceof ApiError)) {
      (error as Error & { status?: number }).status = statusCode;
    }

    mockGenerateContent.mockRejectedValueOnce(error);

    await expect(service.send(payload)).rejects.toThrow(ResourceExhaustedError);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1); // Should not retry
  };

  describe('resource exhausted error handling', () => {
    it('should throw ResourceExhaustedError for "RESOURCE_EXHAUSTED" error', async () => {
      await testResourceExhaustedError('RESOURCE_EXHAUSTED: Quota exceeded');
    });

    it('should throw ResourceExhaustedError for "resource exhausted" error', async () => {
      await testResourceExhaustedError(
        'Request failed: resource exhausted - quota limits exceeded',
      );
    });

    it('should throw ResourceExhaustedError for "quota exceeded" error', async () => {
      await testResourceExhaustedError('API quota exceeded for this project');
    });

    it('should throw ResourceExhaustedError for "quota exhausted" error', async () => {
      await testResourceExhaustedError('Your quota has been exhausted');
    });

    it('should preserve original error in ResourceExhaustedError', async () => {
      const payload = createStringPayload();
      const originalError = new ApiError({
        message: 'RESOURCE_EXHAUSTED: Free tier quota exceeded',
        status: 429,
      });

      mockGenerateContent.mockRejectedValueOnce(originalError);

      let thrownError: unknown;
      try {
        await service.send(payload);
      } catch (error: unknown) {
        thrownError = error;
      }

      expect(thrownError).toBeInstanceOf(ResourceExhaustedError);
      expect((thrownError as ResourceExhaustedError).originalError).toBe(
        originalError,
      );
    });

    it('should still retry regular rate limit errors (not resource exhausted)', async () => {
      mockGenerateContent
        .mockRejectedValueOnce(
          new ApiError({ message: 'Rate limit exceeded', status: 429 }),
        )
        .mockResolvedValueOnce(createValidResponse(1));

      const payload = createStringPayload();
      const result = await service.send(payload);

      expectValidResponse(result, 1);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2); // Should retry
    });
  });
});
