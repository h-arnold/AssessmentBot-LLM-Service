import { z } from 'zod';

/**
 * @file Defines the Zod schema for environment variables, serving as the single source of truth for configuration validation.
 * @remarks
 * This schema is crucial for ensuring that the application starts with a valid and type-safe configuration.
 * It is used in two key places:
 * 1.  `ConfigService`: At runtime, this schema validates the combined environment variables from `process.env`
 *     and `.env` files, providing a robust, injectable configuration service to the rest of the application.
 * 2.  `throttler.config.ts`: At compile time, this schema validates `process.env` directly. This is necessary
 *     because NestJS decorators (like `@Throttle`) are evaluated when the application is compiled, and they cannot
 *     access runtime services. By using the same schema, we ensure consistent validation rules for all configuration,
 *     whether it's consumed at runtime or compile time.
 *
 * This approach centralises validation logic, prevents configuration drift, and adheres to the DRY principle.
 */

/**
 * The Zod schema for validating and transforming all environment variables for the application.
 * @property {string} NODE_ENV - The application environment (e.g., 'development', 'production', 'test').
 * @property {number} PORT - The port on which the server will run.
 * @property {string} APP_NAME - The name of the application.
 * @property {string} [APP_VERSION] - The optional version of the application.
 * @property {string[]} [API_KEYS] - A comma-separated list of API keys, transformed into an array.
 * @property {number} MAX_IMAGE_UPLOAD_SIZE_MB - The maximum size for image uploads in megabytes.
 * @property {string[]} ALLOWED_IMAGE_MIME_TYPES - A comma-separated list of allowed image MIME types, transformed into an array.
 * @property {string} GEMINI_API_KEY - The API key for the Google Gemini service.
 * @property {string} LOG_LEVEL - The logging level for the application.
 * @property {number} THROTTLER_TTL - The time-to-live (in milliseconds) for rate-limiting windows.
 * @property {number} UNAUTHENTICATED_THROTTLER_LIMIT - The maximum number of requests for unauthenticated routes within the TTL window.
 * @property {number} AUTHENTICATED_THROTTLER_LIMIT - The maximum number of requests for authenticated routes within the TTL window.
 * @property {number} LLM_BACKOFF_BASE_MS - The base backoff time in milliseconds for LLM rate limit retries.
 * @property {number} LLM_MAX_RETRIES - The maximum number of retry attempts for LLM rate limit errors.
 */
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_NAME: z.string().default('Assessment Bot LLM Service'),
  APP_VERSION: z.string().optional(),
  API_KEYS: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value.split(',').map((s) => s.trim()),
    )
    .refine(
      (array) =>
        array === undefined || array.every((s) => /^[a-zA-Z0-9_-]+$/.test(s)),
      { message: 'Invalid API key format' },
    ),
  MAX_IMAGE_UPLOAD_SIZE_MB: z.coerce.number().int().min(0).default(1),
  ALLOWED_IMAGE_MIME_TYPES: z
    .string()
    .default('image/png')
    .transform((value) => value.split(',').map((s) => s.trim())),
  GEMINI_API_KEY: z.string().min(1),
  LOG_LEVEL: z
    .enum(['info', 'error', 'warn', 'debug', 'verbose', 'fatal'])
    .default('info'),
  THROTTLER_TTL: z.coerce.number().int().min(0).default(10000),
  UNAUTHENTICATED_THROTTLER_LIMIT: z.coerce.number().int().min(0).default(10),
  AUTHENTICATED_THROTTLER_LIMIT: z.coerce.number().int().min(0).default(90), // A full 3 activities from a full class of submissions at once.
  LLM_BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(1000), // Minimum 100ms, default 1 second
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(3), // Default 3 retries
});

/**
 * Represents the inferred TypeScript type from the `configSchema`.
 * This provides static type checking for all configuration values throughout the application.
 */
export type Config = z.infer<typeof configSchema>;
