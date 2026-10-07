# Validation Pipes

This module provides custom NestJS pipes for input validation and transformation.

## ZodValidationPipe

**Location:** `src/common/zod-validation.pipe.ts`

A pipe that validates incoming data against a Zod schema. Throws `BadRequestException` on failure:

- In development, returns detailed Zod error information (field paths, expected types)
- In production (`NODE_ENV=production`), returns a generic "Invalid input" message to prevent information leakage
- If no schema is provided, passes the input through unchanged

**Usage:**

```typescript
// In a controller, the ConfigService must be passed for production mode
const validationPipe = new ZodValidationPipe(mySchema, this.configService);
```

Can be applied to individual parameters, entire methods, or globally. Note that the `ConfigService` parameter is optional — when provided, it is used to check `NODE_ENV` and mask detailed error messages in production.

## ImageValidationPipe

**Location:** `src/common/pipes/image-validation.pipe.ts`

Validates base64 Data URI image uploads. Any non-string value is rejected.

**Validations:**

- Rejects empty base64 data
- Enforces the fixed 1 MiB decoded per-image limit (`MAX_IMAGE_SIZE_BYTES` in `src/common/image.constants.ts`)
- Restricts MIME types to `ALLOWED_IMAGE_MIME_TYPES` from configuration
- Validates the `data:image/` prefix, base64 encoding, and a 10 MB string length limit (ReDoS protection)
- Base64 validation uses `validator`. No magic-byte detection is performed

**Usage** (instantiated programmatically per IMAGE task in `AssessorController`):

```typescript
const imagePipe = new ImageValidationPipe(this.configService);
await imagePipe.transform(assessorDto.reference); // string data URI
```

## Related Documentation

- [Common Module](common.md)
- [Exception Filters](filters.md)
- [Utilities](utilities.md)
- [Configuration Guide](../configuration/environment.md)
