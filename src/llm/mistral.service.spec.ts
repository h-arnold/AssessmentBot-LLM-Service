import { Mistral } from '@mistralai/mistralai';
import { Mock } from 'vitest';
import { ZodError } from 'zod';

import {
  ImagePromptPayload,
  LlmPayload,
  StringPromptPayload,
} from './llm.service.interface.js';
import { MistralService } from './mistral.service.js';
import { LlmResponse } from './types.js';
import {
  AuthenticationError,
  ContentFilteredError,
  ContextLengthExceededError,
  InvalidRequestError,
  LlmError,
  NetworkError,
  ProviderServerError,
  RateLimitError,
  ResourceExhaustedError,
} from '../common/errors/index.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { ConfigService } from '../config/config.service.js';

/**
 * Invokes the private `extractResponseText` helper on a MistralService instance.
 * @param instance - The MistralService under test.
 * @param result - The mock provider result to extract text from.
 * @returns The extracted text string.
 */
const callExtractResponseText = (instance: unknown, result: unknown): string =>
  (
    instance as unknown as { extractResponseText: (r: unknown) => string }
  ).extractResponseText(result);

// ---------------------------------------------------------------------------
// Mock the Mistral SDK
// ---------------------------------------------------------------------------
// We mock the entire @mistralai/mistralai module so that `new Mistral({ apiKey })`
// returns a controlled mock. The `chat` property is a lazy getter on the
// Mistral prototype; our mock implementation returns an object with a
// `complete` function we can control per-test.
vi.mock('@mistralai/mistralai', () => {
  return {
    Mistral: vi.fn(),
  };
});

const mockComplete = vi.fn();

const mockMistral = Mistral as Mock;
mockMistral.mockImplementation(function () {
  return {
    chat: { complete: mockComplete },
  };
});

// ---------------------------------------------------------------------------
// Test fixtures and utilities
// ---------------------------------------------------------------------------

/**
 * Creates a valid mock response from the Mistral SDK.
 * @param score - The score to use for all three criteria (0–5).
 * @returns A mock ChatCompletionResponse-like object.
 */
const createValidResponse = (score: number): unknown => ({
  choices: [
    {
      message: {
        content: `{"completeness": {"score": ${score}, "reasoning": "Test"}, "accuracy": {"score": ${score}, "reasoning": "Test"}, "spag": {"score": ${score}, "reasoning": "Test"}}`,
      },
    },
  ],
});

/**
 * Creates a text payload for testing.
 * @param user - The user message content.
 * @returns A StringPromptPayload.
 */
const createStringPayload = (user: string = 'test'): StringPromptPayload => ({
  system: 'system prompt',
  user,
});

/**
 * Creates an image payload for testing.
 * @returns An ImagePromptPayload.
 */
const createImagePayload = (): ImagePromptPayload => ({
  system: 'system prompt',
  images: [{ mimeType: 'image/png', data: 'test-data' }],
});

/**
 * Creates an image payload with multiple images.
 * @returns An ImagePromptPayload with two images.
 */
const createMultiImagePayload = (): ImagePromptPayload => ({
  system: 'system prompt',
  images: [
    { mimeType: 'image/png', data: 'data-1' },
    { mimeType: 'image/jpeg', data: 'data-2' },
  ],
});

/**
 * Asserts that a result matches the expected LlmResponse shape.
 * @param result - The LlmResponse to check.
 * @param score - The expected score for all three criteria.
 */
const expectValidResponse = (result: LlmResponse, score: number): void => {
  expect(result).toEqual({
    completeness: { score, reasoning: 'Test' },
    accuracy: { score, reasoning: 'Test' },
    spag: { score, reasoning: 'Test' },
  });
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MistralService', () => {
  let service: MistralService;
  let configService: ConfigService;
  let mockParse: Mock;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock ConfigService
    configService = {
      get: vi.fn((key: string): string | null => {
        if (key === 'MISTRAL_API_KEY') return 'test-mistral-key';
        if (key === 'LLM_BACKOFF_BASE_MS') return '10';
        if (key === 'LLM_MAX_RETRIES') return '2';
        return null;
      }),
    } as unknown as ConfigService;

    // Mock JsonParserUtility
    mockParse = vi.fn((json: string): unknown => JSON.parse(json) as unknown);

    service = new MistralService(configService, {
      parse: mockParse,
    } as unknown as JsonParserUtility);
  });

  // ---------------------------------------------------------------------------
  // Helper: access the protected mapError method
  // ---------------------------------------------------------------------------

  /**
   * Calls the protected `mapError` method on the service instance.
   * @param error - The error to classify.
   * @returns The classified LlmError, or undefined.
   */
  const callMapError = (error: unknown): LlmError | undefined => {
    return (
      service as unknown as {
        mapError: (error_: unknown) => LlmError | undefined;
      }
    ).mapError(error);
  };

  // ---------------------------------------------------------------------------
  // A. Constructor and initialisation
  // ---------------------------------------------------------------------------

  describe('constructor and lazy client initialisation', () => {
    it('should construct successfully without reading MISTRAL_API_KEY (lazy client)', () => {
      // The key is conditionally required, and the DI container eagerly
      // constructs every provider — so construction must not touch the key.
      expect(configService.get).not.toHaveBeenCalledWith('MISTRAL_API_KEY');
      expect(mockMistral).not.toHaveBeenCalled();
    });

    it('should instantiate the Mistral SDK client with the correct API key on first send', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      await service.send(createStringPayload());

      expect(configService.get).toHaveBeenCalledWith('MISTRAL_API_KEY');
      expect(mockMistral).toHaveBeenCalledWith({ apiKey: 'test-mistral-key' });
      expect(mockMistral).toHaveBeenCalledTimes(1);
    });

    it('should construct the SDK client only once across multiple sends', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      await service.send(createStringPayload());
      await service.send(createStringPayload());

      expect(mockMistral).toHaveBeenCalledTimes(1);
    });

    it('should construct without a key but fail on first send when MISTRAL_API_KEY is empty', async () => {
      const emptyConfig = {
        get: vi.fn((key: string): string | null => {
          if (key === 'MISTRAL_API_KEY') return '';
          if (key === 'LLM_BACKOFF_BASE_MS') return '10';
          if (key === 'LLM_MAX_RETRIES') return '2';
          return null;
        }),
      } as unknown as ConfigService;

      const keylessService = new MistralService(emptyConfig, {
        parse: mockParse,
      } as unknown as JsonParserUtility);

      await expect(keylessService.send(createStringPayload())).rejects.toThrow(
        'LLM service error: MISTRAL_API_KEY is not set in environment',
      );
    });

    it('should construct without a key but fail on first send when MISTRAL_API_KEY is undefined', async () => {
      const noKeyConfig = {
        get: vi.fn((key: string): string | null => {
          if (key === 'MISTRAL_API_KEY') return null;
          if (key === 'LLM_BACKOFF_BASE_MS') return '10';
          if (key === 'LLM_MAX_RETRIES') return '2';
          return null;
        }),
      } as unknown as ConfigService;

      const keylessService = new MistralService(noKeyConfig, {
        parse: mockParse,
      } as unknown as JsonParserUtility);

      await expect(keylessService.send(createStringPayload())).rejects.toThrow(
        'LLM service error: MISTRAL_API_KEY is not set in environment',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // B. _sendInternal — text payload
  // ---------------------------------------------------------------------------

  describe('_sendInternal — text payload', () => {
    it('should send correct model, messages, temperature, and reasoningEffort', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = createStringPayload('test prompt');
      const result = await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: 'system prompt' },
          { role: 'user', content: 'test prompt' },
        ],
        temperature: 0,
        safePrompt: false,
        responseFormat: { type: 'json_object' },
      });
      expectValidResponse(result, 1);
    });

    it('should fall back to mistral-small-latest when payload.model is absent', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = createStringPayload();
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'mistral-small-latest' }),
      );
    });

    it('should use payload.model override when present', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = {
        ...createStringPayload(),
        model: 'pixtral-large-latest',
      };
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'pixtral-large-latest' }),
      );
    });

    it('should omit reasoningEffort when set to off', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = {
        ...createStringPayload(),
        reasoningEffort: 'off' as const,
      };
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.not.objectContaining({ reasoningEffort: expect.anything() }),
      );
    });

    it('should map reasoningEffort low to none', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = {
        ...createStringPayload(),
        reasoningEffort: 'low' as const,
      };
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'none' }),
      );
    });

    it('should map reasoningEffort high to high', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = {
        ...createStringPayload(),
        reasoningEffort: 'high' as const,
      };
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'high' }),
      );
    });

    it('should map reasoningEffort max to high', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = {
        ...createStringPayload(),
        reasoningEffort: 'max' as const,
      };
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ reasoningEffort: 'high' }),
      );
    });

    it('should extract choices[0].message.content and pass it through JsonParserUtility', async () => {
      const rawJson =
        '{"completeness": {"score": 2, "reasoning": "Test"}, "accuracy": {"score": 2, "reasoning": "Test"}, "spag": {"score": 2, "reasoning": "Test"}}';
      mockComplete.mockResolvedValue({
        choices: [{ message: { content: rawJson } }],
      });

      const payload = createStringPayload();
      await service.send(payload);

      expect(mockParse).toHaveBeenCalledWith(rawJson);
    });

    it('should validate parsed result with LlmResponseSchema on the happy path', async () => {
      mockComplete.mockResolvedValue(createValidResponse(4));

      const payload = createStringPayload();
      const result = await service.send(payload);

      expectValidResponse(result, 4);
    });

    it('should throw ZodError when response fails schema validation', async () => {
      mockComplete.mockResolvedValue({
        choices: [{ message: { content: '{"invalid": "structure"}' } }],
      });

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(ZodError);
    });

    it('should include safePrompt and responseFormat in the request', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = createStringPayload();
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          safePrompt: false,
          responseFormat: { type: 'json_object' },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // C. _sendInternal — image payload
  // ---------------------------------------------------------------------------

  describe('_sendInternal — image payload', () => {
    it('should build UserMessage with ImageURLChunk entries', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = createImagePayload();
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'system prompt' },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  imageUrl: 'data:image/png;base64,test-data',
                },
              ],
            },
          ],
        }),
      );
    });

    it('should send correct model for image payload', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = createImagePayload();
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'mistral-small-latest' }),
      );
    });

    it('should handle multiple images in the content array', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload = createMultiImagePayload();
      await service.send(payload);

      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'system prompt' },
            {
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  imageUrl: 'data:image/png;base64,data-1',
                },
                {
                  type: 'image_url',
                  imageUrl: 'data:image/jpeg;base64,data-2',
                },
              ],
            },
          ],
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // C2. Malformed payload dispatch
  // ---------------------------------------------------------------------------

  describe('_sendInternal — malformed payload', () => {
    it('throws "Unsupported payload type" for a payload that is neither text nor image', async () => {
      const malformed = { system: 's' } as unknown as LlmPayload;

      await expect(
        (
          service as unknown as {
            _sendInternal: (p: LlmPayload) => Promise<unknown>;
          }
        )._sendInternal(malformed),
      ).rejects.toThrow('Unsupported payload type');

      // The SDK must never be called for an unclassifiable payload.
      expect(mockComplete).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // C3. extractResponseText branches
  // ---------------------------------------------------------------------------

  describe('extractResponseText', () => {
    it('returns a string content verbatim', () => {
      const result = {
        choices: [{ message: { content: '{"valid": "json"}' } }],
      };
      expect(callExtractResponseText(service, result)).toBe(
        '{"valid": "json"}',
      );
    });

    it('concatenates text chunks from an Array content', () => {
      const result = {
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: '{"completeness": ' },
                { type: 'text', text: '{"score": 3, "reasoning": "A"}' },
                {
                  type: 'text',
                  text: ', "accuracy": {"score": 4, "reasoning": "B"}}',
                },
              ],
            },
          },
        ],
      };
      const expected =
        '{"completeness": {"score": 3, "reasoning": "A"}, "accuracy": {"score": 4, "reasoning": "B"}}';
      expect(callExtractResponseText(service, result)).toBe(expected);
    });

    it('returns an empty string for an Array content with no text chunks', () => {
      const result = {
        choices: [
          {
            message: {
              content: [
                { type: 'image_url', imageUrl: 'data:image/png;base64,abc' },
              ],
            },
          },
        ],
      };
      expect(callExtractResponseText(service, result)).toBe('');
    });

    it('returns an empty string for null content', () => {
      const result = { choices: [{ message: { content: null } }] };
      expect(callExtractResponseText(service, result)).toBe('');
    });

    it('returns an empty string when content is missing', () => {
      const result = { choices: [{ message: {} }] };
      expect(callExtractResponseText(service, result)).toBe('');
    });

    it('returns an empty string when choices is empty', () => {
      const result = { choices: [] };
      expect(callExtractResponseText(service, result)).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // D. mapError
  // ---------------------------------------------------------------------------

  describe('mapError', () => {
    describe('RateLimitError', () => {
      it('should return RateLimitError for 429 with rate-limit message', () => {
        const error = Object.assign(new Error('Rate limit exceeded'), {
          statusCode: 429,
          body: 'Rate limit exceeded',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(RateLimitError);
        expect(result!.getStatus()).toBe(429);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('ResourceExhaustedError', () => {
      it('should return ResourceExhaustedError for 429 with quota message', () => {
        const error = Object.assign(new Error('Quota exceeded'), {
          statusCode: 429,
          body: 'Quota exceeded for this project',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ResourceExhaustedError);
        expect(result!.getStatus()).toBe(503);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });

      it('should take priority over RateLimitError when both patterns match', () => {
        const error = Object.assign(
          new Error('Rate limit exceeded: quota exhausted'),
          { statusCode: 429, body: 'Rate limit exceeded: quota exhausted' },
        );
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ResourceExhaustedError);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('AuthenticationError', () => {
      it('should return AuthenticationError for 401 status', () => {
        const error = Object.assign(new Error('Invalid API key'), {
          statusCode: 401,
          body: 'Invalid API key',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(AuthenticationError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return AuthenticationError for 403 status', () => {
        const error = Object.assign(new Error('Forbidden'), {
          statusCode: 403,
          body: 'Forbidden',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(AuthenticationError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('ContentFilteredError', () => {
      it('should return ContentFilteredError for 400 with safety message', () => {
        const error = Object.assign(
          new Error('Content blocked by safety filters'),
          { statusCode: 400, body: 'Content blocked by safety filters' },
        );
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ContentFilteredError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });

      it('should take priority over ContextLengthExceededError when both match', () => {
        const error = Object.assign(
          new Error('content safety filter blocked: context length'),
          {
            statusCode: 400,
            body: 'content safety filter blocked: context length',
          },
        );
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ContentFilteredError);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('ContextLengthExceededError', () => {
      it('should return ContextLengthExceededError for 400 with context length message', () => {
        const error = Object.assign(new Error('context length exceeded'), {
          statusCode: 400,
          body: 'context length exceeded',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ContextLengthExceededError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('InvalidRequestError', () => {
      it('should return InvalidRequestError for generic 400', () => {
        const error = Object.assign(new Error('Invalid argument'), {
          statusCode: 400,
          body: 'Invalid argument',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return InvalidRequestError for 418 status', () => {
        const error = Object.assign(new Error("I'm a teapot"), {
          statusCode: 418,
          body: "I'm a teapot",
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return InvalidRequestError for 422 status', () => {
        const error = Object.assign(new Error('Unprocessable entity'), {
          statusCode: 422,
          body: 'Unprocessable entity',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(InvalidRequestError);
        expect(result!.getStatus()).toBe(400);
        expect(result!.retryable).toBe(false);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('ProviderServerError', () => {
      it('should return ProviderServerError for 500 status', () => {
        const error = Object.assign(new Error('Internal server error'), {
          statusCode: 500,
          body: 'Internal server error',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ProviderServerError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return ProviderServerError for 503 status', () => {
        const error = Object.assign(new Error('Service unavailable'), {
          statusCode: 503,
          body: 'Service unavailable',
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ProviderServerError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('NetworkError', () => {
      it('should return NetworkError for ConnectionError instance', () => {
        const error = new Error('Connection refused');
        Object.defineProperty(error, 'name', {
          value: 'ConnectionError',
          configurable: true,
          writable: true,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return NetworkError for RequestTimeoutError instance', () => {
        const error = new Error('Request timed out');
        Object.defineProperty(error, 'name', {
          value: 'RequestTimeoutError',
          configurable: true,
          writable: true,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return NetworkError for RequestAbortedError instance', () => {
        const error = new Error('Request aborted');
        Object.defineProperty(error, 'name', {
          value: 'RequestAbortedError',
          configurable: true,
          writable: true,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return NetworkError for UnexpectedClientError instance', () => {
        const error = new Error('Unexpected client error');
        Object.defineProperty(error, 'name', {
          value: 'UnexpectedClientError',
          configurable: true,
          writable: true,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('should return NetworkError for ECONNREFUSED error with no HTTP status', () => {
        const error = new Error('connect ECONNREFUSED');
        const result = callMapError(error);
        expect(result).toBeInstanceOf(NetworkError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });
    });

    describe('real MISTRAL_PROBES status-code fallback paths', () => {
      it('extracts statusCode from error.status when statusCode is absent', () => {
        const error = Object.assign(new Error('Server error'), {
          status: 500,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ProviderServerError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('extracts statusCode from error.code when statusCode and status are absent', () => {
        const error = Object.assign(new Error('Rate limited'), {
          code: 429,
        });
        const result = callMapError(error);
        expect(result).toBeInstanceOf(RateLimitError);
        expect(result!.getStatus()).toBe(429);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('extracts statusCode from error.response.status when all top-level fields are absent', () => {
        const error = { response: { status: 500 }, message: 'Server error' };
        const result = callMapError(error);
        expect(result).toBeInstanceOf(ProviderServerError);
        expect(result!.getStatus()).toBe(502);
        expect(result!.retryable).toBe(true);
        expect(result!.providerName).toBe('mistral');
      });

      it('returns undefined when none of the fallback paths yield a valid status', () => {
        const result = callMapError({ foo: 'bar' });
        expect(result).toBeUndefined();
      });
    });

    describe('unrecognised errors return undefined', () => {
      it('should return undefined for an unrecognised plain object with no status', () => {
        const result = callMapError({ foo: 'bar' });
        expect(result).toBeUndefined();
      });

      it('should return undefined for null input', () => {
        const result = callMapError(null);
        expect(result).toBeUndefined();
      });

      it('should return undefined for undefined input', () => {
        const result = callMapError(undefined);
        expect(result).toBeUndefined();
      });

      it('should return undefined for a string input', () => {
        const result = callMapError('string error');
        expect(result).toBeUndefined();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // E. Retry loop (inherited from LLMService)
  // ---------------------------------------------------------------------------

  describe('retry logic', () => {
    it('should retry on retryable 429 RateLimit and eventually succeed', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        statusCode: 429,
        body: 'Rate limit exceeded',
      });

      mockComplete
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(createValidResponse(2));

      const payload = createStringPayload();
      const result = await service.send(payload);

      expectValidResponse(result, 2);
      expect(mockComplete).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable ResourceExhaustedError', async () => {
      const resourceExhaustedError = Object.assign(
        new Error('Quota exceeded'),
        { statusCode: 429, body: 'Quota exceeded' },
      );

      mockComplete.mockRejectedValueOnce(resourceExhaustedError);

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(
        ResourceExhaustedError,
      );
      expect(mockComplete).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries exhausted on retryable error', async () => {
      const rateLimitError = Object.assign(new Error('Rate limit exceeded'), {
        statusCode: 429,
        body: 'Rate limit exceeded',
      });

      mockComplete.mockRejectedValue(rateLimitError);

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(RateLimitError);
      // LLM_MAX_RETRIES=2 → 3 total attempts
      expect(mockComplete).toHaveBeenCalledTimes(3);
    });
  });

  // ---------------------------------------------------------------------------
  // F. Error logging
  // ---------------------------------------------------------------------------

  describe('error logging', () => {
    it('should log error context on _sendInternal failure', async () => {
      const loggerSpy = vi.spyOn(
        (
          service as unknown as {
            logger: { error: (...a: unknown[]) => void };
          }
        ).logger,
        'error',
      );

      const error = Object.assign(new Error('Server error'), {
        statusCode: 500,
        body: 'raw upstream body detail',
      });
      mockComplete.mockRejectedValue(error);

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mistral-small-latest',
          payloadType: 'text',
          statusCode: 500,
          errorMessage: 'Server error',
          errorBody: 'raw upstream body detail',
          stack: expect.any(String),
        }),
        'Error communicating with or validating response from Mistral API',
      );
    });
  });
});
