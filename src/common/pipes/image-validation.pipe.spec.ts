import { BadRequestException } from '@nestjs/common';
import { Mock } from 'vitest';

import { ImageValidationPipe } from './image-validation.pipe.js';
import { ConfigService } from '../../config/config.service.js';

interface PipeLike {
  transform: (value: unknown) => Promise<unknown>;
}

describe('ImageValidationPipe', () => {
  let pipe: PipeLike;
  let configService: { get: Mock };

  beforeEach(async () => {
    configService = {
      get: vi.fn((key: string): unknown => {
        return key === 'ALLOWED_IMAGE_MIME_TYPES'
          ? (['image/png', 'image/jpeg'] as unknown)
          : undefined;
      }),
    };

    pipe = new ImageValidationPipe(configService as unknown as ConfigService);
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  it('should inject ConfigService', () => {
    expect(configService).toBeDefined();
  });

  describe('Valid Inputs', () => {
    it('should reject an actual PNG Buffer', async () => {
      const validPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      );
      await expect(pipe.transform(validPngBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject an actual JPEG Buffer', async () => {
      const validJpgBuffer = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEBAxEDEQA/ACoAB//Z',
        'base64',
      );
      await expect(pipe.transform(validJpgBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow a valid base64 PNG string within size limit', async () => {
      const validBase64Png =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      const result = await pipe.transform(validBase64Png);
      expect(result).toEqual(validBase64Png);
    });

    it('should allow a valid base64 JPEG string within size limit', async () => {
      const validBase64Jpg =
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ACoAB//Z';
      const result = await pipe.transform(validBase64Jpg);
      expect(result).toEqual(validBase64Jpg);
    });

    it('should reject a non-data-URI string with a clear message', async () => {
      const text = 'this is not an image';
      await expect(pipe.transform(text)).rejects.toThrow(
        'Image data must be a valid data URI.',
      );
    });

    it('should reject a non-data-URI string as BadRequestException', async () => {
      const text = 'plain-string-without-data-prefix';
      await expect(pipe.transform(text)).rejects.toThrow(BadRequestException);
    });

    it('should reject non-string inputs', async () => {
      const object = { a: 1 };
      await expect(pipe.transform(object)).rejects.toThrow(BadRequestException);
    });
  });

  describe('Invalid Inputs', () => {
    it('should reject a base64 string exceeding the 1 MiB image limit', async () => {
      const largeBytes = new Uint8Array(1024 * 1024 + 1);
      const largeBase64 = `data:image/png;base64,${Buffer.from(largeBytes).toString('base64')}`;
      await expect(pipe.transform(largeBase64)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject a base64 string with a disallowed MIME type', async () => {
      const gifBase64 =
        'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      await expect(pipe.transform(gifBase64)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject an invalid base64 string format', async () => {
      const invalidBase64 = 'data:image/png;base64,not-a-base64-string';
      await expect(pipe.transform(invalidBase64)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject an empty base64 string', async () => {
      const emptyBase64 = 'data:image/png;base64,';
      await expect(pipe.transform(emptyBase64)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty ALLOWED_IMAGE_MIME_TYPES (reject all images)', async () => {
      const emptyMimeConfig = {
        get: vi.fn((key: string): unknown =>
          key === 'ALLOWED_IMAGE_MIME_TYPES' ? [] : undefined,
        ),
      };
      const emptyMimePipe = new ImageValidationPipe(
        emptyMimeConfig as unknown as ConfigService,
      );
      await expect(
        emptyMimePipe.transform('data:image/png;base64,aGVsbG8='),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Security Edge Cases', () => {
    it('should reject a base64 image string longer than 10MB', async () => {
      const hugeBase64 =
        'data:image/png;base64,' + 'A'.repeat(10 * 1024 * 1024 + 1);
      await expect(pipe.transform(hugeBase64)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject crafted input that could cause ReDoS in the old regex', async () => {
      // This input would have caused catastrophic backtracking in the old regex
      const malicious = 'data:a;base64,' + 'a;base64,'.repeat(10000);
      await expect(pipe.transform(malicious)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
