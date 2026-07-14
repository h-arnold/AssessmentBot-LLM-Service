import { Logger, BadRequestException } from '@nestjs/common';

import { Prompt, PromptInput } from './prompt.base.js';
import { LlmPayload } from '../llm/llm.service.interface.js';

/**
 * Prompt implementation for assessing image-based tasks.
 *
 * This class handles the creation of prompts for image assessment tasks
 * using data URI encoded images (including Buffers converted to data URIs
 * upstream by PromptFactory). It manages the extraction of base64-encoded
 * image data from data URI strings into formats suitable for LLM processing.
 */
export class ImagePrompt extends Prompt {
  /**
   * Initialises the ImagePrompt instance with image-specific configuration.
   * @param {PromptInput} inputs - Validated prompt input data containing image
   *   information.
   * @param {Logger} logger - Logger instance for recording image prompt
   *   operations.
   * @param {string} [systemPrompt] - Optional system prompt string providing
   *   context for image assessment.
   */
  constructor(inputs: PromptInput, logger: Logger, systemPrompt?: string) {
    super(inputs, logger, undefined, systemPrompt);
  }

  /**
   * Builds the LLM payload for an image-based assessment.
   *
   * Creates a payload suitable for multimodal LLMs that can process both
   * text and images. Image data is extracted from data URI strings in the
   * input fields. The validation pipeline guarantees all image fields contain
   * valid data URIs (or have been converted from Buffers upstream).
   * @returns {Promise<LlmPayload>} Promise resolving to an LlmPayload
   *   containing system prompt and image data.
   */
  public async buildMessage(): Promise<LlmPayload> {
    this.logger.debug(
      'Building image payload from data URI inputs in the request.',
    );

    const images = this.buildImagesFromDataUris();

    this.logger.log(`Built image payload with ${images.length} images.`);

    return {
      system: this.systemPrompt ?? '',
      images: images,
    };
  }

  /**
   * Builds image payload from data URIs embedded in the input.
   *
   * Extracts base64-encoded image data from data URI strings in the
   * input fields. This method assumes the validation pipeline has
   * already confirmed all image fields contain valid data URIs.
   * @returns {{ data: string; mimeType: string }[]} Array of image data and
   *   MIME type objects.
   * @throws {BadRequestException} If any data URI is malformed.
   */
  private buildImagesFromDataUris(): { data: string; mimeType: string }[] {
    // Assumes validation pipeline guarantees all three tasks are valid data URIs
    const parseDataUri = (uri: string): { data: string; mimeType: string } => {
      const match = /^data:(.+);base64,(.*)$/.exec(uri);
      if (!match) {
        this.logger.error(
          `Invalid data URI encountered while building image prompt: ${uri.slice(0, 30)}...`,
        );
        throw new BadRequestException(
          'Invalid Data URI provided for an image field.',
        );
      }
      const [, mimeType, data] = match;
      this.logger.debug(
        `Parsed data URI for ${mimeType} with ${data.length} base64 characters.`,
      );
      return { mimeType, data };
    };
    return [
      parseDataUri(this.referenceTask),
      parseDataUri(this.emptyTask),
      parseDataUri(this.studentTask),
    ];
  }
}
