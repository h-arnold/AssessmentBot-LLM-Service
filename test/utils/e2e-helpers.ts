import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Represents the raw task data loaded from JSON fixtures.
 */
export interface TaskData {
  taskType: string;
  referenceTask: string;
  emptyTask: string;
  studentTask: string;
}

/**
 * Loads a file from disk and encodes it as a base64 data URI.
 *
 * The MIME type is inferred from the file extension: `.png` maps to
 * `image/png`, everything else maps to `image/jpeg`.
 * @param filePath - Absolute path to the file to load.
 * @returns A data URI string, e.g. `data:image/png;base64,...`.
 */
export const loadFileAsDataURI = async (filePath: string): Promise<string> => {
  const fileBuffer = await fs.readFile(filePath);
  const mimeType =
    path.extname(filePath) === '.png' ? 'image/png' : 'image/jpeg';
  // Encode via Buffer's base64 encoder for portability across Node versions.
  // `Uint8Array#toBase64` is newer and is unavailable in some runtimes.
  return `data:${mimeType};base64,${Buffer.prototype.toString.call(fileBuffer, 'base64')}`;
};
