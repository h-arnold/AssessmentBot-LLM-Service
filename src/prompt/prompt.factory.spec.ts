import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ImagePrompt } from './image.prompt';
import { PromptFactory } from './prompt.factory';
import { TablePrompt } from './table.prompt';
import { TextPrompt } from './text.prompt';
import {
  CreateAssessorDto,
  TaskType,
} from '../v1/assessor/dto/create-assessor.dto';

describe('PromptFactory', () => {
  let factory: PromptFactory;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
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

  it("should return an ImagePrompt for taskType 'IMAGE'", async () => {
    const dto: CreateAssessorDto = {
      taskType: TaskType.IMAGE,
      reference: 'ref',
      studentResponse: 'stud',
      template: 'temp',
      images: [],
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
});
