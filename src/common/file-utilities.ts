import * as fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Utility function to get the project root directory path.
 *
 * Returns `process.cwd()` which is the standard way to resolve paths relative
 * to the project root in both Jest and production environments.
 * @param {string} [fallbackDirectory] - Fallback directory, defaults to
 *   process.cwd().
 * @returns {string} The resolved directory path.
 */
export function getCurrentDirname(fallbackDirectory?: string): string {
  return fallbackDirectory ?? process.cwd();
}

/**
 * Reads the content of a markdown file from the specified directory.
 *
 * This method ensures security by validating the filename and path to prevent
 * path traversal attacks and unauthorized file access.
 * @param {string} name - The name of the markdown file to read. Must end with
 *   `.md` and must not contain path traversal sequences (`..`).
 * @param {string} [basePath] - The base directory to read from. Defaults to
 *   'src/prompt/templates'.
 * @returns {Promise<string>} A promise that resolves to the content of the
 *   markdown file as a string.
 * @throws {Error} If the filename is invalid or the resolved path is
 *   unauthorized.
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
    // Relative to this file at runtime (dist/src/common/file-utilities.js -> ../prompt/templates)
    try {
      const currentDirectory = getCurrentDirname();
      candidates.push(path.resolve(currentDirectory, '../prompt/templates'));
    } catch {
      // ignore
    }
  }

  const tried: string[] = [];
  for (const candidate of candidates) {
    const baseDirectory = path.resolve(candidate);
    const resolvedPath = path.resolve(baseDirectory, name);
    // Security: ensure resolved path is within baseDirectory
    if (!resolvedPath.startsWith(baseDirectory)) continue;
    tried.push(resolvedPath);
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const content = await fs.readFile(resolvedPath, { encoding: 'utf8' });
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
