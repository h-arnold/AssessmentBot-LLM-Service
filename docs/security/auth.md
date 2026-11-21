# Authentication & Authorisation

## Overview

The system uses a stateless API key authentication model. All protected endpoints require a valid API key to be passed in the `Authorization` header using the `Bearer` token scheme. The entire authentication process is handled by the `AuthModule`.

## Authentication Flow

The authentication process for a protected endpoint follows these steps:

1.  **Request Initiation**: A client sends a request to a protected endpoint, including the `Authorization: Bearer <api_key>` header.
2.  **Guard Interception**: The `ApiKeyGuard`, applied to the controller or endpoint, intercepts the incoming request.
3.  **Strategy Invocation**: The guard invokes the Passport.js `bearer` strategy, which is implemented by our `ApiKeyStrategy`.
4.  **Scheme Validation**: `ApiKeyStrategy` first performs a strict check on the `Authorization` header to ensure it starts with `Bearer ` (case-sensitive, with a trailing space). If not, it immediately throws an `UnauthorizedException` to reject malformed requests.
5.  **Service Delegation**: If the scheme is valid, the strategy passes the extracted API key to the `ApiKeyService.validate()` method.
6.  **Key Validation**: The `ApiKeyService` performs two validation steps:
    a. **Format Validation**: It checks that the key starts with the configured `API_KEY_PREFIX` (default `abt_`) and that the body after the prefix is exactly 32 base64url characters. See `ApiKeyService` in `src/auth/api-key.service.ts`. This fails fast on malformed keys before the existence check.
    b. **Existence Check**: If the format is valid, it checks if the key is present in the set of valid `API_KEYS` loaded from the `ConfigService`.
7.  **Outcome**:
    - If the key is invalid in either step, an `UnauthorizedException` is thrown.
    - If the key is valid, the service returns a `User` object (e.g., `{ apiKey: 'the-valid-key' }`).
8.  **Context Attachment**: The `User` object is passed back up the chain, and Passport attaches it to the `Request` object, making it available within the controller.

## Security Implementation Details

### Strict Bearer Scheme Enforcement

File: `src/auth/api-key.strategy.ts`

The strategy explicitly checks `authHeader.startsWith('Bearer ')`. This is a security enhancement to prevent ambiguity and enforce the RFC 6750 standard correctly. It helps avoid accepting non-compliant headers like `bearer <token>` or `Bearer<token>`.

### Key Validation

File: `src/auth/api-key.service.ts`

The use of a Zod schema for initial validation is a defence-in-depth measure. It allows the system to fail fast for clearly invalid tokens before performing a search in the list of valid keys, which is a slightly more expensive operation.

### Configuration

API keys are managed centrally via the `API_KEYS` environment variable. This variable should contain a comma-separated list of valid keys. The `ConfigService` is responsible for parsing this string into an array for the `ApiKeyService` to use.

---

_For information on how to generate and manage keys, see [API Key Management](../auth/API_Key_Management.md)._
_For a high-level overview of the module itself, see [Authentication Module](../modules/auth.md)._
