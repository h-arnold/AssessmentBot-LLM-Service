# Authentication Module (AuthModule)

The `AuthModule` (`src/auth/`) secures application endpoints by validating API keys provided by clients using a stateless, token-based authentication mechanism built on NestJS and Passport.js.

## Core Components

### 1. ApiKeyService

**File:** `src/auth/api-key.service.ts`

Central API key validation logic:

- Loads the list of valid API keys from `ConfigService`
- `validate()` checks if a given key is valid
- Uses a Zod schema to enforce key format (minimum length, character set) before checking existence

### 2. ApiKeyStrategy

**File:** `src/auth/api-key.strategy.ts`

Passport.js strategy implementing `passport-http-bearer`:

- Extracts the token from `Authorization: Bearer <token>` header
- Performs a strict check that the scheme is exactly `Bearer ` (case-sensitive, with trailing space)
- Delegates validation to `ApiKeyService`
- Returns a `User` object on success

### 3. ApiKeyGuard

**File:** `src/auth/api-key.guard.ts`

Simple guard extending `AuthGuard('bearer')`. Apply to routes with `@UseGuards(ApiKeyGuard)`.

## Module Structure

```typescript
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

---

_For a detailed technical breakdown of the authentication flow, see [Authentication & Authorisation](../security/auth.md)._
