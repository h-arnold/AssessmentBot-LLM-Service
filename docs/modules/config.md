# Config Module

The Config Module (`src/config/config.module.ts`) provides validation-aware configuration management for the Assessment Bot LLM Service application. It acts as an architectural boundary that ensures all configuration access is validated and type-safe.

## Overview

The Config Module serves as a wrapper around NestJS's built-in `ConfigModule`, providing:

- **Validated configuration**: All environment variables validated against Zod schemas
- **Type safety**: Strongly typed configuration access throughout the application
- **Centralised access**: Single point of configuration management
- **Environment isolation**: Automatic switching between `.env` and `.test.env` files

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

The Config Module implements a **boundary pattern** that:

- Imports the underlying `NestConfigModule` but **only exports** the custom `ConfigService`
- Prevents direct access to `process.env` or standard `NestConfigModule` elsewhere
- Enforces consistent, validated configuration access across the application
- Maintains testability through centralised configuration management

### Why Not Use @nestjs/config Directly?

The custom Config Module provides several advantages over direct usage:

1. **Validation at Startup**: Configuration is validated when the service is instantiated, causing the application to fail fast on invalid config.
2. **Type Safety**: All configuration keys are strongly typed through Zod inference.
3. **Centralisation**: Prevents configuration sprawl throughout the codebase.
4. **Testability**: Makes mocking configuration significantly easier.
5. **Compile-Time Configuration**: Some NestJS features, like the `@Throttle()` decorator for rate-limiting, are evaluated at compile time and cannot use a runtime service like `ConfigService`. By having a separate configuration system that uses a shared Zod schema (`env.schema.ts`), we can safely parse `process.env` directly for these compile-time needs (see `throttler.config.ts`) while ensuring validation rules are consistent with the rest of the application.

## ConfigService

The `ConfigService` is the single source of truth for runtime environment configuration.

### Key Features

- **Environment file loading**: Automatically selects `.env` or `.test.env` based on `NODE_ENV`
- **Schema validation**: Uses centralised `configSchema` from `env.schema.ts`
- **Fail-fast startup**: Application won't start with invalid configuration
- **Type-safe access**: All configuration values are properly typed

### Core Methods

#### `get<T>(key: T): Config[T]`

Retrieves a configuration value by its key with full type safety:

```typescript
// Strongly typed - TypeScript knows this returns a string
const apiKey = configService.get('GEMINI_API_KEY');

// Strongly typed - TypeScript knows this returns a number
const port = configService.get('PORT');

// Strongly typed - TypeScript knows this returns string[] | undefined
const apiKeys = configService.get('API_KEYS');
```

#### `getGlobalPayloadLimit(): string`

Calculates the global payload limit for `body-parser` middleware based on the maximum image upload size:

```typescript
// Formula: ((MAX_IMAGE_UPLOAD_SIZE_MB * 1.33 * 3) + 1) MB
const limit = configService.getGlobalPayloadLimit(); // e.g., "9mb"
```

The formula accounts for:

- **Base64 encoding overhead** (1.33x multiplier)
- **Multiple images** (3x multiplier for typical use cases)
- **Buffer room** (+1MB for other request data)

## Environment Schema

Configuration is validated against the `configSchema` defined in `src/config/env.schema.ts`:

```typescript
export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_NAME: z.string().default('Assessment Bot LLM Service'),
  APP_VERSION: z.string().optional(),
  API_KEYS: z.string().optional().transform(/* comma-separated to array */),
  MAX_IMAGE_UPLOAD_SIZE_MB: z.coerce.number().int().min(0).default(1),
  ALLOWED_IMAGE_MIME_TYPES: z
    .string()
    .default('image/png')
    .transform(/* to array */),
  GEMINI_API_KEY: z.string().min(1),
  LOG_LEVEL: z
    .enum(['info', 'error', 'warn', 'debug', 'verbose', 'fatal'])
    .default('info'),
  THROTTLER_TTL: z.coerce.number().int().min(0).default(10000),
  UNAUTHENTICATED_THROTTLER_LIMIT: z.coerce.number().int().min(0).default(10),
  AUTHENTICATED_THROTTLER_LIMIT: z.coerce.number().int().min(0).default(90),
  LLM_BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(1000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(3),
});
```

### Key Configuration Categories

#### Application Settings

- `NODE_ENV`: Environment mode (development/production/test)
- `PORT`: Server port (default: 3000)
- `APP_NAME`: Application identifier (default: 'Assessment Bot LLM Service')
- `APP_VERSION`: Optional version string

#### Authentication & Security

- `API_KEYS`: Comma-separated list of valid API keys
- `GEMINI_API_KEY`: Google Gemini API key (required)

#### File Upload Limits

- `MAX_IMAGE_UPLOAD_SIZE_MB`: Maximum image size in MB (default: 1)
- `ALLOWED_IMAGE_MIME_TYPES`: Comma-separated MIME types (default: 'image/png')

#### Rate Limiting

- `THROTTLER_TTL`: Rate limit window in milliseconds (default: 10000)
- `UNAUTHENTICATED_THROTTLER_LIMIT`: Requests per window for unauthenticated users (default: 10)
- `AUTHENTICATED_THROTTLER_LIMIT`: Requests per window for authenticated users (default: 90)

#### LLM Configuration

- `LLM_BACKOFF_BASE_MS`: Base backoff time for retries (default: 1000ms)
- `LLM_MAX_RETRIES`: Maximum retry attempts (default: 3)

#### Logging

- `LOG_LEVEL`: Logging verbosity level (default: 'info')

## Environment File Loading

The ConfigService automatically loads environment variables with the following precedence:

1. **Process environment variables** (highest priority)
2. **Environment file variables** (.env or .test.env based on NODE_ENV)

### File Selection Logic

```typescript
const envFileName = process.env.NODE_ENV === 'test' ? '.test.env' : '.env';
```

This ensures:

- **Development/Production**: Uses `.env` file
- **Testing**: Uses `.test.env` file for test-specific configuration

## Usage Examples

### Injecting ConfigService

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

@Injectable()
export class MyService {
  constructor(private readonly configService: ConfigService) {}

  doSomething() {
    const apiKey = this.configService.get('GEMINI_API_KEY');
    const port = this.configService.get('PORT');
    const logLevel = this.configService.get('LOG_LEVEL');
  }
}
```

### Module Import

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { MyService } from './my.service';

@Module({
  imports: [ConfigModule],
  providers: [MyService],
})
export class MyModule {}
```

## Error Handling

The ConfigService provides clear error messages for configuration issues:

```typescript
// If GEMINI_API_KEY is missing or empty
throw new Error(`Invalid environment configuration: [
  {
    "code": "too_small",
    "minimum": 1,
    "type": "string",
    "inclusive": true,
    "exact": false,
    "message": "String must contain at least 1 character(s)",
    "path": ["GEMINI_API_KEY"]
  }
]`);
```

## Testing

The Config Module supports test-specific configuration:

1. **Create `.test.env`** with test-specific values
2. **Set `NODE_ENV=test`** - ConfigService automatically loads `.test.env`
3. **Mock ConfigService** in unit tests as needed

## Dependencies

- **@nestjs/common** - Injectable decorator and module system
- **@nestjs/config** - Underlying configuration module (wrapped, not directly used)
- **dotenv** - Environment file parsing
- **zod** - Schema validation and type inference

## Related Documentation

- [App Module](app.md) - How Config Module is imported and used
- [Environment Configuration](../configuration/environment.md) - Complete environment setup guide
- [LLM Configuration](../configuration/llm.md) - LLM-specific configuration details
