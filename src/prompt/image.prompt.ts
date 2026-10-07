import { Logger, BadRequestException } from '@nestjs/common';

import { MultiPartPrompt } from './multi-part.prompt.base.js';
import { PromptInput } from './prompt.base.js';
import { ConfigService } from '../config/config.service.js';
import { LlmContentPart } from '../llm/llm.service.interface.js';

/**
 * Prompt implementation for assessing image-based tasks.
 *
 * This class handles the creation of prompts for image assessment
 * tasks using data URI encoded images. It manages the extraction
 * of base64-encoded image data from data URI strings and supplies
 * the ordered label and image pairs through the
 * {@link MultiPartPrompt.buildUserParts} hook; the inherited base
 * owns conversation assembly, server-side cache-key derivation and
 * the single payload-validation boundary.
 *
 * The class is stateless across builds: every `buildMessage()` call
 * derives the user parts afresh from the validated instance inputs
 * and retains no conversation history or accumulated turns.
 */
export class ImagePrompt extends MultiPartPrompt {
  /**
   * Initialises the ImagePrompt instance with image-specific configuration.
   * @param {PromptInput} inputs - Validated prompt input data containing image
   *   information.
   * @param {Logger} logger - Logger instance for recording image prompt
   *   operations.
   * @param {string} [systemPrompt] - Optional system prompt string providing
   *   context for image assessment.
   * @param {ConfigService} [configService] - Runtime configuration.
   */
  constructor(
    inputs: PromptInput,
    logger: Logger,
    systemPrompt?: string,
    configService?: ConfigService,
  ) {
    super(inputs, logger, undefined, systemPrompt, configService);
  }

  /**
   * Builds the ordered user message parts for an image assessment.
   *
   * Extracts the three images from their data URIs and interleaves
   * each with its identification label so that each label immediately
   * precedes its corresponding image, in reference, template, student
   * order. Data-URI extraction is owned locally by this class; the
   * assembled parts are validated by the inherited multipart payload
   * builder, so empty or invalid base64 fails there as a raw
   * `ZodError`.
   * @returns {Promise<LlmContentPart[]>} Promise resolving to the six
   *   ordered user content parts.
   * @throws {BadRequestException} If any data URI is malformed.
   */
  protected async buildUserParts(): Promise<LlmContentPart[]> {
    this.logger.debug(
      'Building image user parts from data URI inputs in the request.',
    );

    const images = this.buildImagesFromDataUris();

    this.logger.log(`Built image user parts with ${images.length} images.`);

    return [
      { kind: 'text', text: 'Reference Task — benchmark for a perfect score.' },
      { kind: 'image', mimeType: images[0].mimeType, data: images[0].data },
      { kind: 'text', text: 'Template — the unfilled task.' },
      { kind: 'image', mimeType: images[1].mimeType, data: images[1].data },
      { kind: 'text', text: 'Student Submission — assess this image.' },
      { kind: 'image', mimeType: images[2].mimeType, data: images[2].data },
    ];
  }

  /**
   * Builds image content from data URIs embedded in the input.
   *
   * Extracts base64-encoded image data from data URI strings in the
   * input fields, in reference, template, student order. This method
   * assumes the validation pipeline has already confirmed all image
   * fields contain valid data URIs; malformed URIs fail loudly here,
   * while base64-level validity is enforced by the payload builder.
   * @returns {{ data: string; mimeType: string }[]} Array of image
   *   data and MIME type objects.
   * @throws {BadRequestException} If any data URI is malformed.
   */
  private buildImagesFromDataUris(): { data: string; mimeType: string }[] {
    const parseDataUri = (uri: string): { data: string; mimeType: string } => {
      const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(uri);
      if (!match) {
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
