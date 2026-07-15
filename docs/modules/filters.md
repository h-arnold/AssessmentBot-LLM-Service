# Exception Filters

## HttpExceptionFilter

**Location:** `src/common/http-exception.filter.ts`

A global exception filter that catches all errors and formats them into standardised JSON responses. Extends NestJS's `BaseExceptionFilter`.

### What It Does

- Catches all `HttpException` instances plus unexpected errors
- Handles Express `PayloadTooLargeError` (returns HTTP 413)
- Redacts sensitive headers (`authorization`, `cookie`, `x-api-key`) before logging
- In production (`NODE_ENV=production`), masks detailed error messages for 5xx errors with a generic "Internal server error"
- Preserves Zod validation error details in 4xx responses (development only)
- Logs 4xx errors at `warn` level, 5xx errors at `error` level with full request context

### Registration

Typically registered globally in `main.ts`:

```typescript
const logger = new Logger('HttpExceptionFilter');
app.useGlobalFilters(new HttpExceptionFilter(logger));
```

Alternatively, registered via `APP_FILTER` provider in `CommonModule`.

### Response Format

```typescript
{
  statusCode: number,
  timestamp: string,     // ISO 8601
  path: string,          // Request path
  message: string,       // Error description
  errors?: Array<{       // Zod errors (development only)
    code: string,
    path: (string | number)[],
    message: string,
  }>,
}
```

## Related Documentation

- [Common Module](common.md)
- [Error Codes](../api/error-codes.md)
