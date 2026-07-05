import * as fs from 'node:fs/promises';
import path from 'node:path';

import { Logger } from '@nestjs/common';

import { Prompt, PromptInput } from './prompt.base';
import { getCurrentDirname } from '../common/file-utilities';
import { LlmPayload } from '../llm/llm.service.interface';

/**
 * Prompt implementation for assessing image-based tasks.
 *
 * This class handles the creation of prompts for image assessment tasks,
 * supporting both file-based images and data URI encoded images. It manages
 * the conversion of image data into formats suitable for LLM processing
 * and implements security measures for file access.
 */
export class ImagePrompt extends Prompt {
  /**
   * Builds user message parts for image prompts.
   *
   * Image prompts handle content differently from text prompts and
   * typically don't require separate user message parts since the
   * images are included directly in the payload.
   * @returns {Promise<import('@google/generative-ai').Part[]>} Promise
   *   resolving to an empty array of Parts.
   */
  protected async buildUserMessageParts(): Promise<
    import('@google/generative-ai').Part[]
  > {
    // For image prompts, this could return an empty array or a basic structure
    return [];
  }
  private readonly images: { path: string; mimeType: string }[];

  /**
   * Initialises the ImagePrompt instance with image-specific configuration.
   * @param {PromptInput} inputs - Validated prompt input data containing image
   *   information.
   * @param {Logger} logger - Logger instance for recording image prompt
   *   operations.
   * @param {{ path: string; mimeType: string }[]} [images] - Optional array of
   *   image objects with file paths and MIME types.
   * @param {string} [systemPrompt] - Optional system prompt string providing
   *   context for image assessment.
   */
  constructor(
    inputs: PromptInput,
    logger: Logger,
    images?: { path: string; mimeType: string }[],
    systemPrompt?: string,
  ) {
    super(inputs, logger, undefined, systemPrompt);
    this.images = images || [];
  }

  /**
   * Builds the LLM payload for an image-based assessment.
   *
   * Creates a payload suitable for multimodal LLMs that can process both
   * text and images. The method handles two scenarios:
   * 1. File-based images: reads image files from disk
   * 2. Data URI images: extracts image data from base64 encoded strings.
   * @returns {Promise<LlmPayload>} Promise resolving to an LlmPayload
   *   containing system prompt and image data.
   */
  public async buildMessage(): Promise<LlmPayload> {
    // For image prompts, the user message is a combination of the rendered system prompt
    // and the structured inputs.

    // Handle the images

    let images: { data: string; mimeType: string }[];
    if (this.images.length > 0) {
      this.logger.debug(
        `Building image payload from ${this.images.length} file-based images.`,
      );
      images = await this.buildImagesFromFiles();
    } else {
      this.logger.debug(
        'Building image payload from data URI inputs in the request.',
      );
      images = this.buildImagesFromDataUris();
    }

    this.logger.log(`Built image payload with ${images.length} images.`);

    return {
      system: this.systemPrompt ?? '',
      images: images,
    };
  }

  /**
   * Builds image payload from file paths on the filesystem.
   *
   * Reads image files from disk and converts them to base64 format
   * suitable for LLM processing. This method is used when images
   * are provided as file references rather than embedded data.
   * @returns {Promise<{ data: string; mimeType: string }[]>} Promise resolving
   *   to array of image data and MIME type objects.
   */
  private async buildImagesFromFiles(): Promise<
    { data: string; mimeType: string }[]
  > {
    const imagePromises = this.images.map(async (image) => {
      this.logger.debug(
        `Reading image file for prompt: ${image.path} (${image.mimeType}).`,
      );
      const data = await this.readImageFile(image.path, image.mimeType);
      return { data, mimeType: image.mimeType };
    });
    return Promise.all(imagePromises);
  }

  /**
   * Builds image payload from data URIs embedded in the input.
   *
   * Extracts base64-encoded image data from data URI strings in the
   * input fields. This method assumes the validation pipeline has
   * already confirmed all image fields contain valid data URIs.
   * @returns {{ data: string; mimeType: string }[]} Array of image data and
   *   MIME type objects.
   * @throws {Error} If any data URI is malformed.
   */
  private buildImagesFromDataUris(): { data: string; mimeType: string }[] {
    // Assumes validation pipeline guarantees all three tasks are valid data URIs
    const parseDataUri = (uri: string): { data: string; mimeType: string } => {
      const match = /^data:(.+);base64,(.*)$/.exec(uri);
      if (!match) {
        this.logger.error(
          `Invalid data URI encountered while building image prompt: ${uri.slice(0, 30)}...`,
        );
        throw new Error(`Invalid Data URI: ${uri.slice(0, 30)}...`);
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

  /**
   * Reads an image file from the specified path and returns its content as a base64-encoded string.
   * @param {string} imagePath - The relative path to the image file within the
   *   allowed directory. Path traversal is blocked to ensure security.
   * @param {string} [mimeType] - The MIME type of the image file. Must be one
   *   of the allowed MIME types specified in the `ALLOWED_IMAGE_MIME_TYPES`
   *   environment variable. Defaults to 'image/png' if not provided.
   * @returns {Promise<string>} A promise that resolves to the base64-encoded
   *   content of the image file.
   * @throws {Error} If the `imagePath` contains path traversal (`..`).
   * @throws {Error} If the `mimeType` is not allowed based on the environment
   *   configuration.
   * @throws {Error} If the resolved file path is outside the authorised
   *   directory.
   * @remarks
   * - The method ensures security by validating the file path and MIME type before reading the file.
   * - The base directory for image files is restricted to `docs/ImplementationPlan/Stage6/Prompts`.
   * - The file path validation prevents unauthorized access to files outside the allowed directory.
   * - The MIME type validation ensures only specific image types are processed.
   */
  async readImageFile(imagePath: string, mimeType?: string): Promise<string> {
    // Security: Only allow reading from the Prompts directory, and block path traversal
    if (imagePath.includes('..')) {
      this.logger.warn(`Blocked image path traversal attempt: ${imagePath}.`);
      throw new Error('Invalid image filename');
    }
    if (path.isAbsolute(imagePath)) {
      this.logger.warn(
        `Blocked unauthorised absolute image path: ${imagePath}.`,
      );
      throw new Error('Unauthorised file path');
    }
    // Get allowed MIME types from environment
    const allowedMimeTypes = (
      process.env.ALLOWED_IMAGE_MIME_TYPES || 'image/png'
    )
      .split(',')
      .map((type) => type.trim().toLowerCase());
    if (!mimeType || !allowedMimeTypes.includes(mimeType.toLowerCase())) {
      this.logger.warn(
        `Blocked image with disallowed MIME type: ${mimeType ?? 'unknown'}.`,
      );
      throw new Error('Disallowed image MIME type');
    }
    const baseDirectory = path.join(
      getCurrentDirname(),
      '../../../docs/ImplementationPlan/Stage6/ExampleData/ImageTasks',
    );
    const relativePath = path.join(baseDirectory, imagePath);
    if (!relativePath.startsWith(baseDirectory)) {
      this.logger.warn(`Blocked unauthorised image path: ${imagePath}.`);
      throw new Error('Unauthorised file path');
    }
    // Security: Path is validated above, safe to read
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const data = await fs.readFile(relativePath, { encoding: 'base64' });
    this.logger.debug(
      `Read image file ${imagePath} with ${data.length} base64 characters.`,
    );
    return data;
  }
}
