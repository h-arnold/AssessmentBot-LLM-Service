# Exception Filters

## HttpExceptionFilter

**Location:** `src/common/http-exception.filter.ts`

A global exception filter that catches all errors and formats them into standardised JSON responses. Extends NestJS's `BaseExceptionFilter`.

### What It Does

- Catches all `HttpException` instances plus unexpected errors
- Handles Express `PayloadTooLargeError` (returns HTTP 413) for request bodies above the aggregate JSON cap (see [Config Module](config.md) for the limit)
- Redacts sensitive headers (`authorization`, `cookie`, `x-api-key`) before logging
- In production (`NODE_ENV=production`), masks detailed error messages for 5xx errors with a generic "Internal server error"
- Preserves Zod validation error details in 4xx responses outside production
- Logs 4xx errors at `warn` level, 5xx errors at `error` level with full request context

### Registration

`HttpExceptionFilter` is registered once as a global `APP_FILTER` in `CommonModule`. See [Common Module](common.md) for the wiring.

### Response Format

```typescript
{
  statusCode: number,
  timestamp: string,     // ISO 8601
  path: string,          // Request path
  message: string,       // Error description
  errors?: Array<{       // Validation issues
    message: string,
    path: (string | number)[],
  }>,
}
```

Validation issues come from `ZodValidationPipe`: outside production each entry is `{ message, path }`; in production the array is `[{ message: 'Invalid input' }]`. See [Validation Pipes](pipes.md#zodvalidationpipe).

## Related Documentation

- [Common Module](common.md)
- [Error Codes](../api/error-codes.md)
