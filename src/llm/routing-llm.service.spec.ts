import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { GeminiService } from './gemini.service.js';
import { LlmPayload, MultiPartPromptPayload } from './llm.service.interface.js';
import { MistralService } from './mistral.service.js';
import { SUPPORTED_MODELS } from './model-registry.js';
import { RoutingLLMService } from './routing-llm.service.js';
import { LlmResponse } from './types.js';
import { ConfigService } from '../config/config.service.js';
import { buildMultiPartPromptPayload } from '../prompt/prompt.base.js';

const VALID_TEXT_MODEL = 'gemini-2.5-flash-lite';
const VALID_IMAGE_MODEL = 'gemini-2.5-flash';
const LOW_EFFORT = 'low';
const HIGH_EFFORT = 'high';
const PROMPT_CACHE_KEY = 'a'.repeat(64);

const createMockLlmResponse = (): LlmResponse => {
  return {
    completeness: { score: 5, reasoning: 'Good completeness' },
    accuracy: { score: 4, reasoning: 'Reasonable accuracy' },
    spag: { score: 5, reasoning: 'Excellent SPAG' },
  };
};

interface MockProvider {
  send: ReturnType<typeof vi.fn>;
}

interface MockConfigService {
  get: ReturnType<typeof vi.fn>;
}

const createMockConfig = (
  overrides: Record<string, string> = {},
): MockConfigService => {
  return {
    get: vi.fn((key: string) => {
      switch (key) {
        case 'DEFAULT_TEXT_TABLE_MODEL': {
          return overrides.DEFAULT_TEXT_TABLE_MODEL ?? VALID_TEXT_MODEL;
        }
        case 'DEFAULT_IMAGE_MODEL': {
          return overrides.DEFAULT_IMAGE_MODEL ?? VALID_IMAGE_MODEL;
        }
        case 'TEXT_REASONING_EFFORT': {
          return overrides.TEXT_REASONING_EFFORT ?? LOW_EFFORT;
        }
        case 'IMAGE_REASONING_EFFORT': {
          return overrides.IMAGE_REASONING_EFFORT ?? HIGH_EFFORT;
        }
        default: {
          return;
        }
      }
    }),
  };
};

const createMockGemini = (): MockProvider => ({ send: vi.fn() });

const createMockMistral = (): MockProvider => ({ send: vi.fn() });

/**
 * Factory that creates a RoutingLLMService with typed mocks, centralising
 * the triple `as unknown as XYZService` casts in one place.
 * @param config  - Mock config (defaults to a config with valid models).
 * @param gemini  - Mock Gemini provider (defaults to a fresh mock).
 * @param mistral - Mock Mistral provider (defaults to a fresh mock).
 * @returns A RoutingLLMService backed by the supplied mocks.
 */
const createRoutingService = (
  config: MockConfigService = createMockConfig(),
  gemini: MockProvider = createMockGemini(),
  mistral: MockProvider = createMockMistral(),
): RoutingLLMService => {
  return new RoutingLLMService(
    config as unknown as ConfigService,
    gemini as unknown as GeminiService,
    mistral as unknown as MistralService,
  );
};

describe('RoutingLLMService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('multi-part routing and boundary validation', () => {
    let service: RoutingLLMService;
    let mockGemini: MockProvider;
    let mockMistral: MockProvider;
    let response: LlmResponse;
    const imageModel = 'pixtral-12b';

    beforeEach(() => {
      mockGemini = createMockGemini();
      mockMistral = createMockMistral();
      response = createMockLlmResponse();
      mockGemini.send.mockResolvedValue(response);
      mockMistral.send.mockResolvedValue(response);
      service = createRoutingService(
        createMockConfig({ DEFAULT_IMAGE_MODEL: imageModel }),
        mockGemini,
        mockMistral,
      );
    });

    it('routes text-only conversations with all roles using authoritative text settings without mutation', async () => {
      const payload = buildMultiPartPromptPayload({
        messages: [
          { role: 'system', parts: [{ kind: 'text', text: 'Instructions' }] },
          { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
          { role: 'assistant', parts: [{ kind: 'text', text: '' }] },
        ],
        model: imageModel,
        reasoningEffort: 'max',
        temperature: 0,
        promptCacheKey: PROMPT_CACHE_KEY,
      });
      const original = structuredClone(payload);

      await expect(service.send(payload)).resolves.toBe(response);

      expect(mockGemini.send).toHaveBeenCalledExactlyOnceWith({
        ...original,
        model: VALID_TEXT_MODEL,
        reasoningEffort: LOW_EFFORT,
      });
      expect(mockMistral.send).not.toHaveBeenCalled();
      expect(mockGemini.send.mock.calls[0][0]).not.toBe(payload);
      expect(payload).toStrictEqual(original);
    });

    it.each([
      { role: 'user', position: 'first' },
      { role: 'assistant', position: 'first' },
      { role: 'user', position: 'later' },
      { role: 'assistant', position: 'later' },
    ] as const)(
      'routes an image in the $position $role message using authoritative image settings without mutation',
      async ({ role, position }) => {
        const messages: MultiPartPromptPayload['messages'] = [];
        if (position === 'later') {
          messages.push(
            { role: 'system', parts: [{ kind: 'text', text: 'Instructions' }] },
            { role: 'user', parts: [{ kind: 'text', text: 'Question' }] },
            { role: 'assistant', parts: [{ kind: 'text', text: 'Answer' }] },
          );
        }
        messages.push({
          role,
          parts: [
            { kind: 'text', text: 'Before image' },
            { kind: 'image', mimeType: 'image/png', data: 'YQ==' },
            { kind: 'text', text: 'After image' },
          ],
        });
        const payload = buildMultiPartPromptPayload({
          messages,
          model: VALID_TEXT_MODEL,
          reasoningEffort: 'off',
          temperature: 0.75,
          promptCacheKey: PROMPT_CACHE_KEY,
        });
        const original = structuredClone(payload);

        await expect(service.send(payload)).resolves.toBe(response);

        expect.soft(mockMistral.send).toHaveBeenCalledExactlyOnceWith({
          ...original,
          model: imageModel,
          reasoningEffort: HIGH_EFFORT,
        });
        expect.soft(mockGemini.send).not.toHaveBeenCalled();
        expect(payload).toStrictEqual(original);
        expect(mockMistral.send.mock.calls[0][0]).not.toBe(payload);
      },
    );

    it.each([
      { label: 'text', payload: { system: '', user: '' }, image: false },
      {
        label: 'image without data',
        payload: { system: '', images: [{ mimeType: 'image/png' }] },
        image: true,
      },
      {
        label: 'image before text and malformed messages',
        payload: { system: '', images: [], user: '', messages: null },
        image: true,
      },
      {
        label: 'undefined images before messages',
        payload: { images: undefined, messages: null },
        image: true,
      },
      {
        label: 'text before malformed messages',
        payload: { system: '', user: '', messages: null },
        image: false,
      },
      {
        label: 'undefined text before messages',
        payload: { user: undefined, messages: null },
        image: false,
      },
      {
        label: 'text before image-containing messages',
        payload: {
          system: '',
          user: '',
          messages: [
            {
              role: 'user',
              parts: [{ kind: 'image', mimeType: 'image/png', data: 'data' }],
            },
          ],
        },
        image: false,
      },
    ])(
      'preserves legacy $label routing without validation or mutation',
      async ({ payload, image }) => {
        const original = {
          ...payload,
          model: 'caller-model',
          reasoningEffort: 'max',
          temperature: 0,
          promptCacheKey: PROMPT_CACHE_KEY,
        } as unknown as LlmPayload;
        const snapshot = structuredClone(original);
        const provider = image ? mockMistral : mockGemini;
        const otherProvider = image ? mockGemini : mockMistral;

        await expect(service.send(original)).resolves.toBe(response);

        expect(provider.send).toHaveBeenCalledExactlyOnceWith({
          ...snapshot,
          model: image ? imageModel : VALID_TEXT_MODEL,
          reasoningEffort: image ? HIGH_EFFORT : LOW_EFFORT,
        });
        expect(otherProvider.send).not.toHaveBeenCalled();
        expect(provider.send.mock.calls[0][0]).not.toBe(original);
        expect(original).toStrictEqual(snapshot);
      },
    );
  });

  describe('constructor validation', () => {
    it('throws when DEFAULT_TEXT_TABLE_MODEL is unrecognised; message contains the model name and supported prefixes', () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gpt-4o',
      });

      expect(() => createRoutingService(mockConfig)).toThrow(/gpt-4o/);

      expect(() => createRoutingService(mockConfig)).toThrow(
        SUPPORTED_MODELS[0].prefix,
      );
    });

    it('throws when DEFAULT_IMAGE_MODEL is unrecognised', () => {
      const mockConfig = createMockConfig({ DEFAULT_IMAGE_MODEL: 'claude-3' });

      expect(() => createRoutingService(mockConfig)).toThrow(/claude-3/);
    });

    it('throws a single aggregated error mentioning both names when both models are unrecognised', () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gpt-4o',
        DEFAULT_IMAGE_MODEL: 'claude-3',
      });

      let error: Error | undefined;
      try {
        createRoutingService(mockConfig);
      } catch (error_) {
        error = error_ as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toContain('gpt-4o');
      expect(error!.message).toContain('claude-3');
    });

    it('does not throw when both models are valid, regardless of provider combination', () => {
      // Gemini for text, Gemini for image
      expect(() => {
        return createRoutingService(
          createMockConfig({
            DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
            DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash',
          }),
        );
      }).not.toThrow();

      // Mistral for text, Mistral for image
      expect(() => {
        return createRoutingService(
          createMockConfig({
            DEFAULT_TEXT_TABLE_MODEL: 'mistral-small-latest',
            DEFAULT_IMAGE_MODEL: 'pixtral-12b',
          }),
        );
      }).not.toThrow();

      // Gemini for text, Mistral for image (mixed)
      expect(() => {
        return createRoutingService(
          createMockConfig({
            DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
            DEFAULT_IMAGE_MODEL: 'mistral-small-latest',
          }),
        );
      }).not.toThrow();
    });
  });

  describe('routing logic', () => {
    let mockGemini: MockProvider;
    let mockMistral: MockProvider;

    beforeEach(() => {
      mockGemini = createMockGemini();
      mockMistral = createMockMistral();
    });

    it('routes text payload to Gemini when DEFAULT_TEXT_TABLE_MODEL maps to Gemini', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({ system: 's', user: 'u' });

      expect(mockGemini.send).toHaveBeenCalledTimes(1);
      expect(mockMistral.send).not.toHaveBeenCalled();
    });

    it('routes text payload to Mistral when DEFAULT_TEXT_TABLE_MODEL maps to Mistral', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'mistral-small-latest',
      });
      mockMistral.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({ system: 's', user: 'u' });

      expect(mockMistral.send).toHaveBeenCalledTimes(1);
      expect(mockGemini.send).not.toHaveBeenCalled();
    });

    it('routes image payload to Gemini when DEFAULT_IMAGE_MODEL maps to Gemini', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({
        system: 's',
        images: [{ mimeType: 'image/png', data: 'abc' }],
      });

      expect(mockGemini.send).toHaveBeenCalledTimes(1);
      expect(mockMistral.send).not.toHaveBeenCalled();
    });

    it('routes image payload to Mistral when DEFAULT_IMAGE_MODEL maps to Mistral', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_IMAGE_MODEL: 'mistral-small-latest',
      });
      mockMistral.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({
        system: 's',
        images: [{ mimeType: 'image/png', data: 'abc' }],
      });

      expect(mockMistral.send).toHaveBeenCalledTimes(1);
      expect(mockGemini.send).not.toHaveBeenCalled();
    });

    it('supports mixed config: text → Gemini and image → Mistral in the same test run', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
        DEFAULT_IMAGE_MODEL: 'mistral-small-latest',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());
      mockMistral.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({ system: 's1', user: 'u1' });
      expect(mockGemini.send).toHaveBeenCalledTimes(1);
      expect(mockMistral.send).not.toHaveBeenCalled();

      await service.send({
        system: 's2',
        images: [{ mimeType: 'image/png', data: 'img' }],
      });
      expect(mockMistral.send).toHaveBeenCalledTimes(1);
    });

    it('routed payload carries model set from config', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({ system: 's', user: 'u' });

      const sent = mockGemini.send.mock.calls[0][0] as LlmPayload;
      expect(sent.model).toBe('gemini-2.5-flash-lite');
    });

    it('routed payload carries reasoningEffort set from config', async () => {
      const mockConfig = createMockConfig({
        TEXT_REASONING_EFFORT: 'max',
        IMAGE_REASONING_EFFORT: 'off',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());
      mockMistral.send.mockResolvedValue(createMockLlmResponse());

      // Text payload should carry TEXT_REASONING_EFFORT
      const serviceText = createRoutingService(
        mockConfig,
        mockGemini,
        mockMistral,
      );
      await serviceText.send({ system: 's', user: 'u' });

      const textSent = mockGemini.send.mock.calls[0][0] as LlmPayload;
      expect(textSent.reasoningEffort).toBe('max');

      // Image payload should carry IMAGE_REASONING_EFFORT
      const configImage = createMockConfig({
        DEFAULT_IMAGE_MODEL: 'mistral-small-latest',
        TEXT_REASONING_EFFORT: 'max',
        IMAGE_REASONING_EFFORT: 'off',
      });
      const serviceImage = createRoutingService(
        configImage,
        mockGemini,
        mockMistral,
      );
      await serviceImage.send({
        system: 's',
        images: [{ mimeType: 'image/png', data: 'img' }],
      });

      const imageSent = mockMistral.send.mock.calls[0][0] as LlmPayload;
      expect(imageSent.reasoningEffort).toBe('off');
    });

    it('caller-supplied model is overwritten by server config', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({
        system: 's',
        user: 'u',
        model: 'caller-supplied-model',
      });

      const sent = mockGemini.send.mock.calls[0][0] as LlmPayload;
      expect(sent.model).toBe('gemini-2.5-flash-lite');
      expect(sent.model).not.toBe('caller-supplied-model');
    });

    it('caller-supplied reasoningEffort is overwritten by server config', async () => {
      const mockConfig = createMockConfig({ TEXT_REASONING_EFFORT: 'high' });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({
        system: 's',
        user: 'u',
        reasoningEffort: 'off',
      });

      const sent = mockGemini.send.mock.calls[0][0] as LlmPayload;
      expect(sent.reasoningEffort).toBe('high');
      expect(sent.reasoningEffort).not.toBe('off');
    });

    it('send() returns the provider response directly', async () => {
      const mockConfig = createMockConfig();
      const expected = createMockLlmResponse();
      mockGemini.send.mockResolvedValue(expected);

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      const result = await service.send({ system: 's', user: 'u' });

      expect(result).toBe(expected);
    });

    it('does not mutate the caller-supplied payload object', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
        TEXT_REASONING_EFFORT: 'high',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      const original: LlmPayload = {
        system: 's',
        user: 'u',
        model: 'caller-model',
        reasoningEffort: 'off',
      };

      await service.send(original);

      // The caller's object must be untouched — the router overwrites on a copy.
      expect(original.model).toBe('caller-model');
      expect(original.reasoningEffort).toBe('off');
      // …while the provider received the authoritative server values.
      const sent = mockGemini.send.mock.calls[0][0] as LlmPayload;
      expect(sent).not.toBe(original);
      expect(sent.model).toBe('gemini-2.5-flash-lite');
      expect(sent.reasoningEffort).toBe('high');
    });

    it('preserves promptCacheKey through the payload spread', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = createRoutingService(mockConfig, mockGemini, mockMistral);

      await service.send({
        system: 's',
        user: 'u',
        promptCacheKey: PROMPT_CACHE_KEY,
      });

      const sent = mockGemini.send.mock.calls[0][0] as LlmPayload;
      expect(sent.promptCacheKey).toBe(PROMPT_CACHE_KEY);
    });
  });
});
