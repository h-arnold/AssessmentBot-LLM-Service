# LLM Error Handling

## Overview

This document describes the centralised LLM error handling library at
`src/common/errors/`. The library provides a consistent, typed error hierarchy
that the two shipped LLM providers (Gemini and Mistral) map their native SDK
errors into. It enables the base `LLMService` retry logic to work against a
standard `retryable` contract. The global `HttpExceptionFilter` turns any thrown
`LlmError` into an HTTP response through the generic `HttpException` branch.

- **Location:** `src/common/errors/` — each error class is defined in its own module.
- **Base class:** `LlmError` (abstract, extends `HttpException`).
- **Consumer imports:** `import { LlmError } from '../common/errors/llm-error.base.js';` and `import { ProviderServerError } from '../common/errors/provider-server.error.js';`

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
  which matches the status upstream providers return for these conditions.
- `AuthenticationError` produces 502 rather than 401 because the authentication
  failure is between our service and the upstream provider, not between the API
  consumer and our service.
- `LlmServiceError` produces 500 because it represents an unclassifiable error
  that should never have reached the consumer — it is a fallback safety net.

---

## Structural Payload Validation (`ZodError`)

Multi-part conversation payloads are validated **once, at construction**, by
`buildMultiPartPromptPayload()` in `src/prompt/prompt.base.ts`, which calls
`MultiPartPromptPayloadSchema.parse()`. A structurally invalid payload (empty
`messages`/`parts`, a system-only conversation, an unknown role or `kind`, a
non-string `text`, malformed or oversized image `data`, an invalid `mimeType`,
or wrong shared-option types) throws a raw `ZodError` before any provider is
contacted. `RoutingLLMService.send()` and the base `LLMService.send()` consume
the branded validated payload and do not re-parse it.

This is separate from the `ZodError` bypass inside `LLMService.send()`. A
`ZodError` raised while validating the provider **response** (`LlmResponseSchema`)
is re-thrown directly, bypassing `mapError()` and retry. Neither path produces an
`LlmError` subclass; both remain outside the error-classification contract above.

---

## Adding a New LLM Provider

To add error mapping for a new LLM provider, follow these steps:

### 1. Declare `providerName`

In your concrete `LLMService` subclass, add a `protected readonly providerName`
property. This value is embedded in every `LlmError` instance created by the
provider (including fallback `LlmServiceError` instances from the base class).

```typescript
protected readonly providerName = '<provider-id>';
```

Replace `<provider-id>` with the new provider's identifier. Each new provider
also supplies its own probe configuration (see below).

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
`src/llm/llm-error-mapper.ts` (`classifyLlmError`), together with the exported
`LlmErrorMapperProbes` interface and the `normaliseStatusCode()` utility. The
[priority order, retryability and 4xx/5xx mapping](#classification-priority-order-rules)
are implemented once inside `classifyLlmError`. A provider does **not**
re-implement the orchestration; it supplies an `LlmErrorMapperProbes`
configuration object describing its SDK's error shape and delegates from
`mapError()`:

```typescript
protected mapError(error: unknown): LlmError | undefined {
  return classifyLlmError(MY_PROBES, error);
}
```

The probe configuration contains:

- `providerName` — embedded in every produced `LlmError`.
- `extractStatusCode(error)` — returns a numeric HTTP status from the SDK's
  status-bearing fields (e.g. `error.status`, `error.statusCode`,
  `error.code`, `error.response.status`). Use `normaliseStatusCode()` to
  coerce string values to numbers.
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

The two shipped consumers are `GeminiService` (`GEMINI_PROBES`) and
`MistralService` (`MISTRAL_PROBES`). Neither re-implements the shared helpers;
see their spec files and `llm-error-mapper.spec.ts` for coverage.

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
   Returning `undefined` for a 4xx would regress the provider-returned 4xx to a
   500 (`LlmServiceError`).
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
- The non-object guard is applied centrally by `classifyLlmError` for every
  provider: it returns `undefined` for `null`, falsy and non-object inputs.

---

## Retryability of Server Errors

`ProviderServerError` and `NetworkError` are retryable. The base `LLMService.send()` loop retries them up to `LLM_MAX_RETRIES` with exponential backoff. Both reach the client as HTTP 502.

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

## `originalError` Narrowing

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

## Non-Object Guard

The non-object guard lives in the shared cascade; see
[Classification Priority-Order Rules](#classification-priority-order-rules).
Every provider inherits it through its `mapError()` delegate.

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
- **Test non-object / `null` / `undefined` inputs:** Verify `mapError()` returns
  `undefined` for these inputs; the central guard in `classifyLlmError` handles
  them before any probe runs (see
  [Classification Priority-Order Rules](#classification-priority-order-rules)).
- **Test the unrecognised-4xx default:** A 4xx error with no specific pattern
  match (e.g. `{ status: 404, message: 'Not Found' }`) must return
  `InvalidRequestError`, not `undefined`.

---

## Mistral Provider

`MistralService` (`src/llm/mistral.service.ts`) is one of the two routed providers.
`RoutingLLMService` resolves its provider in the constructor from the registered
Mistral prefixes (`mistral-small-latest`, `pixtral-`, `open-mistral-`) in the model
registry (`src/llm/model-registry.ts`) and dispatches to it at send time. Its error
mapping delegates to `classifyLlmError` via `MISTRAL_PROBES`.

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

### Classification behaviour

Classification follows the [shared priority order](#classification-priority-order-rules). The only provider-specific difference is that `hasStringStatus` is always `false` for Mistral, so the `RESOURCE_EXHAUSTED` / `RATE_LIMIT_EXCEEDED` string-status short-circuits never fire. Mistral rate-limit and quota errors are recognised through numeric `429` and the message patterns in `classifyLlmError`.

### Testing conventions

Shared cascade tests live in `llm-error-mapper.spec.ts`; Mistral SDK-specific
cases live in `mistral.service.spec.ts`.
