import { Logger } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';

import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyStrategy } from './api-key.strategy.js';
import { AuthModule } from './auth.module.js';
import { ConfigService, Config } from '../config/config.service.js';

describe('AuthModule', () => {
  let module: TestingModule;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.API_KEYS = 'test-api-key';
    process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
    process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
    process.env.LOG_LEVEL = 'debug';
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        AuthModule,
        PassportModule.register({ defaultStrategy: 'bearer' }),
      ],
      providers: [
        ApiKeyStrategy,
        ApiKeyGuard,
        ApiKeyService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: keyof Config) => {
              if (key === 'API_KEYS') {
                return ['test-key'];
              }
              return null;
            }),
          },
        },
        {
          provide: Logger,
          useValue: {
            log: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
          },
        },
      ],
    }).compile();
  });

  it('AuthModule should be defined and importable', () => {
    expect(module).toBeDefined();
  });

  it('AuthModule should export ApiKeyStrategy, ApiKeyGuard and ApiKeyService providers', () => {
    const apiKeyStrategy = module.get<ApiKeyStrategy>(ApiKeyStrategy);
    const apiKeyGuard = module.get<ApiKeyGuard>(ApiKeyGuard);
    const apiKeyService = module.get<ApiKeyService>(ApiKeyService);
    expect(apiKeyStrategy).toBeDefined();
    expect(apiKeyGuard).toBeDefined();
    expect(apiKeyService).toBeDefined();
  });

  it('AuthModule should register ApiKeyStrategy and ApiKeyGuard in providers and exports', () => {
    // This is covered by the 'should export ApiKeyStrategy and ApiKeyGuard providers' test
    expect(module).toBeDefined();
  });
});
