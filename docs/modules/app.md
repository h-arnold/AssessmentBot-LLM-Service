# App Module

The App Module (`src/app.module.ts`) is the root module of the Assessment Bot LLM Service application, responsible for orchestrating and wiring together all other modules in the system.

## Overview

The App Module serves as the main entry point that:

- Configures application-wide concerns like logging and rate limiting
- Establishes module dependencies and load order
- Sets up global guards and filters
- Ensures proper initialization sequence

## Module Structure

```typescript
@Module({
  imports: [
    ConfigModule, // First - loads environment variables
    LoggerModule.forRootAsync, // Configures logging with validated config
    AuthModule, // Authentication and security
    AssessorModule, // Core assessment functionality
    StatusModule, // Health checks and system status
    ThrottlerModule.forRoot, // Rate limiting configuration
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // Global rate limiting
  ],
})
export class AppModule {}
```

## Key Features

### 1. Module Initialization Order

The order of module imports is **critical** for proper application startup:

1. **ConfigModule** - Must be first to load and validate environment variables before other modules attempt to use them
2. **LoggerModule** - Configured asynchronously using the validated configuration
3. **Feature Modules** - AuthModule, AssessorModule, StatusModule loaded after core infrastructure
4. **ThrottlerModule** - Rate limiting configured last

### 2. Logging Configuration

The App Module configures `nestjs-pino` for structured logging with:

- **Environment-specific transport**: Pretty-printed logs for development, JSON logs for production/testing
- **Log redaction**: Sensitive request data is automatically redacted via `LogRedactor.redactRequest()`
- **Request correlation**: Each request gets a unique ID for tracing
- **Configurable log levels**: Set via `LOG_LEVEL` environment variable

**Development logging:**

```typescript
// Pretty-printed console output with single-line format
transport: {
  target: 'pino-pretty',
  options: { singleLine: true }
}
```

**Production/Test logging:**

```typescript
// JSON structured logs to file
transport: {
  target: 'pino/file',
  options: { destination: logFile }
}
```

### 3. Global Rate Limiting

The App Module establishes application-wide rate limiting through:

- **ThrottlerModule**: Configured with default limits from `throttler.config.ts`
- **Global ThrottlerGuard**: Automatically protects all endpoints unless explicitly overridden
- **Baseline protection**: Provides defence against abuse that can be fine-tuned per endpoint

**Default rate limits:**

- Unauthenticated routes: Configured via `UNAUTHENTICATED_THROTTLER_LIMIT`
- Authenticated routes: Configured via `AUTHENTICATED_THROTTLER_LIMIT`
- TTL window: Configured via `THROTTLER_TTL`

Controllers can override global settings using the `@Throttle()` decorator.

## Request ID Handling

The module includes a type guard for request ID correlation:

```typescript
function hasReqId(
  req: IncomingMessage,
): req is IncomingMessage & { id: string | number } {
  const maybeReq = req as unknown as { id?: unknown };
  return (
    Object.prototype.hasOwnProperty.call(maybeReq, 'id') &&
    (typeof maybeReq.id === 'string' || typeof maybeReq.id === 'number')
  );
}
```

This ensures safe access to request IDs for logging correlation while maintaining type safety.

## Dependencies

The App Module depends on:

- **@nestjs/common** - Core NestJS functionality
- **@nestjs/core** - Global guards and providers
- **@nestjs/throttler** - Rate limiting functionality
- **nestjs-pino** - Structured logging
- **http** - Node.js HTTP types for request/response handling

## Configuration Requirements

The App Module requires these environment variables (validated by ConfigModule):

- `LOG_LEVEL` - Logging verbosity level
- `THROTTLER_TTL` - Rate limiting time window
- `UNAUTHENTICATED_THROTTLER_LIMIT` - Request limit for unauthenticated users
- `AUTHENTICATED_THROTTLER_LIMIT` - Request limit for authenticated users
- `LOG_FILE` - Optional file path for JSON log output (testing/production)

## Usage

The App Module is automatically loaded by NestJS when the application starts. It should not be imported by other modules - instead, import the specific feature modules you need (AuthModule, AssessorModule, etc.).

## Related Documentation

- [Config Module](config.md) - Environment variable management
- [Authentication Module](auth.md) - API key authentication
- [Assessor Module](assessor.md) - Core assessment functionality
- [Throttler Configuration](../configuration/throttler.md) - Rate limiting details
