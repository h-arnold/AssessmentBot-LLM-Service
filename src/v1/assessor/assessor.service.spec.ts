import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Mock } from 'vitest';

import { AssessorService } from './assessor.service.js';
import { CreateAssessorDto, TaskType } from './dto/create-assessor.dto.js';
import { JsonParserUtility } from '../../common/json-parser.utility.js';
import { ConfigModule, ConfigService } from '../../config/index.js';
import { GeminiService } from '../../llm/gemini.service.js';
import { LlmModule } from '../../llm/llm.module.js';
import { LLMService } from '../../llm/llm.service.interface.js';
import { LlmResponse } from '../../llm/types.js';
import { Prompt } from '../../prompt/prompt.base.js';
import { PromptFactory } from '../../prompt/prompt.factory.js';
import { PromptModule } from '../../prompt/prompt.module.js';

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
  let mockLlmService: { send: Mock<(input: unknown) => Promise<LlmResponse>> };
  let mockPromptFactory: {
    create: Mock<(dto: CreateAssessorDto) => Promise<Prompt>>;
  };

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.API_KEYS = 'test-api-key';
    process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
    process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
    process.env.APP_NAME = 'Assessment Bot LLM Service';
    process.env.APP_VERSION = 'test-version';
    process.env.LOG_LEVEL = 'debug';
  });
  beforeEach(async () => {
    mockLlmService = {
      send: vi.fn<(input: unknown) => Promise<LlmResponse>>(),
    };
    mockPromptFactory = {
      create: vi.fn<(dto: CreateAssessorDto) => Promise<Prompt>>(),
    };
    const mockJsonParserUtility = { parse: vi.fn() };
    const mockConfigService = {
      get: vi.fn((key: string) => getMockEnvironmentValue(key)),
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
      .useValue({ send: vi.fn() })
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
        buildMessage: vi.fn().mockResolvedValue({
          system: 'System prompt',
          user: 'prompt message',
        }),
      };
      mockPromptFactory.create.mockResolvedValue(
        mockPrompt as unknown as Prompt,
      );
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
            path: 'reference-image.png',
          },
          {
            mimeType: 'image/png',
            path: 'student-image.png',
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
      };

      const mockPrompt = {
        buildMessage: vi.fn().mockResolvedValue(mockMultimodalPayload),
      };
      mockPromptFactory.create.mockResolvedValue(
        mockPrompt as unknown as Prompt,
      );
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
        buildMessage: vi.fn().mockResolvedValue({
          system: 'System prompt',
          user: 'prompt message',
        }),
      };
      mockPromptFactory.create.mockResolvedValue(
        mockPrompt as unknown as Prompt,
      );
      mockLlmService.send.mockResolvedValue(createMockLlmResponse(5));

      await service.createAssessment(dto);

      const [[receivedDto]] = mockPromptFactory.create.mock.calls;
      expect(
        Object.prototype.hasOwnProperty.call(receivedDto, '__proto__'),
      ).toBe(false);
    });
  });
});
