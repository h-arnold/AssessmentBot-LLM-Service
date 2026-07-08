# Utilities

This module provides shared utility functions that support various aspects of the application, including file operations, JSON processing, logging, and type safety. These utilities are designed to be reusable, secure, and reliable across different parts of the system.

## File Utilities

The file utilities module provides secure and cross-platform file operations, particularly focused on directory resolution and markdown file reading.

### getCurrentDirname()

A utility function that resolves the current directory path in both Node.js ESM runtime and Vitest test environments.

#### Features

- **Cross-Environment Compatibility**: Works in both ESM runtime and Vitest test environments
- **Graceful Fallback**: Falls back to `process.cwd()` when `import.meta.url` is unavailable
- **Custom Fallback Support**: Allows specification of custom fallback directory

#### Usage

```typescript
import { getCurrentDirname } from '@/common/file-utils';

// Basic usage
const currentDir = getCurrentDirname();

// With custom fallback for tests
const currentDir = getCurrentDirname('/custom/test/path');
```

#### Parameters

- `fallbackDir` (optional): Custom fallback directory when `import.meta.url` is unavailable. Defaults to `process.cwd()`.

#### Returns

- `string`: The resolved directory path

#### Implementation Details

The function uses dynamic evaluation to avoid TypeScript compilation issues in test environments:

1. Attempts to use `import.meta.url` in ESM environments
2. Falls back to `process.cwd()` or custom fallback in test environments
3. Uses `fileURLToPath()` for proper URL-to-path conversion

### readMarkdown()

A secure function for reading markdown files with built-in path traversal protection.

#### Features

- **Security First**: Validates filenames and prevents path traversal attacks
- **Base Path Control**: Configurable base directory for file operations
- **Input Validation**: Ensures only `.md` files are read
- **Path Resolution**: Uses absolute paths for secure file access

#### Usage

```typescript
import { readMarkdown } from '@/common/file-utils';

// Read from default template directory
const content = await readMarkdown('prompt-template.md');

// Read from custom base path
const content = await readMarkdown('custom-file.md', '/custom/path');
```

#### Parameters

- `name`: The markdown filename (must end with `.md` and not contain `..`)
- `basePath` (optional): Base directory path. Defaults to `'src/prompt/templates'`

#### Returns

- `Promise<string>`: The content of the markdown file

#### Security Measures

- **Filename Validation**: Rejects files not ending in `.md`
- **Path Traversal Prevention**: Blocks filenames containing `..`
- **Path Resolution Checking**: Ensures resolved path stays within base directory
- **Empty Input Handling**: Returns empty string for falsy input

#### Error Conditions

- Throws `Error('Invalid markdown filename')` for invalid filenames
- Throws `Error('Unauthorised file path')` for path traversal attempts

## JSON Processing Utilities

### JsonParserUtil

A robust service for parsing and repairing JSON strings, particularly useful for processing responses from Large Language Models that may contain malformed JSON.

#### Features

- **JSON Repair**: Uses `jsonrepair` library to fix common JSON issues
- **Markdown Block Extraction**: Extracts JSON from markdown code blocks
- **Flexible Trimming**: Optional trimming of content outside JSON brackets
- **Structured Output Validation**: Ensures parsed result is an object or array
- **Comprehensive Logging**: Detailed logging for debugging and monitoring

#### Usage

```typescript
import { JsonParserUtil } from '@/common/json-parser.util';

@Injectable()
export class MyService {
  constructor(private readonly jsonParser: JsonParserUtil) {}

  async processLlmResponse(response: string) {
    // Parse with automatic trimming
    const parsed = this.jsonParser.parse(response);

    // Parse without trimming
    const parsed = this.jsonParser.parse(response, false);

    return parsed;
  }
}
```

#### Methods

##### parse(jsonString, trim?)

Parses and repairs a JSON string into a structured object or array.

**Parameters:**

- `jsonString`: The raw string that may contain JSON
- `trim` (optional): Whether to trim content outside brackets. Defaults to `true`

**Returns:**

- `unknown`: The parsed JavaScript object or array

**Processing Logic:**

1. **Markdown Block Detection**: Checks for `json` code blocks first
2. **Bracket Trimming**: Extracts content between first `{` and last `}`
3. **JSON Repair**: Attempts to repair malformed JSON using `jsonrepair`
4. **Structure Validation**: Ensures result is an object or array
5. **Error Handling**: Throws `BadRequestException` for irreparable JSON

#### Error Handling

- `BadRequestException('No valid JSON object found in response.')` - No JSON structure found
- `BadRequestException('Malformed or irreparable JSON string provided.')` - Parsing failed

#### Dependencies

- **NestJS Common**: For service decorator and exceptions
- **jsonrepair**: For JSON repair functionality

## Logging Utilities

### LogRedactor

A utility class for sanitising sensitive information from log entries, particularly HTTP request objects.

#### Features

- **Request Sanitisation**: Safely clones and redacts HTTP request objects
- **Header Protection**: Masks authorization and authentication headers
- **Shallow Cloning**: Prevents mutation of original request objects
- **Security Compliance**: Ensures sensitive data doesn't appear in logs

#### Usage

```typescript
import { LogRedactor } from '@/common/utils/log-redactor.util';
import { IncomingMessage } from 'http';

// In a logging context
const redactedRequest = LogRedactor.redactRequest(request);
logger.log('Request received', { request: redactedRequest });
```

#### Methods

##### redactRequest(req)

Creates a sanitised copy of an HTTP request object suitable for logging.

**Parameters:**

- `req`: The incoming HTTP request object

**Returns:**

- `IncomingMessage`: A cloned request object with sensitive headers redacted

**Redacted Headers:**

- `authorization`: Replaced with `'Bearer <redacted>'`

#### Implementation Details

- Uses shallow cloning to prevent original object mutation
- Specifically targets authorization headers
- Preserves all other request properties and headers
- Maintains type safety with TypeScript

## Type Safety Utilities

### Type Guards

Runtime type checking functions for ensuring data structure integrity.

#### isSystemUserMessage()

Validates that an unknown value has the structure of a system-user message, commonly used for LLM prompt payloads.

#### Features

- **Runtime Validation**: Checks object shape at runtime
- **Type Narrowing**: Provides TypeScript type narrowing
- **LLM Integration**: Specifically designed for prompt structure validation
- **Null Safety**: Handles null and undefined inputs safely

#### Usage

```typescript
import { isSystemUserMessage } from '@/common/utils/type-guards';

function processMessage(data: unknown) {
  if (isSystemUserMessage(data)) {
    // TypeScript now knows data is { system: string; user: string }
    console.log(`System: ${data.system}`);
    console.log(`User: ${data.user}`);
  } else {
    throw new Error('Invalid message format');
  }
}
```

#### Type Signature

```typescript
function isSystemUserMessage(
  message: unknown,
): message is { system: string; user: string };
```

#### Validation Criteria

- Must be a non-null object
- Must contain `system` property that is a string
- Must contain `user` property that is a string
- Other properties are ignored

## Common Patterns

### Error Handling

All utilities follow consistent error handling patterns:

- Use appropriate NestJS exceptions (`BadRequestException`, etc.)
- Provide descriptive error messages
- Log errors with sufficient context
- Maintain security by not exposing sensitive information

### Logging Integration

Utilities integrate with the application's logging system:

- Use structured logging with context objects
- Redact sensitive information before logging
- Provide debug and error logging at appropriate levels
- Include relevant metadata for debugging

### Security Considerations

- **Input Validation**: All utilities validate inputs before processing
- **Path Security**: File utilities prevent directory traversal
- **Data Sanitisation**: Logging utilities redact sensitive information
- **Type Safety**: Type guards ensure runtime type safety

## Dependencies

- **Node.js Built-ins**: `fs/promises`, `path`, `url`, `http`
- **NestJS Common**: For decorators and exceptions
- **External Libraries**: `jsonrepair` for JSON processing
