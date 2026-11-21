# Guards

This page covers the two custom guards in `src/auth/`: `ApiKeyThrottlerGuard` for global rate limiting and `ApiKeyGuard` for per-controller authentication.

## ApiKeyThrottlerGuard

**Location:** `src/auth/api-key-throttler.guard.ts`

A `ThrottlerGuard` subclass that provides application-wide rate limiting. It is registered once as a global `APP_GUARD` in `AppModule` (`src/app.module.ts`), so it applies to every route.

### Tracking

`getTracker()` keys the limiter by the trimmed Bearer token when the request has an `Authorization: Bearer <token>` header; otherwise it uses the client IP address. Each API key therefore has an independent counter even when several keys share an IP.

Configured limits are owned by [Rate Limiting](../api/rate-limiting.md).

## ApiKeyGuard

**Location:** `src/auth/api-key.guard.ts`

An `AuthGuard('bearer')` subclass that validates API keys through the Passport bearer strategy. It is applied per controller with `@UseGuards(ApiKeyGuard)`, not globally. Failed authentication returns HTTP 401 Unauthorised through the global exception filter.

### Usage

`AssessorController` guards all its routes and overrides the global throttle with the higher authenticated limit:

```typescript
import { Controller, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { ApiKeyGuard } from '../../auth/api-key.guard.js';
import { authenticatedThrottler } from '../../config/throttler.config.js';

@Controller('v1/assessor')
@UseGuards(ApiKeyGuard)
@Throttle(authenticatedThrottler)
export class AssessorController {}
```

## Related Documentation

- [Authentication Module](auth.md)
- [Exception Filters](filters.md)
- [Rate Limiting](../api/rate-limiting.md)
