import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';

import { AssessorService } from './assessor.service';
import { ConfigModule, ConfigService } from '../../config';
import { CreateAssessorDto, TaskType } from './dto/create-assessor.dto';
import { JsonParserUtil as JsonParserUtility } from '../../common/json-parser.utility';
import { GeminiService } from '../../llm/gemini.service';
import { LlmModule } from '../../llm/llm.module';
import { LLMService } from '../../llm/llm.service.interface';
import { LlmResponse } from '../../llm/types';
import { Prompt } from '../../prompt/prompt.base';
import { PromptFactory } from '../../prompt/prompt.factory';
import { PromptModule } from '../../prompt/prompt.module';

const createMockLlmResponse = (score: number): LlmResponse => ({
  completeness: {
    score,
    reasoning: 'Completeness reasoning',
  },
  accuracy: {
    score,
    reasoning: 'Accuracy reasoning',
  },
  spag: {
    score,
    reasoning: 'SPAG reasoning',
  },
});

const getMockEnvironmentValue = (key: string): string => {
  switch (key) {
    case 'GEMINI_API_KEY':
      return process.env.GEMINI_API_KEY ?? '';
    case 'NODE_ENV':
      return process.env.NODE_ENV ?? '';
    case 'PORT':
      return process.env.PORT ?? '';
    case 'API_KEYS':
      return process.env.API_KEYS ?? '';
    case 'MAX_IMAGE_UPLOAD_SIZE_MB':
      return process.env.MAX_IMAGE_UPLOAD_SIZE_MB ?? '';
    case 'ALLOWED_IMAGE_MIME_TYPES':
      return process.env.ALLOWED_IMAGE_MIME_TYPES ?? '';
    case 'APP_NAME':
      return process.env.APP_NAME ?? '';
    case 'APP_VERSION':
      return process.env.APP_VERSION ?? '';
    case 'LOG_LEVEL':
      return process.env.LOG_LEVEL ?? '';
    default:
      return '';
  }
};

describe('AssessorService', () => {
  let service: AssessorService;
  let llmService: LLMService;
  let promptFactory: PromptFactory;
  let mockLlmService: { send: jest.Mock<Promise<LlmResponse>, [unknown]> };
  let mockPromptFactory: {
    create: jest.Mock<Promise<Prompt>, [CreateAssessorDto]>;
  };

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.API_KEYS = 'test-api-key';
    process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
    process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
    process.env.APP_NAME = 'AssessmentBot-Backend';
    process.env.APP_VERSION = 'test-version';
    process.env.LOG_LEVEL = 'debug';
  });
  beforeEach(async () => {
    mockLlmService = { send: jest.fn<Promise<LlmResponse>, [unknown]>() };
    mockPromptFactory = {
      create: jest.fn<Promise<Prompt>, [CreateAssessorDto]>(),
    };
    const mockJsonParserUtility = { parse: jest.fn() };
    const mockConfigService = {
      get: jest.fn((key: string) => getMockEnvironmentValue(key)),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        LlmModule,
        PromptModule,
        ConfigModule,
        LoggerModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            pinoHttp: {
              level: configService.get('LOG_LEVEL'),
            },
          }),
        }),
      ],
      providers: [
        AssessorService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    })
      .overrideProvider(LLMService)
      .useValue(mockLlmService)
      .overrideProvider(PromptFactory)
      .useValue(mockPromptFactory)
      .overrideProvider(GeminiService)
      .useValue({ send: jest.fn() })
      .overrideProvider(JsonParserUtility)
      .useValue(mockJsonParserUtility)
      .compile();

    service = module.get<AssessorService>(AssessorService);
    llmService = module.get<LLMService>(LLMService);
    promptFactory = module.get<PromptFactory>(PromptFactory);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAssessment', () => {
    it('should call the prompt factory and llm service', async () => {
      const dto: CreateAssessorDto = {
        taskType: TaskType.TEXT,
        reference: 'ref',
        studentResponse: 'stud',
        template: 'temp',
      };

      const mockPrompt = {
        buildMessage: jest.fn().mockResolvedValue({
          system: 'System prompt',
          user: 'prompt message',
        }),
      };
      mockPromptFactory.create.mockResolvedValue(mockPrompt as Prompt);
      mockLlmService.send.mockResolvedValue(createMockLlmResponse(5));

      const result = await service.createAssessment(dto);

      expect(promptFactory.create).toHaveBeenCalledWith(dto);
      expect(mockPrompt.buildMessage).toHaveBeenCalled();
      expect(llmService.send).toHaveBeenCalledWith({
        system: 'System prompt',
        user: 'prompt message',
      });
      expect(result).toEqual(createMockLlmResponse(5));
    });

    it('should correctly handle a multimodal (image) payload', async () => {
      const dto: CreateAssessorDto = {
        taskType: TaskType.IMAGE,
        reference: 'A picture of a cat',
        studentResponse: 'A drawing of a cat',
        template: 'An empty canvas',
        images: [
          {
            mimeType: 'image/png',
            base64: 'base64-encoded-string-1',
          },
          {
            mimeType: 'image/png',
            base64: 'base64-encoded-string-2',
          },
        ],
      };

      const mockMultimodalPayload = {
        system: 'You are an art critic.',
        images: [
          {
            mimeType: 'image/png',
            data: 'base64-encoded-string-1',
          },
          {
            mimeType: 'image/png',
            data: 'base64-encoded-string-2',
          },
        ],
        messages: [{ content: 'Assess this artwork.' }],
      };

      const mockPrompt = {
        buildMessage: jest.fn().mockResolvedValue(mockMultimodalPayload),
      };
      mockPromptFactory.create.mockResolvedValue(mockPrompt as Prompt);
      mockLlmService.send.mockResolvedValue(createMockLlmResponse(4));

      const result = await service.createAssessment(dto);

      expect(promptFactory.create).toHaveBeenCalledWith(dto);
      expect(mockPrompt.buildMessage).toHaveBeenCalled();
      expect(llmService.send).toHaveBeenCalledWith(mockMultimodalPayload);
      expect(result).toEqual(createMockLlmResponse(4));
    });
    it('should not have __proto__ property in the DTO', async () => {
      const dto: CreateAssessorDto = {
        taskType: TaskType.TEXT,
        reference: 'ref',
        studentResponse: 'stud',
        template: 'temp',
      };

      const mockPrompt = {
        buildMessage: jest.fn().mockResolvedValue({
          system: 'System prompt',
          user: 'prompt message',
        }),
      };
      mockPromptFactory.create.mockResolvedValue(mockPrompt as Prompt);
      mockLlmService.send.mockResolvedValue(createMockLlmResponse(5));

      await service.createAssessment(dto);

      const [[receivedDto]] = mockPromptFactory.create.mock.calls;
      expect(
        Object.prototype.hasOwnProperty.call(receivedDto, '__proto__'),
      ).toBe(false);
    });
  });
});
