# Utilities

This module provides shared utility functions for file operations, JSON processing, logging, and type safety.

## File Utilities

**Location:** `src/common/file-utilities.ts`

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

### JsonParserUtility

**Location:** `src/common/json-parser.utility.ts`

Injectable service for parsing and repairing JSON strings, designed for LLM responses that may contain malformed JSON.

**Processing pipeline:**

1. Detects and extracts content from ```json code blocks
2. Optionally trims content outside the first `{` and last `}`
3. Repairs malformed JSON via `jsonrepair`
4. Validates the result is an object or array
5. Throws `BadRequestException` if no valid JSON is found

## Logging

### LogRedactor

**Location:** `src/common/utils/log-redactor.utility.ts`

Utility for sanitising HTTP request objects before logging. Currently redacts the `authorization` header, replacing its value with `'Bearer <redacted>'`.

## Type Safety

### `isSystemUserMessage()`

Runtime type guard that validates an unknown value has the structure `{ system: string, user: string }`. Checks for a non-null object with `system` and `user` string properties.

## Cryptography Utilities

**Location:** `src/common/utils/crypto.utilities.ts`

### `generateApiKey(prefix)`

Generates a cryptographically random API key with the given prefix.

```typescript
import { generateApiKey } from '../common/utils/crypto.utilities.js';

const key = generateApiKey('abt_'); // e.g. "abt_X7k9m2...32-base64url-chars"
```

The body is `randomBytes(24).toString('base64url')` = 192 bits of entropy, matching the validator in the config schema. The generator can be used via the CLI script `npm run generate:api-key`.

## Related Documentation

- [Common Module](common.md)
- [Exception Filters](filters.md)
- [Validation Pipes](pipes.md)
