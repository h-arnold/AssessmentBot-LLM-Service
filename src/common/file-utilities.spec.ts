vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, readFile: vi.fn(actual.readFile) };
});

import * as fs from 'node:fs/promises';

import { getCurrentDirname, readMarkdown } from './file-utilities.js';

describe('getCurrentDirname', () => {
  it('should return process.cwd() by default', () => {
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

describe('readMarkdown', () => {
  it('should cache content and avoid repeated disk reads', async () => {
    // Use a known existing template file for a deterministic cache test.
    const templateName = 'text.system.prompt.md';

    // First call should hit disk
    const result1 = await readMarkdown(templateName);
    expect(result1).toBeTruthy();
    expect(fs.readFile).toHaveBeenCalledTimes(1);

    // Second call should use cache — no additional disk read
    const result2 = await readMarkdown(templateName);
    expect(result2).toBe(result1);
    expect(fs.readFile).toHaveBeenCalledTimes(1);
  });

  it('should return identical content on repeated calls', async () => {
    const templateName = 'text.system.prompt.md';

    const result1 = await readMarkdown(templateName);
    const result2 = await readMarkdown(templateName);
    expect(result1).toBe(result2);
  });
});
