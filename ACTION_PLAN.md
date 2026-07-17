# Feature Delivery Plan (TDD-First): Centralised LLM Error Handling Library

## Read-First Context

Before writing or executing this plan:

1. Read the current `SPEC.md` (v1.5 or later — it carries product decisions #10, #11, and #12, plus the v1.5 corrections to decision #4 and the `LlmError` base-class contract that this plan relies on). The v1.5 change history (top of `SPEC.md`) summarises the corrections.
2. Read `AGENTS.md` for project conventions.
3. Read `docs/testing/README.md` and `docs/testing/PRACTICAL_GUIDE.md` for testing guidance.
4. Read the following source files for current error-handling context:
   - `src/llm/llm.service.interface.ts` — the abstract `LLMService` base class with the retry loop
   - `src/llm/gemini.service.ts` — `GeminiService._sendInternal` error handling
   - `src/llm/resource-exhausted.error.ts` — existing error class to be migrated
   - `src/common/http-exception.filter.ts` — global exception filter
   - `src/common/common.module.ts` — module wiring (confirmed: no `ErrorsModule` needed; error classes are imported statically. Read to verify nothing needs adding here.)
   - `src/llm/llm.module.ts` — LLM module wiring (confirmed: no structural change needed per SPEC §"Backend changes required" items 9–10. Read to verify nothing needs adding here.)

Treat the `SPEC.md` as the source of truth for product behaviour, contracts, and error type hierarchy. Do not restate material already settled in the spec.

## Scope and assumptions

### Scope

- Create a `src/common/errors/` directory with nine concrete error classes, an abstract `LlmError` base, and a barrel `index.ts`.
- Migrate the existing `ResourceExhaustedError` from `src/llm/` into the new directory, re-parenting it under `LlmError`.
- Add abstract `providerName` and `mapError()` members to `LLMService`.
- Refactor `LLMService.send()` retry loop to use `LlmError.retryable`.
- Remove all provider-specific error-detection helpers from the abstract base class.
- Remove the explicit `instanceof ResourceExhaustedError` branch and its private handler method from `HttpExceptionFilter` (the migrated error extends `HttpException` with HTTP 503 and is handled identically by the generic branch).
- Implement `mapError()` in `GeminiService` with Gemini-specific error classification, including the unrecognised-4xx → `InvalidRequestError` default (SPEC product decision #11).
- Update `HttpExceptionFilter` imports for `ResourceExhaustedError` (barrel path).
- Audit for the 5xx-retryable behaviour change (SPEC product decision #10). The audit is **scoped to `src/llm/gemini.service.spec.ts`**: the "should not retry on non-429 errors" test (currently `ApiError({ status: 500 })`, single attempt) is the **only** existing test that depends on a single attempt for a 5xx input from the provider — it is already enumerated as Section 3 test #23. The `src/v1/assessor/` tree is a transparent pass-through and needs no changes; the E2E suite is mocked happy-path (`vitest.e2e.setup.ts`, `E2E_MOCK_LLM=true`) and needs no changes. A repo-wide grep for the legacy `'Failed to get a valid and structured response'` message confirms `gemini.service.spec.ts` is the only consumer — see SPEC §"Backend changes required" item 11 for the full audit findings.
- Create a developer guide (`docs/llm/error-handling.md`) documenting how to add new LLM providers and wire their error mapping, including the 5xx-retryable behaviour change.
- Update `AGENTS.md` to reference the new developer guide so future agents know to consult it when adding providers or error types.
- Update `docs/modules/llm.md` to remove the stale `ResourceExhaustedError` constructor snippet and point to the new developer guide.
- Test all new and changed code at the unit level; run regression on affected test suites.

### Out of scope

- Provider implementations for OpenAI, Anthropic, or any provider other than Gemini.
- Retry-After headers, `errorCode` response fields, or custom filter response shaping.
- Changes to the backoff algorithm, jitter, or retry-configuration keys.
- New E2E tests that exercise `LlmError` subclasses through the live filter chain (the mocked E2E set is happy-path only; the new error contracts are covered at the unit/integration level — see Section 4's note on the E2E gap).

### Assumptions

1. Error classes are imported statically via ES module imports from `src/common/errors/index.js`. No NestJS module wiring is needed — error classes are plain TypeScript classes instantiated via `new`, not injected through DI.
2. `ResourceExhaustedError` is migrated in the same section as the other error classes to avoid a dangling placeholder.
3. The existing `LLM_MAX_RETRIES` and `LLM_BACKOFF_BASE_MS` config keys are preserved with their current behaviour.
4. `GeminiService` owns all Gemini-specific error detection — no provider-specific heuristics remain in `LLMService`.
5. The `HttpExceptionFilter`'s explicit `instanceof ResourceExhaustedError` branch is **removed** — after migration the error extends `HttpException` with HTTP 503 and is handled by the generic branch identically, including the production-sanitisation gate (consistent with all other 5xx `LlmError` subclasses).
6. `ZodError` is excluded from the `mapError()` call per SPEC product decision #8: the base `send()` method checks `error instanceof ZodError` before calling `mapError()`, re-throwing it directly as a non-retryable validation failure. `GeminiService._sendInternal` continues to re-throw `ZodError` itself for its own logging; the base-class check is authoritative.
7. Providers read `this.providerName` internally when constructing `LlmError` instances. The `mapError()` method has the signature `protected abstract mapError(error: unknown): LlmError | undefined` — no `providerName` parameter. The base class `send()` method uses `this.providerName` when constructing fallback `LlmServiceError` instances.
8. `originalError` on `LlmError` stores only `Error` instances (SPEC product decision #12): when the original `_sendInternal` error is not an `Error` (narrowed via the preserved `LLMService.isErrorObject()` helper), `originalError` is set to `undefined` and the `LlmServiceError` fallback message uses `"LLM service error: Unknown error"`.
9. Unrecognised 4xx from the provider classifies as `InvalidRequestError`, not `undefined` (SPEC product decision #11), to avoid regressing a provider 4xx to a `LlmServiceError` (HTTP 500).

---

## Global constraints and quality gates

### Engineering constraints

- Keep API/entry points thin and delegate behaviour to services or controllers.
- Fail fast on invalid inputs and persistence failures.
- Avoid defensive guards that hide wiring issues.
- Keep changes minimal, localised, and consistent with repository conventions.
- Use British English in comments and documentation.
- Do not disable or override any linter rule without explicit authorisation.

### TDD workflow (mandatory per section)

For each section below:

1. **Red**: write failing tests for the section's acceptance criteria.
2. **Green**: implement the smallest change needed to pass.
3. **Refactor**: tidy implementation with all tests still green.
4. Run section-level verification commands.

### Delegation mandatory-read gate (mandatory for sub-agent execution)

When a section is delegated to sub-agents, the plan must define and enforce mandatory documentation reads.

For each delegated phase (`Testing Specialist`, `Implementation`, `Code Reviewer`, `Docs`, `De-Sloppification`, or planning agents when used):

1. list required documentation file paths under that phase before delegation
2. require the sub-agent handoff to include `Files read` with explicit file paths
3. verify every mandatory file is listed before accepting the handoff
4. if any mandatory file is missing, return the work to the same sub-agent and block progression to the next phase

### Shared-helper planning gate (mandatory when helper changes are expected)

When a section is likely to introduce helper reuse, helper extension, or new shared helpers:

1. record helper decisions in that section before implementation
2. include: decision (`reuse` | `extend` | `new` | `keep local`), owning path, and call-site rationale
3. during documentation pass (Section 5), reconcile planned entries against actual implementation

**Canonical shared-helper doc (deliberate deviation from template):** This repository has no canonical shared-helper doc. The `ACTION_PLAN.md` itself is the record for shared-helper decisions. Helper decisions remain in Section 3 and are reconciled in Section 5. This deviation is stated up front so the documentation pass and any code-reviewer handoff need not look for a separate canonical doc.

### Validation commands hierarchy

- All tests (unit): `npm test`
- Targeted unit test: `npx vitest run --project unit --reporter=verbose <path-pattern>`
- Lint: `npm run lint`
- E2E tests (regression only): `npm run test:e2e`
- Lint British English: `npm run lint:british`

---

## Section 1 — Create Error Library and Migrate `ResourceExhaustedError`

### Section composition warning (non-decomposable)

This section is **non-decomposable**: it simultaneously (a) creates the new error library, (b) migrates `ResourceExhaustedError` and rewrites its constructor, (c) rewrites the `LLMService.handleSendError()` call site to compile, (d) removes the `HttpExceptionFilter` `instanceof ResourceExhaustedError` branch and `handleResourceExhaustedError` method, and (e) deletes the old `src/llm/resource-exhausted.error.ts` file. If any sub-step is incomplete, the build breaks with a non-obvious "module not found" and the section cannot be left in a partially-green state. If delegation stalls mid-flight, the section **must be completed or fully rolled back** before Section 2 starts — there is no green intermediate checkpoint. Treat the four sub-steps as a single atomic migration; do not split them across uncoordinated sub-agents. The regression-checker skill has no green baseline until this section is whole.

### Objective

- Create the `src/common/errors/` directory with all nine concrete error classes, the `LlmError` abstract base, and a barrel `index.ts`.
- Migrate the existing `ResourceExhaustedError` from `src/llm/resource-exhausted.error.ts` into the new directory, re-parenting it under `LlmError` and updating its constructor.
- **Update exactly one call site in `LLMService`:** the single `new ResourceExhaustedError(msg, { originalError: error })` literal inside the existing private `handleSendError()` method (in `LLMService.handleSendError()`, at the throw around lines 122–126 of the current `llm.service.interface.ts`). This literal is rewritten to the new `(message, providerName, options?)` shape. **Nothing else in `LLMService` changes in Section 1** — the `handleSendError` method itself, the retry loop in `send()`, `sendAttempt()`, `waitBeforeRetry()`, and all other private helpers are untouched and remain in place. The `handleSendError` method (and its single `new ResourceExhaustedError(...)` call) is deleted **in Section 2** as part of the retry-loop refactor. See the non-decomposable warning below for why partial deletion mid-Section-1 breaks the build.
- Delete the old `src/llm/resource-exhausted.error.ts` file and the old `src/llm/resource-exhausted.error.spec.ts` file, and update imports in `HttpExceptionFilter`, `LLMService`, and all affected test files (including `gemini.service.spec.ts`). The migrated, rewritten spec file lives at `src/common/errors/resource-exhausted.error.spec.ts` (see Required test cases #2 below for the rewritten assertions); the old `src/llm/resource-exhausted.error.spec.ts` is deleted — not left in place, not moved-and-renamed.
- Remove the explicit `instanceof ResourceExhaustedError` branch and its private `handleResourceExhaustedError` method from `HttpExceptionFilter` — the migrated error is handled by the generic `HttpException` branch.
- Create a skeleton `docs/llm/error-handling.md` with the document structure (headings and placeholder notes). The `docs/llm/` directory does not exist yet — create it as part of this step. Full content is written in Section 5 after implementation is complete.
- Unit-test every error class and the barrel exports.

### Constraints

- `LlmError` is abstract and extends `HttpException` from `@nestjs/common`.
- **Each `LlmError` subclass MUST pass a bare `string` as the first argument to `super(...)`** (the `message`), not an object such as `{ message, statusCode }`. This pins the contract that the `HttpExceptionFilter`'s `typeof exceptionResponse === 'string'` branch handles every `LlmError` and writes the string into the response body's `message` field. Switching to an object response would route through the filter's `'message' in exceptionResponse` branch and silently change both the response shape and the Section 4 production-sanitisation behaviour for every subclass. See SPEC §"`LlmError` base class contract" for the rationale.
- Each concrete error class hardcodes its HTTP status and `retryable` flag. Only `message`, `providerName`, and optional `originalError`/`cause` are constructor parameters.
- The migrated `ResourceExhaustedError` constructor calls `LlmError`'s constructor with `HttpStatus.SERVICE_UNAVAILABLE` and `retryable = false`. Existing behaviour (503 status, no retries, `originalError` storage) is preserved.
- The new constructor signature `constructor(message: string, providerName: string = 'unknown', options?: { originalError?: Error; cause?: Error })` does **not** accept an object as the second positional argument — the old `new ResourceExhaustedError(msg, { originalError })` form will not compile. All existing call sites must be rewritten.
- **Second compile break (often missed):** the new `options.originalError?: Error` is narrower than the old `options.originalError?: unknown`. The existing `LLMService.handleSendError()` call site passes `{ originalError: error }` where `error: unknown` is **not** assignable to `Error | undefined`. The Section 1 rewrite must narrow `error` before constructing the error: `new ResourceExhaustedError(msg, 'unknown', { originalError: this.isErrorObject(error) ? error : undefined })`, using the preserved `isErrorObject()` helper. Passing `error` directly will fail typecheck. This is the **only** body change permitted in `LLMService` during Section 1 — see the Objective and acceptance criterion #5 above.
- All imports in `HttpExceptionFilter`, `LLMService`, and test files are updated to point to `src/common/errors/index.js`.
- No dependency on any other module; error classes are pure TypeScript. They are imported statically — no NestJS module wrapper.
- **`cause` propagation relies on the `@nestjs/common` version pinned in `package.json`.** Section 1 test #1 (`llm-error.base.spec.ts`) asserts `expect(error.cause).toBe(cause)` against a concrete test subclass constructed with `{ cause }`. `HttpException`'s built-in `initCause()` (the ES2022 `Error` `cause` mechanism) makes this assertion pass against the current pin. If the `@nestjs/common` pin is upgraded and `initCause()` semantics change, **update the assertion rather than deleting it silently** — the assertion is a regression guard, not a flake.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `SPEC.md`
- `AGENTS.md`
- `docs/testing/README.md`
- `docs/testing/PRACTICAL_GUIDE.md`

Implementation mandatory docs:

- `SPEC.md`
- `AGENTS.md`
- `docs/development/code-style.md`
- `src/llm/resource-exhausted.error.ts` (source to be migrated)
- `src/llm/resource-exhausted.error.spec.ts` (tests to be migrated and rewritten to `src/common/errors/resource-exhausted.error.spec.ts`)
- `src/llm/llm.service.interface.ts` (call site to update at `handleSendError` — only the `new ResourceExhaustedError(...)` literal, see Objective above)
- `src/llm/gemini.service.spec.ts` (consumer test whose `ResourceExhaustedError` import must be repointed to `src/common/errors/index.js` in Section 1 alongside the source migration — do not defer this import update to Section 3)
- `src/common/http-exception.filter.ts` (consumer to update — import path + handler removal)
- `src/common/http-exception.filter.spec.ts` (consumer test to update)

Code Reviewer mandatory docs:

- `SPEC.md`
- `AGENTS.md`

### Shared helper plan (when helper changes are expected)

None — all classes in this section are new; the `ResourceExhaustedError` migration is a move with constructor update and call-site rewrites.

### Acceptance criteria

1. `LlmError` is an abstract class extending `HttpException` with `retryable`, `providerName`, and `originalError` properties.
2. Nine concrete error classes exist: `RateLimitError`, `ResourceExhaustedError` (migrated), `ProviderServerError`, `AuthenticationError`, `ContentFilteredError`, `NetworkError`, `ContextLengthExceededError`, `InvalidRequestError`, and `LlmServiceError` (fallback).
3. Each concrete class can be instantiated with the correct HTTP status code, `providerName`, and optional `originalError`.
4. `ResourceExhaustedError` extends `LlmError` (not plain `Error`); constructor accepts `message`, `providerName` (defaulting to `'unknown'`), and optional `originalError`/`cause`. The default `providerName` enables single-arg instantiation for test simplicity (`new ResourceExhaustedError('msg')` → `providerName === 'unknown'`).
5. **Exactly one literal in `LLMService.handleSendError()` is rewritten** — the `new ResourceExhaustedError(msg, { originalError: error })` throw becomes `new ResourceExhaustedError(msg, 'unknown', { originalError: this.isErrorObject(error) ? error : undefined })`. The narrowing via `this.isErrorObject(error)` is required because the new `options.originalError?: Error` field is narrower than the old `unknown` (see SPEC product decision #4 and the C2 note in Section 1 Constraints below); passing `error: unknown` directly would not typecheck. **The `handleSendError` method itself, the retry loop in `send()`, `sendAttempt()`, `waitBeforeRetry()`, and every other private helper in `LLMService` are untouched in Section 1** and must still compile and behave identically. The `handleSendError` method and the `new ResourceExhaustedError(...)` call inside it are deleted together in Section 2 as part of the retry-loop refactor — do not delete either in Section 1.
6. A barrel `index.ts` re-exports `LlmError` and all nine concrete error classes.
7. The old file `src/llm/resource-exhausted.error.ts` no longer exists.
8. All imports in `HttpExceptionFilter`, `LLMService`, and the affected test files point to `src/common/errors/index.js` (or the barrel).
9. **`HttpExceptionFilter` no longer has an explicit `instanceof ResourceExhaustedError` branch or `handleResourceExhaustedError` method.** The catch method processes `ResourceExhaustedError` (and all other `LlmError` subclasses) through the existing generic `instanceof HttpException` branch.
10. Application builds (`npm run build`) without errors.

### Required test cases (Red first)

**New test files (`src/common/errors/`):**

1. **`llm-error.base.spec.ts`:** Verify `LlmError` stores `retryable`/`providerName`/`originalError` when subclassed, extends `HttpException` (correct `message` and `getStatus()`), and passes `cause` to the `HttpException` superclass. Assert `cause` propagation via `expect(error.cause).toBe(cause)` against a concrete test subclass constructed with `{ cause }`. See the Section 1 Constraints block above for the `@nestjs/common` pin sensitivity note — the assertion is a regression guard, not a flake; update it (do not delete it) if a pin upgrade breaks it. `LlmError` is `abstract` so it cannot be instantiated directly at compile time — test via a concrete test subclass, not via `new LlmError(...)`.

2. **Per-error-class spec files** (`rate-limit.error.spec.ts`, `resource-exhausted.error.spec.ts`, etc.): For each concrete error class, verify:
   - Correct HTTP status code per the table in `SPEC.md` ("HTTP status code table" section): `RateLimitError` → 429, `ResourceExhaustedError` → 503, `ProviderServerError` → 502, `AuthenticationError` → 502, `ContentFilteredError` → 400, `NetworkError` → 502, `ContextLengthExceededError` → 400, `InvalidRequestError` → 400, `LlmServiceError` → 500. The SPEC table is the single source of truth for these mappings.
   - Correct `retryable` flag.
   - `providerName` stored correctly.
   - `originalError` stored correctly when provided; `undefined` when omitted.
   - `instanceof LlmError` and `instanceof HttpException` both return `true`.
   - (For `ResourceExhaustedError` specifically): Existing pattern-matching behaviour still works (`instanceof ResourceExhaustedError` filters correctly from other errors). The constructor works with the new signature `(message, providerName, options?)` and with the default `providerName` when omitted (e.g., `new ResourceExhaustedError('msg')` produces `providerName === 'unknown'`). All constructor call sites are rewritten to the new shape: old `new ResourceExhaustedError('msg', { originalError })` → `new ResourceExhaustedError('msg', 'test-provider', { originalError })`; the "should support pattern matching" and "should work in try-catch blocks" tests use `new ResourceExhaustedError('msg', 'test-provider')`. The `instanceof Error` assertion in the existing spec (the `expect(error).toBeInstanceOf(Error)` assertion in the "should create an instance" test) changes to `instanceof HttpException`.

3. **`index.spec.ts` (optional):** Verify the barrel exports `LlmError` and all nine concrete error classes. This test ensures the barrel is importable and the expected exports resolve.

**Updated test files:**

4. **`http-exception.filter.spec.ts`:** Updated import path for `ResourceExhaustedError`. The old "should handle ResourceExhaustedError and return 503" test is **removed** (the explicit handler branch no longer exists). Two new tests:
   - **503 `LlmError` through generic branch:** Construct a `ResourceExhaustedError('msg', 'gemini')`, feed it to the filter (non-production env), assert status 503 and `message` equals the original message (not sanitised in test env).
   - **503 `LlmError` sanitised in production:** Construct a `ResourceExhaustedError('msg', 'gemini')`, feed it to a filter configured with `NODE_ENV=production`, assert status 503 and `message` equals `"Internal server error"`.

### Section checks

- `npx vitest run --project unit --reporter=verbose src/common/errors/` — all error class tests green.
- `npx vitest run --project unit --reporter=verbose src/common/http-exception.filter` — filter tests green after import update and handler removal.
- Verify the old file `src/llm/resource-exhausted.error.ts` no longer exists.
- Verify the old spec file `src/llm/resource-exhausted.error.spec.ts` no longer exists (run `test ! -f src/llm/resource-exhausted.error.spec.ts` — the migrated, rewritten spec lives at `src/common/errors/resource-exhausted.error.spec.ts`).
- `rg "from.*llm/resource-exhausted" src/ --include="*.ts"` — returns empty (no stale imports to old path; this catches a forgotten import in any consumer including `gemini.service.spec.ts`).
- `npm run build` — successful.
- `npm run lint` — no new violations.
- `npm run lint:british` — no new British-English violations in new error class files and comments.

### Optional `@remarks` JSDoc follow-through

- Add `@remarks` on `LlmError` explaining it is abstract and how subclasses call `super()` with hardcoded status and retryable flag.
- Add `@remarks` on `LlmServiceError` explaining it is the fallback for unclassified errors — provider `mapError()` implementations should return `undefined` for unclassifiable errors (the base `send()` constructs `LlmServiceError` on the provider's behalf) rather than throwing `LlmServiceError` directly. The class is exported so the base class and tests can reference it; it is not intended for direct construction by provider code.
- Add `@remarks` on `ResourceExhaustedError` noting it extends `LlmError` and the 503 status is embedded in the class rather than applied by the filter.

### Implementation notes / deviations / follow-up

- **Implementation notes:** Created `src/common/errors/` with `llm-error.base.ts` (abstract `LlmError extends HttpException`, `super(message, httpStatus, { cause: options?.cause })`), nine concrete error classes, and a barrel `index.ts`. Migrated `ResourceExhaustedError` (re-parented under `LlmError`, 503, retryable=false, `(message, providerName='unknown', options?)` signature). Rewrote the single `new ResourceExhaustedError(...)` literal in `LLMService.handleSendError()` to `new ResourceExhaustedError(msg, 'unknown', { originalError: this.isErrorObject(error) ? error : undefined })` and repointed the import to the barrel. Deleted the old `src/llm/resource-exhausted.error.ts` and its spec. Removed the explicit `instanceof ResourceExhaustedError` branch and `handleResourceExhaustedError` method from `HttpExceptionFilter`, repointing its import. Repointed `gemini.service.spec.ts`'s import. Created `docs/llm/error-handling.md` skeleton.
- **Deviations from plan:** The SPEC-mandated positional `providerName` constructor (`constructor(message, providerName='unknown', options?)`) conflicts with the `unicorn/custom-error-definition` ESLint rule (which requires `options` as the second parameter). Per explicit user authorisation, a scoped, documented override disabling `unicorn/custom-error-definition` for `src/common/errors/**/*.ts` was added to `eslint.config.js`. This is the only deviation and is intentional and recorded. No other deviations.
- **Follow-up implications for later sections:** All subsequent sections depend on these error classes being importable from `src/common/errors/index.js`. Section 2 will add `providerName`/`mapError()` abstract members to `LLMService` and remove the preserved private helpers (incl. `handleSendError` + the migrated `ResourceExhaustedError` literal, deleted together).

---

## Section 2 — Refactor `LLMService` Base Class

### Objective

- Add `protected abstract readonly providerName: string;` and `protected abstract mapError(error: unknown): LlmError | undefined;` to `LLMService`.
- Refactor `LLMService.send()` retry loop to call `this.mapError()` and branch on `llmError.retryable`.
- Remove the private methods `isRateLimitError()`, `isResourceExhaustedError()`, `extractErrorStatusCode()`, `matchesStringStatus()`, `handleSendError()`, and `throwTerminalSendError()`. Their logic is inlined or replaced by the new `LlmError`-based branching.
- Rewrite the test file `llm.service.interface.spec.ts` to test the new retry-loop behaviour against typed errors.

### Constraints

- The retry mechanism (exponential backoff with jitter, config keys `LLM_MAX_RETRIES` and `LLM_BACKOFF_BASE_MS`) is unchanged.
- The following private helper methods are **preserved**: `sendAttempt()`, `waitBeforeRetry()`, `sleep()`, `describePayload()`, `isErrorObject()`, `getErrorStack()`.
- The following private methods are **removed**: `isRateLimitError()`, `isResourceExhaustedError()`, `extractErrorStatusCode()`, `matchesStringStatus()`, `handleSendError()`, `throwTerminalSendError()`, and `buildUnexpectedErrorMessage()`.
- `buildUnexpectedErrorMessage()` is removed because the new `LlmServiceError` fallback replaces its role. When the base class wraps an unclassifiable error in `LlmServiceError`, it uses the message format `"LLM service error: <original error.message>"` (or `"LLM service error: Unknown error"` when the original is not an `Error` instance). The `LlmServiceError` is constructed with `this.providerName` — the provider identity is available on the same instance.
- The test subclass `ExposedLLMService` is simplified — it no longer exposes the removed private helpers. Instead it provides a stub `mapError()` and `providerName` for retry-loop testing.
- **`ZodError` handling:** Before calling `mapError()`, `send()` checks `error instanceof ZodError` and re-throws it directly. `ZodError` is a validation failure, not an LLM provider error, and must not be wrapped in `LlmServiceError`.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `SPEC.md`
- `docs/testing/README.md`
- `docs/testing/PRACTICAL_GUIDE.md`
- `src/llm/llm.service.interface.ts`
- `src/common/errors/index.ts` (barrel exports from Section 1)

Implementation mandatory docs:

- `SPEC.md`
- `src/llm/llm.service.interface.ts`
- `src/common/errors/index.ts` (from Section 1)

Code Reviewer mandatory docs:

- `SPEC.md`
- `AGENTS.md`

### Shared helper plan (when helper changes are expected)

None — this is a refactor of existing code; no new shared helpers are introduced. The removed private helpers are provider-specific and will be recreated as private methods inside `GeminiService` in Section 3.

### Acceptance criteria

1. `LLMService` declares `protected abstract readonly providerName: string;`.
2. `LLMService` declares `protected abstract mapError(error: unknown): LlmError | undefined;`.
3. `send()` retry loop: on error, checks `ZodError` → re-throws directly; otherwise calls `this.mapError(error)`. Branches on `llmError.retryable`: retries when `true` and retries remain; throws immediately when `false`.
4. When `mapError()` returns `undefined` or throws, the original error from `_sendInternal` (not the `mapError()`-thrown error) is wrapped in a `LlmServiceError` with `retryable = false` and `this.providerName`. If `mapError()` threw, the mapping error is logged separately.
5. The methods `isRateLimitError`, `isResourceExhaustedError`, `extractErrorStatusCode`, `matchesStringStatus`, `handleSendError`, `throwTerminalSendError`, and `buildUnexpectedErrorMessage` no longer exist in `LLMService`. Their logic is inlined into the `send()` loop where needed, or has been superseded by `LlmError`-based branching.
6. When `_sendInternal` throws an error that cannot be classified (i.e., `mapError()` returns `undefined` or throws), the base class creates a `LlmServiceError` with message `"LLM service error: <original error.message>"` (or `"LLM service error: Unknown error"` for non-`Error` original errors), `retryable = false`, and HTTP 500.
7. **`originalError` narrowing (SPEC product decision #12):** the `LlmServiceError` (and any `LlmError` constructed from a caught error) stores `originalError` **only when the original is an `Error` instance** (narrowed via the preserved `LLMService.isErrorObject()` helper). For a non-`Error` original (plain object, string, `null`), `originalError` is set to `undefined` and the message uses the `"Unknown error"` branch. This mirrors the existing `getErrorStack()` narrowing pattern.

### Required test cases (Red first)

The existing `llm.service.interface.spec.ts` is **substantially rewritten**. The new test structure uses a test subclass (`ExposedLLMService`) that provides a controllable `mapError()` via a mock/spy:

1. **Retry on retryable error, eventually succeed:**
   - `mapError()` returns a `LlmError` subclass with `retryable = true` for the first N-1 calls, then `_sendInternal` succeeds on the last.
   - Assert the correct number of `_sendInternal` calls (`N`).

2. **No retry on non-retryable error:**
   - `mapError()` returns a `LlmError` subclass with `retryable = false`.
   - Assert `_sendInternal` is called exactly once and the error is thrown.

3. **Max retries exhausted on retryable error:**
   - `mapError()` always returns retryable; `_sendInternal` always fails.
   - Assert the correct number of calls (`maxRetries + 1`) and the last error is thrown.

4. **Fallback to `LlmServiceError` when `mapError()` returns `undefined`:**
   - `_sendInternal` throws an `Error` (e.g., `new Error('boom')`); `mapError()` returns `undefined`. Assert `LlmServiceError` is thrown with `retryable = false`, HTTP 500, message `"LLM service error: boom"`, and `originalError` set to the original `Error` (narrowed — see SPEC product decision #12).

5. **Fallback to `LlmServiceError` when `mapError()` throws:**
   - `_sendInternal` throws an `Error` (e.g., `new Error('original')`); `mapError()` throws a _different_ error (e.g., `new Error('mapping blew up')`). Assert `LlmServiceError` is thrown with message `"LLM service error: original"` (the original error from `_sendInternal`, **not** the error thrown by `mapError()`), `originalError` set to the original `Error`, and the `mapError()`-thrown error is logged separately.

6. **`ZodError` bypasses `mapError()` and is re-thrown directly:**
   - `_sendInternal` throws a `ZodError`. Assert it is re-thrown as-is (not wrapped in `LlmServiceError`), and `mapError()` is never called.

7. **Backoff delay calculation preserved:**
   - With a mocked `sleep`, verify it is called with exponentially increasing delays (`base * 2^attempt + randomInt(0, 100)`) for each retry attempt.

8. **Non-`Error` original → `LlmServiceError` with "Unknown error" message and `originalError === undefined` (SPEC product decision #12):**
   - `_sendInternal` throws a non-`Error` value (e.g., a plain object `{ foo: 'bar' }`, a string `'stringy'`, or `null`); `mapError()` returns `undefined`. Assert `LlmServiceError` is thrown with `retryable = false`, HTTP 500, message `"LLM service error: Unknown error"`, and `originalError === undefined` (not the plain object/string/null — the narrowing drops non-`Error` originals). This pins the "Unknown error" branch that tests #4 and #5 do not exercise.

### Section checks

- `npx vitest run --project unit --reporter=verbose src/llm/llm.service.interface` — all retry-loop tests green.
- `npm run lint` — no new violations.
- `npm run lint:british` — no new British-English violations in `LLMService` JSDoc and comments introduced by the refactor.

### Optional `@remarks` JSDoc follow-through

- Add `@remarks` on the refactored `send()` method documenting the retry/fallback flow: `ZodError` bypass (re-thrown directly, no `mapError()` call), `mapError()` call with `LlmServiceError` fallback when undefined/throws, the `retryable` branching logic, and the `originalError` narrowing rule (only `Error` instances are stored; non-`Error` originals get `undefined` and the "Unknown error" message — SPEC product decision #12).

### Implementation notes / deviations / follow-up

- **Implementation notes:** Added `protected abstract readonly providerName: string` and `protected abstract mapError(error: unknown): LlmError | undefined` to `LLMService`. Refactored `send()` to: (1) re-throw `ZodError` directly with no `mapError()` call and no retry; (2) call `this.mapError(error)`, branching on `llmError.retryable` to retry or throw; (3) wrap the original `_sendInternal` error in `LlmServiceError` (HTTP 500, retryable=false, `this.providerName`, `originalError` narrowed via `isErrorObject`) when `mapError()` returns `undefined` or throws (mapping error logged separately). Extracted a `handleAttemptError()` helper and a `wrapUnclassified()` helper to keep `send()` within the `sonarjs/cognitive-complexity: 15` limit. Removed the seven deprecated private helpers (`handleSendError`, `throwTerminalSendError`, `buildUnexpectedErrorMessage`, `isRateLimitError`, `isResourceExhaustedError`, `extractErrorStatusCode`, `matchesStringStatus`). Preserved `sendAttempt`, `waitBeforeRetry`, `sleep`, `describePayload`, `isErrorObject`, `getErrorStack`. `waitBeforeRetry`'s warn-log wording kept verbatim (SPEC product decision #6).
- **Deviations from plan:** The plan sketched the retry branching inline in `send()`; to satisfy the `sonarjs/cognitive-complexity` lint gate, the branching was extracted into a `handleAttemptError()` private helper (logic identical to the plan, no behaviour change). No other deviations. `npm run build` and full `npm test` are intentionally red until Section 3 implements `GeminiService.providerName`/`mapError()` (expected, per plan note).
- **Follow-up implications for later sections:** Section 3 (GeminiService) implements the abstract members declared here. The test subclass from this section must not conflict with Section 3's implementation. Note: `getErrorStack` is now unused by `LLMService` but preserved per SPEC "preserved" list (and remains available for logging); flagged for possible future cleanup.

---

## Section 3 — Implement `GeminiService.mapError()` and `providerName`

### Objective

- Declare `protected readonly providerName = 'gemini'` in `GeminiService`.
- Implement `mapError()` with Gemini-specific error classification, covering all nine error categories in the correct priority order. Each `LlmError` instance is constructed with `this.providerName`.
- Update `gemini.service.spec.ts` to test the new `mapError()` method and the refactored retry loop.
- The existing `_sendInternal` logging behaviour is preserved.

### Constraints

- The detection logic currently in `LLMService`'s private helpers is extracted and adapted into private helper methods within `GeminiService`.
- `mapError()` must handle all Gemini SDK error shapes: `ApiError` instances, plain objects with `status`/`statusCode`/`code`, string status fields (`'RESOURCE_EXHAUSTED'`, `'RATE_LIMIT_EXCEEDED'`), and nested `{ error: { status, code } }` shapes.
- Non-object inputs passed to `mapError()` should return `undefined` without throwing. This is a **Gemini-implementation expectation, not an abstract contract** for `mapError()`: the abstract method permits a provider to throw on `null`/strings, in which case the base-class `send()` try/catch catches the throw and wraps the original `_sendInternal` error in `LlmServiceError` (see SPEC, "Provider error-mapping interface"). The Gemini tests #20–#21 below therefore document Gemini's chosen tolerant behaviour, not a contract every future provider must replicate.
- **Unrecognised 4xx → `InvalidRequestError` (SPEC product decision #11):** any 4xx HTTP status code from the provider that is not matched by a specific classification (resource-exhausted, rate-limit, content-filtered, context-length, authentication) classifies as `InvalidRequestError` (HTTP 400, `retryable = false`) — **not** `undefined`. Returning `undefined` for a 4xx would cause the base class to wrap it in a `LlmServiceError` (HTTP 500), regressing a provider 4xx to a 500. The "anything unrecognised → `undefined`" rule applies only to inputs with **no extractable HTTP status code** (e.g., a plain `Error` with a network-style message, or a status-less object) — those flow to `NetworkError` (if network-style) or `undefined`.
- Classification priority order (highest to lowest):
  1.  `ResourceExhaustedError` (429 + resource-exhausted message, or string `'RESOURCE_EXHAUSTED'`)
  2.  `RateLimitError` (429, or string `'RATE_LIMIT_EXCEEDED'`, or rate-limit message)
  3.  `AuthenticationError` (401/403)
  4.  `ContentFilteredError` (400 + safety/blocked message)
  5.  `ContextLengthExceededError` (400 + context length message)
  6.  `InvalidRequestError` (generic 400 — only after specific 400 patterns are excluded; also the default for any **other** 4xx not matched above)
  7.  `ProviderServerError` (5xx — HTTP status takes precedence over network message patterns)
  8.  `NetworkError` (connection/timeout errors with **no** extractable HTTP status code)
  9.  `undefined` for anything unrecognised that has **no extractable HTTP status code**

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `SPEC.md`
- `docs/testing/README.md`
- `docs/testing/PRACTICAL_GUIDE.md`
- `src/llm/gemini.service.ts`
- `src/llm/gemini.service.spec.ts`
- `src/common/errors/index.ts` (all error classes from Section 1)
- `src/llm/llm.service.interface.ts` (updated base class from Section 2)

Implementation mandatory docs:

- `SPEC.md`
- `src/llm/gemini.service.ts`
- `src/common/errors/index.ts` (from Section 1)
- `src/llm/llm.service.interface.ts` (from Section 2)

Code Reviewer mandatory docs:

- `SPEC.md`
- `AGENTS.md`

### Shared helper plan (when helper changes are expected)

- Helper: `extractStatusCode(error: unknown): number | undefined`
  - Decision: `keep local` — private to `GeminiService`
  - Owning module/path: `src/llm/gemini.service.ts`
  - Call-site rationale: Extracts numeric HTTP status from Gemini SDK error shapes (`status`, `statusCode`, `code`, `response.status`, `error.status`, `error.code`). Renamed from the base class's `extractErrorStatusCode` to distinguish it as Gemini-specific. Not generalised to base class since future providers may have different shapes.
- Helper: `hasStringStatus(error: unknown, value: string): boolean`
  - Decision: `keep local` — private to `GeminiService`
  - Owning module/path: `src/llm/gemini.service.ts`
  - Call-site rationale: Checks for specific string status values (`'RESOURCE_EXHAUSTED'`, `'RATE_LIMIT_EXCEEDED'`) in Gemini's gRPC-style error objects, including nested `error.status`/`error.code` fields. Renamed from the base class's `matchesStringStatus` to distinguish it as Gemini-specific.

### Acceptance criteria

1. `GeminiService.providerName` returns `'gemini'`.
2. `mapError()` correctly classifies all nine Gemini error patterns (see test cases below). Each returned `LlmError` instance carries `providerName = 'gemini'`.
3. Unrecognised inputs with **no extractable HTTP status code** return `undefined` (triggering `LlmServiceError` fallback in the base class). Unrecognised inputs with an extractable 4xx status return `InvalidRequestError` — not `undefined` (SPEC product decision #11).
4. Non-object inputs (strings, `null`, `undefined`) return `undefined` without throwing. This is Gemini's chosen tolerance; the abstract `mapError()` does not require it, but the base-class `send()` try/catch is the safety net if a provider throws instead (see Constraints above).
5. Priority conflicts are resolved correctly (e.g., a 429 with `RESOURCE_EXHAUSTED` message returns `ResourceExhaustedError`, not `RateLimitError`).
6. All existing `gemini.service.spec.ts` retry-behaviour tests pass after the assertions are updated for the new `LlmError`-based flow and the 5xx-retryable behaviour change (SPEC product decision #10; see test case #23).

### Required test cases (Red first)

**New tests for `GeminiService.mapError()`** — add a `describe('mapError')` block in `gemini.service.spec.ts`:

1. **Rate-Limit (429 numeric status):** `ApiError({ status: 429, message: 'Rate limit exceeded' })` → `RateLimitError`, HTTP 429, `retryable = true`.
2. **Rate-Limit (string status RATE_LIMIT_EXCEEDED):** `{ status: 'RATE_LIMIT_EXCEEDED' }` → `RateLimitError`.
3. **Rate-Limit (nested error.code string '429'):** `{ error: { code: '429' } }` → `RateLimitError`.
4. **Resource Exhausted (429 + RESOURCE_EXHAUSTED message):** `ApiError({ status: 429, message: 'RESOURCE_EXHAUSTED: quota' })` → `ResourceExhaustedError`, HTTP 503, `retryable = false`.
5. **Resource Exhausted (string status):** `{ status: 'RESOURCE_EXHAUSTED' }` → `ResourceExhaustedError`.
6. **Priority: Resource Exhausted over Rate Limit:** `ApiError({ status: 429, message: 'RESOURCE_EXHAUSTED' })` → `ResourceExhaustedError` (not `RateLimitError`).
7. **Provider Server Error (500):** `ApiError({ status: 500, message: 'Internal error' })` → `ProviderServerError`, HTTP 502, `retryable = true`.
8. **Provider Server Error (503):** `ApiError({ status: 503 })` → `ProviderServerError`.
9. **Authentication Error (401):** `ApiError({ status: 401, message: 'Invalid API key' })` → `AuthenticationError`, HTTP 502, `retryable = false`.
10. **Authentication Error (403):** `ApiError({ status: 403 })` → `AuthenticationError`.
11. **Content Filtered (400 + safety message):** `ApiError({ status: 400, message: 'Content blocked by safety filters' })` → `ContentFilteredError`, HTTP 400, `retryable = false`.
12. **Context Length Exceeded:** `ApiError({ status: 400, message: 'context length exceeded' })` → `ContextLengthExceededError`, HTTP 400, `retryable = false`.
13. **Priority: Content Filtered over Context Length:** `ApiError({ status: 400, message: 'content safety filter blocked: context length' })` → `ContentFilteredError` (per agreed classification priority order — the safety match wins when both patterns appear).
14. **Priority: Specific 400 over generic Invalid Request:** `ApiError({ status: 400, message: 'safety filter triggered' })` → `ContentFilteredError` (not `InvalidRequestError`).
15. **Invalid Request (generic 400):** `ApiError({ status: 400, message: 'Invalid argument' })` → `InvalidRequestError`, HTTP 400, `retryable = false`. Must be classified after content-filtered and context-length patterns are checked.
16. **Network Error (connection refused):** `new Error('connect ECONNREFUSED')` → `NetworkError`, HTTP 502, `retryable = true`.
17. **Network Error (timeout):** `new Error('ETIMEDOUT')` → `NetworkError`.
18. **Network Error (plain Error, no HTTP status):** `new Error('fetch failed')` → `NetworkError`, HTTP 502, `retryable = true`. (Plain objects with network-failure messages and no extractable HTTP status are also classified as `NetworkError`, but this only applies to errors that lack any extractable status code — any HTTP 5xx status would have been caught by item 7 above.)
19. **Unrecognised 4xx → `InvalidRequestError` (SPEC product decision #11):** `ApiError({ status: 418, message: "I'm a teapot" })` → `InvalidRequestError`, HTTP 400, `retryable = false`. A 4xx with no specific classification must **not** return `undefined` (which would regress to a `LlmServiceError` HTTP 500). Use a realistic 422 as an additional case if desired: `ApiError({ status: 422, message: 'Unprocessable entity' })` → `InvalidRequestError`.
20. **Truly unrecognised (no extractable status) → `undefined`:** `{ foo: 'bar' }` (a plain object with no `status`/`statusCode`/`code`/`response.status`/`error.status`/`error.code` fields and no network-style message) → `undefined`. This is the genuine "unrecognised" path that triggers the base-class `LlmServiceError` fallback. A 4xx is **not** in this category (see test #19).
21. **Non-object input → `undefined` (Gemini-implementation tolerance):** `mapError('string error')` → `undefined` without throwing. This documents Gemini's chosen behaviour — the abstract `mapError()` contract does not require it, and the base-class `send()` try/catch is the safety net if a future provider throws instead (see Constraints).
22. **Null input → `undefined` (Gemini-implementation tolerance):** `mapError(null)` → `undefined` without throwing. Same framing as test #21 — Gemini-implementation tolerance, not an abstract contract.

**Updated existing tests:**

23. Update retry-behaviour tests in `gemini.service.spec.ts` to use the `LlmError`-based flow (the base class now classifies errors through `mapError()` instead of inline helpers). Specifically, these existing assertions change:
    - The "should not retry on non-429 errors" test (currently `ApiError({ status: 500, message: 'Server error' })`): after refactor this is classified as `ProviderServerError` (retryable = true), so it will now retry up to `LLM_MAX_RETRIES` then throw `ProviderServerError`. The assertion must change to expect retries (call count = `LLM_MAX_RETRIES + 1`) and a `ProviderServerError` (HTTP 502) outcome.
    - The "should throw an error if the SDK fails" test (currently bare `new Error('SDK Error')`): after refactor this is unclassifiable, so the base class wraps it in `LlmServiceError`. The assertion must change from `'Failed to get a valid and structured response from the LLM.'` to the `LlmServiceError` message format (`'LLM service error: SDK Error'`).
    - The "should throw an error if JsonParserUtil fails to parse the response" test: same as above — `LlmServiceError` with message `'LLM service error: Malformed or irreparable JSON string provided.'`.
    - The "should throw a ZodError for an invalid response structure" test: unchanged — `ZodError` bypasses `mapError()` and is re-thrown as-is.

### Section checks

- `npx vitest run --project unit --reporter=verbose src/llm/gemini` — all GeminiService tests green (new `mapError()` tests + updated retry-behaviour tests).
- `npm run lint` — no new violations.
- `npm run lint:british` — no new British-English violations in `GeminiService.mapError()` JSDoc, private helper JSDoc, and the `@remarks` blocks specified below.

### Optional `@remarks` JSDoc follow-through

- Add `@remarks` on `mapError()` documenting the classification priority order (see Constraints above) and noting that priority ordering matters for ambiguous cases (e.g., 429 with resource-exhausted message).
- Add `@remarks` on private `extractStatusCode` documenting the Gemini SDK error shapes it handles.

### Implementation notes / deviations / follow-up

- **Implementation notes:** Declared `protected readonly providerName = 'gemini'` on `GeminiService`. Implemented `mapError(error: unknown): LlmError | undefined` following the SPEC classification priority (ResourceExhausted > RateLimit > Authentication(401/403) > ContentFiltered(400+safety) > ContextLengthExceeded(400+context) > InvalidRequestError(generic 400 + any other 4xx, per SPEC #11) > ProviderServerError(5xx, precedence over network message per #9d) > NetworkError(no extractable status + network message) > undefined). Private helpers `extractStatusCode`, `hasStringStatus`, `isResourceExhausted`, `isRateLimit` kept local to `GeminiService` (renamed from base's deprecated helpers per the Section 3 shared-helper plan). A `buildError<T>()` helper constructs each `LlmError` with `this.providerName` and narrowed `originalError`. Non-object/null/string inputs return `undefined` without throwing (Gemini tolerance, SPEC #11). `_sendInternal` logging/re-throw behaviour preserved unchanged.
- **Deviations from plan:** (1) Extracted `isResourceExhausted()`/`isRateLimit()` private helpers (and `buildError`, `normaliseStatusCode`) to keep `mapError()` within the `sonarjs/cognitive-complexity: 15` gate — logic identical to the plan, no behaviour change. (2) Added `Number()` coercion around `configService.get('LLM_MAX_RETRIES')`/`LLM_BACKOFF_BASE_MS` in `LLMService.send()` so strict `attempt === maxRetries` comparison works against both the real `ConfigService` (numbers via `z.coerce.number()`) and test mocks returning strings — a safe minimal no-op for numeric inputs. (3) When `mapError` receives a non-`Error` object it cannot classify, it returns `undefined` (base wraps with `"LLM service error: Unknown error"`) rather than mapping the object; this mirrors the SPEC "Unknown error" convention. No change to the agreed Content-Filtered-over-Context-Length priority (test #13) or any required behaviour.
- **Follow-up implications for later sections:** None — this is the final implementation section. Section 4 runs the full regression + contract-hardening pass (incl. `HttpExceptionFilter` production-sanitisation tests for the new `LlmError` subclasses).

---

## Section 4 — Regression and Contract Hardening

### Objective

- Run all touched and dependent test suites to confirm no regressions.
- Run full lint and E2E suites.
- Verify the assessor pipeline still functions correctly with the new error infrastructure.
- Audit and update any test or E2E path that depends on the old 5xx fail-fast behaviour (SPEC product decision #10 — behaviour change).
- Add production-sanitisation regression tests for the new `LlmError` subclasses flowing through `HttpExceptionFilter`'s generic `HttpException` branch.

### Constraints

- Prefer focused test runs before the full `npm test` suite.
- E2E tests (`npm run test:e2e`) are run as a final sanity check. **E2E gap note:** the mocked E2E set (`vitest.e2e.setup.ts` sets `E2E_MOCK_LLM = 'true'`) substitutes a happy-path LLM response — it does not throw `LlmError` subclasses. The new error contracts through the live filter chain are therefore covered at the unit/integration level (tests #10–#14 below), not at the E2E level. An integration-level test that dispatches an `LlmError` through the live NestJS `APP_FILTER` filter chain (not a hand-built `ArgumentsHost`) is **optional but recommended** to close the gap between the unit filter tests and the mocked E2E — record it as a follow-up if not added in this section.
- The sanitisation tests must run against the filter with a mocked `NODE_ENV=production` `ConfigService`, mirroring the existing production-sanitisation test in `http-exception.filter.spec.ts`.
- The explicit `instanceof ResourceExhaustedError` handler has been removed — `ResourceExhaustedError` now flows through the generic `HttpException` branch and is tested as a 503 `LlmError` subclass.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `SPEC.md`
- `docs/testing/README.md`
- `docs/testing/PRACTICAL_GUIDE.md`
- `docs/testing/E2E_GUIDE.md`
- `src/common/http-exception.filter.ts`
- `src/common/http-exception.filter.spec.ts`

### Acceptance criteria

1. All touched unit test suites pass: `src/common/errors/`, `src/llm/`, `src/common/http-exception.filter`, `src/v1/assessor/`.
2. Full unit test run passes: `npm test`.
3. E2E test suite passes: `npm run test:e2e` (mocked).
4. Lint passes: `npm run lint` and `npm run lint:british`.
5. Application builds: `npm run build`.
6. No unexpected new console warnings or errors during test runs.
7. New sanitisation tests confirm: a 503 `LlmError` subclass (`ResourceExhaustedError`) is sanitised to `"Internal server error"` in production.
8. New sanitisation tests confirm: a 502 `LlmError` subclass (`ProviderServerError`) is sanitised to `"Internal server error"` in production.
9. New sanitisation tests confirm: a 400 `LlmError` subclass (`ContentFilteredError`) is **not** sanitised in production (provider message exposed).
10. New sanitisation tests confirm: a 429 `LlmError` subclass (`RateLimitError`) is **not** sanitised in production (provider message exposed).

### Required test cases/checks

1. `npx vitest run --project unit --reporter=verbose src/common/errors/` — all error class tests green.
2. `npx vitest run --project unit --reporter=verbose src/llm/` — all LLM module tests green (base class + GeminiService).
3. `npx vitest run --project unit --reporter=verbose src/common/` — common module tests green (including filter). Note: `common.module.spec.ts` and `llm.module.spec.ts` do not need wiring changes (no `ErrorsModule`).
4. `npx vitest run --project unit --reporter=verbose src/v1/assessor/` — assessor service tests green.
5. `npm test` — full unit suite green.
6. `npm run test:e2e` — E2E suite green.
7. `npm run lint` — no violations.
8. `npm run lint:british` — no violations.
9. `npm run build` — successful.

**New production-sanitisation regression tests (added to `http-exception.filter.spec.ts`):**

10. **503 `LlmError` sanitised in production:** Construct a `ResourceExhaustedError('msg', 'gemini')`, feed it to a `HttpExceptionFilter` configured with `NODE_ENV=production`, and assert the response body's `message` equals `"Internal server error"` and `statusCode` equals 503.
11. **503 `LlmError` not sanitised in test env:** Construct a `ResourceExhaustedError('msg', 'gemini')`, feed it to a filter with `NODE_ENV=test`, and assert the response body's `message` equals the original message and `statusCode` equals 503.
12. **502 `LlmError` sanitised in production:** Construct a `ProviderServerError` (or any 502 `LlmError` subclass), feed it to a `HttpExceptionFilter` configured with `NODE_ENV=production`, and assert the response body's `message` equals `"Internal server error"` and `statusCode` equals 502.
13. **400 `LlmError` not sanitised in production:** Construct a `ContentFilteredError` (or `InvalidRequestError`), feed it to a `HttpExceptionFilter` configured with `NODE_ENV=production`, and assert the response body's `message` equals the provider-derived `LlmError` message (not `"Internal server error"`) and `statusCode` equals 400.
14. **429 `LlmError` not sanitised in production:** Construct a `RateLimitError`, feed it to a `HttpExceptionFilter` configured with `NODE_ENV=production`, and assert the response body's `message` equals the provider-derived `LlmError` message (not `"Internal server error"`) and `statusCode` equals 429.

### Section checks

- Run all commands listed above and ensure all are green.
- If any test failure is unrelated to these changes, document it but do not fix it in this section.

### Implementation notes / deviations / follow-up

- **Implementation notes:** Ran the full regression + contract-hardening pass (Section 4 acceptance criteria #1–#9). Added three new production-sanitisation regression tests to `http-exception.filter.spec.ts` (Section 4 tests #12–#14): 502 `ProviderServerError` sanitised to "Internal server error" in production; 400 `ContentFilteredError` and 429 `RateLimitError` exposed unsanitised in production. The 503 `ResourceExhaustedError` sanitisation tests (#10–#11) were added in Section 1. Full regression results: unit suite **329 passed** (baseline 271, +58 net-new tests, zero regressions), E2E mocked suite **49 passed / 1 todo** (7 files, no regressions), `npm run build` clean, `npm run lint` clean, `npm run lint:british` clean. No unexpected console warnings; the E2E app-lifecycle child-process exit trace is a pre-existing teardown log, not a failure.
- **Deviations from plan:** None of substance. The regression-checker CLI referenced by the skill (`npm run regression-checker`) is not present in this repo state (no `scripts/builder/dist/regression-checker/`, no `regression.config.json`, no npm script), so the Baseline/Regression Gate was satisfied via the repository's own validation commands (build + lint + full `npm test` + `npm run test:e2e`) captured in `.ts-regression-checker/reports/baseline/baseline.txt`. All Section 4 acceptance criteria met.
- **Follow-up implications for later sections:** Section 5 (documentation) is the final pass; no code behaviour remains. The E2E gap noted in the plan (mocked E2E does not exercise a provider-thrown `LlmError` through the live filter chain) is recorded as a known follow-up — an integration-level test dispatching an `LlmError` through the live `APP_FILTER` chain is recommended but optional.

---

## Section 5 — Documentation and Rollout Notes

### Objective

- Update JSDoc comments on new and changed public APIs.
- Update any project documentation referencing the old `ResourceExhaustedError` location or old error-handling patterns.
- Reconcile shared-helper entries planned in Section 3.

### Constraints

- Only modify documents relevant to the touched areas.
- British English throughout.

### Delegation mandatory reads (when sub-agents are used)

Docs mandatory docs:

- `SPEC.md`
- `AGENTS.md`
- `docs/development/code-style.md`
- `docs/modules/llm.md` (existing doc with stale `ResourceExhaustedError` constructor snippet to be rewritten)
- `src/llm/gemini.service.ts` (reference implementation for the developer guide)
- `src/common/errors/index.ts` (error class barrel)
- `src/llm/llm.service.interface.ts` (base class contract)

Code Reviewer mandatory docs:

- `SPEC.md`
- `AGENTS.md`

### Acceptance criteria

1. `src/common/errors/` classes have complete JSDoc with `@remarks` where specified in Section 1.
2. `LLMService.send()` has updated JSDoc documenting the retry/fallback flow (`ZodError` bypass, `mapError()`, `LlmServiceError` fallback, `originalError` narrowing per SPEC product decision #12).
3. `GeminiService.mapError()` has JSDoc documenting the classification priority order, including the unrecognised-4xx → `InvalidRequestError` default (SPEC product decision #11).
4. `docs/modules/llm.md` is updated: the stale `ResourceExhaustedError` constructor snippet (which currently shows `extends Error` with `originalError` as a constructor positional arg — inaccurate even pre-migration) is removed, and the `ResourceExhaustedError` section is either rewritten to point to `docs/llm/error-handling.md` or removed in favour of the new guide. The error-classification table is updated to reflect the new `LlmError`-based hierarchy.
5. Any other existing project documentation referencing `src/llm/resource-exhausted.error.ts` or the old error-handling patterns is updated.
6. Shared-helper entries from Section 3 are reconciled (status updated to `Implemented` in the action plan itself). The action plan is the canonical shared-helper record per the Global Constraints deviation note (no separate canonical doc exists in this repo).
7. **`docs/llm/error-handling.md`** is complete and contains:
   - A reference table of all nine error classes with their HTTP status codes, `retryable` flags, and when to use each.
   - Step-by-step instructions for adding a new LLM provider, including: declaring `providerName`, implementing `mapError()`, extracting provider-specific status-code helpers, and writing `mapError()` tests.
   - The classification priority-order rules (resource-exhausted before rate-limit; specific 400s before generic invalid-request; **any unrecognised 4xx → `InvalidRequestError`** per decision #11; 5xx before network errors; everything else with no extractable status → `undefined`).
   - The **5xx-retryable behaviour change** (SPEC product decision #10): a dedicated callout that `ProviderServerError` and `NetworkError` are now retried up to `LLM_MAX_RETRIES`, where previously non-429 errors failed fast after a single attempt and threw a generic `Error` (HTTP 500). The thrown type is now `ProviderServerError`/`NetworkError` (HTTP 502).
   - The error message policy: full details are logged server-side; HTTP responses carry brief messages — 5xx (≥500) sanitised to `"Internal server error"` in production, 4xx (400, 429) messages exposed unsanitised.
   - The `originalError` narrowing rule (SPEC product decision #12): only `Error` instances are stored; non-`Error` originals get `undefined` and the "Unknown error" message.
   - The `mapError()` non-object guard framing: Gemini returns `undefined` for non-object inputs as a chosen tolerance, but the abstract contract permits a provider to throw (the base-class `send()` try/catch is the safety net).
   - Testing conventions: use representative error shapes from the provider's SDK, cover all error categories, test priority conflicts, test non-object/null inputs, and test the unrecognised-4xx → `InvalidRequestError` default.
   - A worked example referencing `GeminiService.mapError()` as the canonical implementation.
   - British English throughout.
8. **`AGENTS.md`** is updated to reference `docs/llm/error-handling.md` in the appropriate section (near the existing LLM-related guidance), so that future agents adding providers or error types are directed to consult it.
9. The `@class`/file-level JSDoc on `HttpExceptionFilter` (`src/common/http-exception.filter.ts`) is updated to note that it now handles all `LlmError` subclasses (including `ResourceExhaustedError`) via the generic `HttpException` branch, and cross-references `docs/llm/error-handling.md`.
10. A **release-note entry** is added (under `release-notes/` or the project's established release-notes location) flagging the 5xx-retryable behaviour change (SPEC product decision #10) so consumers are aware that upstream 5xx responses now trigger retries and return 502 (not 500).

### Required checks

1. Verify JSDoc on all public exports in `src/common/errors/index.ts`.
2. Verify JSDoc on `LLMService.send()` describes the retry/fallback flow including `originalError` narrowing.
3. Verify JSDoc on `GeminiService.mapError()` describes the classification priority order and the unrecognised-4xx default.
4. Verify `docs/modules/llm.md` no longer contains `ResourceExhaustedError extends Error` or the stale constructor snippet — run `rg "ResourceExhaustedError extends Error" docs/` and confirm it returns empty.
5. Verify no stale references to `src/llm/resource-exhausted.error.ts` remain in any file under `docs/` or in code comments.
6. Reconcile Section 3 shared-helper entries: update planning entries from `Not implemented` to `Implemented`.
7. Verify `docs/llm/error-handling.md` exists and covers all topics listed in Acceptance Criteria #7, including the 5xx-retryable callout and the unrecognised-4xx default.
8. Verify `AGENTS.md` contains a reference to `docs/llm/error-handling.md`.
9. Verify the `HttpExceptionFilter` file-level JSDoc mentions `LlmError` subclasses and links to `docs/llm/error-handling.md`.
10. Verify a release-note entry exists for the 5xx-retryable behaviour change.

### Optional `@remarks` JSDoc review

- Confirm the `@remarks` specified in Sections 1, 2, and 3 are present on the relevant classes/methods.
- If any planned `@remarks` was found unnecessary during implementation, note the decision.

### Implementation notes / deviations / follow-up

- **Implementation notes:** describe documentation updates made.
- **Deviations from plan:** note any additional documentation needs discovered.

---

## Suggested implementation order

1. **Section 1** — Create error library, migrate `ResourceExhaustedError`, update filter (enabling infrastructure; no dependencies).
2. **Section 2** — Refactor `LLMService` base class (depends on Section 1; required by Section 3).
3. **Section 3** — Implement `GeminiService.mapError()` (depends on Sections 1 and 2).
4. **Section 4** — Regression and contract hardening (depends on Sections 1–3).
5. **Section 5** — Documentation and rollout (depends on all prior sections).

Sections 1 → 2 → 3 must run sequentially (each depends on the previous). Section 4 and Section 5 are gated on all preceding sections.
