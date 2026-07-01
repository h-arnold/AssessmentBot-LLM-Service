import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Utility function to get current directory path that works in both
 * Node.js ESM runtime and Jest test environment
 *
 * @param fallbackDir - Fallback directory for tests, defaults to process.cwd()
 */
export function getCurrentDirname(fallbackDir?: string): string {
  try {
    // Use dynamic evaluation to avoid TypeScript compilation issues in Jest
    // This will work in ESM runtime but fail gracefully in Jest
    const getImportMetaUrl = new Function(
      'return import.meta.url',
    ) as () => string;
    const metaUrl = getImportMetaUrl();
    return path.dirname(fileURLToPath(metaUrl));
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ReferenceError) {
      return fallbackDir ?? process.cwd();
    }

    throw error;
  }
}

/**
 * Reads the content of a markdown file from the specified directory.
 *
 * This method ensures security by validating the filename and path to prevent
 * path traversal attacks and unauthorized file access.
 *
 * @param name - The name of the markdown file to read. Must end with `.md` and
 *               must not contain path traversal sequences (`..`).
 * @param basePath - The base directory to read from. Defaults to 'src/prompt/templates'.
 * @returns A promise that resolves to the content of the markdown file as a string.
 * @throws {Error} If the filename is invalid or the resolved path is unauthorized.
 */
export async function readMarkdown(
  name: string,
  basePath?: string,
): Promise<string> {
  if (!name) return '';
  if (name.includes('..') || !name.endsWith('.md')) {
    throw new Error('Invalid markdown filename');
  }

  // If caller provided a basePath use only that, otherwise try known candidates.
  const candidates: string[] = [];
  if (basePath) {
    candidates.push(basePath);
  } else {
    candidates.push('src/prompt/templates', 'dist/src/prompt/templates');
    // Relative to this file at runtime (dist/src/common/file-utils.js -> ../prompt/templates)
    try {
      const currentDir = getCurrentDirname();
      candidates.push(path.resolve(currentDir, '../prompt/templates'));
    } catch {
      // ignore
    }
  }

  const tried: string[] = [];
  for (const candidate of candidates) {
    const baseDir = path.resolve(candidate);
    const resolvedPath = path.resolve(baseDir, name);
    // Security: ensure resolved path is within baseDir
    if (!resolvedPath.startsWith(baseDir)) continue;
    tried.push(resolvedPath);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const content = await fs.readFile(resolvedPath, { encoding: 'utf-8' });
      return content;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
      ) {
        // Try next candidate
        continue;
      }
      // Re-throw other errors (e.g., permission issues)
      throw error;
    }
  }
  throw new Error(
    `Markdown file not found in candidate paths: ${tried.join(', ')}`,
  );
}
