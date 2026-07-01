import { readFileSync, type PathLike } from 'node:fs';
import { readFile, type FileHandle } from 'node:fs/promises';
import path from 'node:path';

import { Logger } from '@nestjs/common';
import * as mustache from 'mustache';

import { PromptInputSchema, type PromptInput } from './prompt.base';
import { TablePrompt } from './table.prompt';
import { isSystemUserMessage } from '../common/utils/type-guards';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

const mockedReadFile = jest.mocked(readFile);

function normaliseFilePath(filePath: PathLike | FileHandle): string {
  if (typeof filePath === 'string') return filePath;
  if (Buffer.isBuffer(filePath)) return filePath.toString('utf-8');
  if (filePath instanceof URL) return filePath.pathname;

  throw new Error('File handle paths are not supported in this test');
}

function getTemplateContent(filePath: PathLike | FileHandle): string {
  const filePathString = normaliseFilePath(filePath);
  if (filePathString.includes('table.system.prompt.md')) return systemTemplate;
  if (filePathString.includes('table.user.prompt.md')) return userTemplate;
  throw new Error('File not found');
}

const tableTask: PromptInput = PromptInputSchema.parse(
  JSON.parse(
    readFileSync('test/data/tableTask.json', { encoding: 'utf-8' }),
  ) as unknown,
);

let systemTemplate: string;
let userTemplate: string;
beforeAll(() => {
  systemTemplate = readFileSync(
    path.join(process.cwd(), 'src/prompt/templates/table.system.prompt.md'),
    { encoding: 'utf-8' },
  );
  userTemplate = readFileSync(
    path.join(process.cwd(), 'src/prompt/templates/table.user.prompt.md'),
    { encoding: 'utf-8' },
  );
  mockedReadFile.mockImplementation(async (filePath) =>
    getTemplateContent(filePath),
  );
});

describe('TablePrompt', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  it('should build the final prompt object correctly', async () => {
    const inputs = {
      referenceTask: tableTask.referenceTask,
      studentTask: tableTask.studentTask,
      emptyTask: tableTask.emptyTask,
    };

    const prompt = new TablePrompt(
      inputs,
      logger,
      'table.user.prompt.md',
      systemTemplate,
    );
    const message = await prompt.buildMessage();

    // Log the rendered user message for debugging
    console.info('--- Rendered TablePrompt User Message ---');
    if (!isSystemUserMessage(message)) {
      throw new Error(
        `Prompt did not return expected object shape. \n Rendered TablePrompt payload: ${JSON.stringify(message)}`,
      );
    }
    expect(message.system).toBe(systemTemplate);
    const expectedUser = mustache.render(userTemplate, {
      referenceTask: tableTask.referenceTask,
      studentTask: tableTask.studentTask,
      emptyTask: tableTask.emptyTask,
    });
    expect(message.user).toBe(expectedUser);
  });
});
