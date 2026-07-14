import { BadRequestException, Logger, ArgumentMetadata } from '@nestjs/common';
import * as z from 'zod';

import { ZodValidationPipe } from './zod-validation.pipe.js';

/**
 * Creates a mock ConfigService for testing with a given NODE_ENV value.
 * @param {string} nodeEnvironment - The NODE_ENV value the mock should return.
 * @returns {{ get: (key: string) => (string | undefined) }} A mock ConfigService object.
 */
function createMockConfigService(nodeEnvironment: string): {
  get: (key: string) => string | undefined;
} {
  return {
    get: (key: string) => (key === 'NODE_ENV' ? nodeEnvironment : undefined),
  };
}

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string(),
  });

  let pipe: ZodValidationPipe;

  beforeEach(() => {
    pipe = new ZodValidationPipe(
      schema,
      createMockConfigService(
        'test',
      ) as unknown as import('../config/config.service.js').ConfigService,
    );
  });

  it('should be defined', () => {
    expect(pipe).toBeDefined();
  });

  it('should throw BadRequestException on invalid data', () => {
    const invalidData = { name: 123 };
    expect(() => pipe.transform(invalidData, {} as ArgumentMetadata)).toThrow(
      BadRequestException,
    );
  });

  it('should return transformed data on valid payload', () => {
    const validData = { name: 'test' };
    expect(pipe.transform(validData, {} as ArgumentMetadata)).toEqual(
      validData,
    );
  });

  it('should handle edge cases for empty and null values', () => {
    expect(() => pipe.transform(null, {} as ArgumentMetadata)).toThrow(
      BadRequestException,
    );
    expect(() => pipe.transform(undefined, {} as ArgumentMetadata)).toThrow(
      BadRequestException,
    );
  });

  describe('array validation', () => {
    const arraySchema = z.array(z.string());
    let arrayPipe: ZodValidationPipe;

    beforeEach(() => {
      arrayPipe = new ZodValidationPipe(
        arraySchema,
        createMockConfigService(
          'test',
        ) as unknown as import('../config/config.service.js').ConfigService,
      );
    });

    it('should validate a valid array', () => {
      const validData = ['a', 'b', 'c'];
      expect(arrayPipe.transform(validData, {} as ArgumentMetadata)).toEqual(
        validData,
      );
    });

    it('should throw BadRequestException on an invalid array', () => {
      const invalidData = ['a', 1, 'c'];
      expect(() =>
        arrayPipe.transform(invalidData, {} as ArgumentMetadata),
      ).toThrow(BadRequestException);
    });
  });

  it('should log validation failures', () => {
    const loggerSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const invalidData = { name: 123 };
    expect(() => pipe.transform(invalidData, {} as ArgumentMetadata)).toThrow(
      BadRequestException,
    );
    expect(loggerSpy).toHaveBeenCalled();
  });

  describe('nested validation', () => {
    const addressSchema = z.object({
      street: z.string(),
      city: z.string(),
    });
    const userSchema = z.object({
      id: z.uuid(),
      name: z.string().min(3),
      address: addressSchema,
    });
    const productSchema = z.object({
      productId: z.string(),
      quantity: z.number().min(1),
    });
    const nestedSchema = z.object({
      user: userSchema,
      products: z.array(productSchema),
    });
    let nestedPipe: ZodValidationPipe;

    beforeEach(() => {
      nestedPipe = new ZodValidationPipe(
        nestedSchema,
        createMockConfigService(
          'test',
        ) as unknown as import('../config/config.service.js').ConfigService,
      );
    });

    it('should handle nested validation schemas with valid data', () => {
      const validData = {
        user: {
          id: '6f3f94ef-72c4-4f61-aa76-bb1e7d1f8e22',
          name: 'John Doe',
          address: {
            street: '123 Main St',
            city: 'Anytown',
          },
        },
        products: [
          { productId: 'prod1', quantity: 1 },
          { productId: 'prod2', quantity: 5 },
        ],
      };
      expect(nestedPipe.transform(validData, {} as ArgumentMetadata)).toEqual(
        validData,
      );
    });

    it('should throw BadRequestException for invalid nested data', () => {
      const invalidData = {
        user: {
          id: 'invalid-uuid', // Invalid UUID
          name: 'Jo', // Too short
          address: {
            street: '123 Main St',
            city: 'Anytown',
          },
        },
        products: [
          { productId: 'prod1', quantity: 0 }, // Quantity too low
        ],
      };
      expect(() =>
        nestedPipe.transform(invalidData, {} as ArgumentMetadata),
      ).toThrow(BadRequestException);
    });
  });

  it('should format validation errors consistently', () => {
    const schemaWithMultipleErrors = z.object({
      email: z.email(),
      password: z.string().min(8),
    });
    const pipeWithMultipleErrors = new ZodValidationPipe(
      schemaWithMultipleErrors,
      createMockConfigService(
        'development',
      ) as unknown as import('../config/config.service.js').ConfigService,
    );

    const invalidData = {
      email: 'invalid-email',
      password: 'short',
    };

    let thrownError: unknown;
    try {
      pipeWithMultipleErrors.transform(invalidData, {} as ArgumentMetadata);
    } catch (error) {
      thrownError = error;
    }
    expect(thrownError).toBeInstanceOf(BadRequestException);
    const response = (
      thrownError as BadRequestException
    ).getResponse() as ZodErrorResponse;
    expect(response).toHaveProperty('message', 'Validation failed');
    expect(response).toHaveProperty('errors');
    expect(Array.isArray(response.errors)).toBe(true);
    expect(response.errors).toHaveLength(2);
    expect(response.errors[0]).toHaveProperty(
      'message',
      'Invalid email address',
    );
    expect(response.errors[1]).toHaveProperty(
      'message',
      'Too small: expected string to have >=8 characters',
    );
  });

  it('should sanitise validation error messages in production', () => {
    const sensitiveSchema = z.object({
      apiKey: z.string().refine((value) => value.startsWith('sk-'), {
        message: 'Invalid API Key format',
      }),
    });
    const sensitivePipe = new ZodValidationPipe(
      sensitiveSchema,
      createMockConfigService(
        'production',
      ) as unknown as import('../config/config.service.js').ConfigService,
    );

    let productionError: unknown;
    try {
      sensitivePipe.transform({ apiKey: 'invalid' }, {} as ArgumentMetadata);
    } catch (error) {
      productionError = error;
    }
    expect(productionError).toBeInstanceOf(BadRequestException);
    const response = (
      productionError as BadRequestException
    ).getResponse() as ZodErrorResponse;
    expect(response).toHaveProperty('message', 'Validation failed');
    expect(response).toHaveProperty('errors');
    expect(Array.isArray(response.errors)).toBe(true);
    // In production, specific error messages should be generic or sanitised
    expect(response.errors[0].message).not.toContain('Invalid API Key format');
    expect(response.errors[0].message).toEqual('Invalid input'); // Zod's default for refined errors
  });
});

type ZodErrorResponse = {
  message: string;
  errors: Array<{ path?: unknown[]; message?: string }>;
};
