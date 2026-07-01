import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { ImageValidationPipe } from './image-validation.pipe';
import { ConfigService } from '../../config/config.service';

describe('ImageValidationPipe', () => {
  let pipe: ImageValidationPipe;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ImageValidationPipe,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(
              (
                key: 'MAX_IMAGE_UPLOAD_SIZE_MB' | 'ALLOWED_IMAGE_MIME_TYPES',
              ): string[] | number => {
                if (key === 'MAX_IMAGE_UPLOAD_SIZE_MB') {
                  return 1; // 1 MB
                }
                if (key === 'ALLOWED_IMAGE_MIME_TYPES') {
                  return ['image/png', 'image/jpeg'];
                }
                return 0;
              },
            ),
          },
        },
      ],
    }).compile();

    pipe = module.get<ImageValidationPipe>(ImageValidationPipe);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  it('should inject ConfigService', () => {
    expect(configService).toBeDefined();
  });

  describe('Valid Inputs', () => {
    it('should allow a valid PNG Buffer within size limit', async () => {
      const validPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      );
      await expect(pipe.transform(validPngBuffer)).resolves.toEqual(
        validPngBuffer,
      );
    });

    it('should allow a valid JPEG Buffer within size limit', async () => {
      const validJpgBuffer = Buffer.from(
        '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ACoAB//Z',
        'base64',
      );
      await expect(pipe.transform(validJpgBuffer)).resolves.toEqual(
        validJpgBuffer,
      );
    });

    it('should allow a valid base64 PNG string within size limit', async () => {
      const validBase64Png =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
      await expect(pipe.transform(validBase64Png)).resolves.toEqual(
        validBase64Png,
      );
    });

    it('should allow a valid base64 JPEG string within size limit', async () => {
      const validBase64Jpg =
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ACoAB//Z';
      await expect(pipe.transform(validBase64Jpg)).resolves.toEqual(
        validBase64Jpg,
      );
    });

    it('should allow non-image string inputs', async () => {
      const text = 'this is not an image';
      await expect(pipe.transform(text)).resolves.toEqual(text);
    });

    it('should allow non-Buffer/non-string inputs to pass through', async () => {
      const object = { a: 1 };
      await expect(pipe.transform(object)).resolves.toEqual(object);
    });
  });

  describe('Invalid Inputs', () => {
    it('should reject a Buffer exceeding MAX_IMAGE_UPLOAD_SIZE_MB', async () => {
      const largeBuffer = Buffer.alloc(2 * 1024 * 1024); // 2MB
      await expect(pipe.transform(largeBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject a base64 string exceeding MAX_IMAGE_UPLOAD_SIZE_MB', async () => {
      const largeBase64 = `data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024).toString('base64')}`;
      await expect(pipe.transform(largeBase64)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject a Buffer with a disallowed MIME type', async () => {
      const gifBuffer = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64',
      );
      await expect(pipe.transform(gifBuffer)).rejects.toThrow(
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

    it('should reject an empty Buffer', async () => {
      const emptyBuffer = Buffer.from('');
      await expect(pipe.transform(emptyBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject an empty base64 string', async () => {
      const emptyBase64 = 'data:image/png;base64,';
      await expect(pipe.transform(emptyBase64)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject a Buffer that cannot be identified as an image type', async () => {
      const nonImageBuffer = Buffer.from('this is not an image');
      await expect(pipe.transform(nonImageBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle MAX_IMAGE_UPLOAD_SIZE_MB = 0 (reject all images)', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'MAX_IMAGE_UPLOAD_SIZE_MB') {
          return 0;
        }
        return ['image/png', 'image/jpeg'];
      });
      const validPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      );
      await expect(pipe.transform(validPngBuffer)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle empty ALLOWED_IMAGE_MIME_TYPES (reject all images)', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) => {
        if (key === 'MAX_IMAGE_UPLOAD_SIZE_MB') {
          return 1;
        }
        return [];
      });
      const validPngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'base64',
      );
      await expect(pipe.transform(validPngBuffer)).rejects.toThrow(
        BadRequestException,
      );
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
