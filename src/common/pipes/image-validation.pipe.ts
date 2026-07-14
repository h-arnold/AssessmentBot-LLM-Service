import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { detectBufferMime } from 'mime-detect';
import validator from 'validator';

import { ConfigService } from '../../config/config.service.js';

/**
 * A pipe for validating image uploads, ensuring they meet size and format requirements.
 * This pipe supports both binary image buffers and base64-encoded image strings.
 * @class ImageValidationPipe
 * @implements {PipeTransform}
 * @class
 * @param {ConfigService} configService - Service for accessing configuration values.
 * @function transform
 * Validates the provided image data based on its type (Buffer or base64 string).
 * Throws a `BadRequestException` if the image fails validation.
 * @param {unknown} value - The image data to validate. Can be a Buffer or a base64 string.
 * @returns {Promise<unknown>} - The validated image data, or the original value if validation passes.
 *
 * Validation Rules:
 * - For Buffers:
 *   - Must not be empty.
 *   - Must not exceed the maximum file size defined in configuration.
 *   - Must have a MIME type included in the allowed list.
 * - For base64 strings:
 *   - Must not exceed a length limit to mitigate ReDoS risks.
 *   - Must start with a valid Data URI prefix (`data:image/`).
 *   - Must be base64-encoded.
 *   - Must have a MIME type included in the allowed list.
 *   - Must decode to a non-empty Buffer.
 *   - Must not exceed the maximum file size defined in configuration.
 *
 * Exceptions:
 * - Throws `BadRequestException` for invalid image buffers or base64 strings.
 *
 * Configuration Keys:
 * - `MAX_IMAGE_UPLOAD_SIZE_MB`: Maximum allowed image size in megabytes.
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
    const maxFileSize =
      this.configService.get('MAX_IMAGE_UPLOAD_SIZE_MB') * 1024 * 1024;

    if (Buffer.isBuffer(value)) {
      await this.validateBuffer(value, maxFileSize);
    } else if (typeof value === 'string') {
      this.validateString(value, maxFileSize);
    }

    return value;
  }

  private async validateBuffer(
    value: Buffer,
    maxFileSize: number,
  ): Promise<void> {
    this.ensureBufferWithinSize(value, maxFileSize);

    const fileType = await detectBufferMime(value);
    if (!fileType || !this.allowedMimeTypes.has(fileType)) {
      throw new BadRequestException('Invalid image type.');
    }
  }

  private validateString(value: string, maxFileSize: number): void {
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

    this.validateBase64Payload(base64Data, maxFileSize);
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
    const [mimeType, encoding] = header.split(';');
    if (encoding !== 'base64') {
      throw new BadRequestException('Invalid base64 image format.');
    }

    return {
      mimeType,
      base64Data: value.slice(Math.max(0, commaIndex + 1)),
    };
  }

  private validateBase64Payload(base64Data: string, maxFileSize: number): void {
    if (base64Data.length === 0) {
      throw new BadRequestException('Empty image data is not allowed.');
    }

    if (!validator.isBase64(base64Data)) {
      throw new BadRequestException('Invalid base64 string format.');
    }

    const buffer = Buffer.from(base64Data, 'base64');
    this.ensureBufferWithinSize(buffer, maxFileSize);
  }

  private ensureBufferWithinSize(value: Buffer, maxFileSize: number): void {
    if (value.length === 0) {
      throw new BadRequestException('Empty image buffer is not allowed.');
    }

    if (value.length > maxFileSize) {
      throw new BadRequestException(
        `Image size exceeds the limit of ${this.configService.get('MAX_IMAGE_UPLOAD_SIZE_MB')}MB.`,
      );
    }
  }
}
