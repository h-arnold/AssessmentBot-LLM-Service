import { randomBytes } from 'node:crypto';

import { Logger, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ApiKeyService } from './api-key.service.js';
import { ConfigService, Config } from '../config/config.service.js';

const PREFIX = 'abt_';

// Generate two valid configured keys deterministically at module scope.
const VALID_KEY_1 = PREFIX + randomBytes(24).toString('base64url');
const VALID_KEY_2 = PREFIX + randomBytes(24).toString('base64url');
const UNCONFIGURED_KEY = PREFIX + randomBytes(24).toString('base64url');

/**
 * Build a foreign-format secret (wrong prefix).
 * @returns A string starting with 'ghp_' followed by 32 base64url chars.
 */
function foreignKey(): string {
  return 'ghp_' + randomBytes(24).toString('base64url');
}

/**
 * Build a key with correct prefix but too-short body (31 base64url chars).
 * @returns A key with 'abt_' prefix and a 31-char base64url body.
 */
function shortBodyKey(): string {
  // 23 bytes -> 31 base64url chars (not 32)
  return PREFIX + randomBytes(23).toString('base64url');
}

/**
 * Build a key with correct prefix and length but a non-base64url character.
 * @returns A key whose body fails z.base64url() validation.
 */
function invalidBodyKey(): string {
  return PREFIX + randomBytes(24).toString('base64url').slice(0, 31) + '!';
}

/**
 * Build a key with a different prefix (rejected at step 1).
 * @returns A key starting with 'xyz_' followed by 32 base64url chars.
 */
function wrongPrefixKey(): string {
  return 'xyz_' + randomBytes(24).toString('base64url');
}

/**
 * Build a mock ConfigService whose `get` method returns the given keys and PREFIX.
 * @param keys - The API key array to return from `get('API_KEYS')`.
 * @returns A partial ConfigService object suitable for TestingModule.
 */
function configureMockConfigService(keys: string[]): {
  get: ReturnType<typeof vi.fn>;
} {
  const mockValues = new Map<keyof Config, string[] | string>([
    ['API_KEYS', keys],
    ['API_KEY_PREFIX', PREFIX],
  ]);
  const getMock = vi.fn((key: keyof Config): string[] | string | null => {
    return mockValues.get(key) ?? null;
  });
  return { get: getMock };
}

/**
 * Build a mock Logger with all standard level methods as vi.fn().
 * @returns A partial Logger object suitable for TestingModule.
 */
function configureMockLogger(): {
  log: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
  verbose: ReturnType<typeof vi.fn>;
} {
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  };
}

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let logger: Logger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: ConfigService,
          useValue: configureMockConfigService([VALID_KEY_1, VALID_KEY_2]),
        },
        {
          provide: Logger,
          useValue: configureMockLogger(),
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
    logger = module.get<Logger>(Logger);
  });

  // ---- 1. Accept valid prefixed configured key ----

  it('should accept a valid prefixed configured key and return user context', () => {
    const result = service.validate(VALID_KEY_1);
    expect(result).toEqual({ apiKey: VALID_KEY_1 });
    expect(logger.log).toHaveBeenCalledWith(
      'API key authentication attempt successful',
    );
  });

  // ---- 2. Reject undefined/null/''/number ----

  it('should reject undefined/null/empty/number with UnauthorizedException and opaque WARN', () => {
    for (const value of [undefined, null, '', 123]) {
      expect(() => service.validate(value as unknown)).toThrow(
        UnauthorizedException,
      );
    }
    expect(logger.warn).toHaveBeenCalledWith(
      'API key is missing or has an invalid format.',
    );
  });

  // ---- 3. Reject foreign-format secret ----

  it('should reject a foreign-format secret and never echo the value at WARN or DEBUG', () => {
    const key = foreignKey();
    expect(() => service.validate(key)).toThrow(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith(
      'API key is missing or has an invalid format.',
    );
    // No warn call should contain the foreign secret
    const allWarnArguments = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(allWarnArguments.some((call) => call.includes(key))).toBe(false);
    // No debug call should contain the foreign secret
    const allDebugArguments = logger.debug.mock.calls.map((c) => String(c[0]));
    expect(allDebugArguments.some((call) => call.includes(key))).toBe(false);
  });

  // ---- 4. Reject key with prefix but too-short body ----

  it('should reject a key with correct prefix but too-short body and not echo the body', () => {
    const key = shortBodyKey();
    const body = key.slice(PREFIX.length);
    expect(() => service.validate(key)).toThrow(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith(
      'API key is missing or has an invalid format.',
    );
    // The body must not appear in any warn call
    const allWarnArguments = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(allWarnArguments.some((call) => call.includes(body))).toBe(false);
  });

  // ---- 5. Reject key with prefix but non-base64url body ----

  it('should reject a key with correct prefix but non-base64url body', () => {
    const key = invalidBodyKey();
    expect(() => service.validate(key)).toThrow(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith(
      'API key is missing or has an invalid format.',
    );
    // The invalid character must not be echoed in any warn call
    const allWarnArguments = logger.warn.mock.calls.map((c) => String(c[0]));
    expect(allWarnArguments.some((call) => call.includes('!'))).toBe(false);
  });

  // ---- 6. Reject correct-format-but-unconfigured key ----

  it('should reject a correct-format-but-unconfigured key with opaque logs that never leak the key', () => {
    expect(() => service.validate(UNCONFIGURED_KEY)).toThrow(
      UnauthorizedException,
    );
    expect(logger.warn).toHaveBeenCalledWith(
      'Authentication failed: invalid API key presented',
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'Authentication failed: invalid API key presented',
    );
    // The key value must not appear in any log output at any level
    const allLogArguments = [
      ...logger.warn.mock.calls,
      ...logger.debug.mock.calls,
      ...logger.log.mock.calls,
    ].map((call) => String(call[0]));
    expect(
      allLogArguments.some((logLine) => logLine.includes(UNCONFIGURED_KEY)),
    ).toBe(false);
  });

  // ---- 7. Wrong prefix rejected at step 1 ----

  it('should reject a valid base64url body with a different prefix at step 1', () => {
    const key = wrongPrefixKey();
    expect(() => service.validate(key)).toThrow(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledWith(
      'API key is missing or has an invalid format.',
    );
  });

  // ---- 8. Set.has membership ----

  it('should authenticate the second configured key and reject an unconfigured key', () => {
    // Second configured key authenticates
    const result = service.validate(VALID_KEY_2);
    expect(result).toEqual({ apiKey: VALID_KEY_2 });
    expect(logger.log).toHaveBeenCalledWith(
      'API key authentication attempt successful',
    );

    // Unconfigured key is rejected (also covered by case 6)
    expect(() => service.validate(UNCONFIGURED_KEY)).toThrow(
      UnauthorizedException,
    );
  });

  // ---- 9. H2: constructor logs count only ----

  it('constructor should log only "Loaded 2 API key(s)" at DEBUG without key values', () => {
    const debugCalls = logger.debug.mock.calls.map((c) => String(c[0]));
    const countLine = debugCalls.find((call) => call.includes('Loaded'));
    expect(countLine).toBeDefined();
    expect(countLine).toContain('Loaded 2 API key(s)');
    // No configured key value should appear in the constructor log
    expect(countLine?.includes(VALID_KEY_1)).toBe(false);
    expect(countLine?.includes(VALID_KEY_2)).toBe(false);
  });

  // ---- 10. Empty configured keys ----

  describe('with empty configured keys', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyService,
          {
            provide: ConfigService,
            useValue: configureMockConfigService([]),
          },
          {
            provide: Logger,
            useValue: configureMockLogger(),
          },
        ],
      }).compile();

      service = module.get<ApiKeyService>(ApiKeyService);
      logger = module.get<Logger>(Logger);
    });

    it('should warn when no API keys are configured', () => {
      expect(logger.warn).toHaveBeenCalledWith(
        'No API keys configured. All requests will be unauthorised.',
      );
    });
  });
});
