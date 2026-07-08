import { readFileSync, type PathLike } from 'node:fs';
import { readFile, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { Logger } from '@nestjs/common';
import mustache from 'mustache';

import { PromptInputSchema, type PromptInput } from './prompt.base.js';
import { TextPrompt } from './text.prompt.js';
import { isSystemUserMessage } from '../common/utils/type-guards.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

const mockedReadFile = vi.mocked(readFile);

/**
 * Normalise a file path argument to a string.
 * @param {PathLike | FileHandle} filePath - The file path to normalise.
 * @returns {string} The normalised file path as a string.
 */
function normaliseFilePath(filePath: PathLike | FileHandle): string {
  if (typeof filePath === 'string') return filePath;
  if (Buffer.isBuffer(filePath)) return filePath.toString('utf8');
  if (filePath instanceof URL) return filePath.pathname;

  throw new Error('File handle paths are not supported in this test');
}

/**
 * Get the template content for a given file path.
 * @param {PathLike | FileHandle} filePath - The file path to look up.
 * @returns {string} The template content string.
 */
function getTemplateContent(filePath: PathLike | FileHandle): string {
  const filePathString = normaliseFilePath(filePath);
  if (filePathString.includes('text.system.prompt.md')) return systemTemplate;
  if (filePathString.includes('text.user.prompt.md')) return userTemplate;
  throw new Error('File not found');
}

const textTask: PromptInput = PromptInputSchema.parse(
  JSON.parse(
    readFileSync('test/data/textTask.json', { encoding: 'utf8' }),
  ) as unknown,
);

const systemTemplate: string = readFileSync(
  path.join(process.cwd(), 'src/prompt/templates/text.system.prompt.md'),
  { encoding: 'utf8' },
);
const userTemplate: string = readFileSync(
  path.join(process.cwd(), 'src/prompt/templates/text.user.prompt.md'),
  { encoding: 'utf8' },
);
beforeAll(() => {
  mockedReadFile.mockImplementation(async (filePath) =>
    getTemplateContent(filePath),
  );
});

describe('TextPrompt', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  it('should build the final prompt object correctly', async () => {
    const inputs = {
      referenceTask: textTask.referenceTask,
      studentTask: textTask.studentTask,
      emptyTask: textTask.emptyTask,
    };

    const prompt = new TextPrompt(
      inputs,
      logger,
      'text.user.prompt.md',
      systemTemplate,
    );
    const message = await prompt.buildMessage();

    if (!isSystemUserMessage(message)) {
      throw new Error(
        `Prompt did not return expected object shape.\nActual payload:\n${JSON.stringify(message)}`,
      );
    }
    expect(message.system).toBe(systemTemplate);
    const expectedUser = mustache.render(userTemplate, {
      referenceTask: textTask.referenceTask,
      studentTask: textTask.studentTask,
      emptyTask: textTask.emptyTask,
    });
    expect(message.user).toBe(expectedUser);
  });
});
