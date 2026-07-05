import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * A custom validation pipe that uses Zod schemas to validate incoming data.
 * This pipe is designed to be used with NestJS and implements the `PipeTransform` interface.
 * @example
 * ```typescript
 * const schema = z.object({
 *   name: z.string(),
 *   age: z.number(),
 * });
 * const validationPipe = new ZodValidationPipe(schema);
 * ```
 * @remarks
 * - If the schema is not provided, the pipe will simply return the input value without validation.
 * - In production mode, validation errors are masked with a generic message for security purposes.
 * - In non-production mode, detailed validation issues are logged and returned.
 * @class
 * @param schema - The Zod schema used for validation.
 * @function transform
 * Validates the input value against the provided Zod schema.
 * If validation fails, it throws a `BadRequestException` with the validation errors.
 * @param value - The value to be validated.
 * @param metadata - Metadata about the argument being processed.
 * @returns The parsed value if validation succeeds.
 * @throws {BadRequestException} If validation fails.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  private readonly logger = new Logger(ZodValidationPipe.name);

  constructor(private schema?: ZodType) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!this.schema) {
      return value;
    }

    const result = this.schema.safeParse(value);

    if (result.success) {
      return result.data;
    }

    const error = result.error;
    const errors =
      process.env.NODE_ENV === 'production'
        ? [{ message: 'Invalid input' }]
        : error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path,
          }));

    this.logger.warn({ errors }, 'Validation failed');

    throw new BadRequestException({
      message: 'Validation failed',
      errors,
    });
  }
}
