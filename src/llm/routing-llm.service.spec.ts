import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GeminiService } from './gemini.service.js';
import { LlmPayload } from './llm.service.interface.js';
import { MistralService } from './mistral.service.js';
import { SUPPORTED_MODELS } from './model-registry.js';
import { RoutingLLMService } from './routing-llm.service.js';
import { LlmResponse } from './types.js';
import { ConfigService } from '../config/config.service.js';

const VALID_TEXT_MODEL = 'gemini-2.5-flash-lite';
const VALID_IMAGE_MODEL = 'gemini-2.5-flash';
const LOW_EFFORT = 'low';
const HIGH_EFFORT = 'high';

const createMockLlmResponse = (): LlmResponse => ({
  completeness: { score: 5, reasoning: 'Good completeness' },
  accuracy: { score: 4, reasoning: 'Reasonable accuracy' },
  spag: { score: 5, reasoning: 'Excellent SPAG' },
});

interface MockProvider {
  send: ReturnType<typeof vi.fn>;
}

interface MockConfigService {
  get: ReturnType<typeof vi.fn>;
}

const createMockConfig = (
  overrides: Record<string, string> = {},
): MockConfigService => ({
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
});

const createMockGemini = (): MockProvider => ({ send: vi.fn() });

const createMockMistral = (): MockProvider => ({ send: vi.fn() });

describe('RoutingLLMService', () => {
  describe('constructor validation', () => {
    it('throws when DEFAULT_TEXT_TABLE_MODEL is unrecognised; message contains the model name and supported prefixes', () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gpt-4o',
      });

      expect(
        () =>
          new RoutingLLMService(
            mockConfig as unknown as ConfigService,
            createMockGemini() as unknown as GeminiService,
            createMockMistral() as unknown as MistralService,
          ),
      ).toThrow(/gpt-4o/);

      expect(
        () =>
          new RoutingLLMService(
            mockConfig as unknown as ConfigService,
            createMockGemini() as unknown as GeminiService,
            createMockMistral() as unknown as MistralService,
          ),
      ).toThrow(SUPPORTED_MODELS[0].prefix);
    });

    it('throws when DEFAULT_IMAGE_MODEL is unrecognised', () => {
      const mockConfig = createMockConfig({ DEFAULT_IMAGE_MODEL: 'claude-3' });

      expect(
        () =>
          new RoutingLLMService(
            mockConfig as unknown as ConfigService,
            createMockGemini() as unknown as GeminiService,
            createMockMistral() as unknown as MistralService,
          ),
      ).toThrow(/claude-3/);
    });

    it('throws a single aggregated error mentioning both names when both models are unrecognised', () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'gpt-4o',
        DEFAULT_IMAGE_MODEL: 'claude-3',
      });

      let error: Error | undefined;
      try {
        new RoutingLLMService(
          mockConfig as unknown as ConfigService,
          createMockGemini() as unknown as GeminiService,
          createMockMistral() as unknown as MistralService,
        );
      } catch (error_) {
        error = error_ as Error;
      }

      expect(error).toBeDefined();
      expect(error!.message).toContain('gpt-4o');
      expect(error!.message).toContain('claude-3');
    });

    it('does not throw when both models are valid, regardless of provider combination', () => {
      // Gemini for text, Gemini for image
      expect(
        () =>
          new RoutingLLMService(
            createMockConfig({
              DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
              DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash',
            }) as unknown as ConfigService,
            createMockGemini() as unknown as GeminiService,
            createMockMistral() as unknown as MistralService,
          ),
      ).not.toThrow();

      // Mistral for text, Mistral for image
      expect(
        () =>
          new RoutingLLMService(
            createMockConfig({
              DEFAULT_TEXT_TABLE_MODEL: 'mistral-small-latest',
              DEFAULT_IMAGE_MODEL: 'pixtral-12b',
            }) as unknown as ConfigService,
            createMockGemini() as unknown as GeminiService,
            createMockMistral() as unknown as MistralService,
          ),
      ).not.toThrow();

      // Gemini for text, Mistral for image (mixed)
      expect(
        () =>
          new RoutingLLMService(
            createMockConfig({
              DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite',
              DEFAULT_IMAGE_MODEL: 'mistral-small-latest',
            }) as unknown as ConfigService,
            createMockGemini() as unknown as GeminiService,
            createMockMistral() as unknown as MistralService,
          ),
      ).not.toThrow();
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

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

      await service.send({ system: 's', user: 'u' });

      expect(mockGemini.send).toHaveBeenCalledTimes(1);
      expect(mockMistral.send).not.toHaveBeenCalled();
    });

    it('routes text payload to Mistral when DEFAULT_TEXT_TABLE_MODEL maps to Mistral', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_TEXT_TABLE_MODEL: 'mistral-small-latest',
      });
      mockMistral.send.mockResolvedValue(createMockLlmResponse());

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

      await service.send({ system: 's', user: 'u' });

      expect(mockMistral.send).toHaveBeenCalledTimes(1);
      expect(mockGemini.send).not.toHaveBeenCalled();
    });

    it('routes image payload to Gemini when DEFAULT_IMAGE_MODEL maps to Gemini', async () => {
      const mockConfig = createMockConfig({
        DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash',
      });
      mockGemini.send.mockResolvedValue(createMockLlmResponse());

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

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

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

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

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

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

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

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
      const serviceText = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
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
      const serviceImage = new RoutingLLMService(
        configImage as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
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

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

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

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

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

      const service = new RoutingLLMService(
        mockConfig as unknown as ConfigService,
        mockGemini as unknown as GeminiService,
        mockMistral as unknown as MistralService,
      );

      const result = await service.send({ system: 's', user: 'u' });

      expect(result).toBe(expected);
    });
  });
});
