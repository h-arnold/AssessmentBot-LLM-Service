# Rate Limiting

This document details the rate limiting (throttling) implementation in the Assessment Bot LLM Service API.

## Overview

The API uses `@nestjs/throttler` to protect against abuse and ensure fair usage. Rate limiting is applied globally, with different limits for authenticated and unauthenticated requests.

## How It Works

- **Tracking:** Unauthenticated requests are tracked by IP address. Authenticated requests are tracked by API key.
- **Enforcement:** When a limit is exceeded, the API responds with `429 Too Many Requests` and a `Retry-After` header indicating how many seconds to wait before making another request.

## Configuration

Rate limits are configured via environment variables.

| Variable                          | Default | Description                                        |
| --------------------------------- | ------- | -------------------------------------------------- |
| `THROTTLER_TTL`                   | `10000` | Time window in milliseconds (e.g., 10 seconds)     |
| `UNAUTHENTICATED_THROTTLER_LIMIT` | `10`    | Max requests per window for unauthenticated routes |
| `AUTHENTICATED_THROTTLER_LIMIT`   | `90`    | Max requests per window for authenticated routes   |

### Default Limits

- **Unauthenticated:** 10 requests per 10 seconds.
- **Authenticated:** 90 requests per 10 seconds.

These defaults are designed to support a typical classroom scenario of 30 students each submitting 3 tasks simultaneously.

## Endpoint-Specific Limits

| Endpoint       | Method | Limit (per 10s) | Notes           |
| -------------- | ------ | --------------- | --------------- |
| `/v1/assessor` | POST   | 90              | Authenticated   |
| `/health`      | GET    | 10              | Unauthenticated |
| `/`            | GET    | 10              | Unauthenticated |
| `/test-error`  | GET    | 10              | Unauthenticated |

## Client Best Practices

- **Handle `429` responses:** When you receive a `429` status code, wait for the duration specified in the `Retry-After` header before sending another request.
- **Implement backoff:** For robust applications, use an exponential backoff strategy for retries to avoid overwhelming the API.
