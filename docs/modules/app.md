# App Module

The App Module (`src/app.module.ts`) is the root module of the Assessment Bot LLM Service application, responsible for orchestrating and wiring together all other modules in the system.

## Overview

The App Module configures application-wide concerns (logging, rate limiting), establishes module dependencies, and sets up global guards and filters.

## Key Features

### 1. Logging Configuration

The App Module configures `nestjs-pino` for structured logging with:

- **Environment-specific transport**: Pretty-printed logs for development (`pino-pretty` with single-line format); JSON structured logs to file for production and testing (`pino/file`).
- **Log redaction**: Sensitive request data is automatically redacted via `LogRedactor.redactRequest()`.
- **Request correlation**: Each request gets a unique ID for tracing.

### 2. Global Rate Limiting

The App Module establishes application-wide rate limiting through `@nestjs/throttler`:

- A global `ThrottlerGuard` protects all endpoints unless explicitly overridden.
- Default limits are configured via `UNAUTHENTICATED_THROTTLER_LIMIT` and `AUTHENTICATED_THROTTLER_LIMIT` environment variables.
- Controllers can override global settings using the `@Throttle()` decorator.

### 3. Module Initialisation Order

`ConfigModule` must be first in the imports array so environment variables are validated before other modules initialise. The remaining modules have no ordering constraint.

## Dependencies

- **@nestjs/common** — Core NestJS functionality
- **@nestjs/core** — Global guards and providers
- **@nestjs/throttler** — Rate limiting functionality
- **nestjs-pino** — Structured logging
- **http** — Node.js HTTP types for request/response handling

## Usage

The App Module is automatically loaded by NestJS at application start. It should not be imported by other modules — instead, import the specific feature modules you need.

## Related Documentation

- [Config Module](config.md) — Environment variable management
- [Authentication Module](auth.md) — API key authentication
- [Assessor Module](assessor.md) — Core assessment functionality
- [Rate Limiting](../api/rate-limiting.md) — Rate limiting configuration
