# Utilities

This module provides shared utility functions for file operations, JSON processing, logging, and type safety.

## File Utilities

**Location:** `src/common/file-utils.ts`

### `getCurrentDirname(fallbackDir?)`

Resolves the current directory path in both ESM runtime and Vitest test environments. Uses `import.meta.url` when available, falling back to `process.cwd()` or a custom fallback in test environments.

### `readMarkdown(name, basePath?)`

Reads a markdown file with built-in security measures:

- Rejects filenames not ending in `.md`
- Blocks filenames containing `..` (path traversal prevention)
- Verifies the resolved path stays within the base directory
- Default `basePath` is `src/prompt/templates`

Throws `Error('Invalid markdown filename')` or `Error('Unauthorised file path')` on violation.

## JSON Processing

### JsonParserUtil

**Location:** `src/common/json-parser.util.ts`

Injectable service for parsing and repairing JSON strings, designed for LLM responses that may contain malformed JSON.

**Processing pipeline:**

1. Detects and extracts content from ```json code blocks
2. Optionally trims content outside the first `{` and last `}`
3. Repairs malformed JSON via `jsonrepair`
4. Validates the result is an object or array
5. Throws `BadRequestException` if no valid JSON is found

## Logging

### LogRedactor

**Location:** `src/common/utils/log-redactor.util.ts`

Utility for sanitising HTTP request objects before logging. Currently redacts the `authorization` header, replacing its value with `'Bearer <redacted>'`.

## Type Safety

### `isSystemUserMessage()`

Runtime type guard that validates an unknown value has the structure `{ system: string, user: string }`. Checks for a non-null object with `system` and `user` string properties.

## Related Documentation

- [Common Module](common.md)
- [Exception Filters](filters.md)
- [Validation Pipes](pipes.md)
