import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  referenceBase64,
  referenceLabel,
  studentBase64,
  studentLabel,
  templateBase64,
  templateLabel,
} from './image-prompt.test-fixtures.js';
import { ImagePrompt } from './image.prompt.js';
import { PromptFactory } from './prompt.factory.js';
import { TablePrompt } from './table.prompt.js';
import { TextPrompt } from './text.prompt.js';
import { readMarkdown } from '../common/file-utilities.js';
import { ConfigModule } from '../config/config.module.js';
import { MultiPartPromptPayload } from '../llm/llm.service.interface.js';
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

  describe('IMAGE multipart payload construction', () => {
    // Distinct, genuinely valid standard padded base64 payloads with
    // distinct MIME types per position, so MIME/data pairing and
    // reference → template → student ordering are provable.
    it('builds a multipart payload with the real system template for string inputs', async () => {
      const dto: CreateAssessorDto = {
        taskType: TaskType.IMAGE,
        reference: `data:image/png;base64,${referenceBase64}`,
        studentResponse: `data:image/webp;base64,${studentBase64}`,
        template: `data:image/jpeg;base64,${templateBase64}`,
      };

      const prompt = await factory.create(dto);
      expect(prompt).toBeInstanceOf(ImagePrompt);
      const payload = (await prompt.buildMessage()) as MultiPartPromptPayload;

      const systemTemplate = await readMarkdown('image.system.prompt.md');
      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[0]).toStrictEqual({
        role: 'system',
        parts: [{ kind: 'text', text: systemTemplate }],
      });
      expect(payload.messages[1].parts).toStrictEqual([
        {
          kind: 'text',
          text: referenceLabel,
        },
        { kind: 'image', mimeType: 'image/png', data: referenceBase64 },
        { kind: 'text', text: templateLabel },
        { kind: 'image', mimeType: 'image/jpeg', data: templateBase64 },
        { kind: 'text', text: studentLabel },
        { kind: 'image', mimeType: 'image/webp', data: studentBase64 },
      ]);
    });
  });
});
