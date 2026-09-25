import {
  GoogleGenAI,
  ApiError,
  ThinkingLevel,
  type Content,
  type GenerateContentParameters,
  type GenerateContentConfig,
} from '@google/genai';
import { BadRequestException } from '@nestjs/common';
import { Mock } from 'vitest';
import { ZodError } from 'zod';

import { GeminiService } from './gemini.service.js';
import {
  ImagePromptPayload,
  StringPromptPayload,
  MultiPartPromptPayload,
} from './llm.service.interface.js';
import type { LlmPayload } from './llm.service.interface.js';
import { LlmResponse } from './types.js';
import { AuthenticationError } from '../common/errors/authentication.error.js';
import { ContentFilteredError } from '../common/errors/content-filtered.error.js';
import { ContextLengthExceededError } from '../common/errors/context-length-exceeded.error.js';
import { InvalidRequestError } from '../common/errors/invalid-request.error.js';
import type { LlmError } from '../common/errors/llm-error.base.js';
import { LlmServiceError } from '../common/errors/llm-service.error.js';
import { NetworkError } from '../common/errors/network.error.js';
import { ProviderServerError } from '../common/errors/provider-server.error.js';
import { RateLimitError } from '../common/errors/rate-limit.error.js';
import { ResourceExhaustedError } from '../common/errors/resource-exhausted.error.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { ConfigService } from '../config/config.service.js';
import { buildMultiPartPromptPayload } from '../prompt/prompt.base.js';

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
const createValidResponse = (score: number): { text: string } => {
  return {
    text: `{"completeness": {"score": ${score}, "reasoning": "Test"}, "accuracy": {"score": ${score}, "reasoning": "Test"}, "spag": {"score": ${score}, "reasoning": "Test"}}`,
  };
};

const createStringPayload = (user: string = 'test'): StringPromptPayload => {
  return {
    system: 'system prompt',
    user,
  };
};

const createImagePayload = (): ImagePromptPayload => {
  return {
    system: 'system prompt',
    images: [{ mimeType: 'image/png', data: 'test-data' }],
  };
};

const createMultiPartPayload = (
  messages: MultiPartPromptPayload['messages'],
  extra: Partial<MultiPartPromptPayload> = {},
): MultiPartPromptPayload => {
  return buildMultiPartPromptPayload({
    messages,
    ...extra,
  });
};

const expectConversationRequest = (): GenerateContentParameters & {
  config: GenerateContentConfig;
} => {
  expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  return mockGenerateContent.mock.calls[0][0] as GenerateContentParameters & {
    config: GenerateContentConfig;
  };
};

const expectValidResponse = (result: LlmResponse, score: number): void => {
  expect(result).toEqual({
    completeness: { score, reasoning: 'Test' },
    accuracy: { score, reasoning: 'Test' },
    spag: { score, reasoning: 'Test' },
  });
};

/**
 * Asserts that the SDK was called with the given Gemini 3-series
 * `thinkingLevel` for the `gemini-flash-latest` fixture request.
 * @param thinkingLevel - The expected thinking level.
 */
const expectThinkingLevel = (thinkingLevel: ThinkingLevel): void => {
  expect(mockGenerateContent).toHaveBeenCalledWith({
    model: 'gemini-flash-latest',
    contents: ['test prompt'],
    config: {
      systemInstruction: 'system prompt',
      temperature: 0,
      thinkingConfig: { thinkingLevel },
    },
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
        return key === 'LLM_MAX_RETRIES' ? '2' : null;
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

  // Helper for the Gemini 3-series `thinkingLevel` mapping tests. Gemini 3
  // models (including the `gemini-flash-latest` rolling alias) use
  // `thinkingLevel` rather than `thinkingBudget`. Omitting the level makes
  // the model default to *medium* thinking, so a level must always be sent.
  // See https://ai.google.dev/gemini-api/docs/thinking.
  const sendWithEffort = async (
    reasoningEffort?: StringPromptPayload['reasoningEffort'],
  ): Promise<LlmResponse> => {
    mockGenerateContent.mockResolvedValue(createValidResponse(1));
    const payload: StringPromptPayload = {
      ...createStringPayload('test prompt'),
      model: 'gemini-flash-latest',
      ...(reasoningEffort && { reasoningEffort }),
    };
    return service.send(payload);
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should construct without touching GEMINI_API_KEY, then initialise the SDK lazily on first send', async () => {
    // Construction must not build the client — the key is conditionally
    // required and the DI container eagerly constructs every provider.
    expect(mockGoogleGenAI).not.toHaveBeenCalled();

    mockGenerateContent.mockResolvedValue(createValidResponse(1));
    await service.send(createStringPayload('test prompt'));

    expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'test-api-key' });
    expect(mockGoogleGenAI).toHaveBeenCalledTimes(1);
  });

  it('should construct without a key but fail on first send when GEMINI_API_KEY is missing', async () => {
    const noKeyConfig = {
      get: vi.fn((key: string): string | null => {
        if (key === 'GEMINI_API_KEY') return null;
        if (key === 'LLM_BACKOFF_BASE_MS') return '10';
        return key === 'LLM_MAX_RETRIES' ? '2' : null;
      }),
    } as unknown as ConfigService;

    const keylessService = new GeminiService(noKeyConfig, {
      parse: mockParse,
    } as unknown as JsonParserUtility);

    await expect(
      keylessService.send(createStringPayload('test prompt')),
    ).rejects.toThrow(
      'LLM service error: GEMINI_API_KEY is not set in environment',
    );
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

      expect(mockParse).toHaveBeenCalledWith(malformedJson, true);
    });
  });

  describe('payload dispatch edge cases', () => {
    it('should fail-fast on an unsupported payload type (no user or images)', async () => {
      const malformed = { system: 's' } as unknown as LlmPayload;

      // _sendInternal dispatches via mapPayload, which throws
      // 'Unsupported payload type' from the base class dispatcher.
      await expect(
        (
          service as unknown as {
            _sendInternal: (p: LlmPayload) => Promise<unknown>;
          }
        )._sendInternal(malformed),
      ).rejects.toThrow('Unsupported payload type');

      // The SDK must never be called for an unclassifiable payload.
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('dispatches a multi-part payload through send to the SDK and validates the response', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));
      const multiPartPayload = createMultiPartPayload([
        { role: 'user', parts: [{ kind: 'text', text: 'hi' }] },
      ]);

      const result = await service.send(multiPartPayload);

      expect(mockGenerateContent).toHaveBeenCalledExactlyOnceWith({
        model: 'gemini-2.5-flash-lite',
        contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
        config: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      });
      expectValidResponse(result, 1);
    });

    it('should silently drop an invalid image entry (no data) from the content array', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(3));

      const payload: ImagePromptPayload = {
        system: 'system prompt',
        // First image is valid, second is missing the `data` field
        images: [
          { mimeType: 'image/png', data: 'valid-data' },
          { mimeType: 'image/jpeg' }, // data is undefined
        ],
      };

      const result = await service.send(payload);

      // The SDK call should only include the valid image part.
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            { inlineData: { mimeType: 'image/png', data: 'valid-data' } },
          ],
        }),
      );
      expectValidResponse(result, 3);
    });

    it('should silently drop an image entry with non-string mimeType', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(3));

      const payload: ImagePromptPayload = {
        system: 'system prompt',
        images: [
          { mimeType: 'image/png', data: 'valid-data' },
          { mimeType: 123 as unknown as string, data: 'bad-mime' },
        ],
      };

      const result = await service.send(payload);

      // Only the valid image is included
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            { inlineData: { mimeType: 'image/png', data: 'valid-data' } },
          ],
        }),
      );
      expectValidResponse(result, 3);
    });

    it('should handle an all-invalid images array by sending no image parts', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(3));

      const payload: ImagePromptPayload = {
        system: 'system prompt',
        images: [
          { mimeType: 'image/png' as const }, // no data field
        ],
      };

      // Sending with no valid image parts should still work (empty contents)
      const result = await service.send(payload);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [],
        }),
      );
      expectValidResponse(result, 3);
    });
  });

  describe('optional model and reasoningEffort payload fields', () => {
    it('should use payload.model override for text payloads', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      const payload: StringPromptPayload = {
        ...createStringPayload('test prompt'),
        model: 'gemini-2.5-flash',
      };
      const result = await service.send(payload);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: ['test prompt'],
        config: {
          systemInstruction: 'system prompt',
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      expectValidResponse(result, 1);
    });

    it('should default to gemini-2.5-flash-lite when payload.model is absent (regression)', async () => {
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

    it('should use payload.model override for image payloads', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(3));

      const payload: ImagePromptPayload = {
        ...createImagePayload(),
        model: 'gemini-2.0-flash',
      };
      const result = await service.send(payload);

      // gemini-2.0 models have no thinking support, so thinkingConfig must be
      // omitted entirely (the API rejects it with a 400 INVALID_ARGUMENT).
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash',
        contents: [
          { inlineData: { mimeType: 'image/png', data: 'test-data' } },
        ],
        config: {
          systemInstruction: 'system prompt',
          temperature: 0,
        },
      });
      expectValidResponse(result, 3);
    });

    it.each([
      { reasoningEffort: 'off' as const, thinkingBudget: 0 },
      { reasoningEffort: 'low' as const, thinkingBudget: 0 },
      { reasoningEffort: 'high' as const, thinkingBudget: 1024 },
      { reasoningEffort: 'max' as const, thinkingBudget: 8192 },
    ])(
      'should map reasoningEffort "$reasoningEffort" to thinkingBudget $thinkingBudget',
      async ({ reasoningEffort, thinkingBudget }) => {
        mockGenerateContent.mockResolvedValue(createValidResponse(1));

        const payload: StringPromptPayload = {
          ...createStringPayload('test prompt'),
          reasoningEffort,
        };
        const result = await service.send(payload);

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.5-flash-lite',
          contents: ['test prompt'],
          config: {
            systemInstruction: 'system prompt',
            temperature: 0,
            thinkingConfig: { thinkingBudget },
          },
        });
        expectValidResponse(result, 1);
      },
    );

    it('should default thinkingBudget to 0 when reasoningEffort is absent (regression)', async () => {
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
  });

  describe('thinkingLevel mapping for Gemini 3-series models', () => {
    it('should map reasoningEffort "off" to thinkingLevel MINIMAL', async () => {
      const result = await sendWithEffort('off');
      expectThinkingLevel(ThinkingLevel.MINIMAL);
      expectValidResponse(result, 1);
    });

    it('should map reasoningEffort "low" to thinkingLevel LOW', async () => {
      const result = await sendWithEffort('low');
      expectThinkingLevel(ThinkingLevel.LOW);
      expectValidResponse(result, 1);
    });

    it('should map reasoningEffort "high" to thinkingLevel MEDIUM', async () => {
      const result = await sendWithEffort('high');
      expectThinkingLevel(ThinkingLevel.MEDIUM);
      expectValidResponse(result, 1);
    });

    it('should map reasoningEffort "max" to thinkingLevel HIGH', async () => {
      const result = await sendWithEffort('max');
      expectThinkingLevel(ThinkingLevel.HIGH);
      expectValidResponse(result, 1);
    });

    it('should default to thinkingLevel MINIMAL when reasoningEffort is absent (regression)', async () => {
      // Omitting thinkingConfig would silently default the model to medium
      // thinking, adding latency and cost — the level must be sent explicitly.
      const result = await sendWithEffort();
      expectThinkingLevel(ThinkingLevel.MINIMAL);
      expectValidResponse(result, 1);
    });
  });

  describe('promptCacheKey tolerance', () => {
    const promptCacheKey = 'a'.repeat(64);

    it('accepts a text payload carrying promptCacheKey without throwing and leaves the request unchanged', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(2));

      const payload: StringPromptPayload = {
        ...createStringPayload('test prompt'),
        promptCacheKey,
      };
      const result = await service.send(payload);

      // The cache key is provider-agnostic metadata that Gemini ignores: the
      // generated request must be identical to the keyless case.
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash-lite',
        contents: ['test prompt'],
        config: {
          systemInstruction: 'system prompt',
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      expectValidResponse(result, 2);
    });
  });

  describe('multi-part conversation mapping', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('maps a leading system message to systemInstruction with its text parts joined by blank lines in order', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          {
            role: 'system',
            parts: [
              { kind: 'text', text: 'First instruction' },
              { kind: 'text', text: 'Second instruction' },
            ],
          },
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.config.systemInstruction).toBe(
        'First instruction\n\nSecond instruction',
      );
    });

    it('rejects a system-only conversation at construction so the SDK never receives empty contents', () => {
      // The Gemini API rejects an empty contents array; the schema therefore
      // requires at least one user or assistant message, and a system-only
      // conversation fails at the construction boundary without any
      // provider contact.
      expect(() => {
        return createMultiPartPayload([
          { role: 'system', parts: [{ kind: 'text', text: 'Instructions' }] },
        ]);
      }).toThrow(ZodError);
      expect(mockGenerateContent).not.toHaveBeenCalled();
    });

    it('omits systemInstruction when the conversation has no leading system message', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.config).toEqual({
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      });
    });

    it('maps a mid-conversation system message to a user turn at its position', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
          {
            role: 'system',
            parts: [{ kind: 'text', text: 'Mid instructions' }],
          },
          { role: 'assistant', parts: [{ kind: 'text', text: 'Answer' }] },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.contents).toEqual([
        { role: 'user', parts: [{ text: 'Question' }] },
        { role: 'user', parts: [{ text: 'Mid instructions' }] },
        { role: 'model', parts: [{ text: 'Answer' }] },
      ]);
    });

    it('maps assistant messages to model turns', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
          { role: 'assistant', parts: [{ kind: 'text', text: 'Answer' }] },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.contents).toEqual([
        { role: 'user', parts: [{ text: 'Question' }] },
        { role: 'model', parts: [{ text: 'Answer' }] },
      ]);
    });

    it('maps an assistant-first conversation positionally with the assistant as the leading model turn', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          { role: 'assistant', parts: [{ kind: 'text', text: 'Hello' }] },
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.contents).toEqual([
        { role: 'model', parts: [{ text: 'Hello' }] },
        { role: 'user', parts: [{ text: 'Question' }] },
      ]);
    });

    it('maps a mixed-content user message into one turn with text and inlineData parts in caller order', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          {
            role: 'user',
            parts: [
              { kind: 'text', text: 'Describe this image' },
              { kind: 'image', mimeType: 'image/png', data: 'YWJj' },
              { kind: 'text', text: 'Be concise' },
            ],
          },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.contents).toEqual([
        {
          role: 'user',
          parts: [
            { text: 'Describe this image' },
            { inlineData: { mimeType: 'image/png', data: 'YWJj' } },
            { text: 'Be concise' },
          ],
        },
      ]);
    });

    it('maps an assistant message with text and image parts into a model turn', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
          {
            role: 'assistant',
            parts: [
              { kind: 'text', text: 'Here is the chart' },
              { kind: 'image', mimeType: 'image/png', data: 'Y2hhcnQ=' },
            ],
          },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.contents).toEqual([
        { role: 'user', parts: [{ text: 'Question' }] },
        {
          role: 'model',
          parts: [
            { text: 'Here is the chart' },
            { inlineData: { mimeType: 'image/png', data: 'Y2hhcnQ=' } },
          ],
        },
      ]);
    });

    it('produces text-only turns for a text-only conversation without dropping empty text', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          {
            role: 'user',
            parts: [
              { kind: 'text', text: 'Question' },
              { kind: 'text', text: '' },
            ],
          },
          { role: 'assistant', parts: [{ kind: 'text', text: 'Answer' }] },
          { role: 'user', parts: [{ kind: 'text', text: 'Follow-up' }] },
        ]),
      );

      const request = expectConversationRequest();
      expect(request.contents).toStrictEqual([
        { role: 'user', parts: [{ text: 'Question' }, { text: '' }] },
        { role: 'model', parts: [{ text: 'Answer' }] },
        { role: 'user', parts: [{ text: 'Follow-up' }] },
      ]);
    });

    it('resolves the text model default with per-family thinking config and never forwards promptCacheKey', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload(
          [{ role: 'user', parts: [{ kind: 'text', text: 'Question' }] }],
          { temperature: 0.5, promptCacheKey: 'a'.repeat(64) },
        ),
      );

      const request = expectConversationRequest();
      expect(request.model).toBe('gemini-2.5-flash-lite');
      expect(request.config.temperature).toBe(0.5);
      expect(request.config.thinkingConfig).toEqual({ thinkingBudget: 0 });
      expect(JSON.stringify(request)).not.toContain('promptCacheKey');
    });

    describe.each([
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-3-flash-preview',
      'gemini-flash-latest',
    ])('resolved model %s', (model) => {
      it.each([
        { effort: undefined, budget: 0, level: ThinkingLevel.MINIMAL },
        { effort: 'off', budget: 0, level: ThinkingLevel.MINIMAL },
        { effort: 'low', budget: 0, level: ThinkingLevel.LOW },
        { effort: 'high', budget: 1024, level: ThinkingLevel.MEDIUM },
        { effort: 'max', budget: 8192, level: ThinkingLevel.HIGH },
      ] as const)(
        'preserves config for effort $effort without forwarding the cache key',
        async ({ effort, budget, level }) => {
          mockGenerateContent.mockResolvedValue(createValidResponse(1));
          const result = await service.send(
            createMultiPartPayload(
              [
                {
                  role: 'system',
                  parts: [{ kind: 'text', text: 'Instructions' }],
                },
                { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
              ],
              {
                model,
                reasoningEffort: effort,
                temperature: 0.75,
                promptCacheKey: 'a'.repeat(64),
              },
            ),
          );
          const thinkingConfig = model.startsWith('gemini-2.0')
            ? {}
            : {
                thinkingConfig: model.startsWith('gemini-2.5')
                  ? { thinkingBudget: budget }
                  : { thinkingLevel: level },
              };
          expect(expectConversationRequest()).toStrictEqual({
            model,
            contents: [{ role: 'user', parts: [{ text: 'Question' }] }],
            config: {
              systemInstruction: 'Instructions',
              temperature: 0.75,
              ...thinkingConfig,
            },
          });
          expectValidResponse(result, 1);
        },
      );
    });

    it('labels the multi-part payload as a conversation in debug logging without an unknown-type fall-through', async () => {
      const loggingConfig = {
        get: vi.fn((key: string): string | null => {
          if (key === 'GEMINI_API_KEY') return 'test-api-key';
          if (key === 'LLM_BACKOFF_BASE_MS') return '100';
          if (key === 'LLM_MAX_RETRIES') return '2';
          return key === 'LOG_LLM_CONTENT' ? 'true' : null;
        }),
      } as unknown as ConfigService;
      const loggingService = new GeminiService(loggingConfig, {
        parse: mockParse,
      } as unknown as JsonParserUtility);
      const logger = (
        loggingService as unknown as {
          logger: {
            debug: (...arguments_: unknown[]) => void;
            log: (...arguments_: unknown[]) => void;
          };
        }
      ).logger;
      const debugSpy = vi.spyOn(logger, 'debug');
      const dispatchSpy = vi.spyOn(logger, 'log');

      mockGenerateContent.mockResolvedValue(createValidResponse(1));
      await loggingService.send(
        createMultiPartPayload([
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
        ]),
      );

      expectConversationRequest();
      const messages = debugSpy.mock.calls
        .flat()
        .filter((value): value is string => typeof value === 'string');
      expect(messages.join('\n')).not.toMatch(
        /Unknown payload type|String payload|Image payload/i,
      );
      expect(messages.join('\n')).toMatch(/conversation/i);
      expect(dispatchSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Dispatching LLM request \(conversation prompt/),
      );
    });

    it.each([
      {
        label: 'image payload',
        payload: {
          ...createImagePayload(),
          user: 'ignored text',
          messages: [
            {
              role: 'user',
              parts: [{ kind: 'text', text: 'ignored conversation' }],
            },
          ],
        },
        expectedMessage: 'Image payload being sent',
      },
      {
        label: 'text payload',
        payload: {
          ...createStringPayload(),
          messages: [
            {
              role: 'user',
              parts: [{ kind: 'text', text: 'ignored conversation' }],
            },
          ],
        },
        expectedMessage: 'String payload being sent',
      },
    ])(
      'uses unified image → text → conversation precedence for a colliding $label',
      async ({ payload, expectedMessage }) => {
        const loggingConfig = {
          get: vi.fn((key: string): string | null => {
            if (key === 'GEMINI_API_KEY') return 'test-api-key';
            if (key === 'LLM_BACKOFF_BASE_MS') return '100';
            if (key === 'LLM_MAX_RETRIES') return '2';
            return key === 'LOG_LLM_CONTENT' ? 'true' : null;
          }),
        } as unknown as ConfigService;
        const loggingService = new GeminiService(loggingConfig, {
          parse: mockParse,
        } as unknown as JsonParserUtility);
        const logger = (
          loggingService as unknown as {
            logger: { debug: (...arguments_: unknown[]) => void };
          }
        ).logger;
        const debugSpy = vi.spyOn(logger, 'debug');

        mockGenerateContent.mockResolvedValue(createValidResponse(1));
        await loggingService.send(payload as unknown as LlmPayload);

        expect(
          debugSpy.mock.calls.some((call) => call.includes(expectedMessage)),
        ).toBe(true);
      },
    );

    it('labels the payload as a conversation in the error log rather than as text', async () => {
      const errorSpy = vi.spyOn(
        (
          service as unknown as {
            logger: { error: (...a: unknown[]) => void };
          }
        ).logger,
        'error',
      );

      const providerError = new ApiError({
        message: 'Invalid argument',
        status: 400,
      });
      mockGenerateContent.mockRejectedValue(providerError);

      await expect(
        service.send(
          createMultiPartPayload([
            {
              role: 'user',
              parts: [
                { kind: 'text', text: 'Question' },
                { kind: 'image', mimeType: 'image/png', data: 'YWJj' },
              ],
            },
          ]),
        ),
      ).rejects.toMatchObject({
        originalError: providerError,
        retryable: false,
      });
      expectConversationRequest();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash-lite',
          payloadType: 'conversation',
        }),
        'Error communicating with or validating response from Gemini API',
      );
    });

    it('sends role-tagged turn objects to the SDK with no leading-system turn', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));

      await service.send(
        createMultiPartPayload([
          {
            role: 'system',
            parts: [{ kind: 'text', text: 'Instructions' }],
          },
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
          { role: 'assistant', parts: [{ kind: 'text', text: 'Answer' }] },
        ]),
      );

      const request = expectConversationRequest();
      const contents: Content[] = [
        { role: 'user', parts: [{ text: 'Question' }] },
        { role: 'model', parts: [{ text: 'Answer' }] },
      ];
      expect(request.contents).toStrictEqual(contents);
      expect(request.config.systemInstruction).toBe('Instructions');
    });
  });

  describe('legacy payload request-shape regression', () => {
    it('sends an unchanged legacy text request shape', async () => {
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

    it('sends an unchanged legacy image request shape with mixed validity images', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(3));

      const payload: ImagePromptPayload = {
        system: 'system prompt',
        images: [
          { mimeType: 'image/png', data: 'valid-data' },
          { mimeType: 'image/jpeg' }, // no data → silently dropped
        ],
      };
      const result = await service.send(payload);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.5-flash',
        contents: [
          { inlineData: { mimeType: 'image/png', data: 'valid-data' } },
        ],
        config: {
          systemInstruction: 'system prompt',
          temperature: 0,
          thinkingConfig: { thinkingBudget: 0 },
        },
      });
      expectValidResponse(result, 3);
    });

    it('sends an empty contents array when every legacy image lacks data', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(3));

      const payload: ImagePromptPayload = {
        system: 'system prompt',
        images: [{ mimeType: 'image/png' }],
      };

      const result = await service.send(payload);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [],
        }),
      );
      expectValidResponse(result, 3);
    });
  });

  describe.each([
    {
      variant: 'legacy image',
      legacy: createImagePayload(),
      model: 'gemini-2.5-flash',
      contents: [{ inlineData: { mimeType: 'image/png', data: 'test-data' } }],
    },
    {
      variant: 'legacy text',
      legacy: createStringPayload('test prompt'),
      model: 'gemini-2.5-flash-lite',
      contents: ['test prompt'],
    },
    {
      variant: 'legacy image with a colliding user field',
      legacy: { ...createImagePayload(), user: 'Ignored legacy text' },
      model: 'gemini-2.5-flash',
      contents: [{ inlineData: { mimeType: 'image/png', data: 'test-data' } }],
    },
  ])('discriminator precedence: $variant', ({ legacy, model, contents }) => {
    const expectedRequest = {
      model,
      contents,
      config: {
        systemInstruction: 'system prompt',
        temperature: 0,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    it('preserves legacy contents and system instruction despite valid extra messages', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));
      const payload = {
        ...legacy,
        ...createMultiPartPayload([
          {
            role: 'system',
            parts: [{ kind: 'text', text: 'Ignored conversation instruction' }],
          },
          {
            role: 'user',
            parts: [{ kind: 'text', text: 'Ignored conversation content' }],
          },
        ]),
      };

      const result = await service.send(payload);

      expect(mockGenerateContent).toHaveBeenCalledExactlyOnceWith(
        expectedRequest,
      );
      expectValidResponse(result, 1);
    });

    it('sends the legacy request without reading or schema-parsing malformed extra messages', async () => {
      mockGenerateContent.mockResolvedValue(createValidResponse(1));
      const readMessages = vi.fn(() => null);
      const payload = {
        ...legacy,
        get messages(): null {
          return readMessages();
        },
      };

      const result = service.send(payload);

      expect.soft(readMessages).not.toHaveBeenCalled();
      expectValidResponse(await result, 1);
      expect(mockGenerateContent).toHaveBeenCalledExactlyOnceWith(
        expectedRequest,
      );
    });
  });

  describe('error handling', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

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

    it('logs the invalid response structure once through the structured error log without a debug payload dump', async () => {
      const logger = (
        service as unknown as {
          logger: {
            error: (...a: unknown[]) => void;
            debug: (...a: unknown[]) => void;
          };
        }
      ).logger;
      const errorSpy = vi.spyOn(logger, 'error');
      const debugSpy = vi.spyOn(logger, 'debug');

      mockGenerateContent.mockResolvedValue({
        text: '{"invalid": "structure"}',
      });

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow(ZodError);

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash-lite',
          payloadType: 'text',
          statusCode: undefined,
          stack: expect.any(String),
        }),
        'Error communicating with or validating response from Gemini API',
      );
      const debugMessages = debugSpy.mock.calls
        .flat()
        .filter((value): value is string => typeof value === 'string')
        .join('\n');
      expect(debugMessages).not.toContain('Zod validation failed');
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

    it('wraps a JsonParserUtility BadRequestException as LlmServiceError and preserves the original error', async () => {
      mockGenerateContent.mockResolvedValue({
        text: 'This is not JSON.',
      });

      const badRequestException = new BadRequestException(
        'Malformed or irreparable JSON string provided.',
      );
      mockParse.mockImplementation(() => {
        throw badRequestException;
      });

      const payload = createStringPayload();
      let thrown: unknown;
      try {
        await service.send(payload);
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(LlmServiceError);
      expect((thrown as LlmServiceError).originalError).toBe(
        badRequestException,
      );
      expect(thrown).not.toBeInstanceOf(InvalidRequestError);
    });

    it('should log enriched context on failure', async () => {
      const geminiErrorSpy = vi.spyOn(
        (
          service as unknown as {
            logger: { error: (...a: unknown[]) => void };
          }
        ).logger,
        'error',
      );

      mockGenerateContent.mockRejectedValue(
        Object.assign(new ApiError({ message: 'Server error', status: 500 }), {
          body: 'raw upstream body detail',
        }),
      );

      const payload = createStringPayload();
      await expect(service.send(payload)).rejects.toThrow();

      expect(geminiErrorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-2.5-flash-lite',
          payloadType: 'text',
          statusCode: 500,
          errorMessage: expect.stringContaining('Server error'),
          errorBody: undefined,
          stack: expect.any(String),
        }),
        'Error communicating with or validating response from Gemini API',
      );
    });

    it('includes the upstream error body when content logging is enabled', async () => {
      const loggingConfig = {
        get: vi.fn((key: string): string | null => {
          if (key === 'GEMINI_API_KEY') return 'test-api-key';
          if (key === 'LLM_BACKOFF_BASE_MS') return '100';
          if (key === 'LLM_MAX_RETRIES') return '2';
          return key === 'LOG_LLM_CONTENT' ? 'true' : null;
        }),
      } as unknown as ConfigService;
      const loggingService = new GeminiService(loggingConfig, {
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
      mockGenerateContent.mockRejectedValue(
        Object.assign(new ApiError({ message: 'Server error', status: 500 }), {
          body: 'raw upstream body detail',
        }),
      );

      await expect(
        loggingService.send(createStringPayload()),
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ errorBody: 'raw upstream body detail' }),
        'Error communicating with or validating response from Gemini API',
      );
    });

    it.each([
      {
        label: 'rate limit',
        status: 429,
        message: 'Rate limit exceeded',
        errorClass: RateLimitError,
        retryable: true,
        attempts: 3,
      },
      {
        label: 'server error',
        status: 500,
        message: 'Server error',
        errorClass: ProviderServerError,
        retryable: true,
        attempts: 3,
      },
      {
        label: 'resource exhausted',
        status: 429,
        message: 'RESOURCE_EXHAUSTED: Quota exceeded',
        errorClass: ResourceExhaustedError,
        retryable: false,
        attempts: 1,
      },
    ])(
      'maps an SDK $label rejection for a conversation payload with $attempts attempt(s)',
      async ({ status, message, errorClass, retryable, attempts }) => {
        const logger = (
          service as unknown as {
            logger: { error: (...a: unknown[]) => void };
          }
        ).logger;
        const errorSpy = vi.spyOn(logger, 'error');

        const originalError = Object.assign(new ApiError({ message, status }), {
          body: 'upstream detail',
        });
        mockGenerateContent.mockRejectedValue(originalError);

        const payload = createMultiPartPayload([
          {
            role: 'assistant',
            parts: [
              { kind: 'text', text: 'Here is the chart' },
              { kind: 'image', mimeType: 'image/png', data: 'Y2hhcnQ=' },
            ],
          },
        ]);

        let thrown: unknown;
        try {
          await service.send(payload);
        } catch (error: unknown) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(errorClass);
        expect(thrown).toMatchObject({
          originalError,
          providerName: 'gemini',
          retryable,
        });
        expect(mockGenerateContent).toHaveBeenCalledTimes(attempts);
        expect(errorSpy).toHaveBeenCalledTimes(attempts);
      },
    );

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

  const testRetryBehaviourSuccess = async (
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

  const testRetryBehaviourFailure = async (
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
      await testRetryBehaviourSuccess(
        [new ApiError({ message: 'Rate limited', status: 429 })],
        2,
      );
    });

    it('should retry multiple times with exponential backoff', async () => {
      await testRetryBehaviourSuccess(
        [
          new ApiError({ message: 'Rate limited', status: 429 }),
          new ApiError({ message: 'Rate limited', status: 429 }),
        ],
        3,
      );
    });

    it('should retry on rate limit error messages', async () => {
      await testRetryBehaviourSuccess([new Error('Rate limit exceeded')], 2);
    });

    it('should retry on "too many requests" error messages', async () => {
      await testRetryBehaviourSuccess([new Error('Too many requests')], 2);
    });

    it('should throw error after max retries exceeded', async () => {
      const rateLimitError = new ApiError({
        message: 'Rate limited',
        status: 429,
      });
      await testRetryBehaviourFailure(
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
      it.each([
        {
          description: 'generic 400',
          message: 'Invalid argument',
          status: 400,
        },
        {
          description: 'unrecognised 4xx (418)',
          message: "I'm a teapot",
          status: 418,
        },
        {
          description: 'unrecognised 4xx (422)',
          message: 'Unprocessable entity',
          status: 422,
        },
      ])(
        'should return InvalidRequestError for $description',
        ({ message, status }) => {
          const error = new ApiError({ message, status });
          const result = callMapError(error);
          expect(result).toBeInstanceOf(InvalidRequestError);
          expect(result!.getStatus()).toBe(400);
          expect(result!.retryable).toBe(false);
          expect(result!.providerName).toBe('gemini');
        },
      );

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
      it.each([
        { description: 'ECONNREFUSED error', message: 'connect ECONNREFUSED' },
        { description: 'ETIMEDOUT error', message: 'ETIMEDOUT' },
        {
          description: 'plain fetch failure with no status',
          message: 'fetch failed',
        },
        { description: 'ECONNRESET error', message: 'read ECONNRESET' },
        {
          description: 'ENOTFOUND error',
          message: 'getaddrinfo ENOTFOUND api.gemini',
        },
        {
          description: 'a generic network message',
          message: 'network timeout while connecting',
        },
      ])('should return NetworkError for $description', ({ message }) => {
        const result = callMapError(new Error(message));
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
