# App Module

The App Module (`src/app.module.ts`) is the root module of the Assessment Bot LLM Service application, responsible for orchestrating and wiring together all other modules in the system.

## Overview

The App Module configures application-wide concerns (logging, rate limiting), establishes module dependencies, and sets up global guards and filters.

## Key Features

### 1. Logging Configuration

The App Module configures `nestjs-pino` (`src/app.module.ts`) for structured logging with:

- **Environment-specific transport**: Development uses `pino-pretty` for single-line console output; production uses the default JSON logger with no transport; E2E runs set `LOG_FILE` to write JSON logs to a file through `pino/file`.
- **Log redaction**: Sensitive request data is automatically redacted via `LogRedactor.redactRequest()`.
- **Request correlation**: Each request gets a unique ID for tracing.

### 2. Global Rate Limiting

The App Module registers `ApiKeyThrottlerGuard` as a global `APP_GUARD` and configures `@nestjs/throttler` with the unauthenticated default. `AssessorController` overrides that default with `@Throttle(authenticatedThrottler)` for authenticated requests, which allows a higher limit. See [Guards](guards.md) for tracking behaviour and [Rate Limiting](../api/rate-limiting.md) for the configured limits.

### 3. Module Initialisation Order

`ConfigModule` must be first in the imports array so environment variables are validated before other modules initialise. The remaining modules have no ordering constraint.

## Usage

The App Module is automatically loaded by NestJS at application start. It should not be imported by other modules — instead, import the specific feature modules you need.

## Related Documentation

- [Config Module](config.md) — Environment variable management
- [Authentication Module](auth.md) — API key authentication
- [Assessor Module](assessor.md) — Core assessment functionality
- [Rate Limiting](../api/rate-limiting.md) — Rate limiting configuration
