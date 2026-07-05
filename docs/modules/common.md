# Common Module

The Common Module (`src/common/common.module.ts`) provides a set of shared, injectable services and globally applied filters used across the Assessment Bot LLM Service application.

## Overview

The Common Module serves as a central provider for the following cross-cutting concerns:

- **Global Error Handling**: A global `HttpExceptionFilter` to ensure all API error responses are standardised.
- **JSON Processing**: An injectable `JsonParserUtil` service for robust JSON parsing and repair.
- **Logging**: Provides and exports the NestJS `Logger` for dependency injection.

Other utilities, such as validation pipes and file helpers, exist within the `src/common/` directory but are standalone and are not provided by this module.

## Module Structure

The module's providers and exports are defined in `src/common/common.module.ts`:

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

## Core Provided Components

### Global Exception Filter (`HttpExceptionFilter`)

The `HttpExceptionFilter` is registered globally and provides comprehensive error handling for the entire application.

**Features**:

- **Standardised responses**: All errors are formatted into a consistent JSON structure.
- **Security-aware**: Sanitises sensitive information in production environments (e.g., generic messages for 5xx errors, redacted headers in logs).
- **Comprehensive logging**: Logs 4xx errors as warnings and 5xx errors with full stack traces.
- **Express integration**: Handles specific Express errors like `PayloadTooLargeError`.

### JSON Processing Service (`JsonParserUtil`)

The `JsonParserUtil` is an injectable service that provides robust JSON parsing, which is especially useful for handling potentially malformed responses from the LLM.

**Key Features**:

- **Malformed JSON repair**: Uses the `jsonrepair` library to fix common issues like trailing commas.
- **Markdown extraction**: Automatically extracts JSON from ```json code blocks.
- **Structured validation**: Ensures the final parsed result is a structured object or array.

## Usage

### Importing the Common Module

To use the injectable services from this module, import `CommonModule` into your feature module.

```typescript
import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  // Now Logger and JsonParserUtil are available for injection
})
export class FeatureModule {}
```

### Using Exported Services

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { JsonParserUtil } from '../common/json-parser.util';

@Injectable()
export class MyService {
  constructor(
    private readonly logger: Logger,
    private readonly jsonParser: JsonParserUtil,
  ) {}

  async processData(input: string) {
    try {
      const parsed = this.jsonParser.parse(input);
      this.logger.log('Successfully parsed JSON');
      return parsed;
    } catch (error) {
      this.logger.error('JSON parsing failed', error);
      throw error;
    }
  }
}
```

## Related Utilities

While not provided directly by `CommonModule`, several other reusable components are located in the `src/common/` directory. See their respective documentation for more details:

- **[Validation Pipes](./pipes.md)**: For `ZodValidationPipe` and `ImageValidationPipe`.
- **[Exception Filters](./filters.md)**: For a more detailed look at `HttpExceptionFilter`.
- **[Utilities](./utilities.md)**: For standalone functions like `readMarkdown` and `isSystemUserMessage`.
