import * as fs from 'node:fs/promises';

import { Logger } from '@nestjs/common';

import { ImagePrompt } from './image.prompt';
import { ImagePromptPayload } from '../llm/llm.service.interface';

jest.mock('fs/promises');

describe('ImagePrompt', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
  });

  it('should build a structured payload with text and images', async () => {
    process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png'; // Ensure allowed MIME type is lowercase
    const inputs = {
      referenceTask: 'Reference text',
      studentTask: 'Student text',
      emptyTask: 'Empty text',
    };
    const images = [
      { path: 'referenceTask.png', mimeType: 'image/png' },
      { path: 'studentTask.png', mimeType: 'image/png' },
    ];

    (fs.readFile as jest.Mock).mockImplementation(
      (filePath: string, options: { encoding: string }) => {
        if (
          filePath.includes('src/prompt/templates/image.system.prompt.md') &&
          options.encoding === 'utf-8'
        ) {
          return Promise.resolve(template);
        }
        if (filePath.endsWith('.png') && options.encoding === 'base64') {
          return Promise.resolve('base64data');
        }
        return Promise.reject(new Error('File not found'));
      },
    );

    const systemPrompt = 'system prompt';
    const prompt = new ImagePrompt(inputs, logger, images, systemPrompt);
    const message = (await prompt.buildMessage()) as ImagePromptPayload;

    const calls = (fs.readFile as jest.Mock).mock.calls;
    expect(calls).toEqual(
      expect.arrayContaining([
        [expect.stringContaining('referenceTask.png'), { encoding: 'base64' }],
        [expect.stringContaining('studentTask.png'), { encoding: 'base64' }],
      ]),
    );

    // For ImagePrompt, system is passed directly, no template rendering
    expect(message.system).toBe(systemPrompt);
    expect(message.images).toEqual([
      { data: 'base64data', mimeType: 'image/png' },
      { data: 'base64data', mimeType: 'image/png' },
    ]);
  });

  it('should reject images with disallowed MIME types', async () => {
    const inputs = {
      referenceTask: 'Reference text',
      studentTask: 'Student text',
      emptyTask: 'Empty text',
    };
    const images = [
      { path: 'ref.png', mimeType: 'image/gif' }, // Not allowed by default
    ];
    const prompt = new ImagePrompt(inputs, logger, images);
    await expect(prompt.readImageFile('ref.png', 'image/gif')).rejects.toThrow(
      'Disallowed image MIME type',
    );
  });

  it('should reject images with missing MIME type', async () => {
    const inputs = {
      referenceTask: 'Reference text',
      studentTask: 'Student text',
      emptyTask: 'Empty text',
    };
    const images = [
      { path: 'ref.png', mimeType: undefined as unknown as string },
    ];
    const prompt = new ImagePrompt(inputs, logger, images);
    await expect(
      prompt.readImageFile('ref.png', undefined as unknown as string),
    ).rejects.toThrow('Disallowed image MIME type');
  });

  it('should reject images with path traversal in filename', async () => {
    const inputs = {
      referenceTask: 'Reference text',
      studentTask: 'Student text',
      emptyTask: 'Empty text',
    };
    const images = [{ path: '../ref.png', mimeType: 'image/png' }];
    const prompt = new ImagePrompt(inputs, logger, images);
    await expect(
      prompt.readImageFile('../ref.png', 'image/png'),
    ).rejects.toThrow('Invalid image filename');
  });

  it('should accept allowed MIME types from env', async () => {
    process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
    const inputs = {
      referenceTask: 'Reference text',
      studentTask: 'Student text',
      emptyTask: 'Empty text',
    };
    const images = [{ path: 'ref.png', mimeType: 'image/jpeg' }];
    const prompt = new ImagePrompt(inputs, logger, images);
    // Mock fs.readFile to resolve
    (fs.readFile as jest.Mock).mockResolvedValueOnce('base64data');
    await expect(prompt.readImageFile('ref.png', 'image/jpeg')).resolves.toBe(
      'base64data',
    );
  });

  it('should build images from data URIs when no files are provided', async () => {
    const inputs = {
      referenceTask: 'data:image/png;base64,REFDATA',
      studentTask: 'data:image/png;base64,STUDENTDATA',
      emptyTask: 'data:image/png;base64,EMPTYDATA',
    };

    const prompt = new ImagePrompt(inputs, logger);
    const message = (await prompt.buildMessage()) as ImagePromptPayload;

    expect(message.images).toEqual([
      { data: 'REFDATA', mimeType: 'image/png' },
      { data: 'EMPTYDATA', mimeType: 'image/png' },
      { data: 'STUDENTDATA', mimeType: 'image/png' },
    ]);
  });

  it('should throw when a data URI is malformed', async () => {
    const inputs = {
      referenceTask: 'data:image/png;base64,REFDATA',
      studentTask: 'not-a-data-uri',
      emptyTask: 'data:image/png;base64,EMPTYDATA',
    };

    const prompt = new ImagePrompt(inputs, logger);

    await expect(prompt.buildMessage()).rejects.toThrow('Invalid Data URI');
  });

  it('should reject unauthorised absolute paths', async () => {
    process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png';
    const inputs = {
      referenceTask: 'Reference text',
      studentTask: 'Student text',
      emptyTask: 'Empty text',
    };
    const prompt = new ImagePrompt(inputs, logger, []);

    await expect(
      prompt.readImageFile('/etc/passwd', 'image/png'),
    ).rejects.toThrow('Unauthorised file path');
  });
});
