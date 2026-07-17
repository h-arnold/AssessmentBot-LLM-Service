import { GoogleGenAI, ApiError } from '@google/genai';
import { Mock } from 'vitest';
import { ZodError } from 'zod';

import { GeminiService } from './gemini.service.js';
import {
  ImagePromptPayload,
  StringPromptPayload,
} from './llm.service.interface.js';
import { LlmResponse } from './types.js';
import {
  AuthenticationError,
  ContentFilteredError,
  ContextLengthExceededError,
  InvalidRequestError,
  LlmError,
  LlmServiceError,
  NetworkError,
  ProviderServerError,
  RateLimitError,
  ResourceExhaustedError,
} from '../common/errors/index.js';
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

  const callMapError = (error: unknown): LlmError | undefined => {
    return (
      service as unknown as {
        mapError: (error_: unknown) => LlmError | undefined;
      }
    ).mapError(error);
  };

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
      const sendPromise = service.send(payload);
      await expect(sendPromise).rejects.toThrow(LlmServiceError);
      await expect(sendPromise).rejects.toThrow('LLM service error: SDK Error');
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
      const sendPromise = service.send(payload);
      await expect(sendPromise).rejects.toThrow(LlmServiceError);
      await expect(sendPromise).rejects.toThrow(
        'LLM service error: Malformed or irreparable JSON string provided.',
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
      );
    });

    it('should retry on 5xx server errors and throw ProviderServerError after exhausting retries', async () => {
      const serverError = new ApiError({
        message: 'Server error',
        status: 500,
      });
      mockGenerateContent.mockRejectedValue(serverError);

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(ProviderServerError);

      // Now retryable: retries up to LLM_MAX_RETRIES (2) + 1 = 3 times
      expect(mockGenerateContent).toHaveBeenCalledTimes(3);
    });

    it('should wrap an unclassifiable error in LlmServiceError end-to-end', async () => {
      const original = new Error('bogus upstream condition encountered');
      mockGenerateContent.mockRejectedValue(original);

      const payload = createStringPayload();
      let thrown: unknown;
      try {
        await service.send(payload);
      } catch (error: unknown) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(LlmServiceError);
      expect((thrown as LlmServiceError).getStatus()).toBe(500);
      expect((thrown as LlmServiceError).retryable).toBe(false);
      expect((thrown as LlmServiceError).originalError).toBe(original);
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

  describe('mapError', () => {
    describe('RateLimitError', () => {
      it('should return RateLimitError for 429 status', () => {
        const error = new ApiError({
          message: 'Rate limit exceeded',
          status: 429,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(RateLimitError);
        expect(result!.getStatus()).toBe(429);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return RateLimitError for string status RATE_LIMIT_EXCEEDED', () => {
        const result = callMapError({ status: 'RATE_LIMIT_EXCEEDED' });
        expect(result).toBeInstanceOf(RateLimitError);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return RateLimitError for nested error.code of 429', () => {
        const result = callMapError({ error: { code: '429' } });
        expect(result).toBeInstanceOf(RateLimitError);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return RateLimitError for nested error.code RATE_LIMIT_EXCEEDED', () => {
        const result = callMapError({ error: { code: 'RATE_LIMIT_EXCEEDED' } });
        expect(result).toBeInstanceOf(RateLimitError);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return RateLimitError for a string status of "429"', () => {
        const result = callMapError({ status: '429' });
        expect(result).toBeInstanceOf(RateLimitError);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });
    });

    describe('ResourceExhaustedError', () => {
      it('should return ResourceExhaustedError for 429 with RESOURCE_EXHAUSTED message', () => {
        const error = new ApiError({
          message: 'RESOURCE_EXHAUSTED: quota',
          status: 429,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ResourceExhaustedError);
        expect(result!.getStatus()).toBe(503);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return ResourceExhaustedError for string status RESOURCE_EXHAUSTED', () => {
        const result = callMapError({ status: 'RESOURCE_EXHAUSTED' });
        expect(result).toBeInstanceOf(ResourceExhaustedError);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should take priority over RateLimitError when both match', () => {
        const error = new ApiError({
          message: 'RESOURCE_EXHAUSTED',
          status: 429,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ResourceExhaustedError);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return ResourceExhaustedError for nested error.status RESOURCE_EXHAUSTED', () => {
        const result = callMapError({
          error: { status: 'RESOURCE_EXHAUSTED' },
        });
        expect(result).toBeInstanceOf(ResourceExhaustedError);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });
    });

    describe('ProviderServerError', () => {
      it('should return ProviderServerError for 500 status', () => {
        const error = new ApiError({
          message: 'Internal error',
          status: 500,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ProviderServerError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return ProviderServerError for 503 status', () => {
        const error = new ApiError({
          message: 'Service unavailable',
          status: 503,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ProviderServerError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });
    });

    describe('AuthenticationError', () => {
      it('should return AuthenticationError for 401 status', () => {
        const error = new ApiError({
          message: 'Invalid API key',
          status: 401,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(AuthenticationError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return AuthenticationError for 403 status', () => {
        const error = new ApiError({
          message: 'Forbidden',
          status: 403,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(AuthenticationError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return AuthenticationError for a non-ApiError Error carrying status 401', () => {
        const error = Object.assign(new Error('auth failed'), { status: 401 });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(AuthenticationError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
        expect(result!.originalError).toBe(error);
      });
    });

    describe('ContentFilteredError', () => {
      it('should return ContentFilteredError for 400 with safety message', () => {
        const error = new ApiError({
          message: 'Content blocked by safety filters',
          status: 400,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ContentFilteredError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should take priority over ContextLengthExceededError when both match', () => {
        const error = new ApiError({
          message: 'content safety filter blocked: context length',
          status: 400,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ContentFilteredError);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should match on safety-related 400 messages', () => {
        const error = new ApiError({
          message: 'safety filter triggered',
          status: 400,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ContentFilteredError);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });
    });

    describe('ContextLengthExceededError', () => {
      it('should return ContextLengthExceededError for 400 with context length message', () => {
        const error = new ApiError({
          message: 'context length exceeded',
          status: 400,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ContextLengthExceededError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });
    });

    describe('InvalidRequestError', () => {
      it('should return InvalidRequestError for generic 400', () => {
        const error = new ApiError({
          message: 'Invalid argument',
          status: 400,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return InvalidRequestError for unrecognised 4xx (418)', () => {
        const error = new ApiError({
          message: "I'm a teapot",
          status: 418,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return InvalidRequestError for unrecognised 4xx (422)', () => {
        const error = new ApiError({
          message: 'Unprocessable entity',
          status: 422,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('gemini');
      });

      it('should set originalError to undefined when the source error is a non-Error object', () => {
        const result = callMapError({
          status: 400,
          message: 'Invalid argument',
        });
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.originalError).toBeUndefined();
      });
    });

    describe('NetworkError', () => {
      it('should return NetworkError for ECONNREFUSED error', () => {
        const result = callMapError(new Error('connect ECONNREFUSED'));
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return NetworkError for ETIMEDOUT error', () => {
        const result = callMapError(new Error('ETIMEDOUT'));
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return NetworkError for plain fetch failure with no status', () => {
        const result = callMapError(new Error('fetch failed'));
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return NetworkError for ECONNRESET error', () => {
        const result = callMapError(new Error('read ECONNRESET'));
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return NetworkError for ENOTFOUND error', () => {
        const result = callMapError(
          new Error('getaddrinfo ENOTFOUND api.gemini'),
        );
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });

      it('should return NetworkError for a generic network message', () => {
        const result = callMapError(
          new Error('network timeout while connecting'),
        );
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('gemini');
      });
    });

    describe('status code extraction', () => {
      it('should extract status from a nested response.status shape', () => {
        const result = callMapError({ response: { status: 503 } });
        expect(result).toBeInstanceOf(ProviderServerError);
        expect(result!.getStatus()).toBe(502);
      });

      it('should extract status from a nested error.error.status shape', () => {
        const result = callMapError({
          error: { status: 400, message: 'Invalid' },
        });
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.getStatus()).toBe(400);
      });
    });

    describe('unrecognised errors return undefined', () => {
      it('should return undefined for an unrecognised plain object with no status', () => {
        const result = callMapError({ foo: 'bar' });
        expect(result).toBeUndefined();
      });

      it('should return undefined for a string input', () => {
        const result = callMapError('string error');
        expect(result).toBeUndefined();
      });

      it('should return undefined for null input', () => {
        const result = callMapError(null);
        expect(result).toBeUndefined();
      });
    });
  });
});
