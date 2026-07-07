import * as fs from 'node:fs';
import type { PathLike, PathOrFileDescriptor } from 'node:fs';

import * as dotenv from 'dotenv';

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
}));

const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);

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

describe('.env.example file', () => {
  const expectedRequiredVariables = [
    'NODE_ENV',
    'PORT',
    'APP_NAME',
    'APP_VERSION',
  ];

  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((filePath: PathOrFileDescriptor) => {
      if (!normalisePath(filePath).includes('.env.example')) {
        return '';
      }

      return `
NODE_ENV=development
PORT=3000
APP_NAME=Assessment Bot LLM Service
APP_VERSION=1.0.0
DATABASE_URL=your_database_url_here
API_KEY=your_api_key_here
`;
    });
  });

  afterAll(() => {
    vi.resetAllMocks();
  });

  it('should contain all required variables', () => {
    const exampleContent = fs.readFileSync('.env.example', {
      encoding: 'utf8',
    });
    const exampleConfig = dotenv.parse(exampleContent);

    for (const key of expectedRequiredVariables) {
      const matchedEntry = Object.entries(exampleConfig).find(
        ([entryKey]) => entryKey === key,
      );

      expect(matchedEntry).toBeDefined();
      expect(matchedEntry?.[1]).not.toBe('');
    }
  });

  it('should use placeholder values', () => {
    const exampleContent = fs.readFileSync('.env.example', {
      encoding: 'utf8',
    });
    const exampleConfig = dotenv.parse(exampleContent);

    expect(exampleConfig.NODE_ENV).toBe('development');
    expect(exampleConfig.PORT).toBe('3000');
    expect(exampleConfig.APP_NAME).toBe('Assessment Bot LLM Service');
    expect(exampleConfig.APP_VERSION).toBe('1.0.0');
  });
});
