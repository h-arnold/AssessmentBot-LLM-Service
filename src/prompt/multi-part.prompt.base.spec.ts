import { Logger } from '@nestjs/common';
import { expectTypeOf } from 'vitest';
import { ZodError } from 'zod';

import {
  referenceLabel,
  studentLabel,
  templateLabel,
} from './image-prompt.test-fixtures.js';
import { MultiPartPrompt } from './multi-part.prompt.base.js';
import { buildPromptCacheKey, Prompt, PromptInput } from './prompt.base.js';
import { ConfigService } from '../config/config.service.js';
import {
  LlmContentPart,
  MultiPartPromptPayload,
  MultiPartPromptPayloadSchema,
} from '../llm/llm.service.interface.js';

// Minimal concrete subclass exercising the abstract hook. The parts
// supplied at construction time are returned verbatim so each test can
// control the ordered user content deterministically.
class StubMultiPartPrompt extends MultiPartPrompt {
  private readonly userParts: LlmContentPart[];

  constructor(
    inputs: unknown,
    logger: Logger,
    userParts: LlmContentPart[],
    systemPrompt?: string,
    configService?: ConfigService,
  ) {
    super(inputs, logger, undefined, systemPrompt, configService);
    this.userParts = userParts;
  }

  protected async buildUserParts(): Promise<LlmContentPart[]> {
    return this.userParts;
  }
}

// Subclass whose hook always throws, proving hook failures propagate
// without a fallback payload.
class FailingHookPrompt extends MultiPartPrompt {
  constructor(inputs: unknown, logger: Logger) {
    super(inputs, logger);
  }

  protected async buildUserParts(): Promise<LlmContentPart[]> {
    throw new Error('Hook failure');
  }
}

describe('MultiPartPrompt', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  const validInput: PromptInput = {
    referenceTask: 'Reference task content.',
    studentTask: 'Student task content.',
    emptyTask: 'Empty task content.',
  };

  // Ordered mixed text/image parts; each image uses standard padded
  // base64 accepted by MultiPartPromptPayloadSchema.
  const orderedUserParts: LlmContentPart[] = [
    { kind: 'text', text: referenceLabel },
    { kind: 'image', mimeType: 'image/png', data: 'YQ==' },
    { kind: 'text', text: templateLabel },
    { kind: 'image', mimeType: 'image/jpeg', data: 'YWI=' },
    { kind: 'text', text: studentLabel },
    { kind: 'image', mimeType: 'image/webp', data: 'YWJj' },
  ];

  describe('system message assembly', () => {
    it('includes supplied system content verbatim as the leading system message', async () => {
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
        'System instruction.',
      );

      const payload = await prompt.buildMessage();

      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[0]).toStrictEqual({
        role: 'system',
        parts: [{ kind: 'text', text: 'System instruction.' }],
      });
      expect(payload.messages[1]).toStrictEqual({
        role: 'user',
        parts: orderedUserParts,
      });
    });

    it('omits the system message when no system prompt is supplied', async () => {
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
      );

      const payload = await prompt.buildMessage();

      expect(payload.messages).toHaveLength(1);
      expect(payload.messages[0]).toStrictEqual({
        role: 'user',
        parts: orderedUserParts,
      });
    });

    it('retains an explicitly empty system prompt as a text part', async () => {
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
        '',
      );

      const payload = await prompt.buildMessage();

      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[0]).toStrictEqual({
        role: 'system',
        parts: [{ kind: 'text', text: '' }],
      });
    });
  });

  describe('ordered user parts', () => {
    it('contains no assistant turns and no legacy payload fields', async () => {
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
        'System instruction.',
      );

      const payload = await prompt.buildMessage();

      expect(payload.messages.map((message) => message.role)).toStrictEqual([
        'system',
        'user',
      ]);
      expect('system' in payload).toBe(false);
      expect('user' in payload).toBe(false);
      expect('images' in payload).toBe(false);
    });
  });

  describe('payload validation boundary', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // The spy wraps the real schema method, so validation still runs;
    // this is not a mock that bypasses the builder.
    it('parses the assembled conversation exactly once and returns the parsed object', async () => {
      const parseSpy = vi.spyOn(MultiPartPromptPayloadSchema, 'parse');
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
        'System instruction.',
      );

      const payload = await prompt.buildMessage();

      expect(parseSpy).toHaveBeenCalledExactlyOnceWith({
        messages: [
          {
            role: 'system',
            parts: [{ kind: 'text', text: 'System instruction.' }],
          },
          { role: 'user', parts: orderedUserParts },
        ],
        promptCacheKey: buildPromptCacheKey(validInput.referenceTask),
      });
      expect(payload).toBe(parseSpy.mock.results[0].value);
    });
  });

  describe('validation failures', () => {
    it('fails inherited input validation when a required input field is missing', () => {
      const invalidInput = { ...validInput, referenceTask: undefined };

      expect(
        () => new StubMultiPartPrompt(invalidInput, logger, orderedUserParts),
      ).toThrow(ZodError);
    });

    it('fails inherited input validation when an input field is not a string', () => {
      const invalidInput = { ...validInput, studentTask: 42 };

      expect(
        () => new StubMultiPartPrompt(invalidInput, logger, orderedUserParts),
      ).toThrow(ZodError);
    });

    it('fails with a raw ZodError when the hook returns no parts', async () => {
      const prompt = new StubMultiPartPrompt(validInput, logger, []);

      await expect(prompt.buildMessage()).rejects.toThrow(ZodError);
    });

    it('fails with a raw ZodError when the hook returns a deliberately invalid runtime part', async () => {
      // Deliberately invalid at runtime: fails the schema's standard
      // padded-base64 rule, proving invalid hook output fails validation.
      const invalidPart = {
        kind: 'image',
        mimeType: 'image/png',
        data: 'not-valid-base64!',
      } as unknown as LlmContentPart;
      const prompt = new StubMultiPartPrompt(validInput, logger, [invalidPart]);

      await expect(prompt.buildMessage()).rejects.toThrow(ZodError);
    });
  });

  describe('promptCacheKey derivation', () => {
    // The frozen golden-value coverage for the shared helper lives in
    // prompt.base.spec.ts and is not rewritten here.
    it('derives the key from the reference task via the shared helper rule', async () => {
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
      );

      const payload = await prompt.buildMessage();

      expect(payload.promptCacheKey).toBe(
        buildPromptCacheKey(validInput.referenceTask),
      );
    });

    it('derives an unchanged key when only student or template content changes', async () => {
      const firstPrompt = new StubMultiPartPrompt(
        {
          ...validInput,
          studentTask: 'First student response.',
          emptyTask: 'First template content.',
        },
        logger,
        orderedUserParts,
      );
      const secondPrompt = new StubMultiPartPrompt(
        {
          ...validInput,
          studentTask: 'A completely different student response.',
          emptyTask: 'A completely different template content.',
        },
        logger,
        orderedUserParts,
      );

      const firstPayload = await firstPrompt.buildMessage();
      const secondPayload = await secondPrompt.buildMessage();

      expect(secondPayload.promptCacheKey).toBe(firstPayload.promptCacheKey);
      expect(firstPayload.promptCacheKey).toBe(
        buildPromptCacheKey(validInput.referenceTask),
      );
    });

    it('derives a different key when the reference content changes', async () => {
      const firstPrompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
      );
      const secondPrompt = new StubMultiPartPrompt(
        {
          ...validInput,
          referenceTask: 'A completely different reference task.',
        },
        logger,
        orderedUserParts,
      );

      const firstPayload = await firstPrompt.buildMessage();
      const secondPayload = await secondPrompt.buildMessage();

      expect(secondPayload.promptCacheKey).not.toBe(
        firstPayload.promptCacheKey,
      );
    });
  });

  describe('repeat builds and hook failure', () => {
    it('returns equivalent payloads without appending messages or parts across repeat builds', async () => {
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        orderedUserParts,
        'System instruction.',
      );

      const firstPayload = await prompt.buildMessage();
      const secondPayload = await prompt.buildMessage();

      expect(secondPayload).toStrictEqual(firstPayload);
      expect(secondPayload.messages).toHaveLength(2);
      expect(secondPayload.messages[1].parts).toHaveLength(
        orderedUserParts.length,
      );
    });

    it('propagates hook failure with no fallback payload', async () => {
      const prompt = new FailingHookPrompt(validInput, logger);

      await expect(prompt.buildMessage()).rejects.toThrow(Error);
      await expect(prompt.buildMessage()).rejects.toThrow('Hook failure');
    });
  });

  describe('content logging privacy', () => {
    it('does not log raw inputs when LOG_LLM_CONTENT is disabled', () => {
      const configService = {
        get: vi.fn(() => false),
      } as unknown as ConfigService;
      const verboseSpy = vi.spyOn(logger, 'verbose');

      expect(() => {
        return new StubMultiPartPrompt(
          validInput,
          logger,
          orderedUserParts,
          undefined,
          configService,
        );
      }).not.toThrow();

      expect(verboseSpy).not.toHaveBeenCalledWith(
        { inputs: validInput },
        'Prompt constructor received inputs',
      );
    });

    it('logs raw inputs when LOG_LLM_CONTENT is enabled', () => {
      const configService = {
        get: vi.fn(() => true),
      } as unknown as ConfigService;
      const verboseSpy = vi.spyOn(logger, 'verbose');

      expect(() => {
        return new StubMultiPartPrompt(
          validInput,
          logger,
          orderedUserParts,
          undefined,
          configService,
        );
      }).not.toThrow();

      expect(verboseSpy).toHaveBeenCalledWith(
        { inputs: validInput },
        'Prompt constructor received inputs',
      );
    });

    it('logs summary content without any image data', async () => {
      const imageData = 'YQ==';
      const prompt = new StubMultiPartPrompt(
        validInput,
        logger,
        [{ kind: 'image', mimeType: 'image/png', data: imageData }],
        'System instruction.',
      );

      const logSpy = vi.spyOn(logger, 'log');
      const debugSpy = vi.spyOn(logger, 'debug');
      const verboseSpy = vi.spyOn(logger, 'verbose');
      const warnSpy = vi.spyOn(logger, 'warn');
      const errorSpy = vi.spyOn(logger, 'error');

      await prompt.buildMessage();

      const loggedStrings = [logSpy, debugSpy, verboseSpy, warnSpy, errorSpy]
        .flatMap((spy) => spy.mock.calls)
        .flatMap((call) => {
          return call.filter(
            (argument): argument is string => typeof argument === 'string',
          );
        });

      expect(loggedStrings.join('\n')).not.toContain(imageData);
    });
  });

  describe('type contract', () => {
    it('is assignable to the Prompt base and returns branded multipart payloads', () => {
      expectTypeOf<MultiPartPrompt>().toExtend<Prompt>();
      expectTypeOf<MultiPartPrompt['buildMessage']>().toEqualTypeOf<
        () => Promise<MultiPartPromptPayload>
      >();
    });
  });
});
