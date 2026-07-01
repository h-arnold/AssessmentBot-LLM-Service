import { ThrottlerModuleOptions } from '@nestjs/throttler';

import { configSchema } from './environment.schema';

/**
 * @file Configures the application's rate-limiting (throttling) settings.
 *
 * @remarks
 * This file provides the configuration for the `@nestjs/throttler` module.
 * A key architectural decision here is to parse environment variables directly at compile time.
 *
 * **Architectural Reasoning:**
 * NestJS decorators, such as `@Throttle()`, are executed when the application code is compiled, not when it runs.
 * This means they cannot access runtime-injected providers like `ConfigService` to get configuration values.
 *
 * To solve this, we import the shared `configSchema` and use it to parse `process.env` directly in this file.
 * This ensures that our rate-limiting values are validated with the same rules as the rest of the application's
 * configuration, but are available at compile time for the decorators to use.
 *
 * This approach allows for a clean, declarative, and type-safe way to manage rate-limiting on a per-route basis
 * while keeping the validation logic centralised in `environment.schema.ts`.
 */

// 1. Validate environment variables at compile time using the shared Zod schema.
const validatedEnvironment = configSchema.parse(process.env);

// 2. Extract the validated throttler values into constants.
const throttlerTtl = validatedEnvironment.THROTTLER_TTL;
const unauthenticatedLimit = validatedEnvironment.UNAUTHENTICATED_THROTTLER_LIMIT;
const authenticatedLimit = validatedEnvironment.AUTHENTICATED_THROTTLER_LIMIT;

/**
 * The global throttler configuration for the application.
 * This is imported by `AppModule` and applies to all routes by default.
 * It defines a baseline, less restrictive limit for unauthenticated traffic.
 */
export const throttlerConfig: ThrottlerModuleOptions = [
  {
    ttl: throttlerTtl,
    limit: unauthenticatedLimit,
  },
];

/**
 * A specific throttler configuration for authenticated routes.
 * This object is imported into controllers and used with the `@Throttle()` decorator
 * to override the global default and apply stricter limits.
 * The `default` key is used to target the default throttler guard.
 */
export const authenticatedThrottler = {
  default: {
    ttl: throttlerTtl,
    limit: authenticatedLimit,
  },
};
