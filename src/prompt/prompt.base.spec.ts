import { Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import { Prompt, PromptInput, PromptInputSchema } from './prompt.base.js';
import { readMarkdown } from '../common/file-utilities.js';
import { LlmPayload } from '../llm/llm.service.interface.js';

// Mock implementation of the abstract class for testing
class TestPrompt extends Prompt {
  constructor(inputs: unknown, logger: Logger) {
    super(inputs, logger);
  }
  public async buildMessage(): Promise<LlmPayload> {
    return { system: '', images: [], messages: [] } as LlmPayload;
  }
  // Stub implementation to satisfy abstract base class
  protected async buildUserMessageParts(): Promise<
    import('@google/generative-ai').Part[]
  > {
    return [];
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
