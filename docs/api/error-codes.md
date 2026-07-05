# Error Codes

This document details the error handling mechanisms and HTTP status codes returned by the Assessment Bot LLM Service API, including error formats, common scenarios, and troubleshooting guidance.

## Overview

The API uses a comprehensive error handling system built on NestJS's exception filters. All errors are standardised into a consistent JSON format with detailed information to help developers understand and resolve issues quickly.

## Standard Error Response Format

All API errors follow this standardised structure:

```typescript
{
  statusCode: number,        // HTTP status code
  timestamp: string,         // ISO 8601 timestamp when error occurred
  path: string,             // Request path that caused the error
  message: string,          // Human-readable error description
  errors?: ZodErrorDetail[] // Optional detailed validation errors
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
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "String must contain at least 1 character(s)",
      "path": ["reference"]
    }
  ]
}
```

## HTTP Status Codes

### 200 - OK

Successful requests return appropriate 200-level status codes:

- `200 OK`: Successful GET requests (health check, auth check)
- `201 Created`: Successful assessment creation

### 400 - Bad Request

Returned when the request is malformed or fails validation.

**Common Scenarios:**

#### Schema Validation Failures

Invalid request body that doesn't match the expected schema.

#### Image Validation Failures

For IMAGE task types with invalid image data, such as exceeding size limits or using disallowed MIME types.

#### Type Consistency Errors

For IMAGE tasks where reference, template, and studentResponse have inconsistent types (e.g., a mix of strings and Buffers).

### 401 - Unauthorized

Returned when authentication fails or is missing.

**Common Scenarios:**

- Missing API Key
- Invalid API Key
- Malformed Authorization Header (e.g., missing "Bearer" prefix)

### 413 - Payload Too Large

Returned when the request body exceeds the configured size limit. This is handled separately from other validation as it occurs before the main application logic.

### 429 - Too Many Requests

Returned when rate limiting thresholds are exceeded. Rate-limited responses include a `Retry-After` header indicating when requests can resume.

### 500 - Internal Server Error

Returned for unexpected server-side errors. In production, the message is sanitised to "Internal server error" to avoid leaking sensitive details.

### 503 - Service Unavailable

Returned when a downstream service, such as the LLM, is temporarily unavailable or has exhausted its resources. This indicates a temporary state, and the request may be retried later.

## Validation Error Details

### Zod Error Structure

When validation fails, the optional `errors` array contains detailed information about each validation failure:

```typescript
{
  code: string,              // Zod error code (e.g., "too_small", "invalid_type")
  expected?: string,         // Expected type/value
  received?: string,         // Actual received type/value
  path: (string | number)[], // Path to the field that failed
  message: string           // Human-readable error description
}
```

### Common Validation Error Codes

#### `invalid_type`

The field has the wrong data type (e.g., `expected: "string", received: "number"`).

#### `too_small`

A string, number, or array is below the minimum required size/length.

#### `invalid_enum_value`

The provided value is not one of the allowed enum options (e.g., `taskType` is not "TEXT", "TABLE", or "IMAGE").

#### `invalid_union`

Discriminated union validation failed, meaning the combination of fields is incorrect for the specified `taskType`.

## Error Logging

The central `HttpExceptionFilter` logs all errors with appropriate severity levels and context.

- **4xx Errors**: Logged as warnings (`WARN`).
- **5xx Errors**: Logged as errors (`ERROR`) with full stack traces.
- **Sensitive Data**: Headers like `Authorization` and `Cookie` are automatically redacted in logs for security.

## Troubleshooting Guide

### Validation Errors (400)

1.  Check the `errors` array in the response for specific field issues.
2.  Verify data types and constraints against the API schema.
3.  For `IMAGE` tasks, ensure all image fields have consistent types and meet size/MIME requirements.

### Authentication Errors (401)

1.  Ensure the `Authorization` header is present and formatted as `Bearer <api_key>`.
2.  Verify the API key is correct and active.

### Rate Limiting (429)

1.  Check the `Retry-After` header for the required wait time.
2.  Implement exponential backoff in client applications to handle retries gracefully.

### Server Errors (500, 503)

1.  For a `503`, the issue is likely temporary. Retry the request after a short delay.
2.  For a `500`, the issue is an unexpected server-side problem. Check server logs for detailed stack traces and error context.
