# Feature Delivery Plan (TDD-First): Mistral LLM Provider

## Read-First Context

Before writing or executing this plan:

1. Read the current `SPEC.md` (v2.3) — the source of truth for product behaviour, contracts, and architecture decisions. Changes in v2.3 relevant to this plan: shared error-mapper helper (product decision #13 / backend change #3b); server-side config authoritatively overwrites `payload.model`/`payload.reasoningEffort` (product decision #12); `vitest.config.ts` `e2e-live` include must be updated (backend change #11); `test/utils/app-lifecycle.ts` `defaultTestValues` must include `MISTRAL_API_KEY` dummy (backend change #15); existing Gemini E2E suites must pin their models via `environmentOverrides` (backend change #12 / product decision #11); `safePrompt`/`responseFormat` are recommended defaults not hard contract (resolved open question #6).
2. Read `AGENTS.md` for project conventions (British English, KISS/DRY prime directives, mandatory shared-helper planning gate).
3. Read `docs/testing/README.md` and `docs/testing/PRACTICAL_GUIDE.md` for testing guidance.
4. Read the following source files for context:
   - `src/llm/llm.service.interface.ts` — abstract `LLMService` base class (to be extended with `ILlmService` interface)
   - `src/llm/gemini.service.ts` — reference provider implementation (its `mapError()` helpers will be refactored onto the shared helper in Section 6)
   - `src/llm/gemini.service.spec.ts` — reference provider tests (must remain green after the shared-helper refactor)
   - `src/llm/llm.module.ts` — current module wiring
   - `src/v1/assessor/assessor.service.ts` — consumer (injection changes)
   - `src/v1/assessor/assessor.service.spec.ts` — consumer tests (injection changes + mock `ConfigService` audit)
   - `src/config/environment.schema.ts` — env var schema
   - `docs/llm/error-handling.md` — error mapping contract
   - `test/assessor-live.e2e-spec.ts` — canonical live E2E pattern
   - `test/utils/llm-mock.mjs` — E2E mock shim
   - `test/utils/app-lifecycle.ts` — E2E app lifecycle (must add `MISTRAL_API_KEY` to `defaultTestValues`)
   - `vitest.config.ts` — vitest project definitions (the `e2e-live` `include` is a single-file array and must be updated)
   - `package.json` — test/lint scripts

Treat the `SPEC.md` as the source of truth. Do not restate material already settled in the spec.

## Scope and assumptions

### Scope

- Create `src/llm/model-registry.ts` with model-to-provider mapping and validation.
- Extend `LlmPayload` types with optional `model` and `reasoningEffort` fields.
- Introduce `ILlmService` interface and `LLM_SERVICE_TOKEN` string DI token.
- **Create `src/llm/llm-error-mapper.ts`** — shared error-classification cascade (SPEC product decision #13) — and refactor `GeminiService.mapError()` to delegate to it.
- Create `MistralService` extending `LLMService` — full provider implementation including `_sendInternal`, `mapError` (delegating to the shared helper), and `providerName`.
- Create `RoutingLLMService` implementing `ILlmService` — per-task-type routing to the correct provider, with constructor validation of model names (API keys are already enforced by the Zod schema; the router does not re-check them — see SPEC v2.3 product decision #7 and "Runtime validation"). Server-side config authoritatively overwrites `payload.model`/`payload.reasoningEffort` (product decision #12 — no caller-precedence).
- Update `GeminiService` to read optional `payload.model` and `payload.reasoningEffort`, and to delegate `mapError()` to the shared helper.
- Rewire `LlmModule` to register all three services and export the string token mapped to `RoutingLLMService`.
- Update `AssessorService` injection from `LLMService` class token to `LLM_SERVICE_TOKEN`.
- Add five new environment variables to the Zod schema.
- Add `MISTRAL_API_KEY: 'dummy-key-for-testing'` to `test/utils/app-lifecycle.ts` `defaultTestValues` (CRITICAL — otherwise mocked E2E fails Zod validation).
- Create live and mocked E2E tests for Mistral.
- Extend `llm-mock.mjs` to mock the Mistral SDK.
- Pin existing Gemini E2E suites (`assessor.e2e-spec.ts`, `assessor-live.e2e-spec.ts`) to Gemini models via `environmentOverrides` (CRITICAL — otherwise the new schema defaults silently route them to Mistral).
- Update `vitest.config.ts` `e2e-live` `include` to cover the new `mistral-live.e2e-spec.ts` (CRITICAL — otherwise the new live test does not run).
- Audit every `Test.createTestingModule({ imports: [...LlmModule...] })` and every `configObjectSchema.parse` call; ensure each mock `ConfigService`/env returns a non-empty `MISTRAL_API_KEY` and the four new model/effort vars.
- Update documentation.

### Out of scope

- Making API keys conditionally required.
- Hot-reloading model configuration.
- Per-request model selection from API consumers (decided against — see SPEC product decision #12).
- Additional LLM providers beyond Gemini and Mistral.
- Circuit-breaker or per-provider retry configuration.
- Configurable Gemini thinking budgets (hardcoded for now; the `'low'` ↔ `0` indistinguishable-from-`'off'` gap remains as a v1 limitation).
- Hard-asserting `safePrompt`/`responseFormat` in `MistralService` unit tests (they are recommended defaults — resolved open question #6).

### Assumptions

1. The `@mistralai/mistralai` v2.5.0 SDK is already installed in `node_modules`.
2. `MISTRAL_API_KEY` will be available in `.test.env` for live E2E (mocked E2E uses the dummy added by backend change #15).
3. Both `GEMINI_API_KEY` and `MISTRAL_API_KEY` are required at startup, enforced by the Zod schema (SPEC product decision #4). The `RoutingLLMService` constructor does **not** re-check API keys — that is Zod's responsibility. Provider services (`GeminiService`, `MistralService`) retain their existing defensive own-key constructor checks for direct-instantiation cases.
4. Existing Gemini tests continue to pass without structural changes beyond the injection token update (Sections 1 and 6) and the `mapError()` refactor onto the shared helper (Section 6 — behaviour-preserving).
5. The `E2E_MOCK_LLM` mechanism (`vitest.e2e.setup.ts` + `llm-mock.mjs`) extends cleanly to the Mistral SDK.
6. The Mistral SDK v2.5.0 exposes `chat` as a lazy getter on `Mistral.prototype` backed by a private `_chat` field (verified from `node_modules/@mistralai/mistralai/esm/sdk/sdk.js`). The constructor does **not** assign `this.chat` as an own property, so the mock shim uses a prototype getter override (`Object.defineProperty(Mistral.prototype, 'chat', { configurable: true, get() { return mockChat; } })`) rather than the Gemini-style getter/setter intercept. If a future SDK version switches to an own-property assignment, the mock pattern must be revisited.
7. The Gemini `mapError()` refactor onto the shared helper (Section 6) is behaviour-preserving — `gemini.service.spec.ts` tests remain unchanged and green.

---

## Global constraints and quality gates

### Engineering constraints

- Keep API/entry points thin and delegate behaviour to services.
- Fail fast on invalid configuration at module init.
- Avoid defensive guards that hide wiring issues.
- Keep changes minimal, localised, and consistent with repository conventions.
- Use British English in comments and documentation.
- Do not disable or override any linter rule without explicit authorisation.
- `MistralService.mapError()` must follow the existing classification priority order from `docs/llm/error-handling.md`.
- `RoutingLLMService` constructor validates configured model names against the model registry (aggregated, fail-fast). It does **not** validate API keys — both keys are already enforced as required and non-empty by the Zod environment schema (SPEC product decision #4).

### TDD workflow (mandatory per section)

For each section below:

1. **Red**: write failing tests for the section's acceptance criteria.
2. **Green**: implement the smallest change needed to pass.
3. **Refactor**: tidy implementation with all tests still green.
4. Run section-level verification commands.

### Validation commands hierarchy

- All tests (unit): `npm test`
- Targeted unit test: `npx vitest run --project unit --reporter=verbose <path-pattern>`
- Lint: `npm run lint`
- Lint British: `npm run lint:british`
- E2E tests (mocked): `npm run test:e2e`
- E2E tests (live): `npm run test:e2e:live`

---

## Section 1 — ILlmService Interface, Token, and Payload Extensions

### Objective

- Introduce `ILlmService` interface, `LLM_SERVICE_TOKEN` constant, and `ReasoningEffort` type in `llm.service.interface.ts`.
- Add optional `model` and `reasoningEffort` fields to `StringPromptPayload` and `ImagePromptPayload`.
- Mark `LLMService` as `implements ILlmService`.
- Update `AssessorService` to inject via `@Inject(LLM_SERVICE_TOKEN)` with `ILlmService` type.
- Update `LlmModule` to export `LLM_SERVICE_TOKEN` temporarily mapped to `GeminiService`.
- Update `assessor.service.spec.ts` and `llm.module.spec.ts` to use the new token.

**This section is a required enabling step.** By the end, the application compiles and all existing tests pass with the new token — still routing only to Gemini. Sections 2–4 build on this foundation.

### Constraints

- `ILlmService` exports only `send(payload: LlmPayload): Promise<LlmResponse>`.
- `LLM_SERVICE_TOKEN = 'LLM_SERVICE'` is a string literal constant.
- Payload field additions are optional (`model?: string`, `reasoningEffort?: ReasoningEffort`) so existing callers are unaffected.
- Temporary wiring: `{ provide: LLM_SERVICE_TOKEN, useClass: GeminiService }`. Only `GeminiService` is registered as a class provider. The previous `{ provide: LLMService, useClass: GeminiService }` entry is removed (LLMService class token is no longer a DI token).
- `AssessorService` field type changes from `LLMService` to `ILlmService`.
- **Transition note:** This temporary wiring is replaced in Section 5. The test overrides in `assessor.service.spec.ts` and `llm.module.spec.ts` created here must be updated again in Section 5 when the module switches to `RoutingLLMService`. Section 5 explicitly lists the required test-update steps for those two files, **and additionally requires updating `src/v1/assessor/assessor.module.spec.ts`** (which imports `AssessorModule`, which transitively imports `LlmModule`, so its mock `ConfigService` must also return `MISTRAL_API_KEY` and the four new model/effort vars once `MistralService` becomes a class provider in Section 5). The Section 1 test overrides are not expected to survive Section 5 unchanged.

### Acceptance criteria

1. `llm.service.interface.ts` exports `ILlmService`, `LLM_SERVICE_TOKEN`, and `ReasoningEffort`.
2. `LLMService` is declared `implements ILlmService`.
3. `StringPromptPayload` and `ImagePromptPayload` have optional `model` and `reasoningEffort` fields.
4. `LlmModule` exports `LLM_SERVICE_TOKEN` mapped to `GeminiService` via `useClass`.
5. `AssessorService` injects `@Inject(LLM_SERVICE_TOKEN) private readonly llmService: ILlmService`.
6. `assessor.service.spec.ts` overrides `LLM_SERVICE_TOKEN` instead of `LLMService` and uses `ILlmService` type.
7. `llm.module.spec.ts` verifies `module.get(LLM_SERVICE_TOKEN)` resolves to a `GeminiService` instance (temporary — will change to `RoutingLLMService` in Section 5).
8. All existing tests pass. `npm run build` succeeds.

### Required test cases (Red first)

**Updated tests:**

1. `assessor.service.spec.ts` — update imports: replace `LLMService` with `ILlmService` and `LLM_SERVICE_TOKEN`. Change `.overrideProvider(LLMService)` to `.overrideProvider(LLM_SERVICE_TOKEN)`. Change `module.get<LLMService>(LLMService)` to `module.get<ILlmService>(LLM_SERVICE_TOKEN)`. The `llmService` field type annotation changes from `LLMService` to `ILlmService`. **No `MISTRAL_API_KEY` mock is required yet in Section 1** — Section 1 still only registers `GeminiService` (mapped to `LLM_SERVICE_TOKEN`); `MistralService` is not a provider yet, so nothing in the module reads `MISTRAL_API_KEY`. The `MISTRAL_API_KEY` mock (and the four new model/effort vars) is added in Section 5 when `MistralService` is registered as a class provider (Section 5 lists the exact mock additions). All existing assertions remain identical.
2. `llm.module.spec.ts` — change `module.get(LLMService)` to `module.get(LLM_SERVICE_TOKEN)`. Assertion remains `toBeDefined()`. **No `MISTRAL_API_KEY` mock required at this stage** (added in Section 5 alongside the `MistralService` class-provider registration).

### Section checks

- `npx vitest run --project unit --reporter=verbose src/v1/assessor/` — assessor tests green.
- `npx vitest run --project unit --reporter=verbose src/llm/` — all LLM tests green.
- `npm run build` — successful.
- `npm run lint` — no new violations.

### Implementation notes / deviations / follow-up

- **Implementation notes:** Completed via TDD (red → green → review). RED: `assessor.service.spec.ts` and `llm.module.spec.ts` updated to the new `ILlmService`/`LLM_SERVICE_TOKEN` symbols (5 failing tests, all due to the missing symbols). GREEN: `llm.service.interface.ts` gained `ReasoningEffort`, `ILlmService`, `LLM_SERVICE_TOKEN = 'LLM_SERVICE'`, optional `model`/`reasoningEffort` payload fields, and `LLMService implements ILlmService`; `llm.module.ts` rewired to `{ provide: LLM_SERVICE_TOKEN, useClass: GeminiService }` (legacy `LLMService` class-token provider/export removed); `assessor.service.ts` injects `@Inject(LLM_SERVICE_TOKEN) llmService: ILlmService` (type-only import for `ILlmService` due to `isolatedModules` + decorator metadata). All section checks pass: unit suite green (50 files / 346 tests), build, lint, lint:british clean. Code review: PASS (no critical/improvement findings).
- **Deviations from plan:** None.
- **Follow-up implications:** The temporary `LLM_SERVICE_TOKEN → GeminiService` mapping is replaced in Section 5 when `RoutingLLMService` is introduced. Section 5 includes explicit steps to update `assessor.service.spec.ts` and `llm.module.spec.ts` to match the new wiring. The Section 1 test overrides are not expected to survive Section 5 unchanged.

---

## Section 2 — Model Registry

### Objective

- Create `src/llm/model-registry.ts` with `ProviderId`, `ModelEntry`, `SUPPORTED_MODELS`, `resolveProvider()`, and `validateModelName()`.
- Unit-test all exports.

### Constraints

- `SUPPORTED_MODELS` is a `readonly` array.
- Prefix matching is case-sensitive and ordered (first match wins).
- `resolveProvider()` throws `Error` with a descriptive message on no match.
- `validateModelName()` throws with a message listing the unrecognised model name.
- The registry imports no other project files (no circular deps).
- Model name resolution must work even when a model name starts with a shorter registered prefix (e.g., `'gemini-2.5-flash'` is registered; `'gemini-2.5-flash-lite'` still matches because `'gemini-2.5-flash'` is a prefix of it).

### Acceptance criteria

1. `resolveProvider('gemini-2.5-flash-lite')` returns `'gemini'`.
2. `resolveProvider('mistral-small-latest')` returns `'mistral'`.
3. `resolveProvider('pixtral-large-latest')` returns `'mistral'`.
4. `resolveProvider('open-mistral-nemo')` returns `'mistral'`.
5. `resolveProvider('unknown-model')` throws.
6. `resolveProvider('gemini-2.5-flash-new-variant')` returns `'gemini'` (prefix `gemini-2.5-flash` matches first).
7. `validateModelName('mistral-small-latest')` does not throw.
8. `validateModelName('gpt-4o')` throws with a message containing the model name.

### Required test cases (Red first)

**New test file `src/llm/model-registry.spec.ts`:**

1. Resolves `'gemini-2.5-flash'` → `'gemini'`.
2. Resolves `'gemini-2.5-flash-lite'` → `'gemini'`.
3. Resolves `'gemini-2.0-flash'` → `'gemini'`.
4. Resolves `'mistral-small-latest'` → `'mistral'`.
5. Resolves `'pixtral-12b'` → `'mistral'`.
6. Resolves `'open-mistral-nemo'` → `'mistral'`.
7. `resolveProvider('unknown')` throws `Error`.
8. `validateModelName('mistral-small-latest')` does not throw.
9. `validateModelName('gpt-4o')` throws; error message includes model name.

### Section checks

- `npx vitest run --project unit --reporter=verbose src/llm/model-registry` — all green.
- `npm run lint` — no new violations.

### Implementation notes / deviations / follow-up

- **Implementation notes:** TDD red → green. RED: `src/llm/model-registry.spec.ts` created with 16 behaviour-focused tests (all required cases plus `SUPPORTED_MODELS` structure checks, case-sensitivity, and longer-prefix-variant matching); failed with `ERR_MODULE_NOT_FOUND`. GREEN: `src/llm/model-registry.ts` created exactly per SPEC — `ProviderId`, `ModelEntry`, ordered readonly `SUPPORTED_MODELS` (2 Gemini + 3 Mistral prefixes), `resolveProvider()` (case-sensitive first-match `startsWith`, descriptive error listing supported prefixes), `validateModelName()` (delegates to `resolveProvider`, KISS/DRY). No project imports (no circular deps). All 16 tests green; `src/llm/` suite 93/93; build/lint/lint:british clean. Code review: PASS (nitpicks only, no action required).
- **Deviations from plan:** None.
- **Follow-up implications:** `RoutingLLMService` (Section 5) depends on `validateModelName()` and `resolveProvider()`.

---

## Section 3 — Shared Error-Mapper Helper (`src/llm/llm-error-mapper.ts`)

### Objective

- Extract the provider-agnostic classification cascade from `GeminiService.mapError()` into a shared helper so `MistralService` (Section 4) and `GeminiService` (Section 6) can delegate to it instead of duplicating ~150 lines of near-identical logic.
- Remove the duplication identified during the Planner-Reviewer third pass (SPEC v2.3 product decision #13, backend change #3b). Driven by the repo's KISS/DRY prime directive and the mandatory Shared-helper planning gate.

### Constraints

- The helper is provider-agnostic: it owns the priority order (`ResourceExhaustedError` > `RateLimitError` > `AuthenticationError` > `ContentFilteredError` > `ContextLengthExceededError` > `InvalidRequestError` > `ProviderServerError` > `NetworkError` > `undefined`) and the message-pattern/tie-break logic, but **does not** own SDK-specific shapes.
- Per-provider configuration is supplied via probe hooks: a `providerName` string; an `extractStatusCode(error)` hook (provider knows its SDK's status-bearing fields — Gemini probes `error.status`/`error.code`/`error.response.status`/`error.error.status`/`error.error.code`; Mistral probes `MistralError.statusCode`); a `hasStringStatus(error, value)` hook (Gemini uses `RESOURCE_EXHAUSTED`/`RATE_LIMIT_EXCEEDED`/`'429'` string statuses; Mistral returns `false`); and the network-pattern regex.
- The helper produces `LlmError` instances via the same `buildError(ErrorClass, message, providerName, originalError)` convention used today.
- The helper imports only `LlmError` subclasses and `isErrorObject` — no provider service, no NestJS module coupling (no circulars).

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `SPEC.md` (v2.3 — § "Mistral error mapping", § product decision #13)
- `docs/llm/error-handling.md`
- `src/llm/gemini.service.ts` (existing helpers being extracted)
- `src/common/errors/index.ts`

Implementation mandatory docs:

- `SPEC.md` (v2.3)
- `src/llm/gemini.service.ts` (reference structure for the existing helpers)
- `src/common/errors/index.ts`

Code Reviewer mandatory docs:

- `SPEC.md` (v2.3)
- `docs/llm/error-handling.md`
- `src/llm/gemini.service.ts`

### Shared helper plan (mandatory when helper changes are expected)

1. Helper: `src/llm/llm-error-mapper.ts` — provider-agnostic classification cascade.
   - Decision: `new`
   - Owning module/path: `src/llm/llm-error-mapper.ts` (+ `src/llm/llm-error-mapper.spec.ts`)
   - Call-site rationale: both `GeminiService.mapError()` and `MistralService.mapError()` share the same priority order, message-pattern matching, and tie-break rules; only the SDK-shape probes differ. Extracting the cascade removes ~150 lines of duplication, satisfies the repo's KISS/DRY prime directive, and the action-plan template's mandatory Shared-helper planning gate.
   - Relevant canonical doc target: `docs/llm/error-handling.md` (the "Worked Example" section must refactored to describe the shared helper, not just `GeminiService`).
   - Planned doc status: `Not implemented`

### Acceptance criteria

1. `src/llm/llm-error-mapper.ts` exports a function (e.g. `classifyLlmError({ providerName, extractStatusCode, hasStringStatus, networkPattern, message, error })`) returning `LlmError | undefined`.
2. The helper implements the full priority order and all tie-break rules (resource-exhausted > rate-limit; content-filtered > context-length) per `docs/llm/error-handling.md`.
3. Classification: status 429 + quota pattern → `ResourceExhaustedError`; 429 + rate-limit pattern, or 429 generic (no quota), or `hasStringStatus` returns `true` for `'429'`/`'RATE_LIMIT_EXCEEDED'`/`'rate_limit_exceeded'` → `RateLimitError`. (If `hasStringStatus` returns `true` for `'RESOURCE_EXHAUSTED'`/`'resource_exhausted'` **or** message matches quota pattern, `ResourceExhaustedError` takes priority — see criterion #1.) 401/403 → `AuthenticationError`; 400 + safety/blocked/filter pattern → `ContentFilteredError`; 400 + context-length pattern → `ContextLengthExceededError`; 400 generic or any other unrecognised 4xx (incl. 418, 422) → `InvalidRequestError`; any 5xx → `ProviderServerError`; `HTTPClientError` subclass name or network-failure message pattern (`ECONNREFUSED`/`ETIMEDOUT`/`ECONNRESET`/`ENOTFOUND`/`fetch failed`/`network`) and no extractable HTTP status → `NetworkError`; anything else → `undefined`.
4. Non-object and `null`/`undefined` inputs return `undefined`.
5. The helper passes a synthetic-probe unit test suite covering each of the above branches and tie-breaks in isolation (no real SDK classes in scope).

### Required test cases (Red first)

**New test file `src/llm/llm-error-mapper.spec.ts`:**

The tests use **synthetic probe inputs** (plain objects with fake `statusCode`/`status`/`message` fields rather than real SDK instances) so the cascade is verifiable in isolation. This file replaces the role of the existing `gemini.service.spec.ts` mapError tests as the canonical cascade coverage for both providers; the existing `gemini.service.spec.ts` mapError tests still pass end-to-end via the real Gemini probe config after Section 6.

1. `extractStatusCode` hook returns `429`; message matches quota pattern → `ResourceExhaustedError`.
2. `extractStatusCode` returns `429`; message matches rate-limit pattern → `RateLimitError`.
3. `extractStatusCode` returns `429`; message matches both quota and rate-limit patterns → `ResourceExhaustedError` (priority).
4. `extractStatusCode` returns `429`; generic message → `RateLimitError`.
5. `hasStringStatus` returns `true` for `'429'` → `RateLimitError`.
6. `hasStringStatus` returns `true` for `'rate_limit_exceeded'` → `RateLimitError`.
7. `hasStringStatus` returns `true` for `'resource_exhausted'` → `ResourceExhaustedError`.
8. `extractStatusCode` returns `401` → `AuthenticationError`.
9. `extractStatusCode` returns `403` → `AuthenticationError`.
10. `extractStatusCode` returns `400`; message matches `safety|blocked|filter` → `ContentFilteredError`.
11. `extractStatusCode` returns `400`; message matches `context[ _]?length` → `ContextLengthExceededError`.
12. `extractStatusCode` returns `400`; message matches both safety and context-length patterns → `ContentFilteredError` (priority).
13. `extractStatusCode` returns `400`; generic message → `InvalidRequestError`.
14. `extractStatusCode` returns `418` → `InvalidRequestError`.
15. `extractStatusCode` returns `422` → `InvalidRequestError`.
16. `extractStatusCode` returns `500` → `ProviderServerError`.
17. `extractStatusCode` returns `503` → `ProviderServerError`.
18. `extractStatusCode` returns `undefined`; message matches network pattern → `NetworkError`.
19. `HTTPClientError` subclass-name match (probed via input `name === 'ConnectionError'`) → `NetworkError` when no HTTP status.
20. `HTTPClientError` subclass name `'InvalidRequestError'` with no HTTP status → `undefined` (the probe deliberately excludes this name per the Mistral name-collision warning in the SPEC; unclassifiable).
21. `originalError` for `Error` instances is narrowed to `Error|undefined`; non-`Error` inputs produce `originalError: undefined`.
22. `null` → `undefined`.
23. `undefined` → `undefined`.
24. String input → `undefined`.

### Section checks

- `npx vitest run --project unit --reporter=verbose src/llm/llm-error-mapper` — all green.
- `npm run lint` — no new violations.
- `npm run lint:british` — no British English violations.
- Mandatory-read evidence gate passed for all delegated handoffs in this section.
- Shared-helper planning entry present (above) with status `Not implemented`; the canonical doc (`docs/llm/error-handling.md`) "Worked Example" section is updated in Section 11 to describe the shared helper after the implementation lands (reconciling status from `Not implemented`).

### Implementation notes / deviations / follow-up

- **Implementation notes:** TDD red → green. RED: `src/llm/llm-error-mapper.spec.ts` created with all 24 synthetic-probe test cases (ERR_MODULE_NOT_FOUND). GREEN: `src/llm/llm-error-mapper.ts` created — exports `LlmErrorMapperProbes` (per SPEC, `isHttpClientError` optional defaulting to false) and `classifyLlmError()` with the full priority cascade and both tie-breaks; module-local helpers `extractMessage` (probes `error.message` AND `error.body` for Mistral parity), `buildError`, `isResourceExhausted`, `isRateLimit`. Imports only `LlmError` subclasses + `isErrorObject` (no provider/NestJS coupling). A lint-clean-up pass on the spec file followed (JSDoc tags, variable renames, `.includes()` refactors — no test cases or assertions changed). 24/24 green; `src/llm/` 117/117; full suite 391/391; build/lint/lint:british clean. Code review: PASS.
- **Deviations from plan:** None. (Note: helper `extractMessage` also considers `error.body` for `Error` instances — broader than Gemini's original message-only extraction; intentional for Mistral parity, reviewer-confirmed no Gemini regression risk.)
- **Follow-up implications:** Sections 4 and 6 consume this helper. Existing `gemini.service.spec.ts` `mapError` tests serve as integration regression for the helper once Section 6 delegates `GeminiService.mapError()` to it. Reviewer forward note for Section 6: confirm `gemini.service.spec.ts` has no exact-message assertions relying on message-only extraction (none expected).

---

## Section 4 — MistralService Implementation

### Objective

- Create `MistralService extends LLMService` in `src/llm/mistral.service.ts`.
- Implement `providerName = 'mistral'`, `_sendInternal()`, and `mapError()`.
- Unit-test `_sendInternal` (text and image payloads, reasoning effort, model selection) and `mapError` (all error categories including priority conflicts).

### Constraints

- Constructor accepts `ConfigService` and `JsonParserUtility` (same as `GeminiService`).
- Reads `MISTRAL_API_KEY` from config; throws if missing.
- Instantiates Mistral SDK client via `new Mistral({ apiKey })`.
- `_sendInternal` builds `messages[]` with `SystemMessage` and `UserMessage` per the spec's behavioural model.
- For image payloads, each image becomes an `ImageURLChunk` with `imageUrl: 'data:'` URI.
- `reasoningEffort` maps per the spec's mapping table: `off→omitted`, `low→'low'`, `high→'medium'`, `max→'xhigh'`.
- Response text is extracted from `result.choices?.[0]?.message?.content`.
- Malformed JSON is repaired via `JsonParserUtility`.
- `safePrompt: false` and `responseFormat: { type: 'json_object' }` are **recommended defaults** passed to `client.chat.complete()` (SPEC resolved open question #6 — not hard-asserted in tests).
- **`mapError()` delegates to the shared helper** from Section 3 with a Mistral-specific probe configuration:
  - `providerName: 'mistral'`
  - `extractStatusCode(error)` — probes `MistralError.statusCode` (numeric) and falls back to `error.status`/`error.code`/`error.response.status` shapes for parity with non-`MistralError` inputs.
  - `hasStringStatus(error, value)` — Mistral errors do not use string statuses; returns `false`. (The hook exists in the helper interface but is unused for Mistral.)
  - `message` extraction: `error.body` (raw response body) is treated as a secondary message source alongside `error.message` (the shared helper probes both).
  - `HTTPClientError` subclass matching: the helper probes `error.name` against `['ConnectionError', 'RequestTimeoutError', 'RequestAbortedError', 'UnexpectedClientError', 'InvalidRequestError']` (the SDK's exported variants).
- Non-object/null inputs return `undefined` (consistent with GeminiService convention).
- Unrecognised plain objects with no matching status/message patterns return `undefined` (parity with GeminiService behaviour).
- Classification priority (highest to lowest): `ResourceExhaustedError` > `RateLimitError` > `AuthenticationError` > `ContentFilteredError` > `ContextLengthExceededError` > `InvalidRequestError` > `ProviderServerError` > `NetworkError` > `undefined`.
- Unrecognised 4xx status codes classify as `InvalidRequestError` (per `docs/llm/error-handling.md`).
- `ContentFilteredError` takes priority over `ContextLengthExceededError` when both patterns match a 400 error.
- `ResourceExhaustedError` takes priority over `RateLimitError` when both patterns match a 429 error.
- `MistralService` does **not** re-implement the private helpers `extractStatusCode`, `hasStringStatus`, `isResourceExhausted`, `isRateLimit`, `buildError`, `extractMessage` — those live in the shared helper (Section 3). The only per-provider code is the probe configuration and `providerName`.

### Acceptance criteria

**Constructor:**

1. Reads `MISTRAL_API_KEY` from ConfigService on construction.
2. Instantiates `Mistral` SDK client with correct API key.
3. Throws if `MISTRAL_API_KEY` is empty/undefined.

**\_sendInternal — text payload:** 4. Sends correct `model`, `messages` (system + user with string content), and `temperature`. 5. Falls back to `'mistral-small-latest'` when `payload.model` is absent. 6. Uses `payload.model` override when present. 7. Maps `reasoningEffort = 'off'` → `reasoningEffort` omitted from request. 8. Maps `reasoningEffort = 'low'` → `reasoningEffort: 'low'`. 9. Maps `reasoningEffort = 'high'` → `reasoningEffort: 'medium'`. 10. Maps `reasoningEffort = 'max'` → `reasoningEffort: 'xhigh'`. 11. Extracts `choices[0].message.content` and passes it through `JsonParserUtility`. 12. Validates the parsed result with `LlmResponseSchema` (happy path). 13. Throws `ZodError` when response fails schema validation. 14. The `client.chat.complete()` call receives `safePrompt: false` and `responseFormat: { type: 'json_object' }` in the request options — **presence is verified, not the exact value** (these are recommended defaults; a future model exception list may omit `responseFormat` for specific prefixes without breaking this test).

**\_sendInternal — image payload:** 15. Builds `UserMessage` with `ImageURLChunk` entries — correct `imageUrl` data URIs. 16. Sends correct `model` for image payload. 17. Handles multiple images in the content array.

**mapError:** 17. `MistralError` with status 429 + rate-limit message → `RateLimitError`. 18. `MistralError` with status 429 + quota-exhausted message → `ResourceExhaustedError`. 19. `MistralError` with status 429 and both quota + rate-limit patterns → `ResourceExhaustedError` (takes priority over `RateLimitError`). 20. `MistralError` with status 401 or 403 → `AuthenticationError`. 21. `MistralError` with status 400 + safety/blocked message → `ContentFilteredError`. 22. `MistralError` with status 400 + context-length message → `ContextLengthExceededError`. 23. `MistralError` with status 400 and both safety + context-length patterns → `ContentFilteredError` (takes priority over `ContextLengthExceededError`). 24. `MistralError` with status 400 (generic, no safety/context-length pattern) → `InvalidRequestError`. 25. `MistralError` with any unrecognised 4xx status (418, 422) → `InvalidRequestError`. 26. `MistralError` with status 500 or 503 → `ProviderServerError`. 27. `ConnectionError` instance (or `Error` with `ECONNREFUSED` message and no HTTP status) → `NetworkError`. 28. Unrecognised plain object with no matching status/message patterns → `undefined`. 29. `null` input → `undefined`. 30. String input → `undefined`.

**Retry loop (inherited from `LLMService`):** 31. Retries on retryable errors (429 RateLimit) and eventually succeeds. 32. Does not retry on non-retryable errors (ResourceExhausted). 33. Throws after max retries exhausted on retryable error.

**Error logging:** 34. Logs error context on `_sendInternal` failure (model, payload type, status code).

### Required test cases (Red first)

**New test file `src/llm/mistral.service.spec.ts`:**

A. **Constructor and initialisation:**

1.  Reads `MISTRAL_API_KEY` from ConfigService on construction.
2.  Instantiates `Mistral` SDK client with correct API key.
3.  Throws if `MISTRAL_API_KEY` is empty/undefined.

B. **`_sendInternal` — text payload:** 4. Sends correct `model`, `messages` (system + user), `temperature`, and `reasoningEffort` to `client.chat.complete()`. 5. Falls back to `'mistral-small-latest'` when `payload.model` is absent. 6. Uses `payload.model` override when present. 7. Maps `off` → omitted, `low` → `'low'`, `high` → `'medium'`, `max` → `'xhigh'` (four separate test cases). 8. Extracts `choices[0].message.content` and passes it through `JsonParserUtility`. 9. Validates parsed result with `LlmResponseSchema` (happy path). 10. Throws `ZodError` when response fails schema validation. 11. Verifies `client.chat.complete()` is called with `safePrompt: false` and `responseFormat: { type: 'json_object' }` present in the request options (for models not on the exception list).

C. **`_sendInternal` — image payload:** 11. Builds `UserMessage` with `ImageURLChunk` entries — correct `imageUrl` data URIs. 12. Sends correct `model` for image payload. 13. Handles multiple images in the content array.

D. **`mapError`:** 14. Rate-limit (429) → `RateLimitError`. 15. Resource-exhausted (429 + quota message) → `ResourceExhaustedError`. 16. Resource-exhausted over rate-limit priority (429 with both patterns) → `ResourceExhaustedError`. 17. Authentication (401, 403) — two test cases → `AuthenticationError`. 18. Content-filtered (400 + safety) → `ContentFilteredError`. 19. Context-length (400 + context length) → `ContextLengthExceededError`. 20. Content-filtered over context-length priority (400 with both patterns) → `ContentFilteredError`. 21. Generic 400 → `InvalidRequestError`. 22. Unrecognised 4xx (418, 422) — two test cases → `InvalidRequestError`. 23. Provider server error (500, 503) — two test cases → `ProviderServerError`. 24. Network error (`ConnectionError` instance) → `NetworkError`. 25. Network error (`Error` with `ECONNREFUSED` message, no HTTP status) → `NetworkError`. 26. Unrecognised plain object (no status/message patterns) → `undefined`. 27. `null` input → `undefined`. 28. `undefined` input → `undefined`. 29. String input → `undefined`.

E. **Retry loop (inherited from `LLMService`):** 30. Retries on retryable errors (429 RateLimit) and eventually succeeds. 31. Does not retry on non-retryable errors (ResourceExhausted). 32. Throws after max retries exhausted on retryable error.

F. **Error logging:** 33. Logs error context on `_sendInternal` failure (model, payload type, status code).

### Section checks

- `npx vitest run --project unit --reporter=verbose src/llm/mistral.service` — all green.
- `npm run lint` — no new violations.
- `npm run lint:british` — no British English violations.

### Implementation notes / deviations / follow-up

- **Implementation notes:** TDD red → green. RED: `src/llm/mistral.service.spec.ts` created with 39 tests (groups A–F; 41 assertions-level cases reported by vitest). GREEN: `src/llm/mistral.service.ts` created — `providerName = 'mistral'`; constructor with defensive `MISTRAL_API_KEY` check and `new Mistral({ apiKey })`; `_sendInternal` builds system+user messages (text string / ImageURLChunk data-URI array), `temperature ?? 0`, reasoning-effort mapping (off→omitted, low→low, high→medium, max→xhigh), `safePrompt: false` + `responseFormat: { type: 'json_object' }` recommended defaults, response extraction → JsonParserUtility → LlmResponseSchema; `mapError()` is a thin adapter delegating to `classifyLlmError()` with the Mistral probe config (`hasStringStatus: () => false`; `isHttpClientError` excludes the `'InvalidRequestError'` name per the SPEC collision warning). 41/41 green; `src/llm/` 158/158; full suite 432/432; mocked E2E 49 passed; build/lint/lint:british clean. Code review: PASS.
- **Deviations from plan:** None.
- **Follow-up implications:** `MistralService` is needed by `RoutingLLMService` (Section 5). Reviewer follow-ups for Section 6: (a) `normaliseStatusCode` is duplicated between MistralService and GeminiService — the Section 6 refactor should hoist status-code probing shared logic if natural; (b) provider error logging fires only on SDK-call failure, not parse/validation failure — matches test F but noted for parity consideration.

---

## Section 5 — RoutingLLMService and Module Wiring

### Objective

- Create `RoutingLLMService implements ILlmService` in `src/llm/routing-llm.service.ts`.
- Implement `send()` with the routing decision flow per the spec.
- Validate configured model names at construction (fail-fast, aggregated). **Do not** validate API keys — both keys are already enforced as required and non-empty by the Zod environment schema (SPEC product decision #4). Provider services retain their existing defensive own-key constructor checks.
- Update `LlmModule` to wire `LLM_SERVICE_TOKEN` to `RoutingLLMService`.
- Update `assessor.service.spec.ts` and `llm.module.spec.ts` to match the final wiring (removing Section 1's temporary overrides).

### Constraints

- `RoutingLLMService` does **not** extend `LLMService`.
- Constructor accepts `ConfigService`, `GeminiService`, `MistralService`.
- Constructor validates **model names only**:
  - Both `DEFAULT_TEXT_TABLE_MODEL` and `DEFAULT_IMAGE_MODEL` pass `validateModelName()`. Validate both before throwing — collect both errors into a single aggregated message and throw once, so a misconfigured environment reports every problem in one start-up failure.
  - The error message lists the unrecognised model name(s) and the set of supported prefixes from `SUPPORTED_MODELS`.
- The constructor **does not** read or check `GEMINI_API_KEY` / `MISTRAL_API_KEY` — Zod has already enforced both as required and non-empty (SPEC product decision #4, environment-schema additions). Provider services' own constructors retain the existing defensive own-key check for direct-instantiation paths (unchanged from the existing `GeminiService` pattern).
- `send()` determines task type (text/table vs image), looks up model and reasoning effort config **at send time** (so runtime config changes take effect without restart), resolves provider via `resolveProvider()`, **sets** `payload.model` and `payload.reasoningEffort` from server config (authoritative — overwrites any caller-supplied value; SPEC product decision #12), and delegates `provider.send(payload)`.
- The router does **not** implement retry logic (providers handle their own).
- If `resolveProvider()` throws at `send()` time (operator edits env at runtime to an unsupported model name), the resulting `Error` propagates out of `provider.send()` and is caught by the provider's `mapError()` cascade — surfaces as `InvalidRequestError`. Documented behaviour (SPEC resolved open question #8); the constructor's startup validation does not protect the runtime-edit path.
- `LlmModule` registers `GeminiService` and `MistralService` as class providers (for injection into `RoutingLLMService`). `RoutingLLMService` is provided **only** via `{ provide: LLM_SERVICE_TOKEN, useClass: RoutingLLMService }` — no separate class-provider entry for `RoutingLLMService` (avoids a duplicate instance).
- The previous `{ provide: LLMService, useClass: GeminiService }` entry is already removed from Section 1.

### Acceptance criteria

1. `RoutingLLMService` constructor validates both configured model names. Throws a single aggregated `Error` listing every unrecognised model name and the set of supported prefixes when one or both are unrecognised.
2. Constructor does **not** read or check `GEMINI_API_KEY` / `MISTRAL_API_KEY` (Zod enforces them). The constructor succeeds whenever both model names are valid, regardless of which provider they map to.
3. Constructor does not throw when both models are valid.
4. `RoutingLLMService.send()` with a text/table payload routes to the provider configured for `DEFAULT_TEXT_TABLE_MODEL`.
5. `RoutingLLMService.send()` with an image payload routes to the provider configured for `DEFAULT_IMAGE_MODEL`.
6. Mixed-provider config works: text routes to Gemini, image routes to Mistral (or vice versa), in the same test run.
7. The delegated payload carries `model` and `reasoningEffort` fields set from config.
8. The router **authoritatively overwrites** any caller-supplied `model`/`reasoningEffort` with the server-config values (SPEC product decision #12 — no caller-precedence).
9. `LlmModule` resolves `LLM_SERVICE_TOKEN` to a `RoutingLLMService` instance.
10. `GeminiService` and `MistralService` are independently injectable from the module.
11. **`src/v1/assessor/assessor.module.spec.ts` mock `ConfigService` returns non-empty `MISTRAL_API_KEY`** (and the four new model/effort vars). **⚠️ Compile-time prerequisite:** This test imports `AssessorModule`, which transitively imports `LlmModule`, so `MistralService` is instantiated as a class provider during test-module compilation — without `MISTRAL_API_KEY` in the mock (currently returns `undefined` for unknown keys via the `default` branch), the constructor throws and the test fails to compile before any test runs. Apply this mock update before writing or running Section 5 tests. The existing `assessor.module.spec.ts` `getMockConfigValue` `switch` only handles the legacy keys, so this is a real compile-time break that Section 5 must fix.

### Required test cases (Red first)

**New test file `src/llm/routing-llm.service.spec.ts`:**

A. **Constructor validation — model names:**

1.  Constructor throws when `DEFAULT_TEXT_TABLE_MODEL` is unrecognised; error message contains the model name and the supported prefixes (e.g. `gemini-2.5-flash`, `mistral-small-latest`).
2.  Constructor throws when `DEFAULT_IMAGE_MODEL` is unrecognised.
3.  Constructor throws a single aggregated error (one message mentioning both unrecognised names) when **both** configured models are unrecognised.
4.  Constructor does not throw when both models are in the registry (regardless of which provider they map to).

C. **Routing logic:** 5. Text payload routes to `GeminiService` when `DEFAULT_TEXT_TABLE_MODEL` maps to Gemini. 6. Text payload routes to `MistralService` when `DEFAULT_TEXT_TABLE_MODEL` maps to Mistral. 7. Image payload routes to `GeminiService` when `DEFAULT_IMAGE_MODEL` maps to Gemini. 8. Image payload routes to `MistralService` when `DEFAULT_IMAGE_MODEL` maps to Mistral. 9. Mixed config: text → Gemini, image → Mistral in the same test. 10. Routed payload carries `model` field set from config. 11. Routed payload carries `reasoningEffort` field set from config. 12. Caller-supplied `model` is **overwritten** by server config (confirms authoritative behaviour; guards against accidental caller-precedence reintroduction). 13. Caller-supplied `reasoningEffort` is **overwritten** by server config (same). 14. `send()` returns the provider's response directly.

**Updated test file `src/llm/llm.module.spec.ts`:**

15. `LLM_SERVICE_TOKEN` resolves to a `RoutingLLMService` instance (not `GeminiService`).
16. `GeminiService` is injectable by class token.
17. `MistralService` is injectable by class token.
18. The mock `ConfigService` must return `MISTRAL_API_KEY`, `DEFAULT_TEXT_TABLE_MODEL`, `DEFAULT_IMAGE_MODEL`, `TEXT_REASONING_EFFORT`, and `IMAGE_REASONING_EFFORT` in addition to existing keys (`MISTRAL_API_KEY` is now needed because `MistralService` is a registered class provider whose constructor reads it — NotImplementedError thrown by the mock would otherwise break module compilation).

**Updated test file `src/v1/assessor/assessor.service.spec.ts`:**

19. Override `LLM_SERVICE_TOKEN` with a mock `ILlmService` (replace the existing `LLMService` override).
20. Keep the existing `GeminiService` override unchanged (defensive — its constructor would otherwise run during module compilation because `GeminiService` is a class provider in `LlmModule`).
21. **Add** an `MistralService` override (`{ send: vi.fn() }`) for the same defensive reason as `GeminiService` — `MistralService` is now a class provider in `LlmModule` and NestJS instantiates class providers during test-module compilation unless they are overridden. Without this override, `MistralService`'s constructor runs `new Mistral({ apiKey })` against the (mocked) `MISTRAL_API_KEY`, which is harmless when mocked but couples the test to the SDK; the defensive override keeps the assessor unit test isolated from provider internals.
22. Mock `ConfigService` must return all environment values the provider constructors read: `GEMINI_API_KEY`, `MISTRAL_API_KEY`, plus `DEFAULT_TEXT_TABLE_MODEL`, `DEFAULT_IMAGE_MODEL`, `TEXT_REASONING_EFFORT`, `IMAGE_REASONING_EFFORT` (so both provider constructors and the router constructor succeed during module compilation). 23. All existing assertions remain identical.

**Updated test file `src/v1/assessor/assessor.module.spec.ts`:**

24. Expand the `getMockConfigValue` `switch` to return non-empty values for `MISTRAL_API_KEY` (e.g. `'dummy-key-for-testing'`), `DEFAULT_TEXT_TABLE_MODEL`, `DEFAULT_IMAGE_MODEL` (e.g. `'gemini-2.5-flash-lite'`/`'gemini-2.5-flash'` or `'mistral-small-latest'` — any valid registry prefix), `TEXT_REASONING_EFFORT` (e.g. `'low'`), and `IMAGE_REASONING_EFFORT` (e.g. `'high'`). Without these, `MistralService`'s constructor throws on the undefined `MISTRAL_API_KEY` and `RoutingLLMService`'s constructor throws on the unrecognised model-name validation — the test fails to compile.
25. All existing `AssessorModule` assertions (`should be defined`, `should provide AssessorController`, `should provide AssessorService`) remain unchanged.

### Section checks

- `npx vitest run --project unit --reporter=verbose src/llm/routing-llm.service` — all green.
- `npx vitest run --project unit --reporter=verbose src/llm/llm.module` — all green.
- `npx vitest run --project unit --reporter=verbose src/v1/assessor/` — all green.
- `npx vitest run --project unit --reporter=verbose src/llm/` — all LLM tests green (including Gemini, Mistral, router, module).
- `npm run build` — successful.
- `npm run lint` — no new violations.

### Implementation notes / deviations / follow-up

- **Implementation notes:** Section 5 GREEN phase complete (Refactor remaining). Created `src/llm/routing-llm.service.ts` — `RoutingLLMService implements ILlmService` (dispatcher, does NOT extend `LLMService`). Constructor validates both `DEFAULT_TEXT_TABLE_MODEL` and `DEFAULT_IMAGE_MODEL` via `validateModelName()`, collecting errors into a single aggregated `Error`. Constructor does **not** read/check `GEMINI_API_KEY`/`MISTRAL_API_KEY` (Zod's responsibility). `send()` reads model/effort from `ConfigService` at send time, authoritatively overwrites `payload.model`/`payload.reasoningEffort`, resolves provider via `resolveProvider()`, and delegates. Updated `llm.module.ts` — `GeminiService` + `MistralService` as class providers, `LLM_SERVICE_TOKEN` via `useClass: RoutingLLMService`, exports `LLM_SERVICE_TOKEN` only. Updated `assessor.service.spec.ts` (adds `MistralService` override, new env vars in mock), `assessor.module.spec.ts` (adds `MISTRAL_API_KEY` + four new model/effort vars to mock), `llm.module.spec.ts` (verifies `LLM_SERVICE_TOKEN` resolves to `RoutingLLMService`, tests `GeminiService`/`MistralService` injectability, new env vars in mock). All section checks pass: routing-llm.service 14/14, llm.module 4/4, assessor/ 23/23, full LLM suite 182/182, `npm test` 456/456, build/lint/lint:british clean. Refactor phase: no code-quality issues found — implementation is minimal, well-documented, no duplication.
- **Deviations from plan:** None.
- **Follow-up implications:** This completes the routing architecture. The `LLMService` class token is no longer exported from `LlmModule`; any module that previously injected `LLMService` must now use `LLM_SERVICE_TOKEN`. Section 6 was already committed before Section 5 (commit `8790573` — GeminiService optional payload fields and shared error-mapper adoption). Section 8 adds the Mistral mocked E2E tests.

---

## Section 6 — GeminiService Updates and Shared-Helper Refactor

### Objective

- Update `GeminiService._sendInternal` to read `payload.model` and `payload.reasoningEffort` when present.
- Fall back to existing hardcoded behaviour when absent.
- Add unit tests for the new optional fields.
- **Refactor `GeminiService.mapError()`** to delegate to the shared helper from Section 3 (`src/llm/llm-error-mapper.ts`), supplying the existing Gemini probe configuration. The refactor is behaviour-preserving — the existing `gemini.service.spec.ts` `mapError` tests serve as regression and must remain green unchanged.

### Constraints

- Existing behaviour is fully preserved when `model` and `reasoningEffort` are absent from the payload.
- `payload.model` overrides the hardcoded model selection (`gemini-2.5-flash-lite` / `gemini-2.5-flash`).
- `payload.reasoningEffort` maps to `thinkingConfig.thinkingBudget` per the spec's mapping table: `off→0`, `low→0`, `high→1024`, `max→8192`.
- Note: both `'off'` and `'low'` map to `thinkingBudget: 0` for Gemini — this is intentional (current hardcoded behaviour is `0`; `'low'` for Gemini has no native equivalent, so it preserves the existing default). The `'low'` == `'off'` indistinguishability is a known v1 limitation (see SPEC mapping-table note); the Section 6 unit tests deliberately keep both as separate cases to document the gap rather than collapse it (a single combined case would mask the limitation).
- No other `_sendInternal` behaviour changes.
- `mapError()` becomes a thin adapter: probe config (`extractStatusCode` reading `error.status`/`error.code`/`error.statusCode`/`error.response.status`/`error.error.status`/`error.error.code`; `hasStringStatus` checking `RESOURCE_EXHAUSTED`/`RATE_LIMIT_EXCEEDED`/`'429'`/`'rate_limit_exceeded'`/`'resource_exhausted'` case-insensitively; network-pattern regex) + delegation to `classifyLlmError()`.
- The existing private helpers (`extractStatusCode`, `hasStringStatus`, `isResourceExhausted`, `isRateLimit`, `buildError`, `extractMessage`) are deleted from `GeminiService` and replaced by the shared helper — no duplication.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `SPEC.md` (v2.3 — § product decision #13, § "Mistral error mapping", § "Resolved open questions" #6)
- `src/llm/gemini.service.spec.ts` (existing mapError tests must stay green unchanged)
- `src/llm/llm-error-mapper.ts` and `src/llm/llm-error-mapper.spec.ts` (from Section 3)

Implementation mandatory docs:

- `SPEC.md` (v2.3)
- `src/llm/gemini.service.ts` (extract targets)
- `src/llm/llm-error-mapper.ts` (delegation target)

Code Reviewer mandatory docs:

- `SPEC.md` (v2.3 — § product decision #13)
- `src/llm/gemini.service.ts`
- `src/llm/llm-error-mapper.ts`

### Shared helper plan (mandatory when helper changes are expected)

1. Helper: `src/llm/llm-error-mapper.ts` — reuse decision.
   - Decision: `reuse` (the helper was `new` in Section 3; Section 6 consumes it)
   - Owning module/path: `src/llm/llm-error-mapper.ts`
   - Call-site rationale: `GeminiService.mapError()` delegates to the shared cascade with its existing probe config. Removes the per-provider helper duplication; the only per-provider code remaining is the probe configuration and `providerName`.
   - Relevant canonical doc target: `docs/llm/error-handling.md` (the "Worked Example" section is updated in Section 11 to describe the shared helper as the canonical pattern).
   - Planned doc status: `Not implemented` (set in Section 3; reconciled to `implemented` in Section 11).

### Acceptance criteria

1. When `payload.model` is present, it is used instead of the hardcoded model.
2. When `payload.model` is absent, existing hardcoded model selection is used (regression).
3. When `payload.reasoningEffort` is `'off'`, `thinkingBudget` is `0`.
4. When `payload.reasoningEffort` is `'low'`, `thinkingBudget` is `0` — documented as intentionally indistinguishable from `'off'` at the request level (known v1 limitation; kept as a separate test case to surface the gap, not to assert a different outcome).
5. When `payload.reasoningEffort` is `'high'`, `thinkingBudget` is `1024`.
6. When `payload.reasoningEffort` is `'max'`, `thinkingBudget` is `8192`.
7. When `payload.reasoningEffort` is absent, `thinkingBudget` is `0` (existing behaviour).
8. **`GeminiService.mapError()` delegates to `classifyLlmError()`** from Section 3 with the existing Gemini probe config; the existing private helpers are removed.
9. **All existing `gemini.service.spec.ts` `mapError` test cases pass unchanged** (behaviour-preserving refactor — they assert the same classifications against the same SDK-shape inputs).

### Required test cases (Red first)

**Updated test `src/llm/gemini.service.spec.ts`:**

1. Text payload with `payload.model = 'gemini-2.5-flash'` overrides default model to `'gemini-2.5-flash'`.
2. Text payload without `payload.model` uses default `'gemini-2.5-flash-lite'` (regression).
3. Image payload with `payload.model` override.
4. Text payload with `reasoningEffort = 'off'` → `thinkingBudget: 0`.
5. Text payload with `reasoningEffort = 'low'` → `thinkingBudget: 0` (kept separate from `'off'` deliberately — see acceptance criterion #4; the test documents the gap, not a different outcome. Note: this is a Gemini v1 limitation — the router correctly passes the abstract level `'low'`; the mapping to `0` is `GeminiService`'s responsibility, not a routing error.)
6. Text payload with `reasoningEffort = 'high'` → `thinkingBudget: 1024`.
7. Text payload with `reasoningEffort = 'max'` → `thinkingBudget: 8192`.
8. Text payload without `reasoningEffort` → `thinkingBudget: 0` (regression).
9. Verify existing `_sendInternal` tests still pass with extended payload type (field absence is the default).
10. **Existing `mapError` test cases pass unchanged after the refactor onto the shared helper** (no new mapError tests needed in Section 6 — they belong to Section 3; the existing ones serve as regression for the refactor).

### Section checks

- `npx vitest run --project unit --reporter=verbose src/llm/gemini.service` — all green (existing mapError + `_sendInternal` regression + new payload-field tests).
- `npx vitest run --project unit --reporter=verbose src/llm/llm-error-mapper` — all green (the shared helper, from Section 3, must remain green after the Gemini probe config wires through it).
- `npm run lint` — no new violations.
- Mandatory-read evidence gate passed for all delegated handoffs in this section.
- Shared-helper planning entry present (above) recording the `reuse` decision; the canonical doc update happens in Section 11.

### Implementation notes / deviations / follow-up

- **Implementation notes:** TDD red → green. RED: 8 new tests added to `gemini.service.spec.ts` ("optional model and reasoningEffort payload fields" block) — 4 red (text/image model override, high→1024, max→8192), 4 green-by-coincidence regressions (defaults; off/low→0). GREEN: `buildModelParams` reads `payload.model ?? <hardcoded default>` and `mapThinkingBudget(payload.reasoningEffort)` (off/low→0 with a documented v1-limitation comment, high→1024, max→8192, absent→0). `mapError()` is now a one-line delegation to `classifyLlmError(GEMINI_PROBES, error)`; the six private helpers and five pattern constants were deleted from `GeminiService`. The Section 4 reviewer's `normaliseStatusCode` duplication was resolved by exporting it from `llm-error-mapper.ts` and importing it in both providers' probe configs (behaviour-preserving). Existing `mapError` describe block passed UNCHANGED (behaviour-preserving refactor confirmed). Gemini suite 63/63; `src/llm/` 166/166; full suite 440/440; build/lint/lint:british clean. Code review: PASS (cosmetic describe re-indent applied post-review).
- **Deviations from plan:** `normaliseStatusCode` shared probe utility exported from `llm-error-mapper.ts` and consumed by both providers — a minor sanctioned extension beyond the strict Section 6 text, resolving the Section 4 review's DRY finding.
- **Follow-up implications:** None — GeminiService is now compatible with the routing layer and shares its error-mapping cascade with MistralService.

---

## Section 7 — Environment Schema, App-Lifecycle Defaults, and Unit-Test Mock Audit

### Objective

- Add the five new environment variables to `environment.schema.ts`.
- Update `.env.example` and `.test.env.example` with documentation. Both files already exist at the repo root (`ls` confirms). `.test.env.example` is the committed template; developers copy it to `.test.env` (gitignored) and fill in real API keys for live tests.
- Ensure `ConfigService` validates and returns the new values.
- **CRITICAL: Update `test/utils/app-lifecycle.ts` `defaultTestValues`** to add `MISTRAL_API_KEY: 'dummy-key-for-testing'` (parallel to the existing `GEMINI_API_KEY: 'dummy-key-for-testing'`). Without this, every mocked E2E run that does not supply `MISTRAL_API_KEY` in `.test.env` fails at Zod validation before the app starts. Live E2E continues to supply the real `MISTRAL_API_KEY` via `.test.env` (which overrides defaults).
- **CRITICAL: Audit every unit-test mock `ConfigService` for the new keys.** With `MISTRAL_API_KEY` now Zod-required, and once `MistralService` becomes a class provider in `LlmModule` (Section 5), any unit spec whose test module imports `LlmModule` and uses a mock `ConfigService` must return a non-empty `MISTRAL_API_KEY` (and the four new model/effort vars when the router constructor runs in that module).

### Constraints

- `MISTRAL_API_KEY`: `z.string().min(1)` — required.
- `DEFAULT_TEXT_TABLE_MODEL`: `z.string().default('mistral-small-latest')` — validated as plain string (registry check is in `RoutingLLMService` constructor).
- `DEFAULT_IMAGE_MODEL`: `z.string().default('mistral-small-latest')`.
- `TEXT_REASONING_EFFORT`: `z.enum(['off', 'low', 'high', 'max']).default('low')`.
- `IMAGE_REASONING_EFFORT`: `z.enum(['off', 'low', 'high', 'max']).default('high')`.
- `.test.env.example` must be **updated** to include the five new variables with placeholder values alongside the existing `GEMINI_API_KEY` placeholder.
- `test/utils/app-lifecycle.ts` `defaultTestValues` must include `MISTRAL_API_KEY: 'dummy-key-for-testing'` (CRITICAL — backend change #15).
- Audit task: grep across `src/**/*.spec.ts` and `test/**/*.ts` for `Test.createTestingModule({ imports: [...LlmModule...] })`, `Test.createTestingModule({ imports: [...AssessorModule...] })`, and `configObjectSchema.parse`. For each hit, verify the mock `ConfigService` returns non-empty `MISTRAL_API_KEY` (and the four new model/effort vars where the router or any provider constructor runs in that test's module).
  - **Known sites that _transitively_ import `LlmModule` (must be patched in this section or in Section 5):**
    1. `src/llm/llm.module.spec.ts` — directly imports `LlmModule`; the mock `ConfigService` `defaults` object currently has no `MISTRAL_API_KEY`/model/effort keys. Section 5 test-update step #18 owns this; the Section 7 audit confirms.
    2. `src/v1/assessor/assessor.service.spec.ts` — directly imports `LlmModule`; the mock `ConfigService` `getMockEnvironmentValue` `default` branch returns `''` for unknown keys. Section 5 test-update steps #21–#22 own this; the Section 7 audit confirms.
    3. `src/v1/assessor/assessor.module.spec.ts` — **transitively** imports `LlmModule` via `AssessorModule`; its `getMockConfigValue` `switch` `default` branch returns `undefined`. Section 5 test-update step #24 owns this; the Section 7 audit confirms. (This site was surfaced by the second-pass Planner-Reviewer review; the first-pass review missed it because the grep target was too narrow.)
    4. `src/config/environment.schema.spec.ts` — tests the Zod schema directly (not `LlmModule`); must accept a config object containing the new keys and reject an empty `MISTRAL_API_KEY`. Section 7's own schema-test updates cover this.
  - The audit task's grep scope must include **transitive** `LlmModule` consumers (e.g. `AssessorModule`), not just direct imports.
  - **Explicitly exempt files (direct-instantiation pattern, no `LlmModule` import):** 5. `src/llm/gemini.service.spec.ts` — instantiates `GeminiService` directly (`new GeminiService(configService, ...)`) with a mock `ConfigService` returning `null` for keys it doesn't know. Does **not** import `LlmModule`, so `MistralService` never becomes a class provider in this test. The mock only needs to return `GEMINI_API_KEY`, `LLM_BACKOFF_BASE_MS`, and `LLM_MAX_RETRIES` — `MISTRAL_API_KEY` is not required. Document this pattern so future changes don't introduce a silent dependency. 6. `src/llm/llm.service.interface.spec.ts` — imports the abstract `LLMService` base class (no `LlmModule`); instantiates a concrete test subclass directly. The base class constructor does not read `MISTRAL_API_KEY` — only `GeminiService`/`MistralService` constructors do. No mock update needed.
  - If the implementer finds more sites beyond the six listed above, they must be patched in this section and recorded in the implementation notes.

### Acceptance criteria

1. `ConfigService.get('MISTRAL_API_KEY')` returns a non-empty string.
2. `ConfigService.get('DEFAULT_TEXT_TABLE_MODEL')` returns `'mistral-small-latest'` by default.
3. `ConfigService.get('DEFAULT_IMAGE_MODEL')` returns `'mistral-small-latest'` by default.
4. `ConfigService.get('TEXT_REASONING_EFFORT')` returns `'low'` by default.
5. `ConfigService.get('IMAGE_REASONING_EFFORT')` returns `'high'` by default.
6. Invalid reasoning effort values are rejected by Zod.
7. `.env.example` documents all new variables.
8. `.test.env.example` contains all five new variables with placeholder values alongside the existing `GEMINI_API_KEY`.
9. **`test/utils/app-lifecycle.ts` `defaultTestValues` includes `MISTRAL_API_KEY: 'dummy-key-for-testing'`** so a mocked E2E run with no `.test.env` does not fail at Zod validation.
10. **Audit complete:** every `Test.createTestingModule({ imports: [...LlmModule...] })` and every `configObjectSchema.parse` call has a mock `ConfigService`/env returning non-empty `MISTRAL_API_KEY` (and the four new model/effort vars where the router or any provider constructor runs in that test). Audit findings documented in the section implementation notes.

### Required test cases

**Updated test `src/config/environment.schema.spec.ts`:**

1. Validates a config object with all five new variables.
2. Rejects a config with `TEXT_REASONING_EFFORT = 'nonsense'`.
3. Applies defaults correctly for missing optional fields.
4. Rejects a config where `MISTRAL_API_KEY` is empty.

**Audit (no new tests — verification only):**

5. Grep the repo for `LlmModule` test-module imports and `configObjectSchema.parse` calls; tick each site off against acceptance criterion #10. Record the full site list in the section implementation notes.

### Section checks

- `npx vitest run --project unit --reporter=verbose src/config/` — all config tests green.
- `npx vitest run --project unit` — full unit suite green (the audit catches any unit spec that previously relied on `MISTRAL_API_KEY` being absent).
- Verify `.env.example` contains the five new variables with inline documentation.
- Verify `.test.env.example` exists at repo root and contains all five new variables with placeholder values.
- Verify `test/utils/app-lifecycle.ts` `defaultTestValues` includes `MISTRAL_API_KEY: 'dummy-key-for-testing'`.

### Implementation notes / deviations / follow-up

- **Implementation notes:** TDD red → green. RED: five failing tests added to `environment.schema.spec.ts` (`Mistral environment variables` block); base fixture extended with `MISTRAL_API_KEY`. GREEN: five vars added to `configObjectSchema` exactly per SPEC; `.env.example`/`.test.env.example` document all five; `app-lifecycle.ts` `defaultTestValues` gained `MISTRAL_API_KEY: 'dummy-key-for-testing'`. **Audit report (all sites ticked):** (1) `llm.module.spec.ts` — OK as-is at this stage (overrides `ConfigService`; mock `get()` additions deferred to Section 5); (2) `assessor.service.spec.ts` — patched (`process.env.MISTRAL_API_KEY` in `beforeAll`; mock `get()` additions deferred to Section 5); (3) `assessor.module.spec.ts` — OK as-is at this stage (overrides `ConfigService`; Section 5 owns the `getMockConfigValue` expansion); (4) `environment.schema.spec.ts` — updated in this section; (5) `gemini.service.spec.ts` — exempt (direct instantiation, confirmed passing); (6) `llm.service.interface.spec.ts` — exempt (abstract base, confirmed passing). **Additional sites found and patched in this section** (real `ConfigService` Zod parse against `process.env`, fixed by adding `process.env.MISTRAL_API_KEY` in `beforeAll` only): `config.service.spec.ts`, `config.module.spec.ts`, `auth.module.spec.ts`, `prompt.factory.spec.ts`, `prompt.module.spec.ts`, `status.module.spec.ts`, `assessor.service.spec.ts`. Full unit suite 351/351 green; build, lint, lint:british clean. Code review: PASS.
- **Deviations from plan:** Seven additional audit sites (beyond the six listed) required `process.env`-level patches because the newly-required `MISTRAL_API_KEY` fails the real `ConfigService` Zod parse during test-module compilation. Patched here per the plan's own instruction ("must be patched in this section and recorded"). No mock `ConfigService.get()` switches were extended (correctly deferred to Section 5).
- **Follow-up implications:** Section 5 (RoutingLLMService) and Section 8 (mocked E2E) both depend on the schema additions and `app-lifecycle.ts` default landing first — they read `DEFAULT_TEXT_TABLE_MODEL`/`DEFAULT_IMAGE_MODEL`/`MISTRAL_API_KEY` via the typed `ConfigService.get<T>()` and the Zod-validated env.

---

## Section 8 — E2E Mocking for Mistral (and Gemini Regression Provider-Pin)

### Objective

- Extend `test/utils/llm-mock.mjs` to also mock the Mistral SDK alongside the existing Gemini mock.
- Create `test/mistral.e2e-spec.ts` for mocked Mistral E2E tests.
- Ensure the existing Gemini E2E mock continues to work.
- **CRITICAL: Pin the existing `test/assessor.e2e-spec.ts` to Gemini models via `environmentOverrides`.** With the new schema default of `mistral-small-latest`, the existing Gemini mocked regression test would silently route to Mistral unless pinned (SPEC product decision #11, backend change #12). The pin is added in this section so both mocked E2E suites are addressed together — without it, the existing `assessor.e2e-spec.ts` would exercise the wrong provider once Section 5 lands.

### Constraints

- The Mistral SDK mock patches `Mistral.prototype.chat` using a **prototype getter override** (not the Gemini-style getter/setter intercept). Verified from `node_modules/@mistralai/mistralai/esm/sdk/sdk.js`: `chat` is defined as `get chat() { return (this._chat ?? (this._chat = new Chat(this._options))); }` on `Mistral.prototype`, backed by a private `_chat` field. The constructor does **not** assign `this.chat` as an own property (unlike the Gemini SDK, which assigns `this.models = new Models(...)` in its constructor and therefore requires the getter/setter intercept to drop that own-property assignment).
- The shim calls `Object.defineProperty(Mistral.prototype, 'chat', { configurable: true, get() { return mockChat; } })` where `mockChat` is `{ complete: async () => ChatCompletionResponse }`. No setter is required because there is no own-property assignment to intercept.
- The `configurable: true` descriptor flag is mandatory so the override does not conflict with the SDK's own lazy-getter definition on `Mistral.prototype`.
- The mock `chat` object exposes a `complete()` method that returns a `Promise` resolving to a happy-path `ChatCompletionResponse`.
- The response `content` is a JSON string matching the `LlmResponseSchema` shape with distinguishably mock-specific reasoning text: `"Mistral mocked response for completeness."`, `"Mistral mocked response for accuracy."`, `"Mistral mocked response for SPaG."`.
- The existing Gemini mock in `llm-mock.mjs` is untouched — both patches coexist using their respective mechanisms (Gemini: getter/setter intercept; Mistral: prototype getter override).
- The new `test/mistral.e2e-spec.ts` overrides `DEFAULT_TEXT_TABLE_MODEL` and `DEFAULT_IMAGE_MODEL` to `'mistral-small-latest'` via `startApp`'s `environmentOverrides`. It also supplies `MISTRAL_API_KEY=dummy-key-for-testing` (overriding the default dummy `GEMINI_API_KEY`).
- **Existing-test pin (CRITICAL):** `test/assessor.e2e-spec.ts` is updated to pass `environmentOverrides` to its `startApp(logFilePath)` call, pinning `DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite'` and `DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash'`. Without this, the new schema defaults silently route the Gemini regression test to Mistral.
- The two mocks are distinguished only by the literal reasoning-text prefix (`"Mistral mocked response for …"` in `mistral.e2e-spec.ts` vs `"Mocked response for …"` in `assessor.e2e-spec.ts`). Both produce identical `LlmResponse` shapes; differentiation relies on substring matching in test assertions. Do not assume structural differences.

### Acceptance criteria

1. `llm-mock.mjs` overrides `Mistral.prototype.chat` with a `configurable` getter (no setter) that returns a mock `Chat` object exposing `complete()`.
2. The existing Gemini mock still works (attested by `assessor.e2e-spec.ts` passing).
3. `test/mistral.e2e-spec.ts` starts the app with Mistral models configured.
4. Auth/validation tests pass (401, 400).
5. A successful assessment returns the expected `LlmResponse` shape.
6. The response clearly originates from the Mistral mock (reasoning text contains `"Mistral mocked"`).
7. **Existing `test/assessor.e2e-spec.ts` passes `environmentOverrides` pinning `DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite'` and `DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash'` to `startApp(logFilePath)`.** The regression assertions continue to exercise the Gemini mock (reasoning text `"Mocked response for …"`), not the Mistral mock.

### Required test cases

**New test file `test/mistral.e2e-spec.ts`:**

1. 401 Unauthorised when no API key provided.
2. 401 Unauthorised when invalid API key provided.
3. 400 Bad Request for invalid DTO.
4. 201 Created with valid text payload → response has `completeness`, `accuracy`, `spag` with mock reasoning text containing `"Mistral mocked"`.

**Updated test file `test/assessor.e2e-spec.ts`:**

5. Existing `startApp(logFilePath)` call updated to `startApp(logFilePath, { DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite', DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash' })`. All existing assertions unchanged.

### Section checks

- `npm run test:e2e` — all E2E tests (including new `mistral.e2e-spec.ts` and existing `assessor.e2e-spec.ts`) pass.

### Implementation notes / deviations / follow-up

- **Implementation notes:** The `Mistral.prototype.chat` getter override was verified working in the E2E `--import` preload context. `node_modules/@mistralai/mistralai/esm/sdk/sdk.js` confirms `chat` is a lazy getter on `Mistral.prototype` backed by a private `_chat` field (no own-property assignment), so the configurable getter override is sufficient. `E2E_MOCK_LLM=true npx vitest run --project e2e test/mistral.e2e-spec.ts test/assessor.e2e-spec.ts` → 8/8 passing; the `'Mistral mocked'` substring assertion proves the Mistral mock path is exercised. The existing Gemini mock is untouched and still passes. If the SDK ever changes `chat` to an own-property assignment in a future version, switch to the Gemini-style getter/setter intercept and update both plan and spec (per SPEC product decision #9). NOTE: the CRITICAL Gemini-live pin (SPEC product decision #11 / backend change #12) was also applied in this section to `test/assessor-live.e2e-spec.ts` (passing `environmentOverrides` for `gemini-2.5-flash-lite` / `gemini-2.5-flash`), ahead of its scheduled Section 9 treatment, because the silent-flip regression risk applies equally to the live suite once the schema defaults land; this keeps both regression suites correct before Section 9 runs.
- **Deviations from plan:** The `MISTRAL_API_KEY` override described in the Constraints bullet (line 663) was NOT explicitly passed to `startApp` in `mistral.e2e-spec.ts`; it was unnecessary because `test/utils/app-lifecycle.ts` `defaultTestValues` already supplies `MISTRAL_API_KEY: 'dummy-key-for-testing'` (Section 7). Behaviour is identical. British-English alignment: the two `describe('Auth and Validation')` `401 Unauthorized` prose strings in `assessor.e2e-spec.ts` were corrected to `Unauthorised` to match the policy; the `expect(response.body.message).toBe('Unauthorized')` assertions are kept verbatim because that is the real NestJS `UnauthorizedException` message.
- **Follow-up implications:** The live E2E tests (Section 9) will validate the mock's realism and may prompt mock refinements. The `assessor-live.e2e-spec.ts` Gemini pin is already done here; Section 9 therefore only needs the new `mistral-live.e2e-spec.ts` file and the `vitest.config.ts` `e2e-live` `include` update.

---

## Section 9 — Live E2E Tests for Mistral (and Vitest Config + Gemini Live Pin)

### Objective

- Create `test/mistral-live.e2e-spec.ts` mirroring `assessor-live.e2e-spec.ts`.
- Exercise the full assessor pipeline with live Mistral API calls.
- Capture real response data to refine the mocked responses in `llm-mock.mjs`.
- **CRITICAL: Update `vitest.config.ts` `e2e-live` project `include`** to cover the new `test/mistral-live.e2e-spec.ts`. The current config has `include: ['test/assessor-live.e2e-spec.ts']` (a single-file array, not a glob), so the new file would not run under `npm run test:e2e:live` until the include is updated (SPEC backend change #11).
- **CRITICAL: Pin the existing `test/assessor-live.e2e-spec.ts` to Gemini models via `environmentOverrides`.** With the new schema default of `mistral-small-latest`, the existing Gemini live regression test would silently route to Mistral (SPEC product decision #11, backend change #12). The existing assertions and API-key expectations are Gemini-specific, so without the pin the test would exercise the wrong provider.

### Constraints

- Requires `MISTRAL_API_KEY` in `.test.env`.
- Runs only via `npm run test:e2e:live` (the live E2E Vitest project).
- Mirrors `assessor-live.e2e-spec.ts` structure but with `DEFAULT_TEXT_TABLE_MODEL=mistral-small-latest` and `DEFAULT_IMAGE_MODEL=mistral-small-latest` set via `environmentOverrides`.
- Tests text, table, and image task types.
- Each test has a 30-second timeout (API latency).
- Includes a 2-second delay between tests for rate limiting.
- Reuses test data files from `test/data/` and `test/ImageTasks/`.
- **`vitest.config.ts` `e2e-live` `include` is updated** to an **explicit two-element array** `['test/assessor-live.e2e-spec.ts', 'test/mistral-live.e2e-spec.ts']` — do **not** use a glob (a glob could accidentally include files not intended for the `e2e-live` project configuration, which has distinct `setupFiles`, timeouts, and pool settings). Without this, the new file does not execute.
- **Existing `test/assessor-live.e2e-spec.ts` `startApp(logFilePath)` call updated** to pass `environmentOverrides: { DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite', DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash' }`. Without this, the surviving Gemini live regression test silently routes to Mistral.

### Acceptance criteria

1. Live text task assessment returns a valid `LlmResponse` (201 with `completeness`, `accuracy`, `spag`).
2. Live table task assessment returns a valid `LlmResponse`.
3. Live image task assessment returns a valid `LlmResponse`.
4. All responses contain realistic scores and non-placeholder reasoning (real LLM output).
5. **`vitest.config.ts` `e2e-live` `include` is an explicit two-element array** covering both `assessor-live.e2e-spec.ts` and the new `mistral-live.e2e-spec.ts` — `npm run test:e2e:live` runs both files.
6. **Existing `test/assessor-live.e2e-spec.ts` passes `environmentOverrides` pinning Gemini models** to `startApp(logFilePath)`. The Gemini live regression test exercises the Gemini provider (and `GEMINI_API_KEY` in `.test.env`), not Mistral.

### Required test cases

**New test file `test/mistral-live.e2e-spec.ts`:**

1. Text task → 201 with valid `LlmResponse`.
2. Table task → 201 with valid `LlmResponse`.
3. Image task → 201 with valid `LlmResponse`.

**Config + existing-test updates (no new test cases — wiring only):**

4. `vitest.config.ts` `e2e-live` project `include` changed to an explicit two-element array (per constraint above). Verified by `npm run test:e2e:live` running both files.
5. `test/assessor-live.e2e-spec.ts` `startApp(logFilePath)` call updated to pass `environmentOverrides: { DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite', DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash' }`. Existing assertions unchanged.

### Section checks

- Ensure `.test.env` contains `MISTRAL_API_KEY` and `GEMINI_API_KEY`. Run:
  - `npm run test:e2e:live` — all live E2E tests pass (Gemini + Mistral). Both files must execute (verified by `vitest` reporting both suites).

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled by implementer; include captured response samples for mock refinement and confirm both live files ran)_
- **Deviations from plan:** _(filled if any)_
- **Follow-up implications:** After live tests pass, review captured responses and update the mock response text in `llm-mock.mjs` if the placeholder text differs materially from real output.

---

## Section 10 — Regression and Contract Hardening

### Objective

- Run all test suites to confirm no regressions.
- Verify the full pipeline (assessor → router → provider) with both providers.
- Run lint, build, and E2E suites.
- Confirm the CRITICAL findings from the third Planner-Reviewer pass are addressed: `vitest.config.ts` `e2e-live` include updated (Section 9); existing `assessor-live.e2e-spec.ts` and `assessor.e2e-spec.ts` pinned to Gemini via `environmentOverrides` (Sections 8 and 9); `test/utils/app-lifecycle.ts` `defaultTestValues` includes `MISTRAL_API_KEY` dummy (Section 7); the unit-test mock audit (Section 7) is complete; the shared error-mapper (Section 3) is adopted by both providers (Sections 4 and 6).

### Constraints

- All existing Gemini unit tests pass unchanged (beyond the injection token update from Section 1 and the `mapError()` refactor onto the shared helper from Section 6).
- All existing Gemini E2E tests (mocked and live) pass with the provider-pin `environmentOverrides` in place. Without the pins, the new schema defaults would silently route the Gemini regression tests to Mistral — the pins must be present before regression is run.
- All unit-test mock `ConfigService`/env sites audited in Section 7 return a non-empty `MISTRAL_API_KEY` and the four new model/effort vars where the router or provider constructors run.
- No new console warnings or errors.
- Live tests require both `GEMINI_API_KEY` and `MISTRAL_API_KEY` in `.test.env`.

### Acceptance criteria

1. `npm test` — all unit tests pass (including `llm-error-mapper.spec.ts` from Section 3).
2. `npm run test:e2e` — all mocked E2E tests pass (Gemini-pinned `assessor.e2e-spec.ts` + new `mistral.e2e-spec.ts`).
3. `npm run test:e2e:live` — all live E2E tests pass (Gemini-pinned `assessor-live.e2e-spec.ts` + new `mistral-live.e2e-spec.ts`). Requires both API keys present. Both files must execute (verified by the `vitest.config.ts` `e2e-live` include update from Section 9 — without it, `mistral-live.e2e-spec.ts` does not run).
4. `npm run lint` — no violations.
5. `npm run lint:british` — no violations.
6. `npm run build` — successful.
7. **Section 7 audit report:** implementer has produced the full list of `Test.createTestingModule({ imports: [...LlmModule...] })` and `configObjectSchema.parse` sites and ticked each one confirming non-empty `MISTRAL_API_KEY` (and the four new model/effort vars where applicable).
8. **`vitest.config.ts` `e2e-live` include** covers both `assessor-live.e2e-spec.ts` and `mistral-live.e2e-spec.ts` — vitest reports both suites running under `npm run test:e2e:live`.
9. **`test/utils/app-lifecycle.ts` `defaultTestValues`** includes `MISTRAL_API_KEY: 'dummy-key-for-testing'`.
10. **Shared error-mapper adoption verified:** neither `GeminiService` nor `MistralService` re-implements `extractStatusCode`/`hasStringStatus`/`isResourceExhausted`/`isRateLimit`/`buildError`/`extractMessage` — those live only in `src/llm/llm-error-mapper.ts`.

### Section checks

Run all validation commands. Document any test failures and their resolution. Include the Section 7 audit report and the Section 9 vitest-include evidence in the implementation notes.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled by implementer; include the Section 7 audit site list with ticks, and the Section 9 evidence that `vitest.config.ts` `e2e-live` runs both live files)_
- **Deviations from plan:** _(filled if any)_
- **Follow-up implications:** Section 11 (documentation) is the final pass.

---

## Section 11 — Documentation and Rollout Notes

### Objective

- Update `docs/llm/error-handling.md` with Mistral provider guidance **and** reconcile the "Worked Example" section to describe the shared helper (`src/llm/llm-error-mapper.ts`) introduced in Section 3, rather than referencing `GeminiService.mapError()` as the single canonical implementation.
- Update `docs/configuration/environment.md` with the five new variables.
- Create release notes.

### Constraints

- `docs/llm/error-handling.md`:
  - The existing "Worked Example: `GeminiService.mapError()`" section is refactored to describe the shared helper (`src/llm/llm-error-mapper.ts`) as the canonical pattern; `GeminiService` and `MistralService` are described as consumers that supply per-provider probe configuration.
  - A new "Mistral Provider" subsection documents: SDK error shapes (`MistralError.statusCode`, `.body`; `HTTPClientError` subclasses with their `name` strings), the Mistral-specific probe configuration supplied to the shared helper, classification priority, and testing conventions.
  - References to `GeminiService.extractStatusCode()` (currently at line 89 of `docs/llm/error-handling.md`) are updated to refer to the shared helper so the docs do not describe code that no longer exists after Section 6.
- `docs/configuration/environment.md` documents all five new variables with their Zod types, defaults, and accepted enum values.
- Release notes: flag the Mistral provider, routing-by-model architecture, new env vars, the shared error-mapper refactor, and note that both API keys are independently required.
- British English throughout.

### Acceptance criteria

1. `docs/llm/error-handling.md` has a "Mistral" subsection.
2. `docs/llm/error-handling.md` "Worked Example" section describes the shared helper (`src/llm/llm-error-mapper.ts`) as the canonical pattern; both `GeminiService` and `MistralService` are described as probe-config consumers. No stale references to `GeminiService.extractStatusCode()` or other now-deleted private helpers.
3. `docs/configuration/environment.md` documents `MISTRAL_API_KEY`, `DEFAULT_TEXT_TABLE_MODEL`, `DEFAULT_IMAGE_MODEL`, `TEXT_REASONING_EFFORT`, `IMAGE_REASONING_EFFORT` with their types, defaults, and accepted values.
4. Release notes exist in `release-notes/` documenting this version's changes.
5. No stale references to the old `LLMService` class-token injection pattern in docs.

### Required checks

1. Verify `docs/llm/error-handling.md` mentions `MistralError` and `HTTPClientError`.
2. Verify `docs/llm/error-handling.md` "Worked Example" section references `src/llm/llm-error-mapper.ts` and `classifyLlmError()` (not the deleted private helpers on `GeminiService`).
3. Verify `docs/configuration/environment.md` documents all five variables with Zod types, defaults, and accepted enum values (not just a list of names).
4. Verify release notes exist under `release-notes/`.
5. **Reconcile planned shared-helper entries placed in `Not implemented` status in Sections 3 and 6** — update the canonical doc to `implemented` once the implementation lands (per the action-plan template's gate).

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled by implementer)_
- **Deviations from plan:** _(filled if any)_
- **Follow-up implications:** Feature complete.

---

## Suggested implementation order

1. **Section 1** — `ILlmService`, token, payload extensions, `AssessorService` DI update (enabling infrastructure; includes unit-test mock `ConfigService` audit).
2. **Section 7** — Environment schema additions + `app-lifecycle.ts` `defaultTestValues` `MISTRAL_API_KEY` dummy + `.env.example`/`.test.env.example` updates (enabling infrastructure; can run in parallel with Section 1 — needed before Section 5 routes through the new `Config` keys).
3. **Section 2** — Model registry (no external dependencies).
4. **Section 3** — Shared error-mapper helper with unit tests (depends on error classes only).
5. **Section 4** — `MistralService` implementation (depends on Section 2 for model-prefix knowledge, Section 1 for payload types, and Section 3 for the shared error-mapper).
6. **Section 6** — `GeminiService` updates + `mapError()` refactor onto the shared helper (depends on Sections 1 and 3; behaviour-preserving so existing tests serve as regression; can run in parallel with Sections 4–5 after Section 3).
7. **Section 5** — `RoutingLLMService` and module wiring (depends on Sections 2, 4, and 1). **Must also update the test overrides from Section 1.**
8. **Section 8** — E2E mocking for Mistral (depends on Section 5 for correct routing; also pin existing `assessor.e2e-spec.ts` to Gemini models here or in regression).
9. **Section 9** — Live E2E tests for Mistral + `vitest.config.ts` `e2e-live` include update + pin existing `assessor-live.e2e-spec.ts` to Gemini models (depends on Section 5; requires real API key).
10. **Section 10** — Regression and contract hardening (depends on all prior sections).
11. **Section 11** — Documentation (depends on all prior sections).

### CRITICAL sequencing gates

- **Section 7 must land before Section 5's test overrides try to mock the new `Config` keys** (otherwise the mock `ConfigService` switch can return empty for `DEFAULT_TEXT_TABLE_MODEL` etc., causing `RoutingLLMService` constructor validation to throw during test-module compilation).
- **Section 3 must land before Section 4 and Section 6** (both `MistralService.mapError()` and the `GeminiService.mapError()` refactor depend on the shared helper).
- **The provider-pinning overrides on existing `assessor.e2e-spec.ts` and `assessor-live.e2e-spec.ts` must land by the time the new schema defaults are merged** (Sections 8 and 9 respectively; do not leave the existing suites unmodified after the new defaults land or they will silently route to Mistral).
- **The `vitest.config.ts` `e2e-live` `include` update must land in Section 9**, alongside the new `mistral-live.e2e-spec.ts` — otherwise the new live test does not run.
