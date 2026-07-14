import { Logger } from '@nestjs/common';

import { ImagePrompt } from './image.prompt.js';
import { ImagePromptPayload } from '../llm/llm.service.interface.js';

describe('ImagePrompt', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger();
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

  it('should handle data URIs resulting from Buffer conversion', async () => {
    // This simulates the output of PromptFactory's Buffer → data URI conversion.
    // The factory converts Buffer fields to data URIs using detectBufferMime
    // before passing them to ImagePrompt, so ImagePrompt only ever sees strings.
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const dataUri = `data:image/png;base64,${base64Data}`;

    const inputs = {
      referenceTask: dataUri,
      studentTask: dataUri,
      emptyTask: dataUri,
    };

    const prompt = new ImagePrompt(inputs, logger);
    const message = (await prompt.buildMessage()) as ImagePromptPayload;

    expect(message.images).toHaveLength(3);
    expect(message.images[0].mimeType).toBe('image/png');
    expect(message.images[0].data).toBe(base64Data);
  });
});
