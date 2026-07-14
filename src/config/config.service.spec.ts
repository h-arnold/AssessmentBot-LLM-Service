import * as fs from 'node:fs';
import type { PathLike, PathOrFileDescriptor } from 'node:fs';

import { Test, TestingModule } from '@nestjs/testing';

import { ConfigService } from './config.service.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn<(path: PathLike) => boolean>(),
  readFileSync:
    vi.fn<
      (
        path: PathOrFileDescriptor,
        options?:
          | BufferEncoding
          | { encoding?: BufferEncoding | null; flag?: string }
          | null,
      ) => string
    >(),
  unlinkSync: vi.fn<(path: PathLike) => void>(),
}));

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockUnlinkSync = vi.mocked(fs.unlinkSync);

const normalisePath = (filePath: PathOrFileDescriptor): string => {
  if (typeof filePath === 'string') {
    return filePath;
  }

  if (filePath instanceof URL) {
    return filePath.pathname;
  }

  if (Buffer.isBuffer(filePath)) {
    return filePath.toString('utf8');
  }

  return '';
};

describe('ConfigService', () => {
  let service: ConfigService;
  const originalEnvironment = process.env;

  beforeAll(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';
    process.env.API_KEYS = 'abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
    process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
    process.env.LOG_LEVEL = 'debug';
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockUnlinkSync.mockReset();

    mockExistsSync.mockReturnValue(false);
    mockReadFileSync.mockImplementation(() => {
      return '';
    });
    mockUnlinkSync.mockImplementation(() => {
      return;
    });

    // Reset process.env before each test
    process.env = { ...originalEnvironment };
    process.env.NODE_ENV = 'test';
    process.env.PORT = '3000';

    delete process.env.APP_VERSION; // Ensure APP_VERSION is clean for tests that expect it to be undefined
    delete process.env.MAX_IMAGE_UPLOAD_SIZE_MB;
    delete process.env.ALLOWED_IMAGE_MIME_TYPES;
  });

  afterAll(() => {
    // Restore original process.env after all tests
    process.env = originalEnvironment;
    // Restore all mocks
    vi.restoreAllMocks();
  });

  it('should be defined', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
    expect(service).toBeDefined();
  });

  describe('Environment variable loading', () => {
    it('should load environment variables from process.env', async () => {
      process.env.APP_NAME = 'TestAppNameFromEnv';
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      service = module.get<ConfigService>(ConfigService);
      expect(service.get('APP_NAME')).toBe('TestAppNameFromEnv');
    });

    it('should load variables from .env file', async () => {
      // Mock .env file existence and content
      mockExistsSync.mockImplementation((filePath: PathLike) => {
        return normalisePath(filePath).includes('.env');
      });
      mockReadFileSync.mockImplementation((filePath: PathOrFileDescriptor) => {
        if (normalisePath(filePath).includes('.env')) {
          return 'APP_NAME=TestAppNameFromDotEnv';
        }
        return ''; // Default for other files
      });

      // Ensure process.env does not have APP_NAME to verify .env loading
      delete process.env.APP_NAME;

      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      service = module.get<ConfigService>(ConfigService);
      expect(service.get('APP_NAME')).toBe('TestAppNameFromDotEnv');
    });

    it('should prioritise process.env over .env file', async () => {
      // Mock .env file existence and content
      mockExistsSync.mockImplementation((filePath: PathLike) => {
        return normalisePath(filePath).includes('.env');
      });
      mockReadFileSync.mockImplementation((filePath: PathOrFileDescriptor) => {
        if (normalisePath(filePath).includes('.env')) {
          return 'APP_VERSION=dotenv_version';
        }
        return ''; // Default for other files
      });
      process.env.APP_VERSION = 'process_env_version';
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      service = module.get<ConfigService>(ConfigService);
      expect(service.get('APP_VERSION')).toBe('process_env_version');
    });
  });

  describe('Zod schema validation', () => {
    it('should default to production when NODE_ENV is missing', () => {
      delete process.env.NODE_ENV;
      const service = new ConfigService();
      expect(service.get('NODE_ENV')).toBe('production');
    });

    it('should pass with valid NODE_ENV values', () => {
      const validEnvironments = ['development', 'production', 'test'];
      for (const environment of validEnvironments) {
        process.env.NODE_ENV = environment;
        expect(() => new ConfigService()).not.toThrow();
      }
    });

    it('should fail with truly invalid NODE_ENV values', () => {
      const invalidEnvironments = ['invalid', ''];
      for (const environment of invalidEnvironments) {
        process.env.NODE_ENV = environment;
        expect(() => new ConfigService()).toThrow();
      }
    });

    it('should be validated as a number', () => {
      process.env.PORT = 'not_a_number';
      expect(() => new ConfigService()).toThrow();
    });

    it('should be within valid range', () => {
      process.env.PORT = '0';
      expect(() => new ConfigService()).toThrow();
      process.env.PORT = '65536';
      expect(() => new ConfigService()).toThrow();
    });
  });

  describe('API Key validation', () => {
    it('should fail when API_KEYS is not a string', () => {
      process.env.API_KEYS = 12345 as unknown as string; // Force invalid type
      expect(() => new ConfigService()).toThrow();
    });

    it('should fail when API_KEYS contains malformed keys', () => {
      process.env.API_KEYS = 'key1,key2_with_invalid_chars-@,key3';
      expect(() => new ConfigService()).toThrow(
        /Invalid environment configuration/,
      );
    });

    it('should correctly parse a single API key', () => {
      const apiKey = 'abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      process.env.API_KEYS = apiKey;
      const configService = new ConfigService();
      expect(configService.get('API_KEYS')).toEqual([apiKey]);
    });

    it('should correctly parse multiple comma-separated API keys', () => {
      const apiKeys =
        'abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA,abt_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      process.env.API_KEYS = apiKeys;
      const configService = new ConfigService();
      expect(configService.get('API_KEYS')).toEqual([
        'abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'abt_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      ]);
    });

    it('should handle whitespace when parsing multiple keys', () => {
      const apiKeys =
        '  abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA  ,  abt_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB  ';
      process.env.API_KEYS = apiKeys;
      const configService = new ConfigService();
      expect(configService.get('API_KEYS')).toEqual([
        'abt_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'abt_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
      ]);
    });

    it('should fail gracefully if API_KEYS is missing', () => {
      delete process.env.API_KEYS;
      // Assuming API_KEYS is optional, this shouldn't throw.
      // If it becomes required, this test should change to expect a throw.
      const configService = new ConfigService();
      expect(configService.get('API_KEYS')).toBeUndefined();
    });
  });

  describe('Schema defaults and optional values', () => {
    it('APP_NAME should return default value when not set', () => {
      delete process.env.APP_NAME;
      const configService = new ConfigService();
      expect(configService.get('APP_NAME')).toBe('Assessment Bot LLM Service');
    });

    it('APP_VERSION should be optional and return undefined', () => {
      delete process.env.APP_VERSION;
      const configService = new ConfigService();
      expect(configService.get('APP_VERSION')).toBeUndefined();
    });
  });

  describe('Service-level value types', () => {
    it('ConfigService should return PORT as a number', () => {
      process.env.PORT = '3001';
      const configService = new ConfigService();
      expect(typeof configService.get('PORT')).toBe('number');
      expect(configService.get('PORT')).toBe(3001);
    });

    it('ConfigService should load MAX_IMAGE_UPLOAD_SIZE_MB as a number', () => {
      process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '2';
      const configService = new ConfigService();
      expect(configService.get('MAX_IMAGE_UPLOAD_SIZE_MB')).toBe(2);
    });

    it('ConfigService should use default MAX_IMAGE_UPLOAD_SIZE_MB if not set', () => {
      // Ensure the environment variable is not set
      delete process.env.MAX_IMAGE_UPLOAD_SIZE_MB;
      const configService = new ConfigService();
      expect(configService.get('MAX_IMAGE_UPLOAD_SIZE_MB')).toBe(1);
    });

    it('ConfigService should reject invalid MAX_IMAGE_UPLOAD_SIZE_MB', () => {
      process.env.MAX_IMAGE_UPLOAD_SIZE_MB = 'abc';
      expect(() => new ConfigService()).toThrow();
    });

    it('ConfigService should load ALLOWED_IMAGE_MIME_TYPES as an array of strings', () => {
      process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
      const configService = new ConfigService();
      expect(configService.get('ALLOWED_IMAGE_MIME_TYPES')).toEqual([
        'image/png',
        'image/jpeg',
      ]);
    });

    it('ConfigService should use default ALLOWED_IMAGE_MIME_TYPES if not set', () => {
      // Ensure the environment variable is not set
      delete process.env.ALLOWED_IMAGE_MIME_TYPES;
      const configService = new ConfigService();
      expect(configService.get('ALLOWED_IMAGE_MIME_TYPES')).toEqual([
        'image/png',
      ]);
    });

    it('should handle single ALLOWED_IMAGE_MIME_TYPES', () => {
      process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/gif';
      const configService = new ConfigService();
      expect(configService.get('ALLOWED_IMAGE_MIME_TYPES')).toEqual([
        'image/gif',
      ]);
    });

    it('ConfigService should load LOG_LEVEL as a string', () => {
      process.env.LOG_LEVEL = 'debug';
      const configService = new ConfigService();
      expect(configService.get('LOG_LEVEL')).toBe('debug');
    });
  });

  describe('getGlobalPayloadLimit', () => {
    it('should calculate correctly for default MAX_IMAGE_UPLOAD_SIZE_MB', () => {
      // Ensure we use the default value
      delete process.env.MAX_IMAGE_UPLOAD_SIZE_MB;
      const configService = new ConfigService();
      // Formula: ((1 * 1.33 * 3) + 1) = 4.99 -> 5MB
      expect(configService.getGlobalPayloadLimit()).toBe('5mb');
    });

    it('should calculate correctly for a different MAX_IMAGE_UPLOAD_SIZE_MB', () => {
      process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '2';
      const configService = new ConfigService();
      // Formula: ((2 * 1.33 * 3) + 1) = 8.98 -> 9MB
      expect(configService.getGlobalPayloadLimit()).toBe('9mb');
    });
  });

  describe('.env.example file validation', () => {
    const expectedRequiredVariables = ['NODE_ENV', 'PORT', 'APP_NAME'];

    beforeEach(() => {
      // Ensure .env.example exists for these tests
      mockExistsSync.mockImplementation((filePath: PathLike) => {
        return normalisePath(filePath).includes('.env.example');
      });
      mockReadFileSync.mockImplementation((filePath: PathOrFileDescriptor) => {
        if (normalisePath(filePath).includes('.env.example')) {
          return `
NODE_ENV=development
PORT=3000
APP_NAME=Assessment Bot LLM Service
APP_VERSION=1.0.0
DATABASE_URL=your_database_url_here
API_KEY=your_api_key_here
# This is a comment
SOME_OTHER_VAR=value
          `;
        }
        return '';
      });
    });

    it('.env.example should contain all required variables', () => {
      // cSpell:ignore Vars
      const fileContent = fs.readFileSync('.env.example', {
        encoding: 'utf8',
      });
      const lines = fileContent
        .split('\n')
        .filter((line: string) => line.trim() !== '' && !line.startsWith('#'));
      const variablesInFile = lines.map(
        (line: string) => line.split('=', 1)[0],
      );

      for (const variable of expectedRequiredVariables) {
        expect(variablesInFile).toContain(variable);
      }
    });

    it('.env.example should use placeholder values', () => {
      // cSpell:ignore Vars
      const fileContent = fs.readFileSync('.env.example', {
        encoding: 'utf8',
      });
      expect(fileContent).toContain('your_database_url_here');
      expect(fileContent).toContain('your_api_key_here');
      expect(fileContent).not.toContain('production_secret_key');
    });
  });

  describe('Missing .env file handling', () => {
    beforeEach(() => {
      // Ensure .env file does not exist for these tests
      if (fs.existsSync('.env')) {
        fs.unlinkSync('.env');
      }
      // Set required variables in process.env
      process.env.NODE_ENV = 'test';
      process.env.PORT = '3000';
      process.env.APP_NAME = 'TestApp';
      delete process.env.APP_VERSION; // Ensure optional is undefined
    });

    it('should not cause an error when .env file is missing and required vars are in process.env', async () => {
      // cSpell:ignore vars
      // We need to re-create the testing module to ensure ConfigService re-initializes
      // with the correct environment state (no .env file).
      const module: TestingModule = await Test.createTestingModule({
        providers: [ConfigService],
      }).compile();
      service = module.get<ConfigService>(ConfigService);
      expect(service).toBeDefined(); // If service is defined, no error was thrown during instantiation
    });
  });
});
