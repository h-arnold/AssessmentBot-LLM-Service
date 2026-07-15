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
@Body(new ZodValidationPipe(mySchema)) data: MyType
```

Can be applied to individual parameters, entire methods, or globally.

## ImageValidationPipe

**Location:** `src/common/pipes/image-validation.pipe.ts`

Specialises in validating image uploads, supporting both Buffer objects and base64 Data URIs.

**Validations:**

- Rejects empty buffers or base64 data
- Enforces `MAX_IMAGE_UPLOAD_SIZE_MB` limit from configuration
- Restricts MIME types to `ALLOWED_IMAGE_MIME_TYPES` from configuration
- For base64 strings: validates `data:image/` prefix, proper encoding, and enforces a 10MB string length limit (ReDoS protection)
- MIME type detection uses `mime-detect`; base64 validation uses `validator`

**Usage:**

```typescript
@Body('image', ImageValidationPipe) imageData: Buffer | string
```

## Related Documentation

- [Common Module](common.md)
- [Exception Filters](filters.md)
- [Utilities](utilities.md)
- [Configuration Guide](../configuration/environment.md)
