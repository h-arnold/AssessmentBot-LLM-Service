import { Mistral } from '@mistralai/mistralai';
import { BadRequestException } from '@nestjs/common';
import { Mock } from 'vitest';
import { ZodError } from 'zod';

import {
  ImagePromptPayload,
  LlmPayload,
  StringPromptPayload,
} from './llm.service.interface.js';
import { MistralService } from './mistral.service.js';
import { LlmResponse } from './types.js';
import { AuthenticationError } from '../common/errors/authentication.error.js';
import { ContentFilteredError } from '../common/errors/content-filtered.error.js';
import { ContextLengthExceededError } from '../common/errors/context-length-exceeded.error.js';
import { InvalidRequestError } from '../common/errors/invalid-request.error.js';
import { LlmError } from '../common/errors/llm-error.base.js';
import { LlmServiceError } from '../common/errors/llm-service.error.js';
import { NetworkError } from '../common/errors/network.error.js';
import { ProviderServerError } from '../common/errors/provider-server.error.js';
import { RateLimitError } from '../common/errors/rate-limit.error.js';
import { ResourceExhaustedError } from '../common/errors/resource-exhausted.error.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { ConfigService } from '../config/config.service.js';
import { buildMultiPartPromptPayload } from '../prompt/prompt.base.js';

/**
 * Invokes the private `extractResponseText` helper on a MistralService instance.
 * @param instance - The MistralService under test.
 * @param result - The mock provider result to extract text from.
 * @returns The extracted text string.
 */
const callExtractResponseText = (
  instance: unknown,
  result: unknown,
): string => {
  return (
    instance as unknown as { extractResponseText: (r: unknown) => string }
  ).extractResponseText(result);
};

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

type MistralCompleteRequest = Parameters<Mistral['chat']['complete']>[0];

const mockComplete = vi.fn();

const conversationPayload = buildMultiPartPromptPayload({
  messages: [{ role: 'user', parts: [{ kind: 'text', text: 'Question' }] }],
});

const expectConversationRequest = (): MistralCompleteRequest => {
  expect(mockComplete).toHaveBeenCalledTimes(1);
  return mockComplete.mock.calls[0][0] as MistralCompleteRequest;
};

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
const createValidResponse = (score: number): unknown => {
  return {
    choices: [
      {
        message: {
          content: `{"completeness": {"score": ${score}, "reasoning": "Test"}, "accuracy": {"score": ${score}, "reasoning": "Test"}, "spag": {"score": ${score}, "reasoning": "Test"}}`,
        },
      },
    ],
  };
};

/**
 * Creates a text payload for testing.
 * @param user - The user message content.
 * @returns A StringPromptPayload.
 */
const createStringPayload = (user: string = 'test'): StringPromptPayload => {
  return {
    system: 'system prompt',
    user,
  };
};

/**
 * Creates an image payload for testing.
 * @returns An ImagePromptPayload.
 */
const createImagePayload = (): ImagePromptPayload => {
  return {
    system: 'system prompt',
    images: [{ mimeType: 'image/png', data: 'test-data' }],
  };
};

/**
 * Creates an image payload with multiple images.
 * @returns An ImagePromptPayload with two images.
 */
const createMultiImagePayload = (): ImagePromptPayload => {
  return {
    system: 'system prompt',
    images: [
      { mimeType: 'image/png', data: 'data-1' },
      { mimeType: 'image/jpeg', data: 'data-2' },
    ],
  };
};

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
        return key === 'LLM_MAX_RETRIES' ? '2' : null;
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
      // The full constructor options are pinned by the EU-server test below;
      // here we assert the key is supplied on the lazy-construction path.
      expect(mockMistral).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'test-mistral-key' }),
      );
      expect(mockMistral).toHaveBeenCalledTimes(1);
    });

    it('should pin the SDK client to the EU server on the lazy construction path', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      await service.send(createStringPayload());

      // EU pinning is fixed policy (SPEC product decision #8): the client is
      // constructed with `server: 'eu'`, resolving to
      // https://api.eu.mistral.ai rather than the global default.
      expect(mockMistral).toHaveBeenCalledWith({
        apiKey: 'test-mistral-key',
        server: 'eu',
      });
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
          return key === 'LLM_MAX_RETRIES' ? '2' : null;
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
          return key === 'LLM_MAX_RETRIES' ? '2' : null;
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
        responseFormat: { type: 'text' },
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

    it.each([
      { reasoningEffort: 'low' as const, expected: 'none' as const },
      { reasoningEffort: 'high' as const, expected: 'high' as const },
      { reasoningEffort: 'max' as const, expected: 'high' as const },
    ])(
      'should map reasoningEffort $reasoningEffort to $expected',
      async ({ reasoningEffort, expected }) => {
        mockComplete.mockResolvedValue(createValidResponse(1));

        const payload = {
          ...createStringPayload(),
          reasoningEffort,
        };
        await service.send(payload);

        expect(mockComplete).toHaveBeenCalledWith(
          expect.objectContaining({ reasoningEffort: expected }),
        );
      },
    );

    it('should extract choices[0].message.content and pass it through JsonParserUtility', async () => {
      const rawJson =
        '{"completeness": {"score": 2, "reasoning": "Test"}, "accuracy": {"score": 2, "reasoning": "Test"}, "spag": {"score": 2, "reasoning": "Test"}}';
      mockComplete.mockResolvedValue({
        choices: [{ message: { content: rawJson } }],
      });

      const payload = createStringPayload();
      await service.send(payload);

      expect(mockParse).toHaveBeenCalledWith(rawJson, true);
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
          responseFormat: { type: 'text' },
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
                  type: 'text',
                  text: 'Assess these images per your system instructions. If you do not have system instructions, report this',
                },
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
                  type: 'text',
                  text: 'Assess these images per your system instructions. If you do not have system instructions, report this',
                },
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

    it('should silently drop an image entry with no data field from the content array', async () => {
      mockComplete.mockResolvedValue(createValidResponse(3));

      const payload: ImagePromptPayload = {
        system: 'system prompt',
        // First image is valid, second is missing the `data` field
        images: [
          { mimeType: 'image/png', data: 'valid-data' },
          { mimeType: 'image/jpeg' }, // data is undefined
        ],
      };

      const result = await service.send(payload);

      // Only the valid image is included; no `base64,undefined` URI is sent.
      expect(mockComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'system prompt' },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Assess these images per your system instructions. If you do not have system instructions, report this',
                },
                {
                  type: 'image_url',
                  imageUrl: 'data:image/png;base64,valid-data',
                },
              ],
            },
          ],
        }),
      );
      expectValidResponse(result, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // C1. promptCacheKey forwarding
  // ---------------------------------------------------------------------------

  describe('promptCacheKey forwarding', () => {
    const promptCacheKey = 'a'.repeat(64);

    it('forwards promptCacheKey on a text payload request when present', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload: StringPromptPayload = {
        ...createStringPayload(),
        promptCacheKey,
      };
      await service.send(payload);

      const request = mockComplete.mock.calls[0][0] as Record<string, unknown>;
      expect(request.promptCacheKey).toBe(promptCacheKey);
    });

    it('forwards promptCacheKey on an image payload request when present', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const payload: ImagePromptPayload = {
        ...createImagePayload(),
        promptCacheKey,
      };
      await service.send(payload);

      const request = mockComplete.mock.calls[0][0] as Record<string, unknown>;
      expect(request.promptCacheKey).toBe(promptCacheKey);
    });

    it('omits promptCacheKey entirely when the payload does not carry one', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      await service.send(createStringPayload());

      const request = mockComplete.mock.calls[0][0] as Record<string, unknown>;
      // The field must be absent from the built request — not present as
      // `undefined`/`null`, and never sent under the provider-native spelling.
      expect('promptCacheKey' in request).toBe(false);
      expect('prompt_cache_key' in request).toBe(false);
      expect(request.promptCacheKey).toBeUndefined();
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

    it('dispatches a multi-part payload through public send and validates the response', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));

      const result = await service.send(conversationPayload);

      const expected: MistralCompleteRequest = {
        model: 'mistral-small-latest',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Question' }] },
        ],
        temperature: 0,
        safePrompt: false,
        responseFormat: { type: 'text' },
      };
      expect(expectConversationRequest()).toStrictEqual(expected);
      expectValidResponse(result, 1);
    });
  });

  describe('multi-part conversation mapping', () => {
    afterEach(() => {
      vi.restoreAllMocks();
      mockComplete.mockReset();
    });

    it('preserves native roles and separate text chunks in caller order, including later system messages', async () => {
      mockComplete.mockResolvedValue(createValidResponse(2));
      const payload = buildMultiPartPromptPayload({
        messages: [
          {
            role: 'system',
            parts: [
              { kind: 'text', text: 'First instruction' },
              { kind: 'text', text: 'Second instruction' },
            ],
          },
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
          { role: 'assistant', parts: [{ kind: 'text', text: 'Answer' }] },
          {
            role: 'system',
            parts: [{ kind: 'text', text: 'Later instruction' }],
          },
          { role: 'system', parts: [{ kind: 'text', text: '' }] },
          { role: 'user', parts: [{ kind: 'text', text: 'Follow-up' }] },
        ],
      });
      const original = structuredClone(payload);

      const result = await service.send(payload);

      // SDK-typed expectations pin system text arrays without a cast.
      const messages: MistralCompleteRequest['messages'] = [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'First instruction' },
            { type: 'text', text: 'Second instruction' },
          ],
        },
        { role: 'user', content: [{ type: 'text', text: 'Question' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'Answer' }] },
        {
          role: 'system',
          content: [{ type: 'text', text: 'Later instruction' }],
        },
        { role: 'system', content: [{ type: 'text', text: '' }] },
        { role: 'user', content: [{ type: 'text', text: 'Follow-up' }] },
      ];
      expect(expectConversationRequest().messages).toStrictEqual(messages);
      expect(payload).toStrictEqual(original);
      expectValidResponse(result, 2);
    });

    it.each(['user', 'assistant'] as const)(
      'keeps a single %s message as a single text-chunk array without injecting content',
      async (role) => {
        mockComplete.mockResolvedValue(createValidResponse(1));
        await service.send(
          buildMultiPartPromptPayload({
            messages: [{ role, parts: [{ kind: 'text', text: '' }] }],
          }),
        );

        const messages: MistralCompleteRequest['messages'] = [
          { role, content: [{ type: 'text', text: '' }] },
        ];
        expect(expectConversationRequest().messages).toStrictEqual(messages);
      },
    );

    it('rejects a system-only conversation at construction', () => {
      // A conversation with only a system message maps to no user/assistant
      // turns; the schema rejects it at the construction boundary so the
      // provider never receives a message array without user content.
      expect(() => {
        return buildMultiPartPromptPayload({
          messages: [{ role: 'system', parts: [{ kind: 'text', text: '' }] }],
        });
      }).toThrow(ZodError);
    });

    it('preserves an assistant-first conversation without adding or reordering turns', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));
      await service.send(
        buildMultiPartPromptPayload({
          messages: [
            { role: 'assistant', parts: [{ kind: 'text', text: 'Hello' }] },
            { role: 'system', parts: [{ kind: 'text', text: 'Instructions' }] },
            { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
          ],
        }),
      );

      const messages: MistralCompleteRequest['messages'] = [
        { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'system', content: [{ type: 'text', text: 'Instructions' }] },
        { role: 'user', content: [{ type: 'text', text: 'Question' }] },
      ];
      expect(expectConversationRequest().messages).toStrictEqual(messages);
    });

    it.each(['user', 'assistant'] as const)(
      'maps mixed %s parts to ordered text and image data-URI chunks without the legacy instruction',
      async (role) => {
        mockComplete.mockResolvedValue(createValidResponse(3));
        await service.send(
          buildMultiPartPromptPayload({
            messages: [
              {
                role,
                parts: [
                  { kind: 'text', text: 'Compare' },
                  { kind: 'image', mimeType: 'image/png', data: 'Zmlyc3Q=' },
                  { kind: 'text', text: 'with' },
                  { kind: 'image', mimeType: 'image/jpeg', data: 'c2Vjb25k' },
                  { kind: 'text', text: 'Explain' },
                ],
              },
            ],
          }),
        );

        const messages: MistralCompleteRequest['messages'] = [
          {
            role,
            content: [
              { type: 'text', text: 'Compare' },
              {
                type: 'image_url',
                imageUrl: 'data:image/png;base64,Zmlyc3Q=',
              },
              { type: 'text', text: 'with' },
              {
                type: 'image_url',
                imageUrl: 'data:image/jpeg;base64,c2Vjb25k',
              },
              { type: 'text', text: 'Explain' },
            ],
          },
        ];
        expect(expectConversationRequest().messages).toStrictEqual(messages);
      },
    );

    it('passes an image-only message through without silent dropping or instruction injection', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));
      await service.send(
        buildMultiPartPromptPayload({
          messages: [
            {
              role: 'user',
              parts: [{ kind: 'image', mimeType: 'image/png', data: 'YQ==' }],
            },
          ],
        }),
      );
      expect(expectConversationRequest().messages).toStrictEqual([
        {
          role: 'user',
          content: [
            { type: 'image_url', imageUrl: 'data:image/png;base64,YQ==' },
          ],
        },
      ]);
    });

    it.each([
      { effort: undefined, native: undefined },
      { effort: 'off', native: undefined },
      { effort: 'low', native: 'none' },
      { effort: 'high', native: 'high' },
      { effort: 'max', native: 'high' },
    ] as const)(
      'preserves request options and cache forwarding for reasoning effort $effort',
      async ({ effort, native }) => {
        mockComplete.mockResolvedValue(createValidResponse(1));
        await service.send(
          buildMultiPartPromptPayload({
            ...conversationPayload,
            model: 'pixtral-large-latest',
            temperature: 0.75,
            reasoningEffort: effort,
            promptCacheKey: 'a'.repeat(64),
          }),
        );

        const expected: MistralCompleteRequest = {
          model: 'pixtral-large-latest',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Question' }] },
          ],
          temperature: 0.75,
          safePrompt: false,
          responseFormat: { type: 'text' },
          promptCacheKey: 'a'.repeat(64),
          ...(native !== undefined && { reasoningEffort: native }),
        };
        expect(expectConversationRequest()).toStrictEqual(expected);
      },
    );

    it('omits absent cache and effort fields entirely and preserves the EU client pin', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));
      await service.send(conversationPayload);
      const request = expectConversationRequest();
      expect(request).not.toHaveProperty('promptCacheKey');
      expect(request).not.toHaveProperty('prompt_cache_key');
      expect(request).not.toHaveProperty('reasoningEffort');
      expect(mockMistral).toHaveBeenCalledExactlyOnceWith({
        apiKey: 'test-mistral-key',
        server: 'eu',
      });
    });

    it.each([
      {
        status: 400,
        message: 'Unsupported assistant image',
        errorClass: InvalidRequestError,
        retryable: false,
        attempts: 1,
      },
      {
        status: 429,
        message: 'Quota exceeded',
        errorClass: ResourceExhaustedError,
        retryable: false,
        attempts: 1,
      },
      {
        status: 429,
        message: 'Rate limit exceeded',
        errorClass: RateLimitError,
        retryable: true,
        attempts: 3,
      },
      {
        status: 500,
        message: 'Server error',
        errorClass: ProviderServerError,
        retryable: true,
        attempts: 3,
      },
    ])(
      'preserves $errorClass.name classification and conversation error context for $message',
      async ({ status, message, errorClass, retryable, attempts }) => {
        const logger = (
          service as unknown as {
            logger: { error: (...arguments_: unknown[]) => void };
          }
        ).logger;
        const errorSpy = vi.spyOn(logger, 'error');
        const providerError = Object.assign(new Error(message), {
          statusCode: status,
          body: 'upstream detail',
        });
        mockComplete.mockRejectedValue(providerError);
        const promise = service.send(
          buildMultiPartPromptPayload({
            messages: [
              {
                role: 'assistant',
                parts: [
                  { kind: 'text', text: 'Image' },
                  { kind: 'image', mimeType: 'image/png', data: 'ZGF0YQ==' },
                ],
              },
            ],
          }),
        );

        await expect(promise).rejects.toBeInstanceOf(errorClass);
        await expect(promise).rejects.toMatchObject({
          originalError: providerError,
          providerName: 'mistral',
          retryable,
        });
        expect(mockComplete).toHaveBeenCalledTimes(attempts);
        expect(errorSpy).toHaveBeenCalledTimes(attempts);
        expect(errorSpy).toHaveBeenCalledWith(
          {
            model: 'mistral-small-latest',
            payloadType: 'conversation',
            statusCode: status,
            errorMessage: message,
            errorBody: undefined,
            stack: providerError.stack,
          },
          'Error communicating with or validating response from Mistral API',
        );
      },
    );

    it('keeps existing debug messages without introducing a payload-type label when content logging is enabled', async () => {
      vi.mocked(configService.get).mockReturnValueOnce(true);
      const loggingService = new MistralService(configService, {
        parse: mockParse,
      } as unknown as JsonParserUtility);
      const logger = (
        loggingService as unknown as {
          logger: { debug: (...arguments_: unknown[]) => void };
        }
      ).logger;
      const debugSpy = vi.spyOn(logger, 'debug');
      const responseText = JSON.stringify({
        completeness: { score: 1, reasoning: 'Test' },
        accuracy: { score: 1, reasoning: 'Test' },
        spag: { score: 1, reasoning: 'Test' },
      });
      mockComplete.mockResolvedValue({
        choices: [{ message: { content: responseText } }],
      });

      const result = await loggingService.send(conversationPayload);

      expectConversationRequest();
      expect(debugSpy.mock.calls).toStrictEqual([
        ['Sending to Mistral with model: mistral-small-latest, temperature: 0'],
        [{ responseText }, 'Raw response from Mistral'],
        [{ parsedJson: result }, 'Parsed JSON response'],
      ]);
    });

    it('concatenates response text chunks through the existing parser and response validation', async () => {
      const responseText = JSON.stringify({
        completeness: { score: 2, reasoning: 'Test' },
        accuracy: { score: 2, reasoning: 'Test' },
        spag: { score: 2, reasoning: 'Test' },
      });
      mockComplete.mockResolvedValue({
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: responseText.slice(0, 20) },
                { type: 'text', text: responseText.slice(20) },
              ],
            },
          },
        ],
      });
      const result = await service.send(conversationPayload);
      expectConversationRequest();
      expect(mockParse).toHaveBeenCalledExactlyOnceWith(responseText, true);
      expectValidResponse(result, 2);
    });

    it('propagates invalid response validation as ZodError without retrying', async () => {
      mockComplete.mockResolvedValue({
        choices: [{ message: { content: '{}' } }],
      });
      await expect(service.send(conversationPayload)).rejects.toBeInstanceOf(
        ZodError,
      );
      expectConversationRequest();
      expect(mockParse).toHaveBeenCalledExactlyOnceWith('{}', true);
    });

    it('does not log Zod validation issues as raw provider content', async () => {
      const logger = (
        service as unknown as {
          logger: { debug: (...arguments_: unknown[]) => void };
        }
      ).logger;
      const debugSpy = vi.spyOn(logger, 'debug');
      mockComplete.mockResolvedValue({
        choices: [{ message: { content: '{"invalid":"student response"}' } }],
      });

      await expect(service.send(conversationPayload)).rejects.toBeInstanceOf(
        ZodError,
      );

      const debugMessages = debugSpy.mock.calls
        .flat()
        .filter((value): value is string => typeof value === 'string')
        .join('\n');
      expect(debugMessages).not.toContain('Zod validation failed');
      expect(debugMessages).not.toContain('student response');
    });

    it('wraps a JsonParserUtility BadRequestException as LlmServiceError and preserves the original error', async () => {
      mockComplete.mockResolvedValue(createValidResponse(1));
      const badRequestException = new BadRequestException(
        'Malformed or irreparable JSON string provided.',
      );
      mockParse.mockImplementation(() => {
        throw badRequestException;
      });

      let thrown: unknown;
      try {
        await service.send(conversationPayload);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(LlmServiceError);
      expect((thrown as LlmServiceError).originalError).toBe(
        badRequestException,
      );
      expect(thrown).not.toBeInstanceOf(InvalidRequestError);
    });
  });

  describe('legacy image silent-drop regression', () => {
    it('retains the string system message and injected instruction when all images lack data', async () => {
      mockComplete.mockResolvedValue(createValidResponse(3));
      const result = await service.send({
        system: 'system prompt',
        images: [{ mimeType: 'image/png' }, { mimeType: 'image/jpeg' }],
      });
      expect(mockComplete).toHaveBeenCalledExactlyOnceWith({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: 'system prompt' },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Assess these images per your system instructions. If you do not have system instructions, report this',
              },
            ],
          },
        ],
        temperature: 0,
        safePrompt: false,
        responseFormat: { type: 'text' },
      });
      expectValidResponse(result, 3);
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
      it.each([
        {
          description: 'generic 400',
          message: 'Invalid argument',
          status: 400,
        },
        { description: '418 status', message: "I'm a teapot", status: 418 },
        {
          description: '422 status',
          message: 'Unprocessable entity',
          status: 422,
        },
      ])(
        'should return InvalidRequestError for $description',
        ({ message, status }) => {
          const error = Object.assign(new Error(message), {
            statusCode: status,
            body: message,
          });
          const result = callMapError(error);
          expect(result).toBeInstanceOf(InvalidRequestError);
          expect(result!.getStatus()).toBe(400);
          expect(result!.retryable).toBe(false);
          expect(result!.providerName).toBe('mistral');
        },
      );
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
      it.each([
        {
          description: 'ConnectionError instance',
          message: 'Connection refused',
          name: 'ConnectionError',
        },
        {
          description: 'RequestTimeoutError instance',
          message: 'Request timed out',
          name: 'RequestTimeoutError',
        },
        {
          description: 'RequestAbortedError instance',
          message: 'Request aborted',
          name: 'RequestAbortedError',
        },
        {
          description: 'UnexpectedClientError instance',
          message: 'Unexpected client error',
          name: 'UnexpectedClientError',
        },
        {
          description: 'ECONNREFUSED error with no HTTP status',
          message: 'connect ECONNREFUSED',
        },
      ])('should return NetworkError for $description', ({ message, name }) => {
        const error = new Error(message);
        if (name !== undefined) {
          Object.defineProperty(error, 'name', {
            value: name,
            configurable: true,
            writable: true,
          });
        }
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
            logger: { error: (...arguments_: unknown[]) => void };
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
          errorBody: undefined,
          stack: expect.any(String),
        }),
        'Error communicating with or validating response from Mistral API',
      );
    });

    it('labels image payload errors as image without exposing the upstream body', async () => {
      const logger = (
        service as unknown as {
          logger: { error: (...arguments_: unknown[]) => void };
        }
      ).logger;
      const errorSpy = vi.spyOn(logger, 'error');
      mockComplete.mockRejectedValue(
        Object.assign(new Error('Image failure'), {
          statusCode: 400,
          body: 'raw image upstream body',
        }),
      );

      await expect(service.send(createImagePayload())).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          payloadType: 'image',
          errorBody: undefined,
        }),
        'Error communicating with or validating response from Mistral API',
      );
    });

    it('includes the upstream error body when content logging is enabled', async () => {
      const loggingConfig = {
        get: vi.fn((key: string): string | null => {
          if (key === 'MISTRAL_API_KEY') return 'test-mistral-key';
          if (key === 'LLM_BACKOFF_BASE_MS') return '10';
          if (key === 'LLM_MAX_RETRIES') return '2';
          return key === 'LOG_LLM_CONTENT' ? 'true' : null;
        }),
      } as unknown as ConfigService;
      const loggingService = new MistralService(loggingConfig, {
        parse: mockParse,
      } as unknown as JsonParserUtility);
      const errorSpy = vi.spyOn(
        (
          loggingService as unknown as {
            logger: { error: (...arguments_: unknown[]) => void };
          }
        ).logger,
        'error',
      );
      mockComplete.mockRejectedValue(
        Object.assign(new Error('Server error'), {
          statusCode: 500,
          body: 'raw upstream body detail',
        }),
      );

      await expect(
        loggingService.send(createStringPayload()),
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ errorBody: 'raw upstream body detail' }),
        'Error communicating with or validating response from Mistral API',
      );
    });

    it.each([null, undefined])(
      'should surface an LlmServiceError when the SDK rejects with %s',
      async (rejection) => {
        const logger = (
          service as unknown as {
            logger: { error: (...arguments_: unknown[]) => void };
          }
        ).logger;
        const errorSpy = vi.spyOn(logger, 'error');

        mockComplete.mockRejectedValue(rejection as never);

        const payload = createStringPayload();
        let thrown: unknown;
        try {
          await service.send(payload);
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(LlmServiceError);
        expect(thrown).toMatchObject({
          message: 'LLM service error: Unknown error',
          providerName: 'mistral',
          retryable: false,
        });

        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({
            model: 'mistral-small-latest',
            payloadType: 'text',
            errorMessage: String(rejection),
          }),
          'Error communicating with or validating response from Mistral API',
        );
      },
    );
  });

  describe('logProviderError payload labelling', () => {
    it('labels a payload matching no known type as unknown without throwing', () => {
      const logger = (
        service as unknown as {
          logger: { error: (...arguments_: unknown[]) => void };
        }
      ).logger;
      const errorSpy = vi.spyOn(logger, 'error');

      const callLogProviderError = (): void => {
        (
          service as unknown as {
            logProviderError(
              error: unknown,
              model: string,
              payload: LlmPayload,
            ): void;
          }
        ).logProviderError(
          new Error('upstream failure'),
          'mistral-small-latest',
          {} as unknown as LlmPayload,
        );
      };

      expect(callLogProviderError).not.toThrow();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          model: 'mistral-small-latest',
          payloadType: 'unknown',
          errorMessage: 'upstream failure',
        }),
        'Error communicating with or validating response from Mistral API',
      );
    });
  });
});
