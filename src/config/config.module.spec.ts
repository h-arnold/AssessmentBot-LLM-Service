import * as fs from 'node:fs';
import path from 'node:path';

import { Test, TestingModule } from '@nestjs/testing';

import { ConfigModule } from './config.module.js';
import { ConfigService } from './config.service.js';

describe('ConfigModule', () => {
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
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.LOG_LEVEL = 'debug';
    module = await Test.createTestingModule({
      imports: [ConfigModule],
    }).compile();
  });

  it('should be defined', () => {
    const configModule = module.get<ConfigModule>(ConfigModule);
    expect(configModule).toBeDefined();
  });

  it('should export ConfigService', () => {
    const configService = module.get<ConfigService>(ConfigService);
    expect(configService).toBeDefined();
  });

  it('should initialise successfully when .env file is missing but required env vars are set', async () => {
    // Temporarily remove .env file if it exists for this test
    const originalDotEnvironmentPath = path.resolve(process.cwd(), '.env');
    let dotEnvironmentExists = false;
    if (fs.existsSync(originalDotEnvironmentPath)) {
      fs.renameSync(
        originalDotEnvironmentPath,
        originalDotEnvironmentPath + '.bak',
      );
      dotEnvironmentExists = true;
    }

    // Ensure required variables are set in process.env
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.APP_NAME = 'TestApp';
    process.env.APP_VERSION = '1.0.0';

    let testModule: TestingModule | undefined;
    let error: unknown;
    try {
      testModule = await Test.createTestingModule({
        imports: [ConfigModule],
      }).compile();
    } catch (error_) {
      error = error_;
    } finally {
      // Restore .env file if it existed
      if (dotEnvironmentExists) {
        fs.renameSync(
          originalDotEnvironmentPath + '.bak',
          originalDotEnvironmentPath,
        );
      }
    }

    expect(error).toBeUndefined();
    expect(testModule).toBeDefined();
    const configService =
      testModule && testModule.get<ConfigService>(ConfigService);
    expect(configService).toBeDefined();
    expect(configService?.get('NODE_ENV')).toBe('test');
    expect(configService?.get('PORT')).toBe(3000);
    expect(configService?.get('APP_NAME')).toBe('TestApp');
    expect(configService?.get('APP_VERSION')).toBe('1.0.0');
  });
});
