import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import { Mock } from 'vitest';

import { AssessorService } from './assessor.service.js';
import { CreateAssessorDto, TaskType } from './dto/create-assessor.dto.js';
import { JsonParserUtility } from '../../common/json-parser.utility.js';
import { ConfigModule, ConfigService } from '../../config/index.js';
import { GeminiService } from '../../llm/gemini.service.js';
import { LlmModule } from '../../llm/llm.module.js';
import {
  ILlmService,
  LLM_SERVICE_TOKEN,
} from '../../llm/llm.service.interface.js';
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

// ALLOWED_IMAGE_MIME_TYPES is now supplied via ConfigService (not process.env)
const getMockEnvironmentValue = (key: string): string | string[] => {
  let value: string | string[];
  switch (key) {
    case 'ALLOWED_IMAGE_MIME_TYPES':
      value = ['image/png', 'image/jpeg'];
      break;
    case 'GEMINI_API_KEY':
      value = process.env.GEMINI_API_KEY ?? '';
      break;
    case 'NODE_ENV':
      value = process.env.NODE_ENV ?? '';
      break;
    case 'PORT':
      value = process.env.PORT ?? '';
      break;
    case 'API_KEYS':
      value = process.env.API_KEYS ?? '';
      break;
    case 'MAX_IMAGE_UPLOAD_SIZE_MB':
      value = process.env.MAX_IMAGE_UPLOAD_SIZE_MB ?? '';
      break;
    case 'APP_NAME':
      value = process.env.APP_NAME ?? '';
      break;
    case 'APP_VERSION':
      value = process.env.APP_VERSION ?? '';
      break;
    case 'LOG_LEVEL':
      value = process.env.LOG_LEVEL ?? '';
      break;
    default:
      value = '';
  }
  return value;
};

describe('AssessorService', () => {
  let service: AssessorService;
  let llmService: ILlmService;
  let promptFactory: PromptFactory;
  let mockLlmService: { send: Mock<(input: unknown) => Promise<LlmResponse>> };
  let mockPromptFactory: {
    create: Mock<(dto: CreateAssessorDto) => Promise<Prompt>>;
  };

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.MISTRAL_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.API_KEYS = 'abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
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
      .overrideProvider(LLM_SERVICE_TOKEN)
      .useValue(mockLlmService)
      .overrideProvider(PromptFactory)
      .useValue(mockPromptFactory)
      .overrideProvider(GeminiService)
      .useValue({ send: vi.fn() })
      .overrideProvider(JsonParserUtility)
      .useValue(mockJsonParserUtility)
      .compile();

    service = module.get<AssessorService>(AssessorService);
    llmService = module.get<ILlmService>(LLM_SERVICE_TOKEN);
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
