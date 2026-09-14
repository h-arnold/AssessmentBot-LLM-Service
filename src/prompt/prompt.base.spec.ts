import { Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  buildPromptCacheKey,
  Prompt,
  PromptInput,
  PromptInputSchema,
} from './prompt.base.js';
import { readMarkdown } from '../common/file-utilities.js';
import { LlmPayload } from '../llm/llm.service.interface.js';

/*
 * Frozen golden input and its expected SHA-256 digest. The digest was generated
 * once during test authoring via
 * `createHash('sha256').update(GOLDEN_REFERENCE_TASK).digest('hex')`.
 * It is committed as a constant on purpose: if it ever mismatches, the
 * derivation rule is what changed — the constant must never be edited to
 * accommodate an implementation. The rule is single-input `sha256(referenceTask)`
 * with no separator, prefix, or task-type input (SPEC product decision #4).
 */
const GOLDEN_REFERENCE_TASK =
  'Golden reference task for prompt cache key derivation.';
const GOLDEN_PROMPT_CACHE_KEY =
  '566e3ddf37a4cfc47e28fe8665ac788bf75582b05431aea476be6831f9b1cd05';

/*
 * Shared reference string used by both pathways (plain text and image data-URI)
 * and its independently computed SHA-256 digest. The digest was generated once
 * during test authoring via
 * `createHash('sha256').update(SHARED_IMAGE_DATA_URI_REFERENCE).digest('hex')`
 * (cross-checked with `openssl dgst -sha256`) and committed as a frozen
 * constant. It anchors the pathway comparison to the SHA-256 rule itself, so a
 * non-SHA-256 transformation cannot pass merely by returning equal values for
 * both calls.
 */
const SHARED_IMAGE_DATA_URI_REFERENCE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const SHARED_IMAGE_DATA_URI_EXPECTED_KEY =
  'c66521058e4b3bb052cc4e5c696483061b48629a34d5932ff3468dd2e135ff83';

// Mock implementation of the abstract class for testing
class TestPrompt extends Prompt {
  constructor(inputs: unknown, logger: Logger) {
    super(inputs, logger);
  }
  public async buildMessage(): Promise<LlmPayload> {
    return { system: '', images: [] } as LlmPayload;
  }
}

// Concrete subclass that deliberately does not override `buildMessage`, so the
// inherited base (default text/table) population path is exercised directly.
class InheritedBuildMessagePrompt extends Prompt {
  constructor(inputs: unknown, logger: Logger) {
    super(inputs, logger);
  }
}

describe('Prompt Base Class', (): void => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  const validInput: PromptInput = {
    referenceTask: 'This is the reference task.',
    studentTask: 'This is the student task.',
    emptyTask: 'This is the empty task.',
  };

  describe('PromptInputSchema', (): void => {
    it('should parse a valid input object successfully', (): void => {
      const result = (): PromptInput => PromptInputSchema.parse(validInput);
      expect(result).not.toThrow();
      expect(result()).toEqual(validInput);
    });

    it('should throw a ZodError if referenceTask is missing', (): void => {
      const invalidInput = { ...validInput, referenceTask: undefined };
      expect(() => PromptInputSchema.parse(invalidInput)).toThrow(ZodError);
    });

    it('should throw a ZodError if studentTask is not a string', (): void => {
      const invalidInput = { ...validInput, studentTask: 123 };
      expect(() => PromptInputSchema.parse(invalidInput)).toThrow(ZodError);
    });

    it('should throw a ZodError if emptyTask is missing', (): void => {
      const invalidInput = { ...validInput, emptyTask: undefined };
      expect(() => PromptInputSchema.parse(invalidInput)).toThrow(ZodError);
    });

    it('should accept empty strings as valid input', (): void => {
      const emptyInput: PromptInput = {
        referenceTask: '',
        studentTask: '',
        emptyTask: '',
      };
      const result = (): PromptInput => PromptInputSchema.parse(emptyInput);
      expect(result).not.toThrow();
      expect(result()).toEqual(emptyInput);
    });
  });

  describe('Prompt Constructor', (): void => {
    it('should instantiate and assign properties with valid input', (): void => {
      const prompt = new TestPrompt(validInput, logger);
      expect(prompt).toBeInstanceOf(TestPrompt);
      // We can't directly access protected members, but we know the schema passed.
    });

    it('should throw a ZodError via the constructor with invalid input', (): void => {
      const invalidInput = { ...validInput, studentTask: false };
      expect(() => new TestPrompt(invalidInput, logger)).toThrow(ZodError);
    });
  });

  describe('Prompt.buildMessage promptCacheKey population', (): void => {
    it('should derive promptCacheKey from the reference task on the default payload', async (): Promise<void> => {
      const prompt = new InheritedBuildMessagePrompt(validInput, logger);
      const payload = await prompt.buildMessage();

      expect(payload.promptCacheKey).toBe(
        buildPromptCacheKey(validInput.referenceTask),
      );
    });

    it('should derive the same promptCacheKey when only the student task changes', async (): Promise<void> => {
      const firstPrompt = new InheritedBuildMessagePrompt(
        { ...validInput, studentTask: 'First student response.' },
        logger,
      );
      const secondPrompt = new InheritedBuildMessagePrompt(
        {
          ...validInput,
          studentTask: 'A completely different student response.',
        },
        logger,
      );

      const firstPayload = await firstPrompt.buildMessage();
      const secondPayload = await secondPrompt.buildMessage();

      expect(firstPayload.promptCacheKey).toBe(
        buildPromptCacheKey(validInput.referenceTask),
      );
      expect(secondPayload.promptCacheKey).toBe(
        buildPromptCacheKey(validInput.referenceTask),
      );
      expect(secondPayload.promptCacheKey).toBe(firstPayload.promptCacheKey);
    });
  });

  describe('buildPromptCacheKey', (): void => {
    it('should return the frozen SHA-256 golden value for the fixed reference task', (): void => {
      expect(buildPromptCacheKey(GOLDEN_REFERENCE_TASK)).toBe(
        GOLDEN_PROMPT_CACHE_KEY,
      );
    });

    it('should derive deterministically for repeated calls with the same input', (): void => {
      const firstKey = buildPromptCacheKey(GOLDEN_REFERENCE_TASK);
      const secondKey = buildPromptCacheKey(GOLDEN_REFERENCE_TASK);
      expect(secondKey).toBe(firstKey);
    });

    it('should return a 64-character lowercase hexadecimal key', (): void => {
      const key = buildPromptCacheKey(GOLDEN_REFERENCE_TASK);
      expect(key).toHaveLength(64);
      expect(key).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should derive distinct keys for distinct reference content', (): void => {
      const firstKey = buildPromptCacheKey('First distinct reference task.');
      const secondKey = buildPromptCacheKey('Second distinct reference task.');
      expect(firstKey).not.toBe(secondKey);
    });

    it('should derive the identical key when the same reference string is used as plain text and as image data-URI content', (): void => {
      const plainTextKey = buildPromptCacheKey(SHARED_IMAGE_DATA_URI_REFERENCE);
      const imageDataUriKey = buildPromptCacheKey(
        SHARED_IMAGE_DATA_URI_REFERENCE,
      );

      // Anchor both pathways to the independent SHA-256 expectation rather than
      // comparing the helper only against itself.
      expect(plainTextKey).toBe(SHARED_IMAGE_DATA_URI_EXPECTED_KEY);
      expect(imageDataUriKey).toBe(SHARED_IMAGE_DATA_URI_EXPECTED_KEY);
      expect(plainTextKey).toBe(imageDataUriKey);
    });
  });

  describe('readMarkdown', () => {
    it('should reject filenames with path traversal', async () => {
      await expect(readMarkdown('../template.md')).rejects.toThrow(
        'Invalid markdown filename',
      );
    });

    it('should reject filenames that do not end with .md', async () => {
      await expect(readMarkdown('template.txt')).rejects.toThrow(
        'Invalid markdown filename',
      );
    });
  });
});
