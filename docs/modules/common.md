# Common Module

The Common Module (`src/common/common.module.ts`) provides shared, injectable services and globally applied filters used across the application.

## Overview

The module provides three cross-cutting concerns:

- **Global error handling:** Registers `HttpExceptionFilter` as a global `APP_FILTER` for standardised error responses
- **JSON processing:** The injectable `JsonParserUtil` service for robust JSON parsing and repair
- **Logger:** Exports the NestJS `Logger` for dependency injection

## Module Registration

```typescript
@Module({
  imports: [LoggerModule],
  providers: [
    Logger,
    JsonParserUtil,
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
  exports: [Logger, JsonParserUtil],
})
export class CommonModule {}
```

## Standalone Utilities (not provided by CommonModule)

The following components live in `src/common/` but are **not** registered in `CommonModule` — they are imported directly where needed:

- **Validation pipes:** `ZodValidationPipe`, `ImageValidationPipe` (`src/common/`)
- **File utilities:** `getCurrentDirname()`, `readMarkdown()` (`src/common/file-utils.ts`)
- **LogRedactor:** (`src/common/utils/log-redactor.util.ts`)
- **Type guards:** `isSystemUserMessage()` (`src/common/utils/type-guards.ts`)

## Related Documentation

- [Exception Filters](filters.md)
- [Validation Pipes](pipes.md)
- [Utilities](utilities.md)
