import { getCurrentDirname } from './file-utilities';

describe('getCurrentDirname', () => {
  it('should return process.cwd() in Jest test environment', () => {
    const result = getCurrentDirname();
    expect(result).toBe(process.cwd());
  });

  it('should use fallback directory when provided', () => {
    const fallbackDirectory = '/custom/test/path';
    const result = getCurrentDirname(fallbackDirectory);
    expect(result).toBe(fallbackDirectory);
  });

  it('should return process.cwd() when no fallback is provided', () => {
    const result = getCurrentDirname();
    expect(result).toBe(process.cwd());
  });
});
