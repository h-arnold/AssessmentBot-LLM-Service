# LLM Error Handling

## Overview

This document describes the centralised LLM error handling library at
`src/common/errors/`. The library provides a consistent, typed error hierarchy
that all LLM provider implementations (Gemini, future OpenAI, Anthropic, etc.)
can map their native SDK errors into. It enables the base `LLMService` retry
logic to work against a standard `retryable` contract and gives the HTTP layer
(the global `HttpExceptionFilter`) a single point of recognition for LLM-domain
errors.

**Location:** `src/common/errors/` — barrel re-export at `src/common/errors/index.ts`.  
**Base class:** `LlmError` (abstract, extends `HttpException`).  
**Consumer import:** `import { LlmError, ProviderServerError } from '../common/errors/index.js';`

---

## Error Class Reference

| Error class                  | HTTP status | Retryable | Meaning for API consumers                                         |
| ---------------------------- | ----------- | --------- | ----------------------------------------------------------------- |
| `RateLimitError`             | 429         | Yes       | Our upstream is rate-limiting. Retry with backoff.                |
| `ResourceExhaustedError`     | 503         | No        | Our LLM quota is exhausted. Try again later.                      |
| `ProviderServerError`        | 502         | Yes       | The upstream LLM returned an internal error. Retry may succeed.   |
| `AuthenticationError`        | 502         | No        | Our upstream credentials are invalid (configuration error).       |
| `ContentFilteredError`       | 400         | No        | The request content was blocked by the provider's safety filters. |
| `NetworkError`               | 502         | Yes       | Could not connect to the upstream provider. Retry may succeed.    |
| `ContextLengthExceededError` | 400         | No        | The input exceeds the model's context window.                     |
| `InvalidRequestError`        | 400         | No        | The provider rejected our request as malformed.                   |
| `LlmServiceError`            | 500         | No        | Unclassified upstream error. Diagnostics only.                    |

### Status-code rationale

- `ProviderServerError`, `AuthenticationError`, and `NetworkError` all produce 502. From the API consumer's perspective, all three represent "the upstream
  provider is unreachable or misconfigured." They are distinguished by
  `providerName`, the error class name in logs, and the error message.
- `ContentFilteredError` and `ContextLengthExceededError` both produce 400,
  which matches what upstream providers (Gemini, OpenAI) return for these
  conditions.
- `AuthenticationError` produces 502 rather than 401 because the authentication
  failure is between our service and the upstream provider, not between the API
  consumer and our service.
- `LlmServiceError` produces 500 because it represents an unclassifiable error
  that should never have reached the consumer — it is a fallback safety net.

---

## Adding a New LLM Provider

To add error mapping for a new LLM provider, follow these steps:

### 1. Declare `providerName`

In your concrete `LLMService` subclass, add a `protected readonly providerName`
property. This value is embedded in every `LlmError` instance created by the
provider (including fallback `LlmServiceError` instances from the base class).

```typescript
protected readonly providerName = 'openai'; // or 'anthropic', etc.
```

### 2. Implement `mapError()`

Implement the abstract method:

```typescript
protected abstract mapError(error: unknown): LlmError | undefined;
```

The method receives the raw error caught from `_sendInternal` (except
`ZodError`, which is re-thrown by the base class before `mapError()` is called).
Return the most specific `LlmError` subclass that matches the error shape.

Your implementation should:

- Inspect the native error shape (status codes, message patterns, string
  type/code fields).
- Return the most specific `LlmError` subclass, reading `this.providerName` to
  embed provider identity.
- Return `undefined` when no pattern matches — the base class wraps the
  original error in `LlmServiceError`.
- Throw only for truly unexpected shapes — the base class catches mapping
  errors and wraps the **original** `_sendInternal` error in `LlmServiceError`.

### 3. Extract provider-specific status-code helpers

If the SDK error has status-code accessors different from those handled by
`GeminiService.extractStatusCode()`, write private helpers for the new provider.
Common shapes include `error.status`, `error.statusCode`, `error.code`,
`error.response.status`, and nested `error.error.status`.

### 4. Write unit tests

Cover all error categories that the provider SDK can produce, using
representative error shapes. Test the classification priority order,
unrecognised-4xx default, non-object/null inputs, and edge cases where
multiple patterns match the same error.

---

## Classification Priority-Order Rules

When a single error matches multiple patterns, the following priority order
(highest to lowest) determines the classification:

1. **ResourceExhaustedError** — string status `RESOURCE_EXHAUSTED` or 429 with
   resource-exhausted / quota-exhausted message. Beats `RateLimitError`.
2. **RateLimitError** — string status `RATE_LIMIT_EXCEEDED` / `429`, numeric
   429, or rate-limit / too-many-requests message.
3. **AuthenticationError** — HTTP 401 or 403.
4. **ContentFilteredError** — 400 with safety / blocked / filter message. Beats
   `ContextLengthExceededError` when both patterns match.
5. **ContextLengthExceededError** — 400 with context-length message.
6. **InvalidRequestError** — any 4xx HTTP status not matched by rules 1–5.
   **Any unrecognised 4xx maps to `InvalidRequestError`** (not `undefined`).
   This is a deliberate decision (#11): returning `undefined` for a 4xx would
   regress the provider-returned 4xx to a 500 (`LlmServiceError`).
7. **ProviderServerError** — any 5xx HTTP status. Beats network-style message
   patterns (rule 8) when an HTTP status is extractable.
8. **NetworkError** — `Error` objects with a network-failure message pattern
   (`ECONNREFUSED`, `ETIMEDOUT`, `ECONNRESET`, `ENOTFOUND`, `fetch failed`,
   `network`) and **no** extractable HTTP status. Also matches plain objects
   with no extractable status whose message matches a network pattern.
9. **`undefined`** — none of the above match. The base class wraps the original
   error in `LlmServiceError`.

### Key behaviours

- An error carrying both a 5xx HTTP status and a network-style message string
  (e.g. `ApiError({ status: 500, message: 'connect ECONNREFUSED' })`) is
  classified by HTTP status first → `ProviderServerError`. `NetworkError` is
  only reachable when **no** HTTP status code is extractable at all.
- `ContentFilteredError` beats `ContextLengthExceededError` when a single
  message matches both patterns (e.g. `"content safety filter blocked: context
length"`).
- The non-`Error`-object guard (returning `undefined` for non-object inputs) is
  a provider-implementation choice (Gemini v1 does it); the abstract contract
  does not require it. A provider that throws on `null` instead of returning
  `undefined` is still spec-compliant — the base class `mapError()` try/catch
  is the safety net.

---

## 5xx-Retryable Behaviour Change (Decision #10)

**This is an intentional behaviour change from earlier versions.**

- **Before:** Any non-429 upstream error (including HTTP 500, 502, 503 from the
  provider) caused `LLMService.send()` to fail fast after a single attempt and
  throw a generic `Error` with HTTP 500.
- **After:** `ProviderServerError` (HTTP 502, `retryable = true`) and
  `NetworkError` (HTTP 502, `retryable = true`) are now retried up to
  `LLM_MAX_RETRIES` attempts with exponential backoff. The final thrown error
  carries HTTP 502 (not 500).

**Impact:** Transient upstream 5xx failures are now handled by retry-with-
backoff, which is appropriate for these error types. From an API consumer's
perspective, the response status code for upstream 5xx errors changes from 500
to 502. The error type changes from a generic `Error` to `ProviderServerError`
or `NetworkError`.

---

## Error Message Policy

- **Server-side:** Full diagnostic details — including `originalError` (with
  stack trace), `providerName`, and the raw error message — are logged at the
  appropriate level.
- **HTTP response:** The response body carries a brief, stable message:
  - **5xx errors** (status >= 500): sanitised to `"Internal server error"` in
    production (`NODE_ENV === 'production'`). This applies to
    `ProviderServerError`, `AuthenticationError`, `NetworkError`,
    `ResourceExhaustedError`, and `LlmServiceError`.
  - **4xx errors** (400, 429): the client-facing message is a **static,
    brief, stable summary** (e.g. `'Request blocked by provider safety
filters'`, `'Input exceeds the model context window'`, `'The request was
rejected by the provider as invalid'`, `'Authentication with the LLM
provider failed'`). The raw upstream error message is retained
    **server-side only** in `originalError` and is never echoed to the
    client, so prompt text or other PII in the upstream message cannot leak
    to API consumers.

### Non-production diagnostics exposure

`LlmServiceError` (HTTP 500, the fallback for unclassifiable upstream errors)
is sanitised to `"Internal server error"` when `NODE_ENV === 'production'`.
In all other environments the raw message — which can include provider
payload echoes and stack detail — is returned in the response body. This
exposure is **intentional** and gated solely on `NODE_ENV`; non-production
environments are assumed trusted. Do not add additional gating.

---

## `originalError` Narrowing (Decision #12)

The `originalError` property on `LlmError` (and all subclasses) stores the
caught `_sendInternal` error **only when it is an `Error` instance**. Non-
`Error` originals (plain objects, strings, `null`, `undefined`) are stored as
`undefined`.

This is enforced via the shared `isErrorObject` type guard at
`src/common/utils/type-guards.ts` (imported into `LLMService`):

```typescript
const originalError = isErrorObject(error) ? error : undefined;
```

When the `LlmServiceError` fallback constructs its message for a non-`Error`
original, it uses `"LLM service error: Unknown error"`.

---

## `mapError()` Non-Object Guard Framing

**The abstract contract does not require a non-object guard.** The abstract
method signature `mapError(error: unknown): LlmError | undefined` permits a
provider to throw on `null` or non-object inputs — the base class wraps the
throw in `LlmServiceError` via its `mapError()` try/catch.

In practice, `GeminiService.mapError()` returns `undefined` for non-object and
falsy inputs (`if (!error || typeof error !== 'object') { return undefined; }`).
This is a provider-implementation choice and is tested in `gemini.service.spec.ts`.
Future providers may choose to throw instead; both behaviours are spec-compliant.

---

## Testing Conventions

- **Representative error shapes:** Each provider's `mapError()` tests should
  construct realistic error objects matching that provider's SDK (e.g.
  `{ message, status }` for Gemini `ApiError` instances).
- **Cover all error categories:** At least one test per `LlmError` subclass,
  plus one test expecting `undefined`.
- **Test priority conflicts:** Create errors that match multiple patterns (e.g.
  both `RESOURCE_EXHAUSTED` status and a rate-limit message string) to verify
  the highest-priority classification wins.
- **Test non-object / `null` / `undefined` inputs:** Verify the provider's guard
  (if any) returns `undefined` for these inputs.
- **Test the unrecognised-4xx default:** A 4xx error with no specific pattern
  match (e.g. `{ status: 404, message: 'Not Found' }`) must return
  `InvalidRequestError`, not `undefined`.

---

## Worked Example: `GeminiService.mapError()`

The canonical reference implementation is `src/llm/gemini.service.ts`, method
`GeminiService.mapError()` (search for `protected mapError`). Its priority
order, documented in the method's JSDoc, matches the classification rules above
exactly:

1. `ResourceExhaustedError` — string status or 429 with quota message.
2. `RateLimitError` — string status `RATE_LIMIT_EXCEEDED` / `429`, numeric 429.
3. `AuthenticationError` — 401 or 403.
4. `ContentFilteredError` — 400 with safety/blocked/filter message.
5. `ContextLengthExceededError` — 400 with context-length message.
6. `InvalidRequestError` — generic 400 or any other unrecognised 4xx
   (decision #11).
7. `ProviderServerError` — any 5xx.
8. `NetworkError` — error with network-failure message and no HTTP status.
9. `undefined` — none of the above.

The implementation uses private helpers:

- `extractStatusCode(error)` — probes `status`, `statusCode`, `code`,
  `response.status`, `error.status`, `error.code` fields, coercing string
  values to numbers.
- `hasStringStatus(error, value)` — case-insensitive string match against
  `status`, `code`, and nested `error.status`/`error.code`.
- `isResourceExhausted(error, statusCode, message)` — checks string status and
  status+message combinations.
- `isRateLimit(error, statusCode, message)` — checks string status, numeric
  status, and message patterns.
- `buildError(ErrorClass, message, error)` — constructs the `LlmError` instance
  with `this.providerName` and narrowed `originalError`.

See `src/llm/gemini.service.ts` and its spec file for the complete
implementation and test coverage.
