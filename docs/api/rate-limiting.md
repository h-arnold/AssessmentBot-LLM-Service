# Rate Limiting

## Overview

The API uses `@nestjs/throttler` to protect against abuse and ensure fair usage. Rate limiting is applied globally with a custom `ApiKeyThrottlerGuard` that keys rate-limiting by API key for authenticated requests, falling back to IP-based tracking for unauthenticated traffic.

## How It Works

- **Tracking:** Unauthenticated requests are tracked by IP address. Authenticated requests are tracked by API key (via the custom `ApiKeyThrottlerGuard` at `src/auth/api-key-throttler.guard.ts`).
- **Enforcement:** When a limit is exceeded, the API responds with `429 Too Many Requests` and a `Retry-After` header indicating how many seconds to wait before making another request.

## Configuration

Rate limits are configured through `THROTTLER_TTL`, `UNAUTHENTICATED_THROTTLER_LIMIT` and `AUTHENTICATED_THROTTLER_LIMIT`. See [environment configuration](../configuration/environment.md#rate-limiting) for their values.

These limits are sized for a typical classroom scenario of 30 students each submitting 3 tasks simultaneously.

## Guard Implementation

Rate limiting is enforced by `ApiKeyThrottlerGuard` (`src/auth/api-key-throttler.guard.ts`), a custom guard that extends `ThrottlerGuard`. It overrides the `getTracker` method to use the Bearer token (API key) as the tracker for authenticated requests, ensuring each API key has its own independent rate-limit counter.

## Endpoint-Specific Limits

| Endpoint       | Method | Limit (per 10s) | Notes           |
| -------------- | ------ | --------------- | --------------- |
| `/v1/assessor` | POST   | 90              | Authenticated   |
| `/health`      | GET    | 10              | Unauthenticated |
| `/`            | GET    | 10              | Unauthenticated |
| `/test-error`  | GET    | 10              | Unauthenticated |

## Client Best Practices

- **Handle `429` responses:** For a throttler-generated `429`, wait for the duration in the `Retry-After` header before sending another request. Provider-originated `429`s have no header; see [Error Codes](./error-codes.md#429---too-many-requests).
- **Implement backoff:** When you retry, use exponential backoff to avoid overwhelming the API.
