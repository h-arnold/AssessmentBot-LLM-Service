import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';

import { AssessorController } from './assessor.controller.js';
import { AssessorModule } from './assessor.module.js';
import { AssessorService } from './assessor.service.js';
import { ConfigModule, ConfigService } from '../../config/index.js';

const getMockConfigValue = (key: string): unknown => {
  switch (key) {
    case 'GEMINI_API_KEY':
      return 'test-key';
    case 'NODE_ENV':
      return 'test';
    case 'PORT':
      return 3000;
    case 'API_KEYS':
      return 'test-api-key';
    case 'MAX_IMAGE_UPLOAD_SIZE_MB':
      return 5;
    case 'ALLOWED_IMAGE_MIME_TYPES':
      return 'image/png,image/jpeg';
    case 'LOG_LEVEL':
      return 'debug';
    default:
      return undefined;
  }
};

const mockConfigService = {
  get: vi.fn((key: string) => getMockConfigValue(key)),
};

describe('AssessorModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        AssessorModule,
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
      providers: [Logger],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .compile();
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide AssessorController', () => {
    const controller = module.get<AssessorController>(AssessorController);
    expect(controller).toBeDefined();
  });

  it('should provide AssessorService', () => {
    const service = module.get<AssessorService>(AssessorService);
    expect(service).toBeDefined();
  });
});
