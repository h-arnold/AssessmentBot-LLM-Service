import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import * as validator from 'validator';

import { ConfigService } from '../../config/config.service.js';
import { MAX_IMAGE_SIZE_BYTES } from '../image.constants.js';

/**
 * A pipe for validating image uploads, ensuring they meet size and format requirements.
 * This pipe validates base64-encoded image data URIs.
 * @class ImageValidationPipe
 * @implements {PipeTransform}
 * @class
 * @param {ConfigService} configService - Service for accessing configuration values.
 * @function transform
 * Validates the provided image data URI.
 * Throws a `BadRequestException` if the image fails validation.
 * @param {unknown} value - The image data URI to validate.
 * @returns {Promise<unknown>} - The validated image data, or the original value if validation passes.
 *
 * Validation Rules:
 * - Must be a base64 data URI with an allowed MIME type and non-empty payload.
 * - The decoded image must not exceed 1 MiB.
 * - The encoded string length is bounded to mitigate ReDoS risks.
 *
 * Exceptions:
 * - Throws `BadRequestException` for invalid data URIs or base64 strings.
 *
 * Configuration Keys:
 * - `ALLOWED_IMAGE_MIME_TYPES`: List of allowed MIME types for images.
 */
@Injectable()
export class ImageValidationPipe implements PipeTransform {
  private readonly allowedMimeTypes: Set<string>;

  constructor(private readonly configService: ConfigService) {
    this.allowedMimeTypes = new Set(
      this.configService.get('ALLOWED_IMAGE_MIME_TYPES'),
    );
  }

  async transform(value: unknown): Promise<unknown> {
    if (typeof value !== 'string') {
      throw new BadRequestException('Image data must be a valid data URI.');
    }
    this.validateString(value);
    return value;
  }

  private validateString(value: string): void {
    if (value.length > 10 * 1024 * 1024) {
      throw new BadRequestException('Base64 image string is too large.');
    }

    if (!value.startsWith('data:')) {
      throw new BadRequestException('Image data must be a valid data URI.');
    }

    const { mimeType, base64Data } = this.parseImageDataUri(value);
    if (!this.allowedMimeTypes.has(mimeType)) {
      throw new BadRequestException('Invalid image type.');
    }

    this.validateBase64Payload(base64Data);
  }

  private parseImageDataUri(value: string): {
    mimeType: string;
    base64Data: string;
  } {
    if (!value.startsWith('data:image/')) {
      throw new BadRequestException('Invalid base64 image format.');
    }

    const commaIndex = value.indexOf(',');
    if (commaIndex === -1) {
      throw new BadRequestException('Invalid base64 image format.');
    }

    const header = value.slice(5, commaIndex);
    const [mimeType, encoding] = header.split(';', 2);
    if (encoding !== 'base64') {
      throw new BadRequestException('Invalid base64 image format.');
    }

    return {
      mimeType,
      base64Data: value.slice(Math.max(0, commaIndex + 1)),
    };
  }

  private validateBase64Payload(base64Data: string): void {
    if (base64Data.length === 0) {
      throw new BadRequestException('Empty image data is not allowed.');
    }

    if (!validator.default.isBase64(base64Data)) {
      throw new BadRequestException('Invalid base64 string format.');
    }

    const buffer = Buffer.from(base64Data, 'base64');
    this.ensureBufferWithinSize(buffer);
  }

  private ensureBufferWithinSize(value: Buffer): void {
    if (value.length === 0) {
      throw new BadRequestException('Empty image buffer is not allowed.');
    }

    if (value.length > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Image size exceeds the limit of 1 MiB.');
    }
  }
}
