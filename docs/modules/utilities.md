# Utilities

This module provides shared utility functions for file operations, JSON processing, logging, and type safety.

## File Utilities

**Location:** `src/common/file-utilities.ts`

### `getCurrentDirname(fallbackDirectory?)`

Returns the supplied fallback directory, or `process.cwd()` when none is given. This resolves paths relative to the project root in both Vitest and production.

### `readMarkdown(name, basePath?)`

Reads a markdown file with built-in security measures:

- Rejects filenames not ending in `.md`
- Blocks filenames containing `..` (path traversal prevention)
- Verifies the resolved path stays within the base directory
- Default `basePath` is `src/prompt/templates`

An empty name returns `''`. A name containing `..` or not ending in `.md` throws `Error('Invalid markdown filename')`. A candidate whose resolved path falls outside its base directory is skipped; if no candidate contains the file, the function throws `Error('Markdown file not found in candidate paths: ...')`.

## JSON Processing

### JsonParserUtility

**Location:** `src/common/json-parser.utility.ts`

Injectable service for parsing and repairing JSON strings, designed for LLM responses that may contain malformed JSON.

**Processing pipeline:**

1. Detects and extracts content from ```json code blocks
2. When the required `trim` argument is `true`, trims content outside the first `{` and last `}` (callers must pass it explicitly; provider call sites pass `true`)
3. Repairs malformed JSON via `jsonrepair`
4. Validates the result is an object or array
5. Throws `BadRequestException` if no valid JSON is found

## Logging

### LogRedactor

**Location:** `src/common/utils/log-redactor.utility.ts`

Utility used by the nestjs-pino request serialiser to sanitise HTTP request objects before logging. It redacts `authorization` to `'Bearer <redacted>'` and `x-api-key` to `'[REDACTED]'`.

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
