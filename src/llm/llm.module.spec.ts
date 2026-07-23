import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';

import { LlmModule } from './llm.module.js';
import { LLM_SERVICE_TOKEN } from './llm.service.interface.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { ConfigModule } from '../config/config.module.js';
import { ConfigService } from '../config/config.service.js';

const defaults = {
  GEMINI_API_KEY: 'test-key',
  NODE_ENV: 'test',
  PORT: '3000',
  API_KEYS: 'test-api-key',
  MAX_IMAGE_UPLOAD_SIZE_MB: '5',
  ALLOWED_IMAGE_MIME_TYPES: 'image/png,image/jpeg',
  LOG_LEVEL: 'debug',
  LLM_BACKOFF_BASE_MS: '1000',
  LLM_MAX_RETRIES: '3',
};

const mockConfigService = {
  get: vi.fn((key: string) => {
    return defaults[key as keyof typeof defaults];
  }),
};

/**
 * A mock implementation of a JSON parser utility for testing purposes.
 *
 * This mock object contains a `parse` method that simulates the behaviour of
 * parsing a JSON string into a JavaScript object. The `parse` method is
 * implemented using Vitest's `vi.fn` to allow tracking calls and providing custom
 * behaviour during tests.
 * @property {Mock} parse - A Vitest mock function that takes a JSON string
 * as input and returns the parsed JavaScript object.
 */
const mockJsonParserUtility = {
  parse: vi.fn((jsonString: string) => {
    return JSON.parse(jsonString) as unknown;
  }),
};

describe('LlmModule', () => {
  it('should compile the module', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        LlmModule,
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
      .overrideProvider(JsonParserUtility)
      .useValue(mockJsonParserUtility)
      .compile();
    expect(module).toBeDefined();
  });

  it('should provide the LLMService', async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        LlmModule,
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
      .overrideProvider(JsonParserUtility)
      .useValue(mockJsonParserUtility)
      .compile();
    const configService = module.get(ConfigService);
    expect(configService).toBeDefined();
    const llmService = module.get(LLM_SERVICE_TOKEN);
    expect(llmService).toBeDefined();
  });
});
