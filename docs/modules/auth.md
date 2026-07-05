# Authentication Module (`AuthModule`)

This document provides an overview of the `AuthModule`, which is responsible for handling all authentication and authorisation concerns within the Assessment Bot LLM Service.

## Primary Responsibility

The primary responsibility of the `AuthModule` is to secure application endpoints by validating API keys provided by clients. It uses a stateless, token-based authentication mechanism built on top of NestJS and the Passport.js ecosystem.

## Core Components

The module is composed of three main components that work together to provide a robust authentication layer.

### 1. `ApiKeyService`

**File**: `src/auth/api-key.service.ts`

This service is the central point for API key validation logic. Its key responsibilities are:

- Loading the list of valid API keys from the `ConfigService`.
- Providing a `validate()` method that checks if a given key is valid.
- Using a Zod schema to enforce a strict format for API keys (e.g., minimum length, character set) before checking for its existence.
- Logging authentication attempts and warnings.

### 2. `ApiKeyStrategy`

**File**: `src/auth/api-key.strategy.ts`

This class is a Passport.js strategy that implements the `passport-http-bearer` scheme. It is responsible for:

- Extracting the token from the `Authorization: Bearer <token>` header.
- Performing an initial, strict check to ensure the scheme is `Bearer ` (case-sensitive with a space) to prevent common mistakes.
- Delegating the actual validation of the token to the `ApiKeyService`.
- Returning a `User` object upon successful validation, which NestJS then attaches to the `Request` object.

### 3. `ApiKeyGuard`

**File**: `src/auth/api-key.guard.ts`

This is a standard NestJS authentication guard. It is a simple class that extends `AuthGuard('bearer')`. Its sole purpose is to trigger the `ApiKeyStrategy` on any route it protects. It is the primary interface used by the rest of the application to enforce authentication.

## Module Structure

The `AuthModule` encapsulates all these components, importing necessary modules like `PassportModule` and `ConfigModule`, and then exporting the authentication components for use in other parts of the application.

```typescript
// src/auth/auth.module.ts
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'bearer' }),
    ConfigModule,
  ],
  providers: [ApiKeyStrategy, ApiKeyGuard, ApiKeyService],
  exports: [ApiKeyStrategy, ApiKeyGuard, ApiKeyService],
})
export class AuthModule {}
```

## Usage Example

To protect an endpoint, you simply apply the `ApiKeyGuard` using the `@UseGuards()` decorator.

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Controller('protected-resource')
@UseGuards(ApiKeyGuard)
export class ProtectedController {
  @Get()
  getData() {
    return { message: 'This data is protected.' };
  }
}
```

---

_For a more detailed technical breakdown of the security flow, see [Authentication & Authorisation](../../security/auth.md)._
