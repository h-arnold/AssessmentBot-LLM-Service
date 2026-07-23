import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ImagePrompt } from './image.prompt.js';
import { PromptFactory } from './prompt.factory.js';
import { TablePrompt } from './table.prompt.js';
import { TextPrompt } from './text.prompt.js';
import { ConfigModule } from '../config/config.module.js';
import { ImagePromptPayload } from '../llm/llm.service.interface.js';
import {
  CreateAssessorDto,
  TaskType,
} from '../v1/assessor/dto/create-assessor.dto.js';

describe('PromptFactory', () => {
  let factory: PromptFactory;

  beforeAll(() => {
    process.env.MISTRAL_API_KEY = 'test-key';
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [PromptFactory, Logger],
    }).compile();

    factory = module.get<PromptFactory>(PromptFactory);
  });

  it('should be defined', () => {
    expect(factory).toBeDefined();
  });

  it("should return a TextPrompt for taskType 'TEXT'", async () => {
    const dto: CreateAssessorDto = {
      taskType: TaskType.TEXT,
      reference: 'ref',
      studentResponse: 'stud',
      template: 'temp',
    };
    const prompt = await factory.create(dto);
    expect(prompt).toBeInstanceOf(TextPrompt);
  });

  it("should return a TablePrompt for taskType 'TABLE'", async () => {
    const dto: CreateAssessorDto = {
      taskType: TaskType.TABLE,
      reference: 'ref',
      studentResponse: 'stud',
      template: 'temp',
    };
    const prompt = await factory.create(dto);
    expect(prompt).toBeInstanceOf(TablePrompt);
  });

  it("should return an ImagePrompt for taskType 'IMAGE' with string inputs", async () => {
    const dto: CreateAssessorDto = {
      taskType: TaskType.IMAGE,
      reference: 'ref',
      studentResponse: 'stud',
      template: 'temp',
    };
    const prompt = await factory.create(dto);
    expect(prompt).toBeInstanceOf(ImagePrompt);
  });

  it('should throw an error for an unsupported taskType', async () => {
    const dto = {
      taskType: 'INVALID',
    } as unknown as CreateAssessorDto;
    await expect(factory.create(dto)).rejects.toThrow(
      'Unsupported task type: INVALID',
    );
  });

  describe('IMAGE Buffer inputs', () => {
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    let pngBuffer: Buffer;

    beforeAll(() => {
      pngBuffer = Buffer.from(pngBase64, 'base64');
    });

    it('should produce valid ImagePrompt with Buffer inputs and correct data URIs', async () => {
      const dto: CreateAssessorDto = {
        taskType: TaskType.IMAGE,
        reference: pngBuffer,
        studentResponse: pngBuffer,
        template: pngBuffer,
      };

      const prompt = await factory.create(dto);
      expect(prompt).toBeInstanceOf(ImagePrompt);

      const message = (await prompt.buildMessage()) as ImagePromptPayload;
      expect(message.images).toHaveLength(3);

      // All three images should have detected PNG MIME type and the correct
      // base64 data
      for (const image of message.images) {
        expect(image.mimeType).toBe('image/png');
        expect(image.data).toBe(pngBase64);
      }
    });

    it('should pass Buffer data URIs through buildMessage in the correct order', async () => {
      // Use distinct buffers so we can verify ordering:
      // referenceTask (1st), emptyTask/template (2nd), studentTask (3rd)
      const referenceBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
      const templateBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const studentBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42jNkYPgPAADSATABtElncgAAAABJRU5ErkJggg==';

      const dto: CreateAssessorDto = {
        taskType: TaskType.IMAGE,
        reference: Buffer.from(referenceBase64, 'base64'),
        studentResponse: Buffer.from(studentBase64, 'base64'),
        template: Buffer.from(templateBase64, 'base64'),
      };

      const prompt = await factory.create(dto);
      const message = (await prompt.buildMessage()) as ImagePromptPayload;

      expect(message.images[0].data).toBe(referenceBase64);
      expect(message.images[1].data).toBe(templateBase64);
      expect(message.images[2].data).toBe(studentBase64);
    });
  });
});
