import { z } from 'zod';

import { resolveProvider, type ProviderId } from '../llm/model-registry.js';

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
 * The default prefix for API keys.
 * @remarks This value is reused by the generator CLI and as the schema default for API_KEY_PREFIX.
 */
export const DEFAULT_API_KEY_PREFIX = 'abt_';

/**
 * The Zod schema for validating and transforming all environment variables for the application.
 * @property {string} NODE_ENV - The application environment (e.g., 'development', 'production', 'test').
 * @property {number} PORT - The port on which the server will run.
 * @property {string} APP_NAME - The name of the application.
 * @property {string} [APP_VERSION] - The optional version of the application.
 * @property {string} API_KEY_PREFIX - The prefix required for all API keys (default: 'abt_').
 * @property {string[]} [API_KEYS] - A comma-separated list of API keys, transformed into an array.
 * @property {number} MAX_IMAGE_UPLOAD_SIZE_MB - The maximum size for image uploads in megabytes.
 * @property {string[]} ALLOWED_IMAGE_MIME_TYPES - A comma-separated list of allowed image MIME types, transformed into an array.
 * @property {string} [GEMINI_API_KEY] - The API key for the Google Gemini service. Required only when a configured model (`DEFAULT_TEXT_TABLE_MODEL` / `DEFAULT_IMAGE_MODEL`) routes to the Gemini provider.
 * @property {string} [MISTRAL_API_KEY] - The API key for the Mistral AI service. Required only when a configured model (`DEFAULT_TEXT_TABLE_MODEL` / `DEFAULT_IMAGE_MODEL`) routes to the Mistral provider.
 * @property {string} DEFAULT_TEXT_TABLE_MODEL - The model used for text/table assessment tasks (default: 'mistral-small-latest').
 * @property {string} DEFAULT_IMAGE_MODEL - The model used for image assessment tasks (default: 'mistral-small-latest').
 * @property {string} TEXT_REASONING_EFFORT - The abstract reasoning effort for text/table tasks; one of 'off', 'low', 'high', 'max' (default: 'low').
 * @property {string} IMAGE_REASONING_EFFORT - The abstract reasoning effort for image tasks; one of 'off', 'low', 'high', 'max' (default: 'high').
 * @property {boolean} LOG_LLM_CONTENT - When true, raw LLM prompt and response content (which may contain student-derived data) is included in debug logs. Defaults to false to avoid persisting personal data in default deployments.
 * @property {string} LOG_LEVEL - The logging level for the application.
 * @property {number} THROTTLER_TTL - The time-to-live (in milliseconds) for rate-limiting windows.
 * @property {number} UNAUTHENTICATED_THROTTLER_LIMIT - The maximum number of requests for unauthenticated routes within the TTL window.
 * @property {number} AUTHENTICATED_THROTTLER_LIMIT - The maximum number of requests for authenticated routes within the TTL window.
 * @property {number} LLM_BACKOFF_BASE_MS - The base backoff time in milliseconds for LLM rate limit retries.
 * @property {number} LLM_MAX_RETRIES - The maximum number of retry attempts for LLM rate limit errors.
 * @property {string} [LOG_FILE] - The optional path to a log file for E2E testing.
 */
export const configObjectSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_NAME: z.string().default('Assessment Bot LLM Service'),
  APP_VERSION: z.string().optional(),
  API_KEY_PREFIX: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default(DEFAULT_API_KEY_PREFIX),
  API_KEYS: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value.split(',').map((s) => s.trim()),
    ),
  MAX_IMAGE_UPLOAD_SIZE_MB: z.coerce.number().int().min(0).default(1),
  ALLOWED_IMAGE_MIME_TYPES: z
    .string()
    .default('image/png')
    .transform((value) => value.split(',').map((s) => s.trim())),
  GEMINI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  DEFAULT_TEXT_TABLE_MODEL: z.string().default('mistral-small-latest'),
  DEFAULT_IMAGE_MODEL: z.string().default('mistral-small-latest'),
  TEXT_REASONING_EFFORT: z.enum(['off', 'low', 'high', 'max']).default('low'),
  IMAGE_REASONING_EFFORT: z.enum(['off', 'low', 'high', 'max']).default('high'),
  LOG_LLM_CONTENT: z
    .preprocess(
      (value) =>
        typeof value === 'string'
          ? value.trim().toLowerCase() === 'true' || value.trim() === '1'
          : Boolean(value),
      z.boolean(),
    )
    .default(false),
  LOG_LEVEL: z
    .enum(['info', 'error', 'warn', 'debug', 'verbose', 'fatal'])
    .default('info'),
  THROTTLER_TTL: z.coerce.number().int().min(0).default(10000),
  UNAUTHENTICATED_THROTTLER_LIMIT: z.coerce.number().int().min(0).default(10),
  AUTHENTICATED_THROTTLER_LIMIT: z.coerce.number().int().min(0).default(90), // A full 3 activities from a full class of submissions at once.
  LLM_BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(1000), // Minimum 100ms, default 1 second
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(3), // Default 3 retries
  LOG_FILE: z.string().optional(),
});
/**
 * Resolves the provider for a configured model name, returning `undefined`
 * when the name matches no registered prefix.
 *
 * Unrecognised model names are deliberately skipped here rather than reported:
 * the `RoutingLLMService` constructor fail-fasts at startup with a clearer
 * aggregated error listing every bad name and the supported prefixes, so the
 * schema does not duplicate that validation.
 * @param modelName - The configured model name to resolve.
 * @returns The provider identifier, or `undefined` when unrecognised.
 */
function tryResolveProvider(modelName: string): ProviderId | undefined {
  try {
    return resolveProvider(modelName);
  } catch {
    return undefined;
  }
}

/**
 * Validates the API key format entries (prefix + 32-char base64url body).
 * A no-op when `API_KEYS` is undefined so the compile-time
 * `throttler.config.ts` parse of bare `process.env` stays valid. Only a
 * present-but-malformed `API_KEYS` is a hard error (fail-fast per SPEC
 * decision #8).
 * @param data - The parsed configuration object.
 * @param context - The Zod refinement context for reporting issues.
 */
function validateApiKeyFormat(
  data: z.infer<typeof configObjectSchema>,
  context: z.RefinementCtx,
): void {
  if (data.API_KEYS === undefined) return;

  for (const entry of data.API_KEYS) {
    if (!entry.startsWith(data.API_KEY_PREFIX)) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid API key format',
        path: ['API_KEYS'],
      });
      return;
    }

    const body = entry.slice(data.API_KEY_PREFIX.length);
    if (!z.base64url().length(32).safeParse(body).success) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid API key format',
        path: ['API_KEYS'],
      });
      return;
    }
  }
}

/**
 * Enforces the conditional provider-key rule: a provider's API key is
 * required only when a configured model (`DEFAULT_TEXT_TABLE_MODEL` or
 * `DEFAULT_IMAGE_MODEL`) routes to that provider. A Gemini-only deployment
 * may omit `MISTRAL_API_KEY` entirely, and vice versa.
 * @param data - The parsed configuration object (defaults already applied).
 * @param context - The Zod refinement context for reporting issues.
 */
function validateProviderKeys(
  data: z.infer<typeof configObjectSchema>,
  context: z.RefinementCtx,
): void {
  const requiredProviders = new Set<ProviderId>();
  const textProvider = tryResolveProvider(data.DEFAULT_TEXT_TABLE_MODEL);
  if (textProvider !== undefined) requiredProviders.add(textProvider);
  const imageProvider = tryResolveProvider(data.DEFAULT_IMAGE_MODEL);
  if (imageProvider !== undefined) requiredProviders.add(imageProvider);

  if (requiredProviders.has('gemini') && !data.GEMINI_API_KEY?.trim()) {
    context.addIssue({
      code: 'custom',
      message:
        'GEMINI_API_KEY must be set (non-empty) because a configured model routes to the Gemini provider',
      path: ['GEMINI_API_KEY'],
    });
  }

  if (requiredProviders.has('mistral') && !data.MISTRAL_API_KEY?.trim()) {
    context.addIssue({
      code: 'custom',
      message:
        'MISTRAL_API_KEY must be set (non-empty) because a configured model routes to the Mistral provider',
      path: ['MISTRAL_API_KEY'],
    });
  }
}

export const configSchema = configObjectSchema.superRefine((data, context) => {
  validateApiKeyFormat(data, context);
  validateProviderKeys(data, context);
});

/**
 * Represents the inferred TypeScript type from the `configSchema`.
 * This provides static type checking for all configuration values throughout the application.
 */
export type Config = z.infer<typeof configSchema>;
