import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

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
    const referenceBase64 = 'cmVmZXJlbmNlLWltYWdlLWJ5dGVz';
    const templateBase64 = 'dGVtcGxhdGUtaW1hZ2UtYnl0ZXM=';
    const studentBase64 = 'c3R1ZGVudC1pbWFnZS1ieXRlcw==';

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
          text: 'Reference Task — benchmark for a perfect score.',
        },
        { kind: 'image', mimeType: 'image/png', data: referenceBase64 },
        { kind: 'text', text: 'Template — the unfilled task.' },
        { kind: 'image', mimeType: 'image/jpeg', data: templateBase64 },
        { kind: 'text', text: 'Student Submission — assess this image.' },
        { kind: 'image', mimeType: 'image/webp', data: studentBase64 },
      ]);
    });

    it('retains detected MIME types and base64 data in order after Buffer conversion', async () => {
      // Distinct real image formats so per-position MIME detection is
      // exercised: PNG reference, JPEG template, WebP student response.
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      );
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ]);
      const webpBuffer = Buffer.concat([
        Buffer.from('RIFF', 'utf8'),
        Buffer.from([0x00, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP', 'utf8'),
        Buffer.from([0x56, 0x50, 0x38, 0x20, 0x0a, 0x00, 0x00, 0x00]),
      ]);

      const dto: CreateAssessorDto = {
        taskType: TaskType.IMAGE,
        reference: pngBuffer,
        studentResponse: webpBuffer,
        template: jpegBuffer,
      };

      const prompt = await factory.create(dto);
      expect(prompt).toBeInstanceOf(ImagePrompt);
      const payload = (await prompt.buildMessage()) as MultiPartPromptPayload;

      expect(payload.messages).toHaveLength(2);
      expect(payload.messages[1].parts).toStrictEqual([
        {
          kind: 'text',
          text: 'Reference Task — benchmark for a perfect score.',
        },
        {
          kind: 'image',
          mimeType: 'image/png',
          data: pngBuffer.toString('base64'),
        },
        { kind: 'text', text: 'Template — the unfilled task.' },
        {
          kind: 'image',
          mimeType: 'image/jpeg',
          data: jpegBuffer.toString('base64'),
        },
        { kind: 'text', text: 'Student Submission — assess this image.' },
        {
          kind: 'image',
          mimeType: 'image/webp',
          data: webpBuffer.toString('base64'),
        },
      ]);
    });
  });
});
