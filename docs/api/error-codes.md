# Error Codes

## Overview

All API errors share one JSON shape, produced by the global `HttpExceptionFilter`.

## Standard Error Response Format

Every error response uses this envelope:

```typescript
{
  statusCode: number, // HTTP status code
  timestamp: string,  // ISO 8601 timestamp when error occurred
  path: string,       // Request path that caused the error
  message: string,    // Human-readable error description
  errors?: Array<{ message: string; path?: (string | number)[] }> // Validation failures only
}
```

### Example Error Response

```json
{
  "statusCode": 400,
  "timestamp": "2025-01-07T12:00:00.000Z",
  "path": "/v1/assessor",
  "message": "Validation failed",
  "errors": [
    {
      "message": "<Zod issue message>",
      "path": ["reference"]
    }
  ]
}
```

## HTTP Status Codes

### 200 - OK

Successful requests return appropriate 200-level status codes:

- `200 OK`: Successful GET requests (health checks)
- `201 Created`: Successful assessment creation

### 400 - Bad Request

Returned when the request is malformed or fails validation.

**Common Scenarios:**

#### Schema Validation Failures

Invalid request body that doesn't match the expected schema.

#### Image Validation Failures

For IMAGE task types with invalid image data, such as exceeding size limits or using disallowed MIME types.

#### Image Input Type Errors

For IMAGE tasks, each field must be a base64 Data URI string. A `Buffer` or a Buffer-like JSON object fails schema validation.

### 401 - Unauthorised

Returned when authentication fails or is missing.

**Common Scenarios:**

- Missing API Key
- Invalid API Key
- Malformed Authorization Header (e.g., missing "Bearer" prefix)

### 413 - Payload Too Large

Returned when the request body exceeds the fixed 5 MiB JSON body cap, which is sized for three maximum-size base64 images. This is handled by `body-parser` before the main application logic, so it bypasses schema and image validation.

### 429 - Too Many Requests

Returned when rate limiting thresholds are exceeded. Only throttler-generated 429s include a `Retry-After` header; provider-originated 429s from the upstream LLM carry the standard body only. See [Rate Limiting](./rate-limiting.md).

### 500 - Internal Server Error

Returned for unexpected server-side errors. In production, the message is sanitised to "Internal server error" to avoid leaking sensitive details.

### 502 - Bad Gateway

Returned when an upstream LLM provider fails: an upstream server error, a network failure, or invalid provider credentials. Transient failures are retried before the error reaches the client. [LLM Error Handling](../llm/error-handling.md) owns the authoritative error-class table.

### 503 - Service Unavailable

Returned when the LLM provider's resources or quota are exhausted. This is a temporary state; the request may be retried later.

## Validation Error Details

Validation failures populate the `errors` array. Full `message`/`path` detail is returned outside production; production returns only the generic `Invalid input` message. The exact shape, defined by `ZodValidationPipe` (`src/common/zod-validation.pipe.ts`), is:

- Outside production: `{ message: string, path: (string | number)[] }[]` — one entry per Zod issue.
- In production: `[{ message: 'Invalid input' }]` — no `path` is sent.

Production masking of validation detail is applied by `ZodValidationPipe` when it builds the wire error; see [ZodValidationPipe](../modules/pipes.md#zodvalidationpipe). The [exception filter](../modules/filters.md) separately sanitises 5xx messages to `Internal server error` in production.

## Error Logging

The central `HttpExceptionFilter` logs all errors with appropriate severity levels and context.

- **4xx Errors**: Logged as warnings (`WARN`).
- **5xx Errors**: Logged as errors (`ERROR`) with full stack traces.
- **Sensitive Data**: Headers like `Authorization` and `Cookie` are automatically redacted in logs for security.

## Troubleshooting Guide

### Validation Errors (400)

1.  Check the `errors` array for the `message` and `path` of each issue; in production this is masked to `Invalid input`.
2.  Verify data types and constraints against the [API schemas](./schemas.md).

### Authentication Errors (401)

1.  Ensure the `Authorization` header is present and formatted as `Bearer <api_key>`.
2.  Verify the API key is correct and active.

### Rate Limiting (429)

1.  For a throttler-generated 429, check the `Retry-After` header for the required wait time. Provider-originated 429s have no header.
2.  Implement exponential backoff in client applications to handle retries gracefully.

### Server Errors (500, 502, 503)

1.  For a `502`, an upstream LLM call failed. Retry transient failures with backoff; see [LLM Error Handling](../llm/error-handling.md).
2.  For a `503`, the provider's quota or resources are exhausted. Retry after a short delay.
3.  For a `500`, the issue is an unexpected server-side problem. Check server logs for detailed stack traces and error context.
