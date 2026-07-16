# Centralised LLM Error Handling Library — Specification

## Status

- Draft v1.6 (post-sixth-review)

### Change history since v1.0

- **v1.1:** Added `LlmServiceError` naming resolution; error message exposure policy; clarified `CommonModule` wiring.
- **v1.2:** Added `ZodError` bypass decision (product decision #8); resolved ContentFiltered/ContextLength priority tie (product decision #9); clarified `NetworkError` classification precedence; defined `LlmServiceError` message format and `buildUnexpectedErrorMessage` removal; updated `LlmError` contract snippet for `HttpStatus` type consistency; added `@remarks` and filter-docblock update requirements; clarified `ResourceExhaustedError` constructor migration with default `providerName`; clarified `ZodError` HTTP response behaviour; clarified `mapError()` throwing is safe.
- **v1.3:** Removed `ErrorsModule` NestJS wrapper (error classes imported statically, no DI needed). Dropped `providerName` parameter from `mapError()` — providers read `this.providerName` internally. Removed explicit `instanceof ResourceExhaustedError` branch from `HttpExceptionFilter` (generic `HttpException` branch handles it consistently with sanitisation). Fixed `ResourceExhaustedError` constructor migration claim — the old `options`-object-second-arg call sites do not compile against the new `(message, providerName, options?)` shape and must be rewritten in the same section. Scheduled `resource-exhausted.error.spec.ts` rewrite in Section 1.
- **v1.4:** Added product decisions #10 (5xx retryable behaviour change — explicit, with release-note requirement) and #11 (unrecognised 4xx → `InvalidRequestError`, not `undefined`) to close a status-code regression gap. Added product decision #12 (`originalError` stores only `Error` instances; `undefined` for non-`Error` originals; "Unknown error" message branch). Clarified `LlmServiceError` fallback message and `originalError` narrowed storage in retry behaviour section. Clarified `mapError()` non-object guard as a provider-implementation expectation (not an abstract contract) with base-class `LlmServiceError` fallback as the safety net.
- **v1.5:** Corrections from the fifth planning review, addressing Critical findings C1–C3 and Improvements I1–I6. (a) Product decision #4: added the **second** Section 1 compile break — the `originalError` narrowing from `unknown` (old) to `Error` (new) makes the existing `{ originalError: error }` call site with `error: unknown` unassignable to `Error | undefined`; the rewrite must narrow via `isErrorObject(error)`. Also clarified that only the `new ResourceExhaustedError(...)` literal changes in Section 1 — the `handleSendError` method and all other `LLMService` helpers are untouched until Section 2 — and that `gemini.service.spec.ts`'s `ResourceExhaustedError` import is repointed in Section 1 alongside the source migration (not deferred to Section 3). (b) `LlmError` base-class contract: corrected the prose about how `super(message, status, { cause })` becomes the response body's `message` field — `HttpException` treats a bare string as the _response_, which the filter's `typeof === 'string'` branch (not the `'message' in exceptionResponse` object branch) extracts. Pinned the bare-string contract that every `LlmError` subclass MUST pass a string as the first `super(...)` arg (never an object), so the filter's response extraction and the production-sanitisation tests hold. (c) Product decision #9: lifted the `NetworkError`-for-plain-objects-with-no-status claim from the action plan into the contract priority list, so future providers planning from the SPEC alone do not miss it. (d) §"Backend changes required" item 11: corrected the audit scope — the only test depending on a single 5xx attempt is `gemini.service.spec.ts`'s "should not retry on non-429 errors" (already enumerated as Section 3 test #23); the `src/v1/assessor/` tree is a transparent pass-through and the E2E suite is mocked happy-path, so neither needs changes. (e) Added §"Resolved questions" #4 — a repo-wide grep confirms the legacy `"Failed to get a valid and structured response from the LLM."` message is consumed only by the test enumerated in Section 3, closing the response-body-contract-change audit. (f) Added §"Documentation conventions" recording the shared-helper-doc deviation (no canonical shared-helper doc in this repo — `ACTION_PLAN.md` is the record) and the E2E mock mechanism (`vitest.e2e.setup.ts`, `E2E_MOCK_LLM=true`, `test/utils/llm-mock.mjs` shim) so future specs inherit the same convention.
- **v1.6:** Added §"Resolved questions" #5 and #6 to close two product decisions deferred from the fifth review. #5: 429 message exposure leak risk reviewed and **accepted** — 429 responses remain unsanitised in production; the diagnostic value outweighs the low-sensitivity leak surface of provider-internal identifiers in the response body; no sanitisation or message substitution is applied to 429. #6: the `LLMService.waitBeforeRetry()` warn-log message `"Rate limit encountered on attempt ..."` is **kept verbatim** despite now firing for any retryable error after Section 2 — no rewrite to `"Retryable error encountered"` or any other phrasing is in scope for this feature; if a future feature restructures the warn-log payload it may revisit the wording. No ACTION_PLAN.md sections need updating for these two decisions; both are contract-pinning only.

## Purpose

This document defines the intended behaviour for a centralised, provider-agnostic error-handling library for the LLM service layer.

The library will be used to:

- Provide a consistent, typed error hierarchy that all LLM provider implementations (Gemini, future OpenAI, Anthropic, etc.) can map their native SDK errors into.
- Enable the base `LLMService` retry logic to work against a standard `retryable` contract rather than ad-hoc error-shape inspection.
- Give the HTTP layer (the global `HttpExceptionFilter`) a single point of recognition for LLM-domain errors, producing stable, predictable status codes and response bodies for API consumers.
- Make it straightforward to add a new provider by implementing a single mapping method without modifying shared base-class logic.

This feature is **not** intended to:

- Replace the existing Zod-based input/payload validation layer (DTO validation, image validation). Those remain unchanged.
- Handle errors from non-LLM subsystems (auth, throttling, config).
- Introduce a runtime plugin registry or dynamic provider discovery — the list of providers is known at build time and wired through NestJS DI.

## Agreed product decisions

1. **Approach A — provider-owned mapping.** Each concrete LLM provider service implements an abstract `mapError()` method that receives the native SDK error and returns the appropriate subclass of `LlmError`. The abstract `LLMService.send()` calls this mapper through the abstract method contract.
2. **Error classes extend `HttpException` through a common base.** All LLM-domain errors inherit from `LlmError extends HttpException`. `LlmError` carries shared metadata: `retryable` (boolean), `providerName` (string), and the `originalError` (`Error | undefined`, for diagnostics with stack traces).
3. **The library lives in `src/common/errors/`** as a directory with a barrel `index.ts`. Error classes are pure TypeScript and imported statically — no NestJS module wrapper is needed since they are instantiated via `new`, not injected through DI. Consumers (`LLMService`, `GeminiService`, `HttpExceptionFilter`) import from the barrel directly.
4. **The existing `ResourceExhaustedError` class is promoted** from `src/llm/resource-exhausted.error.ts` into the new hierarchy (it now extends `LlmError`). Its existing behaviour — no retries, 503 status — is preserved. As it was previously a plain `Error` subclass, its constructor is updated to call `super(HttpStatus.SERVICE_UNAVAILABLE, ...)` through the `LlmError` base. The new constructor signature is `constructor(message: string, providerName: string = 'unknown', options?: { originalError?: Error; cause?: Error })`. Because the old signature accepted an object as the second positional argument (`{ originalError }`), the existing call site in `LLMService.handleSendError()` **will not compile** against the new signature — and there are **two independent reasons** for this break: (a) the object is not assignable to `string` (the second positional arg is now `providerName`); (b) the old `options.originalError?: unknown` is narrowed to `options.originalError?: Error`, and the existing call passes `{ originalError: error }` where `error: unknown` is not assignable to `Error | undefined`. Both breaks must be fixed in the same rewrite. The call site is updated in the same section to `new ResourceExhaustedError(msg, 'unknown', { originalError: this.isErrorObject(error) ? error : undefined })`, using the preserved `isErrorObject()` helper to narrow before construction. This call site is then removed entirely in Section 2 (the `handleSendError` method and the literal inside it are deleted together as part of the retry-loop refactor). Similarly, the migrated `resource-exhausted.error.spec.ts` must have its constructor call sites rewritten for the new shape. The old file is deleted and imports are updated in `HttpExceptionFilter`, `LLMService`, and the affected test files (including `gemini.service.spec.ts`, whose `ResourceExhaustedError` import must be repointed to the new barrel in Section 1 alongside the source migration — do not defer it to Section 3).
5. **The existing retry loop in `LLMService.send()` is refactored** to check `llmError.retryable` instead of calling `isRateLimitError()` / `isResourceExhaustedError()` with provider-specific heuristics. Those private helper methods — plus `extractErrorStatusCode`, `matchesStringStatus`, `handleSendError`, `throwTerminalSendError`, and `buildUnexpectedErrorMessage` — are removed from the abstract base class.
6. **The `HttpExceptionFilter`'s explicit `instanceof ResourceExhaustedError` branch is removed.** After migration `ResourceExhaustedError` extends `HttpException` with HTTP 503 embedded in the class, so the generic `instanceof HttpException` branch handles it identically — correct status code, and the production-sanitisation gate applies consistently with all other 5xx `LlmError` subclasses. No new `instanceof LlmError` branch is added in v1; richer response bodies for specific error types are deferred.
7. **All eight error categories** are in scope for v1 (see hierarchy below), plus `LlmServiceError` as a generic fallback for unclassifiable provider errors.
8. **`ZodError` bypasses `mapError()` entirely.** The base `send()` method checks `error instanceof ZodError` before calling `mapError()` and re-throws `ZodError` directly without wrapping. `ZodError` is a validation failure, not an upstream provider error, and must not be mapped to `LlmServiceError`. `GeminiService._sendInternal` already re-throws `ZodError` itself (for its own logging); the base-class check is the **authoritative** guard — providers that do not log `ZodError` specially need not duplicate it.
9. **Classification priority order** for ambiguous error shapes is contract-level, not per-provider. When a single error matches multiple patterns: (a) `ResourceExhaustedError` beats `RateLimitError`; (b) `ContentFilteredError` beats `ContextLengthExceededError` (the safety pattern wins when both appear); (c) specific 4xx classifications beat generic `InvalidRequestError`; (d) HTTP 5xx status beats network-style message strings (i.e., a 502-or-higher error with a `ECONNREFUSED` message is `ProviderServerError`, not `NetworkError`). **`NetworkError` is reachable only when no HTTP status code is extractable at all** — it classifies plain `Error` instances whose `.message` matches a network-failure pattern (e.g., `'connect ECONNREFUSED'`, `'ETIMEDOUT'`, `'fetch failed'`), **and** plain objects with no extractable `status`/`statusCode`/`code`/`response.status`/`error.status`/`error.code` field whose `.message` (if present) matches a network-failure pattern. Any object carrying a 5xx status takes the `ProviderServerError` classification per rule (d), even if its `.message` text looks like a network failure.
10. **5xx upstream errors become retryable (behaviour change).** Before this feature, a non-429 upstream error (including HTTP 500, 502, 503 from the provider) caused `LLMService.send()` to fail fast after a single attempt and throw a generic `Error` with message `"Failed to get a valid and structured response from the LLM."`. Under the new hierarchy, `ProviderServerError` (HTTP 502, `retryable = true`) and `NetworkError` (HTTP 502, `retryable = true`) are now retried up to `LLM_MAX_RETRIES` attempts with the existing exponential backoff, and the final thrown error carries HTTP 502 (not 500). This is an intentional behaviour change: from an API consumer's perspective, transient upstream 5xx failures are exactly the cases where retry-with-backoff is appropriate. The change must be documented in `docs/llm/error-handling.md` and flagged in the release notes. Any existing test that depends on a single attempt for a 5xx input (e.g., `gemini.service.spec.ts` "should not retry on non-429 errors") must be updated as part of this work.
11. **Unrecognised 4xx errors classify as `InvalidRequestError`.** A 4xx HTTP status code from the provider that is not matched by a specific classification (resource-exhausted, rate-limit, content-filtered, context-length, authentication) classifies as `InvalidRequestError` (HTTP 400, `retryable = false`), not as `undefined`. Rationale: returning `undefined` would cause the base class to wrap the error in `LlmServiceError` (HTTP 500), regressing a provider-returned 4xx to a 500 — a status-code regression for API consumers. `InvalidRequestError` preserves the 4xx semantics ("the provider rejected the request as malformed"). The only 4xx codes that map to `undefined` are those that are genuinely unclassifiable by the _provider's_ `mapError()` — and even then, only when no HTTP status is extractable. Note: `AuthenticationError` (401/403) is itself a specific 4xx classification and takes precedence over the generic `InvalidRequestError` rule per decision #9(c).
12. **`originalError` stores only `Error` instances.** The `originalError?: Error` field on `LlmError` (and all subclasses) stores the caught `_sendInternal` error **only when it is an `Error` instance**. When the original error is a non-`Error` value (e.g., a plain object, a string, or `null`), `originalError` is set to `undefined`. The `LlmServiceError` fallback message still uses `String(original)` for non-`Error` originals: `"LLM service error: Unknown error"`. This mirrors the existing `getErrorStack()` narrowing pattern (`isErrorObject(error) ? error.stack : undefined`) already used in `LLMService`. The base `send()` uses the preserved `isErrorObject()` helper for this narrowing — no new helper is introduced.

## Existing system constraints

### Backend constraints already in place

- `LLMService` is an abstract class with a single `send()` method containing the retry loop and an abstract `_sendInternal()` for provider implementations.
- `GeminiService` extends `LLMService` and wraps its `_sendInternal` in a try/catch that logs enriched context before re-throwing.
- `AssessorService.createAssessment()` catches, logs, and re-throws — it is a transparent pass-through for errors.
- The global `HttpExceptionFilter` currently handles `PayloadTooLargeError`, `ResourceExhaustedError` (explicit check), and generic `HttpException`/`Error` fallback.
- The project uses Vitest for all testing, with spec files co-located alongside source files.

### Current data-shape constraints

- The existing `ResourceExhaustedError` is a plain `Error` subclass (at `src/llm/resource-exhausted.error.ts`) with an `originalError` property — no HTTP status code is embedded in the class itself.
- No other LLM-domain error classes exist today; all other errors are raw SDK errors or generic `Error` instances.

### LLM provider error patterns already observed

- **Google Gemini (`@google/genai` SDK):** Throws `ApiError` with `{ message, status }` (numeric HTTP status), or errors with string `status`/`code` fields (`'RESOURCE_EXHAUSTED'`, `'RATE_LIMIT_EXCEEDED'`), or errors with nested `{ error: { status, code } }` shapes.
- **Expected future providers (OpenAI, Anthropic):** Typically throw errors with `status` (numeric) and `message` properties; OpenAI uses `type` strings like `'rate_limit_exceeded'`; Anthropic uses a structured error response with `type` and `status`.

## Domain and contract recommendations

### Error type hierarchy

All errors live under a common abstract base:

```
LlmError (abstract, extends HttpException)
├── RateLimitError              (429, retryable = true)
├── ResourceExhaustedError      (503, retryable = false)
├── ProviderServerError         (502, retryable = true)
├── AuthenticationError         (502, retryable = false)
├── ContentFilteredError        (400, retryable = false)
├── NetworkError                (502, retryable = true)
├── ContextLengthExceededError  (400, retryable = false)
├── InvalidRequestError         (400, retryable = false)
└── LlmServiceError             (500, retryable = false)  — fallback for unclassified errors
```

### `LlmError` base class contract

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

abstract class LlmError extends HttpException {
  readonly retryable: boolean;
  readonly providerName: string;
  readonly originalError?: Error;

  constructor(
    httpStatus: number,
    message: string,
    retryable: boolean,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) {
    // NestJS `HttpException`'s first parameter is the `response`. Passing a
    // bare `string` makes `getResponse()` return that string verbatim (not an
    // object with a `.message` field). The `HttpExceptionFilter`'s existing
    // `typeof exceptionResponse === 'string'` branch then picks up this string
    // and writes it into the response body's `message` field.
    //
    // IMPORTANT contract pin: every `LlmError` subclass MUST pass a bare
    // `string` as the first argument to `super(...)` (NOT an object such as
    // `{ message, statusCode }`). The `HttpExceptionFilter` response-body
    // extraction and the Section 4 production-sanitisation tests depend on
    // `getResponse()` returning a string; switching to an object response
    // would route through the filter's `'message' in exceptionResponse`
    // branch instead and silently change both the response shape and the
    // sanitisation behaviour for every `LlmError` subclass.
    //
    // The `message` passed to `super(...)` becomes the HTTP response body's
    // `message` field for any `LlmError` subclass that flows through the
    // filter's generic `HttpException` branch. In production, 5xx messages
    // (status >= 500) are sanitised to `"Internal server error"` by the
    // existing filter gate; 4xx messages are exposed unsanitised.
    super(message, httpStatus, { cause: options?.cause });
    this.retryable = retryable;
    this.providerName = providerName;
    this.originalError = options?.originalError;
  }
}
```

`LlmError` **is not constructable directly** — it is `abstract`. Each concrete subclass hardcodes its HTTP status (as a `number`) and `retryable` flag, accepting only `message`, `providerName`, and optional `originalError`/`cause`. The `originalError` should be the caught `Error` instance from the provider SDK; non-`Error` values **must not** be stored in `originalError` — see product decision #12. When the caught error is not an `Error` instance (verified via the preserved `LLMService.isErrorObject()` helper), `originalError` is set to `undefined`. The `LlmServiceError` fallback message still uses `String(original)` for non-`Error` originals (see "Retry behaviour changes").

### Provider identity contract

Each concrete `LLMService` subclass must declare:

```ts
protected abstract readonly providerName: string;
```

This is used by providers internally when constructing `LlmError` instances in `mapError()`, and is embedded in every `LlmError` instance (including fallback `LlmServiceError` instances created by the base class `send()` method) for logging and diagnostics. Example values: `'gemini'`, `'openai'`, `'anthropic'`.

### Provider error-mapping interface

Each concrete `LLMService` subclass must implement:

```ts
protected abstract mapError(error: unknown): LlmError | undefined;
```

The method receives the raw error caught from `_sendInternal` (except `ZodError`, which is re-thrown by the base class before `mapError()` is called) and returns the appropriate `LlmError` subclass. Providers read `this.providerName` internally when constructing error instances — the provider identity is available on the same instance and need not be passed as a parameter. Providers may use internal private helper methods (e.g., `extractStatusCode`, `hasStringStatus`) — these helpers are private to the provider, not shared in the base class.

If no known pattern matches the error, the provider **returns `undefined`**. The base class `send()` then wraps the original error from `_sendInternal` in a generic `LlmServiceError` with `retryable = false` and HTTP 500. The base class also wraps `mapError()` in a try/catch — if the mapping method itself throws, the base class catches the mapping error (for logging), then wraps the **original `_sendInternal` error** (not the mapping-thrown error) in a `LlmServiceError`. Providers may safely throw from `mapError()` for truly unexpected error shapes; the base class handles it gracefully.

**Non-object / `null` handling is a provider-implementation expectation, not an abstract contract.** The abstract `mapError(error: unknown): LlmError | undefined` does not require providers to guard against `null`, strings, or other non-object inputs. Providers **should** return `undefined` for unrecognised non-object inputs (this is the Gemini v1 implementation's stated behaviour and is tested in `gemini.service.spec.ts`), but a future provider that throws on `null` instead of returning `undefined` is still spec-compliant — the base-class `mapError()` try/catch catches the throw and wraps the **original** `_sendInternal` error in `LlmServiceError`. The "returns `undefined` for non-object inputs" expectation in the Gemini test suite is therefore a Gemini-implementation test, not a contract test for the abstract method.

### HTTP status code table

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

**Rationale for overlapping status codes:**

- `ProviderServerError`, `AuthenticationError`, and `NetworkError` all produce 502. This is intentional — from the API consumer's perspective, all three represent "the upstream provider is unreachable or misconfigured." They are distinguished by `providerName`, the error class name in logs, and the error message. Future work (deferred) may add an `errorCode` field to the response body for programmatic discrimination.
- An error carrying both an HTTP 5xx status and a network-style message string (e.g., `ApiError({ status: 500, message: 'connect ECONNREFUSED' })`) is classified by HTTP status first → `ProviderServerError`. Only errors with **no** extractable HTTP status code and a network-failure message pattern are classified as `NetworkError`.
- `ContentFilteredError` and `ContextLengthExceededError` both produce 400. 400 is what upstream providers return for these conditions (Gemini returns 400 for both; OpenAI also uses 400). When a single message matches both patterns (e.g., `"content safety filter blocked: context length"`), `ContentFilteredError` wins per the agreed classification priority order (product decision #9).
- `InvalidRequestError` produces 400 because the upstream provider rejected the request as structurally or semantically invalid. Even though this may indicate a bug in our request construction, 400 is the conventional upstream code and allows API consumers to differentiate "request-related" errors from "infrastructure-related" (502/503/429) errors.
- `AuthenticationError` produces 502 rather than 401 because the authentication failure is between our service and the upstream provider, not between the API consumer and our service. Returning 401 would incorrectly suggest the consumer needs to re-authenticate with us.

### Retry behaviour changes

- The retry loop in `LLMService.send()` first checks `error instanceof ZodError` and re-throws immediately without calling `mapError()` and without retrying.
- For non-`ZodError` errors, `send()` calls `this.mapError(error)`.
- Only errors where `retryable === true` are retried (with the existing exponential-backoff configuration from `LLM_MAX_RETRIES` and `LLM_BACKOFF_BASE_MS`). The backoff algorithm, jitter, and config keys are unchanged.
- Non-retryable errors, and retryable errors after exhausting retries, are thrown immediately.
- **5xx upstream errors are now retried (behaviour change — see product decision #10):** `ProviderServerError` (502) and `NetworkError` (502) carry `retryable = true`, so a transient upstream 5xx triggers up to `LLM_MAX_RETRIES` attempts before throwing. Before this feature, any non-429 error (including upstream 500/502/503) failed fast after a single attempt and threw a generic `Error`; the thrown type is now `ProviderServerError`/`NetworkError` (HTTP 502) rather than the old generic `Error` (HTTP 500).
- If `_sendInternal` throws an error that the provider's `mapError()` cannot classify (returns `undefined`), or if `mapError()` itself throws, the base class wraps the **original `_sendInternal` error** (not the `mapError()`-thrown error) in a `LlmServiceError` with `retryable = false`, HTTP 500, and `providerName` from `this.providerName`. The `LlmServiceError` message has the form: `"LLM service error: <original error.message>"` when the original is an `Error` instance (narrowed via the preserved `isErrorObject()` helper — see product decision #12), or `"LLM service error: Unknown error"` when the original is a non-`Error` value (e.g., a plain object, a string, or `null`). The `LlmServiceError.originalError` is set to the original `_sendInternal` error only when it is an `Error` instance; otherwise `originalError` is `undefined`. If `mapError()` threw, the mapping error is logged separately for diagnostics. This replaces the legacy `buildUnexpectedErrorMessage()` format, which is removed from the base class.
- Providers must not return non-`LlmError`, non-`undefined` values from `mapError()`; the base class does not validate the return type in v1.

### Provider name propagation

The abstract `providerName` property on each `LLMService` subclass is read by `send()` and embedded in `LlmServiceError` fallback instances. Each provider's `mapError()` implementation reads `this.providerName` internally when constructing its own `LlmError` instances. The resulting `LlmError` carries the provider identity in its `providerName` field for logging and diagnostics.

## Feature architecture

### Placement

- **Primary location:** `src/common/errors/` — a directory containing error class files and a barrel `index.ts`.
- **Shared import path:** Consumers import error classes statically from `src/common/errors/index.js`. No NestJS module wrapper is needed — error classes are plain TypeScript classes instantiated via `new`, not injected through DI.
- **HTTP filter integration:** The `HttpExceptionFilter` (`src/common/`) imports errors from the barrel. Since all new errors extend `HttpException`, the filter handles them through its existing `instanceof HttpException` branch. The explicit `instanceof ResourceExhaustedError` check in the filter is removed — after migration `ResourceExhaustedError` extends `HttpException` with HTTP 503, so the generic branch handles it identically (and applies the production-sanitisation gate consistently with all other 5xx errors).

### Proposed high-level tree

```text
src/common/errors/
├── llm-error.base.ts                   # Abstract LlmError extends HttpException
├── rate-limit.error.ts
├── resource-exhausted.error.ts         # Migrated from src/llm/, re-parented under LlmError
├── provider-server.error.ts
├── authentication.error.ts
├── content-filtered.error.ts
├── network.error.ts
├── context-length-exceeded.error.ts
├── invalid-request.error.ts
├── llm-service.error.ts                # Generic fallback (LlmServiceError)
└── index.ts                            # Barrel re-export
```

### Out of scope for this surface

- Error handling for non-LLM subsystems (auth guards, throttler, file upload).
- Retry logic changes beyond switching to the `retryable` flag (no change to backoff algorithm, jitter, or config keys).
- Provider error-mapping implementations for providers other than Gemini (Gemini's `mapError()` is in scope for v1; other providers are implemented when each new provider is added).
- `errorCode` / `retryAfter` fields in the HTTP response body.
- Per-error-type retry counts or circuit breaking.

## Data loading and orchestration

The error classes have no runtime data dependencies — they are purely a library of classes. They are imported statically by consumers (`LLMService`, `GeminiService`, `HttpExceptionFilter`) at build time via ES module imports from `src/common/errors/index.js`.

No NestJS module wiring, prefetching, lazy loading, or refresh concerns apply. The single barrel import is the canonical entry point.

## Workflow specification

### Provider adds error mapping

1. Provider service (e.g., `GeminiService`) implements `mapError(error: unknown): LlmError | undefined`.
2. The implementation inspects the native error shape (status codes, message patterns, string type/code fields) and returns the most specific `LlmError` subclass, reading `this.providerName` to embed provider identity.
3. If no pattern matches, the provider returns `undefined` — the base class wraps it in `LlmServiceError`.
4. The mapping is unit-tested in isolation in the provider's spec file, using representative error shapes from that provider's SDK.

### Base class retry loop (refactored)

1. `LLMService.send()` calls `_sendInternal(payload)` inside the existing retry loop.
2. On error, `send()` first checks `error instanceof ZodError` and re-throws immediately (no retry, no `mapError()` call).
3. For non-`ZodError` errors, `send()` calls `this.mapError(error)` to obtain an `LlmError | undefined`.
4. If `mapError()` returns `undefined` or throws, `send()` wraps the original error in `new LlmServiceError(message, this.providerName, { originalError })` with `retryable = false`.
5. If the resulting `LlmError` instance has `retryable === true` and retries remain → wait with exponential backoff and retry.
6. If `retryable === false` or retries exhausted → throw the `LlmError`.

### HTTP exception filter (updated)

1. `HttpExceptionFilter.catch()` receives an exception.
2. If `exception instanceof HttpException` → existing generic handler fires, using the status code from the exception.
3. Since all `LlmError` subclasses (including the migrated `ResourceExhaustedError`) are `HttpException`, they flow through step 2 with their correct status codes (429, 400, 502, 503, 500).
4. The explicit `instanceof ResourceExhaustedError` branch is **removed** — after migration the class embeds HTTP 503 via the `LlmError` base, so the generic branch handles it identically and applies the 5xx production-sanitisation gate consistently.
5. Non-HttpException errors (unlikely after refactor, but as a safety net) still hit the filter's 500 fallback.
6. **Error message policy:** Full error details (including `originalError`, stack trace, and `providerName`) are logged server-side at the appropriate level. The HTTP response body carries a brief, stable message — the `LlmError` subclass message or, in production for 5xx errors (status ≥ 500), the filter's existing `"Internal server error"` sanitisation. 4xx messages (400, 429) are **not** sanitised in production since they convey actionable information to API consumers. This applies to all `LlmError` subclasses: `RateLimitError` (429), `InvalidRequestError`/`ContentFilteredError`/`ContextLengthExceededError` (400) produce unsanitised provider-derived messages, while `ProviderServerError`/`AuthenticationError`/`NetworkError`/`ResourceExhaustedError` (502/503) and `LlmServiceError` (500) are sanitised in production.

## Error, loading, and empty-state rules

Not applicable to a backend error library — no UI states.

## Backend changes required

1. **Create `src/common/errors/` directory** with all nine error classes (eight categories + `LlmServiceError`), the abstract `LlmError` base, and a barrel `index.ts`. No NestJS module wrapper.
2. **Migrate `ResourceExhaustedError`** from `src/llm/resource-exhausted.error.ts` to `src/common/errors/resource-exhausted.error.ts`. Update its constructor to extend `LlmError` and accept `message`, `providerName` (defaulting to `'unknown'`), and the new `options` shape. Preserve the existing `originalError` behaviour. **Update the call site in `LLMService.handleSendError()`** to `new ResourceExhaustedError(msg, 'unknown', { originalError: error })` — the existing object-second-arg form does not compile against the new `(message, providerName, options?)` signature. Remove the old file. Update imports in `HttpExceptionFilter` and the affected test files (`llm.service.interface.spec.ts`, `gemini.service.spec.ts`, `resource-exhausted.error.spec.ts`, `http-exception.filter.spec.ts`).
3. **Add abstract members to `LLMService`:** `protected abstract readonly providerName: string;` and `protected abstract mapError(error: unknown): LlmError | undefined;`.
4. **Refactor `send()` retry loop** in `LLMService` to (a) check `ZodError` first and re-throw directly, (b) call `this.mapError(error)` on non-`ZodError` errors, and (c) branch on the resulting `LlmError` instance's `retryable` flag instead of calling the old private detection helpers.
5. **Remove the following private methods** from `LLMService`: `isRateLimitError()`, `isResourceExhaustedError()`, `extractErrorStatusCode()`, `matchesStringStatus()`, `handleSendError()`, `throwTerminalSendError()`, and `buildUnexpectedErrorMessage()`. Their logic is either inlined into the refactored `send()` method or has been superseded by `LlmError`-based branching. The following methods are **preserved**: `sendAttempt()`, `waitBeforeRetry()`, `sleep()`, `describePayload()`, `isErrorObject()`, and `getErrorStack()`.
6. **Implement `mapError()` in `GeminiService`** using the detection patterns currently in the base class (extracted and adapted as private helper methods within `GeminiService`). Rename `extractErrorStatusCode` to `extractStatusCode` and `matchesStringStatus` to `hasStringStatus`. Each error instance is constructed with `this.providerName` (no parameter needed). Cover all error categories the Gemini SDK can produce, following the agreed classification priority order (product decisions #9 and #11). Per decision #11, any 4xx HTTP status not matched by a specific classification (resource-exhausted, rate-limit, content-filtered, context-length, authentication) falls through to `InvalidRequestError` — not `undefined` — to avoid regressing a provider 4xx to a `LlmServiceError` (HTTP 500).
7. **Declare `providerName` in `GeminiService`** as `protected readonly providerName = 'gemini'`.
8. **Update `HttpExceptionFilter`** to import `ResourceExhaustedError` from the new barrel path. **Remove** the explicit `instanceof ResourceExhaustedError` branch and its private `handleResourceExhaustedError` method — the migrated error extends `HttpException` with HTTP 503 and is handled identically by the generic branch. No other filter changes are required for v1.
9. **Update `CommonModule`** — no change. Error classes are imported statically, not wired through module `imports`/`exports`.
10. **Update `LlmModule`** — no structural change needed. Error classes are imported by consumers directly from the barrel.
11. **Audit for the 5xx-retryable behaviour change (product decision #10).** The only existing test that depends on a single attempt for a 5xx input from the provider is `gemini.service.spec.ts`'s "should not retry on non-429 errors" test (currently `ApiError({ status: 500, message: 'Server error' })`), already enumerated as Section 3 test #23 in `ACTION_PLAN.md`. The `src/v1/assessor/assessor.service.ts` is a transparent pass-through (lines 53–61: it catches, logs, and re-throws without inspecting error type) and has no 5xx-specific assertions, so the assessor tree needs **no** test changes. The E2E suite (`test/**/*.e2e-spec.ts`) sets `E2E_MOCK_LLM=true` via `vitest.e2e.setup.ts`, substituting a happy-path LLM response, so no E2E test exercises a provider 5xx path and none needs updating. A grep for `'Failed to get a valid and structured response'` (the legacy `LlmServiceError` message) across the repo confirms the only consumer is `gemini.service.spec.ts` (asserted at lines 156, 180, 221) plus the source string itself (deleted in Section 2); the response-body contract change from `'Failed to get a valid and structured response from the LLM.'` to `'LLM service error: <original>'` therefore touches **only** the test already enumerated in Section 3 test #23, and is not a separate workstream. Any newly-introduced test discovered during implementation that depends on a single attempt for a 5xx input must still be updated as part of this work, not deferred.
12. **Update test files:**
    - `llm.service.interface.spec.ts`: This file undergoes a **substantial rewrite**. The current `ExposedLLMService` test subclass exposes private error-detection methods that no longer exist. These tests are replaced with tests that verify the retry loop behaviour against `LlmError` subclasses with known `retryable` flags. A new test subclass exposes `mapError()` and uses a spy/mock to verify the retry/throw branching.
    - `gemini.service.spec.ts`: Existing tests for retry logic and resource-exhausted handling are updated to reflect the new `mapError()`-based flow. Several existing assertions change: (a) the "500 ApiError → no retry" test now expects `ProviderServerError` (retryable, retries up to `LLM_MAX_RETRIES` then throws `ProviderServerError`), (b) the "SDK Error" test now expects `LlmServiceError` (not the legacy message), (c) the "non-429 error" test expects `InvalidRequestError` (for 4xx inputs) or `LlmServiceError` (for unclassifiable non-4xx inputs) depending on the shape. New tests added for each error category that `GeminiService.mapError()` can produce.
    - `resource-exhausted.error.spec.ts`: Migrated to the new module and updated for the `LlmError` constructor change. All constructor call sites are rewritten: `new ResourceExhaustedError('msg', { originalError })` → `new ResourceExhaustedError('msg', 'test-provider', { originalError })`, single-arg forms gain an explicit `providerName` or rely on the default. `instanceof Error` assertions change to `instanceof HttpException`/`instanceof LlmError`. This rewrite is part of Section 1 — the spec file is not deferred.
    - `http-exception.filter.spec.ts`: Updated import path for `ResourceExhaustedError`. The existing `ResourceExhaustedError → 503 response` test is **removed** (the explicit branch no longer exists). Two new tests: one verifying that a 503 `LlmError` subclass (`ResourceExhaustedError`) flows through the generic `HttpException` branch and produces the correct 503 status and message; another verifying it is sanitised to `"Internal server error"` in production. A new test verifies that a 502 `LlmError` subclass (e.g., `ProviderServerError`) is sanitised to `"Internal server error"` in production; another verifies a 400 `LlmError` subclass is **not** sanitised in production.
    - `assessor.service.spec.ts`: No structural changes; regression check only.

## Testing expectations

- **Unit tests for each error class (new):** Verify correct HTTP status, `retryable` flag, `providerName` storage, `originalError` storage, and correct inheritance chain (`instanceof LlmError`, `instanceof HttpException`).
- **Unit tests for `GeminiService.mapError()` (new):** Cover all nine error categories with representative Gemini SDK error shapes. For each test case, assert the returned `LlmError` class, status code, and `retryable` flag. Include edge cases: non-Error values, undefined/null errors, and completely unrecognised shapes (expecting `undefined` return).
- **Refactored base-class tests (rewritten):** The existing `llm.service.interface.spec.ts` tests for `isRateLimitError`/`isResourceExhaustedError`/`extractErrorStatusCode` are replaced. New tests verify:
  - Retryable `LlmError` subclasses trigger retries (up to `LLM_MAX_RETRIES`).
  - Non-retryable `LlmError` subclasses throw immediately without retry.
  - Fallback to `LlmServiceError` when `mapError()` returns `undefined`.
  - Fallback to `LlmServiceError` when `mapError()` throws.
  - Retryable errors after max retries are thrown as-is.
- **Regression on `assessor.service.spec.ts`** and **`gemini.service.spec.ts`**: Ensure no behaviour change in the assessor pipeline.
- **`HttpExceptionFilter` tests**: Verify that a 503 `LlmError` subclass (`ResourceExhaustedError`) flowing through the generic `HttpException` branch produces a 503 response and is sanitised to `"Internal server error"` in production. Verify that a 502 `LlmError` subclass is similarly sanitised; a 400 `LlmError` subclass is **not** sanitised; a 429 `LlmError` subclass is **not** sanitised.

## V1 scope recommendation

### Include in v1

- All eight domain error classes plus the abstract `LlmError` base and `LlmServiceError` fallback.
- Barrel `index.ts` for shared import path.
- Abstract `mapError()` and `providerName` on `LLMService`, plus retry-loop refactor.
- `GeminiService.mapError()` implementation covering all nine error categories, including the unrecognised-4xx → `InvalidRequestError` default (product decision #11).
- The 5xx-retryable behaviour change (product decision #10), including the assessor/E2E audit and the release-note flag.
- Removal of the old private detection methods from the base class and the explicit `ResourceExhaustedError` handler from `HttpExceptionFilter`.
- `ResourceExhaustedError` migration to `src/common/errors/`.
- Update of `docs/modules/llm.md` to remove the stale `ResourceExhaustedError` constructor snippet (the doc currently shows `extends Error` with `originalError` as a constructor positional arg, which is inaccurate even pre-migration).
- All tests listed above.

### Defer from v1

- Provider implementations for OpenAI, Anthropic, or any other provider (these use the new infrastructure when they are added).
- Retry-After headers or enhanced error response bodies (`retryAfter`, `errorCode` fields).
- Custom response formatting in `HttpExceptionFilter` for specific `LlmError` subclasses (e.g., different JSON shape for rate-limit vs. server errors).
- Retry strategy changes (jitter configuration, per-error-type retry counts, circuit breaking).

## Resolved questions

1. **Error message exposure to API consumers:** Full diagnostic details are **logged server-side**. The HTTP response carries a brief message: 5xx errors are sanitised to `"Internal server error"` in production (existing filter behaviour); 4xx errors (400, 429) carry their `LlmError` subclass message unsanitised, since they convey actionable information to API consumers.

2. **`LlmServiceError` naming:** Confirmed as `LlmServiceError`. The name reflects its role as a catch-all for unclassifiable provider errors within the LLM service layer.

3. **`ZodError` HTTP response behaviour:** `ZodError` bypasses `mapError()` and is re-thrown directly by the base `send()` method. It is **not** an `HttpException` subclass, so the `HttpExceptionFilter` handles it through its generic `Error` fallback (HTTP 500). In production, the 500 sanitisation gate applies, so `ZodError` messages are sanitised to `"Internal server error"` for API consumers. This preserves the **existing** behaviour (before this feature, `ZodError` already followed this path). Changing `ZodError` to produce a 400 with an exposed message is a separate enhancement and is **deferred** from v1.

4. **Legacy fallback message removal audit:** A repo-wide grep for `"Failed to get a valid and structured response from the LLM."` (the legacy `LLMService.send()` failure message, replaced by the `LlmServiceError` format in v1) confirms the only consumers are `src/llm/gemini.service.spec.ts` (asserted at lines 156, 180, 221 — all updated by `ACTION_PLAN.md` Section 3 test #23) and the source string itself in `src/llm/llm.service.interface.ts` line 177 (deleted in Section 2). No `src/v1/assessor/` test, E2E test, or doc asserts against the legacy string; the response-body contract change is fully contained in the test already enumerated in Section 3 test #23, and is not a separate workstream.

5. **429 message exposure — leak risk reviewed and accepted:** The 429-unsanitised decision (Resolved question #1) was reviewed against the leak-risk concern that raw upstream Gemini rate-limit messages may carry internal project or quota identifiers. The decision is **confirmed**: 429 messages are exposed unsanitised to API consumers in production, as-is. The actionable-diagnostic value (the consumer can see _which_ upstream limiter fired and adjust their own consumption) outweighs the low-sensitivity leak surface of provider-internal identifiers in the response body. Full diagnostic context — including `providerName` and `originalError` stack — remains server-side-only in logs, as in Resolved question #1. No sanitisation or message-substitution is to be applied to 429 responses in this feature or in the release notes; the `HttpExceptionFilter`'s existing `status >= 500` sanitisation gate continues to handle 5xx only.

6. **`waitBeforeRetry` log message — kept verbatim:** The existing `LLMService.waitBeforeRetry()` warn log message says `"Rate limit encountered on attempt ${attempt + 1}/${maxRetries + 1}. Retrying in ${delay}ms. Error: ..."`. After Section 2's refactor this path is exercised by **any** retryable error (429 `RateLimitError`, 5xx `ProviderServerError`, 5xx `NetworkError`), not just rate-limit errors. Reviewed and decided: **keep the message verbatim** — no rewrite to a more generic phrasing such as `"Retryable error encountered"` is to be made in this feature. The decision is recorded to avoid a recurring low-value churn item; if a future feature restructures the warn-log payload it may revisit the wording, but that is out of scope here.

## Documentation conventions

- **Shared-helper canonical doc (deliberate deviation):** This repository has no canonical shared-helper doc. The `ACTION_PLAN.md` companion document is the **record** for shared-helper decisions for this feature (see its "Global constraints and quality gates" → "Shared-helper planning gate" subsection, which states the deviation up front). The `ACTION_PLAN.md` template's mandatory step #3 — _"add planned helper entries to the relevant canonical docs with status `Not implemented`"_ — is therefore skipped by design: helper decisions are recorded inline in the relevant `Shared helper plan` block (see ACTION_PLAN Section 3) and reconciled inline in Section 5's documentation pass. Future specs in this repo may inherit the same convention; do not reintroduce the template step unless a canonical shared-helper doc is added to `docs/` first.

- **E2E mocking mechanism:** The mocked E2E test project (`npm run test:e2e`) is gated by `vitest.e2e.setup.ts`, which sets `process.env.E2E_MOCK_LLM='true'`; the `test/utils/app-lifecycle.ts` module then loads an ESM preload shim (`test/utils/llm-mock.mjs`) that patches the Gemini SDK in the spawned child process to return a happy-path response. No E2E test therefore exercises a provider-thrown `LlmError` subclass through the live filter chain; the new error contracts are covered at the unit/integration level (see `ACTION_PLAN.md` Section 4's "E2E gap note" and the per-error-class unit tests). Future extensions that want E2E coverage of provider error paths must disable the shim or add a new variant.
