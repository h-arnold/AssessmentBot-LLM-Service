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

  it("should return a TextPrompt for taskType 'TEXT'", () => {
    const dto: CreateAssessorDto = {
      taskType: TaskType.TEXT,
      reference: 'ref',
      studentResponse: 'stud',
      template: 'temp',
    };
    return factory.create(dto).then((prompt) => {
      expect(prompt).toBeInstanceOf(TextPrompt);
      return;
    });
  });

  it("should return a TablePrompt for taskType 'TABLE'", () => {
    const dto: CreateAssessorDto = {
      taskType: TaskType.TABLE,
      reference: 'ref',
      studentResponse: 'stud',
      template: 'temp',
    };
    return factory.create(dto).then((prompt) => {
      expect(prompt).toBeInstanceOf(TablePrompt);
      return;
    });
  });

  it("should return an ImagePrompt for taskType 'IMAGE'", () => {
    const dto: CreateAssessorDto = {
      taskType: TaskType.IMAGE,
      reference: 'ref',
      studentResponse: 'stud',
      template: 'temp',
      images: [],
    };
    return factory.create(dto).then((prompt) => {
      expect(prompt).toBeInstanceOf(ImagePrompt);
      return;
    });
  });

  it('should throw an error for an unsupported taskType', () => {
    const dto = {
      taskType: 'INVALID',
    } as unknown as CreateAssessorDto;
    return expect(factory.create(dto)).rejects.toThrow(
      'Unsupported task type: INVALID',
    );
  });
});
