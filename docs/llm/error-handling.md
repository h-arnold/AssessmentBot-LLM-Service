# LLM Error Handling

## Overview

This document describes the centralised LLM error handling library at
`src/common/errors/`. The library provides a consistent, typed error hierarchy
that all LLM provider implementations (Gemini, Mistral, future OpenAI,
Anthropic, etc.)
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

### 3. Supply provider-specific probes to the shared `classifyLlmError` helper

All classification logic lives in the shared helper
`src/llm/llm-error-mapper.ts` (`classifyLlmError`). A provider does **not**
re-implement the orchestration; instead it supplies a
`LlmErrorMapperProbes` configuration object (see the `LlmErrorMapperProbes`
interface in that file) describing its SDK's error shape, and `mapError()`
delegates:

```typescript
protected mapError(error: unknown): LlmError | undefined {
  return classifyLlmError(MY_PROBES, error);
}
```

The probe configuration contains:

- `providerName` — embedded in every produced `LlmError`.
- `extractStatusCode(error)` — returns a numeric HTTP status from the SDK's
  status-bearing fields (e.g. `error.status`, `error.statusCode`,
  `error.code`, `error.response.status`). Use the exported
  `normaliseStatusCode()` utility to coerce string values to numbers.
- `hasStringStatus(error, value)` — case-insensitive string-status match
  (e.g. `'RESOURCE_EXHAUSTED'`). Return `false` if the SDK has no string-status
  convention (as Mistral does).
- `networkPattern` — a `RegExp` matching network-failure messages
  (`ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network`). The
  pattern is shared across providers; copy it from an existing probe config.
- `isHttpClientError(error)` — **optional**; matches transport-layer
  `HTTPClientError` subclass names. Omit (or return `false`) when the SDK has
  no such concept. **Beware name collisions:** do not include SDK class names
  that also exist as `LlmError` subclasses (e.g. Mistral's `InvalidRequestError`
  is excluded from its probe's list — see the Mistral subsection below).

This design means the priority order, retryability, and 4xx/5xx mapping remain
identical across providers; only the SDK-specific shape probing differs.

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

In practice, both `GeminiService.mapError()` and `MistralService.mapError()`
return `undefined` for non-object and falsy inputs (`if (!error || typeof error
!== 'object') { return undefined; }`). This is a provider-implementation choice
and is tested in `gemini.service.spec.ts` and `mistral.service.spec.ts`. Future
providers may choose to throw instead; both behaviours are spec-compliant.

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

## Worked Example: the shared `classifyLlmError` helper (canonical pattern)

The classification logic is **shared**, not duplicated per provider. It lives
in `src/llm/llm-error-mapper.ts` (`classifyLlmError`) together with the exported
`LlmErrorMapperProbes` interface and the `normaliseStatusCode()` utility. The
priority order, retryability, and 4xx/5xx mapping in "Classification
Priority-Order Rules" are implemented **once** inside `classifyLlmError`.

Each provider supplies only a `LlmErrorMapperProbes` configuration object and
delegates from its `mapError()`:

```typescript
import { classifyLlmError, type LlmErrorMapperProbes } from './llm-error-mapper.js';

protected mapError(error: unknown): LlmError | undefined {
  return classifyLlmError(MY_PROBES, error);
}
```

`classifyLlmError` performs (in priority order, highest first):
`ResourceExhaustedError` → `RateLimitError` → `AuthenticationError` →
`ContentFilteredError` → `ContextLengthExceededError` → `InvalidRequestError`
(any unrecognised 4xx, decision #11) → `ProviderServerError` (any 5xx) →
`NetworkError` (no status + network/`isHttpClientError` match) → `undefined`.

The provider-supplied probes describe only the SDK-specific shape:

- `extractStatusCode(error)` — probes the SDK's status-bearing fields, using
  `normaliseStatusCode()` to coerce strings to numbers.
- `hasStringStatus(error, value)` — case-insensitive string-status match (e.g.
  `'RESOURCE_EXHAUSTED'`). Return `false` when the SDK has no string-status
  convention (as Mistral does).
- `networkPattern` — a shared `RegExp` (`ECONNREFUSED|ETIMEDOUT|ECONNRESET|
ENOTFOUND|fetch failed|network`).
- `isHttpClientError(error)` — optional; matches transport-layer subclass
  names. See the Mistral subsection for the name-collision caveat.

`GeminiService` (`GEMINI_PROBES`) and `MistralService` (`MISTRAL_PROBES`) are
the two consumers; neither re-implements `extractStatusCode`/`hasStringStatus`/
`isResourceExhausted`/`isRateLimit`/`buildError`/`extractMessage` — those live
only in the shared helper. See `src/llm/llm-error-mapper.ts` and the
provider spec files (`gemini.service.spec.ts`, `mistral.service.spec.ts`, and
the synthetic-probe suite `llm-error-mapper.spec.ts`) for the complete
implementation and coverage.

---

## Mistral Provider

`MistralService` (`src/llm/mistral.service.ts`) is the second routed provider.
It is selected at send time when the resolved model id has a `mistral-` prefix
(see the model registry in `src/llm/model-registry.ts`). Its error mapping
delegates to `classifyLlmError` via `MISTRAL_PROBES`.

### SDK error shapes

- `MistralError` carries a numeric `statusCode` (probed first by
  `extractStatusCode`). Non-`MistralError` inputs fall back to `status`,
  `code`, and `response.status` for parity with the Gemini probes.
- The raw response body is available on `error.body` and is treated as a
  secondary message source by the shared `extractMessage` helper (alongside
  `error.message`).
- Transport-layer failures surface as `HTTPClientError` subclasses with
  distinctive `name` strings.

### Probe configuration (`MISTRAL_PROBES`)

- `providerName: 'mistral'`.
- `hasStringStatus` returns `false` — Mistral errors do not use string-status
  conventions.
- `isHttpClientError` matches the transport-layer subclass `name` strings:
  `ConnectionError`, `RequestTimeoutError`, `RequestAbortedError`,
  `UnexpectedClientError`. It deliberately **excludes** `InvalidRequestError` to
  avoid a name collision with our own `InvalidRequestError` `LlmError`
  subclass. (If a future SDK version renames these or adds a colliding class,
  revisit this exclusion.)
- `networkPattern` is the shared pattern above.

### Classification priority

Identical to the shared cascade (highest first):
`ResourceExhaustedError` → `RateLimitError` → `AuthenticationError` →
`ContentFilteredError` → `ContextLengthExceededError` → `InvalidRequestError`
→ `ProviderServerError` → `NetworkError` → `undefined`. Because `hasStringStatus`
is always `false` for Mistral, the string-status short-circuits
(`RESOURCE_EXHAUSTED` / `RATE_LIMIT_EXCEEDED`) never fire; Mistral rate-limit
and quota errors are instead recognised via numeric `429` and the message
patterns in `classifyLlmError`.

### Testing conventions

- `mistral.service.spec.ts` exercises `mapError()` with representative Mistral
  SDK error shapes (numeric `statusCode`, `error.body`, and the
  `HTTPClientError` subclass `name`s), covering every `LlmError` subclass, the
  unrecognised-4xx → `InvalidRequestError` default, non-object/`null`/`undefined`
  inputs, and priority conflicts.
- `llm-error-mapper.spec.ts` validates the shared cascade directly with
  **synthetic probes** (provider-agnostic), so the priority order and 4xx/5xx
  mapping are tested once, independent of any SDK.
- Follow the generic "Testing Conventions" above for any new provider; prefer
  synthetic-probe coverage in `llm-error-mapper.spec.ts` for shared behaviour
  and SDK-specific coverage in the provider's own spec.
