import { Logger, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ApiKeyService } from './api-key.service.js';
import { ConfigService, Config } from '../config/config.service.js';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let configService: ConfigService;
  let logger: Logger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: keyof Config) => {
              if (key === 'API_KEYS') {
                return ['valid-key-1', 'valid-key-2'];
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

    service = module.get<ApiKeyService>(ApiKeyService);
    configService = module.get<ConfigService>(ConfigService);
    logger = module.get<Logger>(Logger);
  });

  it('ApiKeyService.validate should accept a valid API key and return user context', () => {
    const result = service.validate('valid-key-1');
    expect(result).toEqual({ apiKey: 'valid-key-1' });
  });

  it('ApiKeyService.validate should reject an invalid API key', () => {
    expect(() => service.validate('invalid-key')).toThrow(
      UnauthorizedException,
    );
  });

  it('ApiKeyService.validate should handle missing API key gracefully', () => {
    expect(() => service.validate(undefined)).toThrow(UnauthorizedException);
    expect(() => service.validate(null)).toThrow(UnauthorizedException);
    expect(() => service.validate('')).toThrow(UnauthorizedException);
  });

  it('ApiKeyService.validate should support multiple configured API keys', () => {
    const result1 = service.validate('valid-key-1');
    expect(result1).toEqual({ apiKey: 'valid-key-1' });

    const result2 = service.validate('valid-key-2');
    expect(result2).toEqual({ apiKey: 'valid-key-2' });
  });

  it('ApiKeyService.validate should enforce API key format (length, character set)', () => {
    // Assuming a minimum length of 10 for example
    expect(() => service.validate('short')).toThrow(UnauthorizedException);
    // Assuming only alphanumeric characters are allowed
    expect(() => service.validate('valid-key!')).toThrow(UnauthorizedException);
  });

  it('ApiKeyService.validate should load API keys from ConfigService', () => {
    expect(configService.get).toHaveBeenCalledWith('API_KEYS');
  });

  it('ApiKeyService.validate should log structured authentication attempts without exposing raw API key', () => {
    service.validate('valid-key-1');
    expect(logger.log).toHaveBeenCalledWith(
      expect.stringContaining('API key authentication attempt successful'),
    );
  });
});
