# Config Module

The Config Module (`src/config/config.module.ts`) provides validation-aware configuration management. It acts as an architectural boundary that ensures all configuration access is validated and type-safe.

## Overview

The Config Module wraps NestJS's built-in `ConfigModule`, providing:

- **Validated configuration**: All environment variables validated against a shared Zod schema (`env.schema.ts`)
- **Type safety**: Strongly typed configuration access via `ConfigService`
- **Centralised access**: Single point of configuration management
- **Environment isolation**: Automatic switching between `.env` and `.test.env` based on `NODE_ENV`

## Module Structure

```typescript
@Module({
  imports: [
    NestConfigModule.forRoot({
      envFilePath: '.env',
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
```

## Architectural Design

### Boundary Pattern

The Config Module imports the underlying `NestConfigModule` but **only exports** the custom `ConfigService`, preventing direct access to `process.env` or the standard `NestConfigModule` elsewhere. This enforces consistent, validated configuration access across the application.

### Compile-Time Configuration Gotcha

Some NestJS features (e.g. the `@Throttle()` decorator) are evaluated at **compile time** and cannot use a runtime service like `ConfigService`. Therefore a separate configuration system (`throttler.config.ts`) parses `process.env` directly against the shared Zod schema (`env.schema.ts`), ensuring validation rules remain consistent while satisfying compile-time constraints.

## ConfigService

The `ConfigService` is the single source of truth for runtime environment configuration.

### Core Methods

#### `get<T>(key: T): Config[T]`

Retrieves a typed configuration value by its key:

```typescript
const apiKey = configService.get('GEMINI_API_KEY'); // string
const port = configService.get('PORT'); // number
const apiKeys = configService.get('API_KEYS'); // string[] | undefined
```

#### `getGlobalPayloadLimit(): string`

Calculates the global payload limit for `body-parser` middleware based on the maximum image upload size:

```typescript
// Formula: ((MAX_IMAGE_UPLOAD_SIZE_MB * 1.33 * 3) + 1) MB
const limit = configService.getGlobalPayloadLimit(); // e.g., "9mb"
```

The formula accounts for Base64 encoding overhead (1.33×), multiple images (3×), and a buffer room (+1 MB).

## Dependencies

- **@nestjs/common** — Injectable decorator and module system
- **@nestjs/config** — Underlying configuration module (wrapped, not directly used)
- **dotenv** — Environment file parsing
- **zod** — Schema validation and type inference

## Related Documentation

- [App Module](app.md) — How Config Module is imported and used
- [Environment Configuration](../configuration/environment.md) — Complete environment setup guide
- [LLM Module](llm.md) — LLM-specific configuration details
