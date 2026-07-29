# Pre-PR Review — feature/mistral-llm-provider

- **Base branch:** master (repo default; no `main` branch exists)
- **Generated:** 2026-07-24T06:21:15Z
- **Regression gate:** PASS — substitute gate used because `npm run regression-checker` is unavailable: `npm run lint` clean, unit tests 461/461 passed, mocked E2E 53 passed (1 todo)
- **Changed files:** 51 (51 files changed, 6396 insertions(+), 433 deletions(-)) — includes uncommitted working-tree changes to `docs/configuration/environment.md`, `docs/modules/llm.md`, `release-notes/v0.3.0.md`, `src/llm/gemini.service.ts`, `src/llm/gemini.service.spec.ts`

## Verdict

**Needs Improvement** — two Critical findings from De-Sloppification (≈2,300 lines of planning/session artefacts committed to the PR, and release notes containing startup-breaking, self-contradictory upgrade guidance) must be addressed before the PR is opened; the production code itself is sound across all focuses.

**Decision-pass outcome (see Decisions section):** C1 is to be fixed now (remove artefacts, keep the agent-config change); C2 is an explicit user Wontfix. The large majority of Improvements and Nitpicks were accepted as fix-now on this branch, including two user-directed design changes that go beyond the findings: conditional per-provider API keys (superseding SPEC decision #4) and a template-method payload dispatch in the `LLMService` base.

## Focus areas

### Repo rule compliance

**Verdict: PASS with documentation-compliance gaps.**

#### Critical

None.

#### Improvement

1. **`docs/modules/llm.md` is stale — Module Structure, Key Components, and Dependencies do not reflect the new routing architecture.** The "Module Structure" block (lines 7–14) still shows `providers: [GeminiService, { provide: LLMService, useClass: GeminiService }]` and `exports: [LLMService]`, both of which were removed. "Key Components" (lines 24–37) documents only `GeminiService` and omits `MistralService` and `RoutingLLMService`. "Dependencies" (lines 67–73) lists `@google/genai` but not `@mistralai/mistralai`. Contradicts actual wiring in `src/llm/llm.module.ts:38–49`.
2. **`docs/architecture/patterns.md` documents obsolete patterns.** The "Provider Pattern" snippet (lines 36–40) repeats the removed `providers: [GeminiService, { provide: LLMService, useClass: GeminiService }]` / `exports: [LLMService]` form; the "Strategy Pattern" section (lines 47–64) shows only `GeminiService`, with no mention of `MistralService` or the token-based dispatcher.
3. **`MistralService` logging context is inconsistent with `GeminiService` and mislabels error logs.** `MistralService` declares `mistralLogger` (`mistral.service.ts:121`) but logs the SDK error via the inherited base `this.logger` in `logProviderError` (`mistral.service.ts:205`) and the Zod-debug via `this.logger` (line 184) — both emit under `[LLMService]`, not `[MistralService]`. Align to `mistralLogger` at lines 184 and 205.
4. **Runtime `resolveProvider()` failure in `RoutingLLMService` bypasses the `LlmError` contract.** `routing-llm.service.ts:129` calls `resolveProvider(modelName)`, which throws a raw `Error` that propagates straight out of `send()`. A misconfigured model name would hit the filter as a raw `Error` (500) rather than `InvalidRequestError`. Effectively unreachable because `validateModelConfig()` fail-fasts at construction (`routing-llm.service.ts:84–92`), but consider wrapping in `InvalidRequestError` for contract consistency.

#### Nitpick

1. **`mistral.service.ts:355` — `isStringPromptPayload` is dead code.** Declared but never invoked (contrast `gemini.service.ts:208`, used at `:324` and `:354`).
2. **`test/utils/llm-mock.mjs` (full-diff.txt:7587–7596) — duplicated JSDoc block** on `selectGeminiResponse`; two identical consecutive `/** … */` blocks.
3. **`routing-llm.service.ts:85–87` re-derives the prefix list inline** instead of reusing the private `formatSupportedPrefixes()` helper in `model-registry.ts:58–60`.
4. **British English in a lint-ignored file — `test/utils/llm-mock.mjs` uses "serialized"** (full-diff.txt:7598, :7620). `eslint.config.js:16` ignores `**/*.mjs`, so `lint:british` never flags it.

#### Incidental (triage)

1. **`gemini.service.ts:196–200` — imprecise leftover comment.** States six helpers "have been extracted into the shared `classifyLlmError` helper", but `extractStatusCode`/`hasStringStatus` are now probe hooks in `GEMINI_PROBES` and `normaliseStatusCode` is a shared exported function.
2. **`docs/modules/llm.md:30–37` "Model Selection Logic" is now partly superseded.** `RoutingLLMService` sets `payload.model`/`payload.reasoningEffort` authoritatively (`routing-llm.service.ts:124–127`); a clarifying sentence would help.
3. **Positive:** no `console.*` and no `any` types in scope; JSDoc present on all public/exported members in scope.

### KISS & DRY

**Verdict: PASS** — shared `llm-error-mapper.ts` abstraction is right-sized; `RoutingLLMService` + `model-registry.ts` is the simplest design that works.

#### Critical

None.

#### Improvement

1. **`formatSupportedPrefixes()` is private yet re-implemented inline** at `routing-llm.service.ts:85-87` — export and reuse.
2. **`extractStatusCode` logic overlaps ~80% between `gemini.service.ts:47-76` and `mistral.service.ts:56-76`** — shareable helper (borderline under WET).

#### Nitpick

1. **`validateModelName` (`model-registry.ts:92-94`) is a pure pass-through** over `resolveProvider`.
2. **Identical `networkPattern` regex duplicated in both probes** (`gemini.service.ts:98-100`, `mistral.service.ts:80-81`) — export a constant.
3. **Identical `isImagePromptPayload`/`isStringPromptPayload` guards duplicated;** natural home is the `LLMService` base.
4. **Constructor validation vs runtime re-resolution is redundant-but-deliberate.**

#### Incidental (triage)

1. **Dead code:** `mistral.service.ts:355-359` `isStringPromptPayload` never called.
2. **Dead code in test mock:** duplicated JSDoc block on `selectGeminiResponse` (`test/utils/llm-mock.mjs:138-147`); `geminiTableResponse`/`mistralTableResponse` (`:39`, `:93`) defined but never selected.
3. **PR hygiene:** the branch diff bundles large non-source artefacts (`.opencode/scratchpad/*.md`, `ACTION_PLAN.md`, `SPEC.md`, release notes) — confirm they are intended to ship.

### De-Sloppification

#### Critical

1. **C1 — Planning and session artefacts do not belong in this PR (≈2,300 lines of non-deliverable content).**
   - `ACTION_PLAN.md` (916 lines, new at repo root) and `SPEC.md` (747 lines, new at repo root) are TDD working documents with per-section deviation journals (e.g. ACTION_PLAN.md:1042–1044) and claims the implementation contradicts (see I5).
   - Seven agent code-review transcripts under `.opencode/scratchpad/` (diff lines 43–817) are pure session output.
   - `.ts-regression-checker/reports/baseline/baseline.txt` (diff lines 848–883) is a regression-gate artefact whose header names a **different branch** (`feature/centralized-llm-error-handling`, diff line 854).
   - `.opencode/agents/code-reviewer.md` (diff lines 30–41): one-line agent-model swap unrelated to the feature.
   - Recommendation: drop all from the PR; consider adding `.opencode/scratchpad/` and `.ts-regression-checker/` to `.gitignore`.
2. **C2 — `release-notes/v0.3.0.md` gives operator guidance that will break startup, and contradicts itself.**
   - Lines 88–94 advise omitting the Mistral key to stay Gemini-only, but `MISTRAL_API_KEY` is unconditionally required (`src/config/environment.schema.ts:69`, `z.string().min(1)`); `.env.example:10` says the opposite. Following the release notes aborts startup.
   - Line 93 recommends pinning to `gemini-2.5-flash-lite`/`gemini-2.5-flash` ten lines after stating those models "are deprecated for new keys (404)" (lines 74–76).
   - The file wholesale **replaces** the existing v0.3.0 release notes (security-remediation content deleted — diff lines 3049–3195), carries a "(draft)" title (line 1), and a "Validation status for this draft" section with intra-branch fix history (lines 59–86).

#### Improvement

1. **I1 — Bug + dead data in `test/utils/llm-mock.mjs`: the Mistral image response is unreachable (copy-paste double-unwrap).** Call site passes the messages array (`llm-mock.mjs:222`) but the function unwraps again (`JSON.stringify(request?.messages ?? [])`, `llm-mock.mjs:171`); an array has no `.messages`, so `serialized` is always `"[]"`, the base64 regex (`:175`) never matches, and `mistralImageResponse` (`:110–136`) is dead. Future mocked Mistral image E2E tests will silently receive the text response.
2. **I2 — Dead constants and inaccurate header prose in `llm-mock.mjs`.** `geminiTableResponse` (`:39–54`) and `mistralTableResponse` (`:93–108`) never referenced; header JSDoc (`:9–11`) claims provider selection that does not happen; selector JSDocs (`:141`, `:168`) promise "three captured variants" but only two are reachable per provider.
3. **I3 — Duplicated JSDoc block, `llm-mock.mjs:138–147`.**
4. **I4 — Dead private method in `MistralService`.** `isStringPromptPayload` (`mistral.service.ts:355–359`) never called; the `StringPromptPayload` import (`:15`) exists solely to serve it.
5. **I5 — `RoutingLLMService` JSDoc documents behaviour that cannot happen.** `routing-llm.service.ts:41–46` and `:100–101` claim runtime config changes take effect without restart, but `ConfigService` snapshots config at construction (`config.service.ts:36`). ACTION_PLAN.md:417 and SPEC.md:727 also mismatch the code (a raw `Error` propagates from the router, never through a provider's `mapError()`).
6. **I6 — `docs/configuration/environment.md`: duplicate and misleading key documentation.** `MISTRAL_API_KEY` documented twice (line 12 and line 70, the latter under "have default values" despite no default); both key entries frame keys as conditionally required, but the schema requires both unconditionally (`environment.schema.ts:68–69`).
7. **I7 — `docs/modules/llm.md` left stale despite being touched in this PR.** Still opens "Google Gemini as the concrete implementation" (line 3) and shows pre-PR wiring (lines 10–11); no mention of `RoutingLLMService`, `MistralService`, or the token.
8. **I8 — Stale prefix list in `.env.example`.** `.env.example:43` omits `gemini-flash-latest` (added at `model-registry.ts:44`, and pinned by the live suites at `test/assessor-live.e2e-spec.ts:45–46`).
9. **I9 — Refactor-narration comment in `GeminiService`.** `gemini.service.ts:196–200` narrates the diff, not the code; delete.
10. **I10 — Duplicated prefix-formatting logic and drifting error wording.** `routing-llm.service.ts:85–87` re-implements `formatSupportedPrefixes()` (`model-registry.ts:58–60`); error wording drifts (`Unsupported model name(s): …` vs `Unsupported model name: '<name>'.`).

#### Nitpick

1. **N1 —** `mapReasoningEffort(): string | undefined` (`mistral.service.ts:324`) — exhaustive switch never returns `undefined`.
2. **N2 —** Double cast `request as unknown as MistralCompleteRequest` (`mistral.service.ts:162`) caused by `buildRequest` returning `Record<string, unknown>` (`:265`).
3. **N3 —** Logger inconsistency in `MistralService` (`mistral.service.ts:184, 205` vs `:152, 171, 174`).
4. **N4 —** Inaccurate mapper JSDoc: "called once each" (`llm-error-mapper.ts:220`) — `hasStringStatus` is called up to three times (`:182, 202–203`).
5. **N5 —** Copy-paste E2E suite: `test/mistral-live.e2e-spec.ts:14–46` duplicates `loadFileAsDataURI`, `TaskData`, and body of `assessor-live.e2e-spec.ts`; kept `.expect(201)` (`:88, 111, 133`) while the sibling was converted to `expect(response.status).toBe(201)`.
6. **N6 —** Provider-independent auth tests duplicated: `test/mistral.e2e-spec.ts:33–61` re-runs 401/401/400 auth tests from `assessor.e2e-spec.ts` verbatim.
7. **N7 —** Triplicated 25-line TestingModule builder in `src/llm/llm.module.spec.ts:79, 107, 133`.
8. **N8 —** Repeated triple-cast boilerplate in `routing-llm.service.spec.ts` (~12 occurrences, e.g. lines 67–71, 105–109).
9. **N9 —** Missing trailing newline in `.test.env.example` (diff line 847).
10. **N10 —** Stale remark in Gemini JSDoc (`gemini.service.ts:378–379`) about thinking config that now lives in `buildThinkingConfig` (`:255–270`).
11. **N11 —** Unresolvable `{@link}` targets: `{@link RoutingLLMService}` in `llm.service.interface.ts:23` and `{@link LLMService}` in `routing-llm.service.ts:22–23`.

#### Incidental (triage)

1. **Uncommitted work on the review branch:** five modified, uncommitted files (`docs/configuration/environment.md`, `docs/modules/llm.md`, `release-notes/v0.3.0.md`, `src/llm/gemini.service.spec.ts`, `src/llm/gemini.service.ts`) must be committed before the PR is raised.
2. **`.gitignore` gap enabling C1:** `.gitignore` covers neither `.opencode/scratchpad/` nor `.ts-regression-checker/`.
3. **Duplicated payload type-guards across providers** (`gemini.service.ts:202–206`, `mistral.service.ts:344–348`, plus equivalents in `llm.service.interface.ts:275` and `routing-llm.service.ts:114`) — pre-existing pattern extended by this PR; optional shared guard.
4. **Legacy `{Type}` JSDoc annotations** persist in `llm.service.interface.ts:123–128, 258–268` and `assessor.service.ts:39–42`; new code correctly omits them.

### Performance (Big-O)

**Verdict: PASS.** Per-request hot path is `O(1)` with respect to request volume; only input-proportional work is linear in payload size. No `O(n²)` blow-ups, no per-request regex compilation, no per-request client/registry allocation.

#### Critical

None.

#### Improvement

1. **I1 — `resolveProvider` linear scan on the request path (negligible now).** `routing-llm.service.ts:129` → `model-registry.ts:72-77` iterates `SUPPORTED_MODELS` (k = 5) per `send()`. Cost `O(k·L)`, effectively constant; a `Map`/longest-prefix lookup gives `O(1)` amortised if the registry grows. Low priority.
2. **I2 — Error classification re-run every retry for the same error (bounded, redundant).** Retry loop (`llm.service.interface.ts:135`) → `mapError` → `classifyLlmError` (`llm-error-mapper.ts:237-327`) re-runs `extractMessage` + up to five regex `.test()` per attempt. Cost `O(R·M)` with `R = LLM_MAX_RETRIES`. Classify once per error and reuse.

#### Nitpick

1. **N1 —** `isHttpClientError` allocates a fresh 4-element array each call (`mistral.service.ts:91-96`); hoistable to a module-level `const`.
2. **N2 —** `hasStringStatus` recomputes `value.toLowerCase()` per call (`gemini.service.ts:81`); up to 3× per `classifyLlmError`. Negligible.
3. **N3 —** `extractResponseText` two passes (filter then map) (`mistral.service.ts:301-311`). `O(2c) = O(c)`; stylistic.
4. **N4 —** Error-message prefix strings rebuilt only on failure paths (`model-registry.ts:58-60`, `routing-llm.service.ts:85-87`). Negligible.

#### Incidental (triage)

None of significance. Positive confirmations: regexes hoisted to module constants (`llm-error-mapper.ts:92-108`, `gemini.service.ts:98-99`, `mistral.service.ts:80-81`); LLM clients built once in constructors (`mistral.service.ts:134`, `gemini.service.ts:123`); `ConfigService.get` is `O(1)` (`config.service.ts:75-79`).

### Logging rules compliance

**Verdict: PASS** — no `console.*`, correct `Logger` abstraction, error mapper and router are log-free, rethrow-at-boundary discipline intact.

#### Critical

None.

#### Improvement

1. **I1 — Inconsistent `Logger` instance in `MistralService` (wrong log context for errors).** Debug/response logs use `this.mistralLogger` (`mistral.service.ts:121,152,171,174`) but the error path uses base `this.logger` (context `'LLMService'`): `mistral.service.ts:184` (Zod catch) and `:205` (`logProviderError`). `GeminiService` uses `geminiLogger` for errors (`gemini.service.ts:110,152,161`).
2. **I2 — New Mistral debug logs capture raw LLM response text / parsed JSON.** `mistral.service.ts:171` `debug({ responseText })` and `:174` `debug({ parsedJson })` may contain student-derived content. Mirrors the pre-existing Gemini pattern (`gemini.service.ts:344,347`) and is debug-gated, but `.env.example:65` ships `LOG_LEVEL=debug`. Recommend a project-wide decision to confirm/redact/gate.

#### Nitpick

1. **N1 —** `MistralService.logProviderError` omits the actual error/stack (`mistral.service.ts:205-208` logs only `{ model, payloadType, statusCode }`). Stack is recovered downstream; optionally pass `error.stack` as the second arg. Mirrors Gemini (`gemini.service.ts:152-159`).
2. **N2 —** Base/subclass log-context mixing (observational): abstract `LLMService` logs dispatch/retry under `'LLMService'` (`llm.service.interface.ts:223,229,243`) while providers use provider-named contexts.

#### Incidental (triage)

1. **Gemini logs the full prompt `contents` (student data) at debug** (`gemini.service.ts:355`) — pre-existing, unchanged by this branch. Mistral does not log the request payload; consider aligning Gemini to the Mistral pattern.
2. **Triple logging of a terminal failure** (provider → `AssessorService.createAssessment:61` → `HttpExceptionFilter`) is the established architecture, not mapper+filter double-logging (mapper and router verified log-free).
3. **Positive:** `AssessorService` logs only `taskType` and payload character/image counts (`assessor.service.ts:75-79`); no secrets in logs; levels appropriate.

### Frontend layout / design / accessibility (optional)

_(not in scope for this diff)_

### Frontend data shape / schema consistency (optional)

_(not in scope for this diff)_

### Backend data shape / schema consistency (optional)

**Verdict: PASS** — four-way defaults for all five new Mistral env vars match exactly across `environment.schema.ts`, `.env.example`, `.test.env.example`, and `docs/configuration/environment.md`; `LlmResponse` shape and error taxonomy identical for both providers.

#### Critical

None.

#### Improvement

1. **I1 — `.env.example` "Supported prefixes" list omits `gemini-flash-latest`, which the model registry accepts.** Registry lists it first among Gemini entries (`model-registry.ts:44`), yet `.env.example:43` enumerates only `gemini-2.5-flash, gemini-2.0-flash, mistral-small-latest, pixtral-, open-mistral-`. The alias _is_ referenced in `docs/configuration/environment.md:73`, so the two documents are also internally inconsistent.
2. **I2 — `docs/configuration/environment.md:71-72` describes provider routing with inaccurate wildcards.** `pixtral-*` models route to `MistralService` but do not start with `mistral-` (`model-registry.ts:50`); the real mechanism is an explicit prefix list (`model-registry.ts:42-51`) — arbitrary `gemini-*`/`mistral-*` ids like `gemini-pro` fail `validateModelConfig()` at startup (`routing-llm.service.ts:66-92`). Restate as "the model id must match a registered prefix in the model registry".

#### Nitpick

1. **N1 —** `docs/configuration/environment.md:71` labels the Zod type as `z.string()`, but the actual schema is `z.string().default('mistral-small-latest')` (`environment.schema.ts:70`; same at `:72`).
2. **N2 —** `formatSupportedPrefixes()` (`model-registry.ts:58-60`) not exported; router re-derives at `routing-llm.service.ts:85-87`.
3. **N3 —** `.env.example` "Supported prefixes" comment appears only on `DEFAULT_TEXT_TABLE_MODEL` (`:43`), not `DEFAULT_IMAGE_MODEL` (`:46-47`).

#### Incidental (triage)

1. **IN1 —** `docs/modules/config.md:9` and `:37` reference `env.schema.ts`, but the actual file is `src/config/environment.schema.ts`. Pre-existing, outside this diff.
2. **IN2 —** `src/llm/gemini.service.ts` and `src/llm/gemini.service.spec.ts` carry uncommitted working-tree modifications; commit or revert before the PR is raised so the reviewed state matches what merges.

### Security & secrets (optional)

**Verdict: PASS** — no hardcoded credentials, realistic placeholder keys, or production credential-leak paths introduced.

#### Critical

None.

#### Improvement

1. **#1 — Raw provider error body reaches client-facing messages (production-gated only).** `src/llm/llm-error-mapper.ts:124-142` concatenates `error.body` into the message; `:251-258 / 312-314 / 318-322` use it verbatim for `ResourceExhaustedError` (503), `ProviderServerError` (502), `NetworkError` (502). Only guard is `NODE_ENV==='production' && status>=500` in `src/common/http-exception.filter.ts:86-89` — in non-prod the raw upstream body is returned to clients. Recommend logging the body server-side only.
2. **#2 — Full LLM responses / student submissions logged at `debug`.** `src/llm/gemini.service.ts:355,397,400` and `src/llm/mistral.service.ts:171,174`; `.env.example:65` ships `LOG_LEVEL=debug`. PII risk. Recommend redaction or an off-by-default verbose flag.
3. **#3 — Raw provider error retained on `LlmError.originalError`** (`llm-error-mapper.ts:163-164`); not currently serialised, but a latent risk.

#### Nitpick

1. **#4 —** Permissive `mimeType` regex `src/prompt/image.prompt.ts:66` flows into the data-URI at `mistral.service.ts:242`; safe only because `ImageValidationPipe` (`image-validation.pipe.ts:84-87`) already allowlists the mime type.

#### Incidental (triage)

None. Explicit non-findings verified: all diff key strings are obvious fakes; no realistic keys in `SPEC.md`, `ACTION_PLAN.md`, `release-notes/v0.3.0.md`, `.opencode/scratchpad/*`; fixed SDK endpoints (no SSRF); untrusted LLM output repaired via `jsonrepair` + schema validation; `authorization`/`cookie`/`x-api-key` already redacted in logs.

### Test-coverage gaps (optional)

**Verdict: PASS (with coverage recommendations).** No untested branch is a confirmed defect; all critical new behaviour has some coverage.

#### Critical

None.

#### Improvement

1. `mistral.service.ts:294-314` — `extractResponseText` array-content and empty-fallback branches never exercised (all fixtures use string `content`).
2. `mistral.service.ts:64-75` — `MISTRAL_PROBES.extractStatusCode` `status`/`code`/`response.status` fallback branches never driven via the real probe.
3. `mistral.service.ts:83-98` — `isHttpClientError` only the `ConnectionError` name tested; `RequestTimeoutError`/`RequestAbortedError`/`UnexpectedClientError` unasserted.
4. `llm-error-mapper.ts:319` — `?? false` default for an omitted `isHttpClientError` probe never exercised.
5. `llm-error-mapper.ts:76-83` — `normaliseStatusCode` has no direct test; string-coercion path untested for Mistral.
6. `model-registry.ts:44` / `model-registry.spec.ts:19-34` — new `gemini-flash-latest` prefix not asserted at unit level.
7. `routing-llm.service.ts:129` — `send`-time `resolveProvider()` throw untested.
8. `assessor.service.ts:60-66` — `createAssessment` catch/error-logging branch untested.
9. `gemini.service.ts:327` — `buildContents` 'Unsupported payload type' throw untested.
10. `gemini.service.ts:334-349` — `mapImageParts` invalid-image→`[]` branch untested.
11. `mistral.service.ts:355-359` — `isStringPromptPayload` is dead/unused code (also flagged elsewhere).
12. `mistral-live.e2e-spec.ts` (whole file) — real Mistral text/table/image paths only validated in live e2e, which is excluded from CI (`vitest.config.ts:32`).
13. `mistral.e2e-spec.ts` covers only the TEXT path; Mistral IMAGE/TABLE full-stack paths exist only in the live file.

#### Nitpick

1. `mistral.service.ts:326-331` — `mapReasoningEffort` `case 'off'` is unreachable (excluded by `buildRequest`).
2. `mistral.service.ts:202-203` — `logProviderError` status precedence only partially exercised.

#### Incidental (triage)

1. LSP/type-checker noise confined to `src/auth/api-key.service.spec.ts` — not part of this diff; environmental.
2. Explicitly checked, no gaps: config-validation paths fully covered; unknown-model-prefix and case-sensitivity tested; empty-registry/duplicate-registration N/A given static `readonly` `SUPPORTED_MODELS`.

### British-English consistency (optional)

**Verdict: PASS** — new `src/llm/` production source and all in-diff docs and env examples are British-English clean.

#### Critical

None.

#### Improvement

1. **I-1 —** `scripts/check-british-english.sh` only scans `*.ts`/`*.js`, so it never checks `*.mjs`, `*.md`, or `.env*` files, nor any American word outside its fixed 21-word list. N-1/N-2 below slipped through precisely because of this. Recommend broadening coverage.

#### Nitpick

1. **N-1 —** `test/utils/llm-mock.mjs:35`: `capitalization` → `capitalisation` (mock string).
2. **N-2 —** `test/utils/llm-mock.mjs:149,157,171,175`: `serialized` (identifier ×4) → `serialised`.

#### Incidental (triage)

Pre-existing, not in this PR (for awareness): `assessor.controller.ts:58` `specialized`; `config.service.ts:17/56` `centralized`/`prioritizing`; `docs/security/auth.md:69` `defense-in-depth`; `docs/auth/API_Key_Management.md:28` `capitalized`; `CONTRIBUTING.md:28-30` `behavior`; `release-notes/v0.1.7.md:23` `behavior`; `docs/testing/PROD_TESTS_GUIDE.md:7` `artifact`. Correctly American (API-mandated, keep): `Authorization` header, `"license"` SPDX key in `package.json`.

### Error-handling robustness (optional)

**Verdict: PASS WITH IMPROVEMENTS.** The shared `classifyLlmError` cascade plus the base `LLMService.handleAttemptError` `try/catch` around `mapError()` form a genuine safety net; unclassifiable and throwing provider errors are always wrapped in `LlmServiceError` (500), and no raw upstream message reaches a client in production.

#### Critical

None.

#### Improvement

1. **I-1 —** (`src/llm/llm-error-mapper.ts:318` + `:76-77`) `NetworkError` is gated strictly on `statusCode === undefined`. Because `normaliseStatusCode` returns a numeric `0` verbatim, a transport error carrying `statusCode: 0` (a plausible Mistral `HTTPClientError` shape) skips every branch and is downgraded to a non-retryable 500 instead of a retryable `NetworkError`, defeating `MISTRAL_PROBES.isHttpClientError` (`mistral.service.ts:83-98`). Needs SDK verification + a unit test.
2. **I-2 —** (`llm-error-mapper.ts:153-165`, `llm.service.interface.ts:168-174`) mapped/unclassified errors never supply the base constructor's `cause` option, so `Error.cause` is always `undefined` — the standard causal chain is broken.
3. **I-3 —** (`mistral.service.ts:197-209`, `gemini.service.ts:143-170`) provider failure logs record only `{ model, payloadType, statusCode }` and discard the upstream `error.message`/`stack`, contradicting `docs/llm/error-handling.md`.

#### Nitpick

1. **N-1 —** Inconsistent logger context (`mistral.service.ts:205` uses base `this.logger` not `mistralLogger`).
2. **N-2 —** In-place `payload` mutation (`routing-llm.service.ts:126-127`).
3. **N-3 —** No `modelName` guard before `resolveProvider` (unreachable due to schema defaults).

#### Incidental (triage)

1. **I-Inc-1 —** Global `HttpExceptionFilter.logError` (`http-exception.filter.ts:209-214`) logs `exception.stack` (the `LlmError`'s own allocation stack) rather than `originalError.stack`, so the original upstream stack is effectively never logged.
2. **I-Inc-2 —** `app-lifecycle.ts` changes benign.
3. **I-Inc-3 —** `AssessorService.createAssessment` catch is correct.

## Decisions

Captured during the decision pass on 2026-07-24. Findings raised by multiple focuses are recorded once with all references. "Fix now" means: address on this branch before the PR is opened.

### Critical

- **[Critical] De-Sloppification C1 — committed working artefacts (`ACTION_PLAN.md`, `SPEC.md`, `.opencode/scratchpad/*` transcripts, `.ts-regression-checker/reports/baseline/baseline.txt`, `.opencode/agents/code-reviewer.md`)** — Decision: **Fix now (partial removal)**. Approach: remove `ACTION_PLAN.md`, `SPEC.md`, the seven `.opencode/scratchpad/` review transcripts, and the stale `.ts-regression-checker` baseline (whose header names a different branch) from the branch. **Keep** the one-line `.opencode/agents/code-reviewer.md` model swap in this PR — the user explicitly chose to ship that config change. Rationale: the planning/session artefacts are non-deliverable content (~2,300 lines) that would rot, but the agent-config fix is wanted. Note: the reviewer's suggestion to add `.opencode/scratchpad/` and `.ts-regression-checker/` to `.gitignore` was part of a broader option the user did not select; it remains a recommended follow-up but is not a committed decision.

- **[Critical] De-Sloppification C2 — `release-notes/v0.3.0.md` startup-breaking guidance, internal contradiction, replacement of prior v0.3.0 notes, draft/journal prose** — Decision: **Wontfix**. Rationale: user decision to keep the release notes as written. A future reviewer should not re-raise this; if the conditional-API-keys change (see below) lands, the "omit the Mistral key" guidance incidentally becomes _correct_, which mitigates point (a) of the finding.

### Repo rule compliance

- **[Improvement] `docs/modules/llm.md:3,7–14,24–37,67–73` and `docs/architecture/patterns.md:36–40,47–64` stale (also De-slop I7)** — Decision: **Fix now**. Approach: update both docs to reflect the actual wiring in `src/llm/llm.module.ts:38–49` — `providers: [GeminiService, MistralService, { provide: LLM_SERVICE_TOKEN, useClass: RoutingLLMService }]`, `exports: [LLM_SERVICE_TOKEN]` — document `MistralService` and `RoutingLLMService` as key components, add `@mistralai/mistralai` to dependencies, and refresh the Strategy/Provider pattern examples. Also add the clarifying note that `RoutingLLMService` sets `payload.model`/`payload.reasoningEffort` authoritatively (incidental #2).

- **[Improvement] `MistralService` logger context (`mistral.service.ts:184,205`; also Logging I1, De-slop N3, Error-handling N-1)** — Decision: **Fix now via consolidation**. Approach: replace the base `LLMService` logger with `protected readonly logger = new Logger(this.constructor.name)` (`llm.service.interface.ts:78`); delete the `geminiLogger` (`gemini.service.ts:110`) and `mistralLogger` (`mistral.service.ts:121`) fields entirely; all provider logs then carry the correct provider context automatically, and base dispatch/retry logs gain provider attribution. Update the test spies at `gemini.service.spec.ts:449` and `mistral.service.spec.ts:709`. Rationale: there is no good reason for separate per-provider logger fields; one dynamically-named base logger makes the inconsistency structurally impossible. This supersedes Logging N2 (context mixing) as well.

- **[Improvement] `routing-llm.service.ts:129` raw `Error` from `send()`-time `resolveProvider` (also coverage gap #7, Error-handling N-3)** — Decision: **Fix now by restructuring**. Approach: since `ConfigService` snapshots config at construction (no hot reload), resolve both providers **once in the constructor** immediately after `validateModelConfig()` and store them as fields; `send()` picks the pre-resolved provider. This deletes the unreachable runtime throw path entirely (no `InvalidRequestError` wrapping needed) and incidentally removes the per-request registry scan. Update router unit tests accordingly.

- **[Nitpick] Dead `isStringPromptPayload` in `mistral.service.ts:355–359` (also De-slop I4, KISS incidental, coverage #11)** — Decision: **Fix now via template-method dispatch** (user-directed design). Approach: move `isImagePromptPayload`/`isStringPromptPayload` to the `LLMService` base as protected guards; add a protected `mapPayload<T>(payload, { image, text })` helper in the base that centralises the dispatch and throws `'Unsupported payload type'` on neither shape; refactor `GeminiService.buildContents` and `MistralService.buildMessages` to supply only the provider-specific mappers. Rationale: Mistral treats text/table identically and the binary ternary silently sent `content: undefined` for malformed payloads; centralising gives both providers Gemini's fail-fast validation and deletes four duplicated guard definitions. Add unit tests for the new base helper and Mistral's unsupported-payload throw.

- **[Nitpick] Duplicated JSDoc block in `test/utils/llm-mock.mjs:138–147`** — Decision: **Fix now** (bundled with the llm-mock fixes below).

- **[Nitpick] "serialized" in `test/utils/llm-mock.mjs`** — Decision: **Fix now** (see British-English section).

### KISS & DRY

- **[Improvement] `formatSupportedPrefixes()` private + re-implemented inline (`model-registry.ts:58–60` vs `routing-llm.service.ts:85–87`; also De-slop I10, Schema N2)** — Decision: **Fix now**. Approach: export `formatSupportedPrefixes()` from `model-registry.ts`, reuse it in the router's aggregated error message, and align the two error-message wordings so the canonical phrasing lives in one place.

- **[Improvement] `extractStatusCode` ~80% overlap (`gemini.service.ts:47–76` vs `mistral.service.ts:56–76`)** — Decision: **Fix now**. Approach: extract the common status-probing logic into a shared helper in `llm-error-mapper.ts`; the per-provider probes keep only genuine differences (e.g. Mistral's `statusCode` field name and `isHttpClientError`).

- **[Nitpick] `validateModelName` pure pass-through (`model-registry.ts:92–94`)** — Decision: **Fix now** (Nitpick Group A). Approach: remove the pass-through (or fold it into the exported API) as part of the router/registry rework above.

- **[Nitpick] Duplicated `networkPattern` regex (`gemini.service.ts:98–100`, `mistral.service.ts:80–81`)** — Decision: **Fix now**. Approach: export a single shared constant (naturally falls out of the shared status-probe helper work).

- **[Nitpick] Duplicated payload type-guards (also incidental)** — Decision: **Fix now** — resolved by the template-method dispatch decision above.

### De-Sloppification

- **[Improvement] I1–I3 `test/utils/llm-mock.mjs` — double-unwrap bug making `mistralImageResponse` unreachable (`:171` vs `:222`), dead `geminiTableResponse`/`mistralTableResponse` constants (`:39–54`, `:93–108`), inaccurate header JSDoc (`:9–11`), duplicated JSDoc (`:138–147`)** — Decision: **Fix now (all)**. Approach: fix the double unwrap so the base64 regex sees the serialised messages and the Mistral image response is selectable; delete the two dead table constants (or wire them in if a table-specific mock is wanted by the new tests); correct the header prose to describe what the shim actually does (independent SDK patches, no provider selection); remove the duplicate JSDoc block.

- **[Improvement] I4 dead `isStringPromptPayload`** — Decision: recorded under Repo rule compliance (template-method dispatch).

- **[Improvement] I5 `routing-llm.service.ts:41–46,100–101` JSDoc claims runtime config changes take effect without restart** — Decision: **Fix now**. Approach: rewrite the JSDoc to state that config is validated at startup and frozen at construction; remove the unreachable operator-edits-env failure narrative. This aligns with the resolve-at-construction router change.

- **[Improvement] I6 `docs/configuration/environment.md` duplicate/misleading key docs (also Schema I2)** — Decision: **Superseded by a code change — implement conditional API keys now.** Approach: change `environment.schema.ts` so a provider's API key is required **only if** a configured model (`DEFAULT_TEXT_TABLE_MODEL`/`DEFAULT_IMAGE_MODEL`) routes to that provider; startup aborts only when a _needed_ key is missing. Update `docs/configuration/environment.md` to document each key once with the conditional rule, fix the inaccurate `mistral-*`/`gemini-*` wildcard description (restate as "the model id must match a registered prefix in the model registry"), update `.env.example`/`.test.env.example` comments, and add schema unit tests for: both keys needed, only-Gemini needed, only-Mistral needed, and missing-needed-key failure. Rationale: user confirmed the _intent_ is conditional keys (overriding SPEC.md decision #4, which had deferred this); the reviewer's evidence that docs and schema disagreed is resolved by moving the code to the intended behaviour rather than the docs to the current code. Note this touches `test/utils/app-lifecycle.ts` dummies and the SPEC's "blast radius" analysis — the dummy keys can remain harmlessly.

- **[Improvement] I7 stale `docs/modules/llm.md`** — Decision: recorded under Repo rule compliance (Fix now).

- **[Improvement] I8 `.env.example:43` missing `gemini-flash-latest` (also Schema I1, N3)** — Decision: **Fix now**. Approach: add `gemini-flash-latest` to the supported-prefixes comment and mirror the comment on `DEFAULT_IMAGE_MODEL`.

- **[Improvement] I9 refactor-narration comment `gemini.service.ts:196–200` (also Repo-rules incidental #1)** — Decision: **Fix now — delete the comment.** The `mapError` delegation plus `GEMINI_PROBES` is self-explanatory.

- **[Improvement] I10 duplicated prefix formatting** — Decision: recorded under KISS & DRY (Fix now).

- **[Nitpick] N1 `mapReasoningEffort` return type; N2 double cast via untyped `buildRequest`; N4 inaccurate mapper JSDoc (`llm-error-mapper.ts:220`); N10 stale Gemini thinking JSDoc (`gemini.service.ts:378–379`); N11 unresolvable `{@link}` targets** — Decision: **Fix all now** (Nitpick Group A). Approach: narrow the return type to `'none' | 'high'`; type `buildRequest`'s return so the double cast disappears; correct the mapper JSDoc ("`hasStringStatus` may be called up to three times"); delete/refresh the stale thinking-config remark; fix or remove the dangling `{@link}` references.

- **[Nitpick] N3 logger inconsistency** — Decision: superseded by logger consolidation (see Repo rule compliance).

- **[Nitpick] N5 copy-paste live E2E suite + `.expect(201)` style drift; N6 duplicated auth tests in `test/mistral.e2e-spec.ts:33–61`; N7 triplicated TestingModule builder (`llm.module.spec.ts:79,107,133`); N8 triple-cast boilerplate in `routing-llm.service.spec.ts`** — Decision: **Fix all now** (Nitpick Group B). Approach: share the `loadFileAsDataURI`/`TaskData` helpers between the two live suites and settle on the `expect(response.status).toBe(201)` style; delete the provider-independent 401/401/400 auth duplicates (keep only the provider-pin test); extract a `buildModule()` helper in `llm.module.spec.ts`; add a small factory for `RoutingLLMService` construction in its spec.

- **[Nitpick] N9 missing trailing newline `.test.env.example`** — Decision: **Fix now** (Nitpick Group C).

### Performance (Big-O)

- **[Improvement] I1 `resolveProvider` linear scan per `send()` (`model-registry.ts:72–77`)** — Decision: **Wontfix as a performance item** — but rendered moot by the resolve-at-construction router change, which removes the per-request scan anyway. Rationale: k = 5, O(k·L) is effectively constant.

- **[Improvement] I2 error classification re-run per retry (`llm.service.interface.ts:135` → `llm-error-mapper.ts:237–327`)** — Decision: **Wontfix**. Rationale: bounded by `LLM_MAX_RETRIES` (small constant) and only on the failure path; not worth the added state.

- **[Nitpick] N1 `isHttpClientError` per-call array (`mistral.service.ts:91–96`); N2 `toLowerCase` recompute (`gemini.service.ts:81`); N3 two-pass filter/map (`mistral.service.ts:301–311`); N4 failure-path string rebuilds** — Decision: **Fix all now** (Nitpick Group C, user chose "Fix all"). Approach: hoist the error-name array to a module-level `const`; tidy the remaining micro-items opportunistically while the files are being edited for the agreed refactors. N4 is naturally absorbed by the `formatSupportedPrefixes` export.

### Logging rules compliance

- **[Improvement] I1 logger context** — Decision: recorded under Repo rule compliance (consolidate to one base logger).

- **[Improvement] I2 raw LLM response/parsed JSON at debug (`mistral.service.ts:171,174`; `gemini.service.ts:344/355,397,400`) + Security #2 (PII at debug; `.env.example:65` ships `LOG_LEVEL=debug`)** — Decision: **Fix now with an explicit verbose flag.** Approach: gate all raw prompt/response content logging (both providers, including Gemini's pre-existing full-prompt log at `gemini.service.ts:355`) behind an off-by-default env flag (e.g. `LOG_LLM_CONTENT=false`), and change the `.env.example` default `LOG_LEVEL` away from `debug`. Rationale: prevents student PII reaching logs in a default deployment while preserving the diagnostic capability when explicitly enabled.

- **[Nitpick] N1 `logProviderError` omits error/stack** — Decision: **Fix now** — merged with Error-handling I-3 below.

- **[Nitpick] N2 base/subclass context mixing** — Decision: superseded by logger consolidation.

### Backend data shape / schema consistency

- **[Improvement] I1 `.env.example` prefix list omits `gemini-flash-latest`** — Decision: **Fix now** (see De-slop I8).
- **[Improvement] I2 inaccurate routing wildcards in `docs/configuration/environment.md:71–72`** — Decision: **Fix now** as part of the conditional-keys doc rewrite (see De-slop I6).
- **[Nitpick] N1 Zod-type label omits `.default()` (`docs/configuration/environment.md:71–72`)** — Decision: **Fix now** (Nitpick Group C) — will be rewritten anyway for conditional keys.
- **[Nitpick] N2 `formatSupportedPrefixes` export** — Decision: recorded under KISS & DRY.
- **[Nitpick] N3 prefix comment only on `DEFAULT_TEXT_TABLE_MODEL`** — Decision: **Fix now** (bundled with I8).
- **[Incidental] IN1 `docs/modules/config.md:9,:37` references `env.schema.ts`** — Decision: **Fix in this PR** (user chose to fix pre-existing incidentals here). Approach: correct the filename to `environment.schema.ts`.
- **[Incidental] IN2 uncommitted working-tree changes (5 files)** — Decision: **Fix now (process)**. All working-tree changes must be committed before the PR is raised so the reviewed state matches what merges.

### Security & secrets

- **[Improvement] #1 raw provider error body in client-facing messages (`llm-error-mapper.ts:124–142` et al.)** — Decision: **Fix now — server-side only.** Approach: log the raw provider body server-side (at the provider error log) and give the client-facing `LlmError` messages a generic provider-failure message regardless of `NODE_ENV`, removing the reliance on the production-only filter sanitisation.
- **[Improvement] #2 PII at debug** — Decision: **Fix now** — recorded under Logging I2 (verbose flag + `.env.example` `LOG_LEVEL` change).
- **[Improvement] #3 raw error on `LlmError.originalError`** — Decision: **Wontfix**. Rationale: not serialised to clients today, valuable for debugging, and the agreed `Error.cause` fix covers standard tooling. Documented so a future serialiser author knows to exclude it.
- **[Nitpick] #4 permissive mimeType regex (`image.prompt.ts:66`)** — Decision: **Fix now** (Nitpick Group C, "Fix all"). Approach: tighten the regex; note it is currently safe only because `ImageValidationPipe` (`image-validation.pipe.ts:84–87`) allowlists mime types upstream.

### Test-coverage gaps

- **[Improvement] Items #1–#10 and #13 (mapper/probe/registry/router/service branch gaps; Mistral IMAGE/TABLE only in live e2e)** — Decision: **Fix now — add unit tests in this PR.** Approach: cover `extractResponseText` array/empty branches; drive `MISTRAL_PROBES.extractStatusCode` fallbacks through the real probe; assert all four `isHttpClientError` names; test `classifyLlmError`'s `?? false` probe default and `normaliseStatusCode` directly (including the new `statusCode: 0` behaviour); assert `gemini-flash-latest` at unit level; test the assessor catch/log branch; test Gemini's unsupported-payload throw and invalid-image→`[]` branch; extend the mocked Mistral e2e to IMAGE (enabled by the llm-mock double-unwrap fix) and TABLE where practical. Note several tests must target the post-refactor shapes (base `mapPayload`, construction-resolved router).
- **[Improvement] #11 dead `isStringPromptPayload`** — Decision: resolved by the template-method dispatch.
- **[Improvement] #12 live-e2e-only coverage of real Mistral error shapes** — Decision: **Fix now** to the extent unit fixtures can encode the SDK shapes verified by live runs; live suites remain the source of truth for real API behaviour.
- **[Nitpick] `mapReasoningEffort` unreachable `case 'off'`; `logProviderError` precedence partially exercised** — Decision: **Fix now** — the `'off'` case is naturally removed/narrowed by the Group-A return-type fix; add the missing precedence assertion.

### British-English consistency

- **[Improvement] I-1 `scripts/check-british-english.sh` scans only `*.ts`/`*.js` with a fixed 21-word list** — Decision: **Fix now in this PR.** Approach: broaden the script to cover `*.mjs` (and ideally `*.md`/`.env*`) and extend the word list (e.g. `-ization`, `serialized`, `capitalized`, `behavior`, `artifact`, `licence`-noun cases), keeping API-mandated American identifiers exempt.
- **[Nitpick] N-1 `capitalization` (`test/utils/llm-mock.mjs:35`); N-2 `serialized` ×4 (`:149,157,171,175`)** — Decision: **Fix now** (`capitalisation`, `serialised`).
- **[Incidental] Pre-existing American spellings (`assessor.controller.ts:58` `specialized`; `config.service.ts:17/56` `centralized`/`prioritizing`; `docs/security/auth.md:69`; `docs/auth/API_Key_Management.md:28`; `CONTRIBUTING.md:28–30`; `release-notes/v0.1.7.md:23`; `docs/testing/PROD_TESTS_GUIDE.md:7`)** — Decision: **Fix in this PR** (user chose to sweep pre-existing incidentals here). API-mandated spellings (`Authorization` header, SPDX `"license"` key) stay.

### Error-handling robustness

- **[Improvement] I-1 `statusCode: 0` transport errors downgraded to non-retryable 500 (`llm-error-mapper.ts:318`, `:76–77`)** — Decision: **Fix now + unit test.** Approach: verify the Mistral SDK error shape, treat `statusCode` of `0` (or falsy non-numeric) as absent in `normaliseStatusCode`/classification so the `isHttpClientError` probe can classify it as retryable `NetworkError`; add a unit test for the `statusCode: 0` case.
- **[Improvement] I-2 missing `Error.cause` (`llm-error-mapper.ts:153–165`, `llm.service.interface.ts:168–174`)** — Decision: **Fix now.** Approach: pass `{ cause: originalError }` when constructing `LlmError` subclasses in the mapper and the base service so the standard causal chain works alongside the custom `originalError` field.
- **[Improvement] I-3 provider failure logs discard `error.message`/`stack` (`mistral.service.ts:197–209`, `gemini.service.ts:143–170`; also Logging N1)** — Decision: **Fix now.** Approach: include the upstream `error.message` and stack in `logProviderError` for both providers per `docs/llm/error-handling.md`. The related incidental (filter logging the `LlmError`'s own stack instead of the original at `http-exception.filter.ts:209–214`) should be addressed in the same change now that `cause`/`originalError` are reliably populated.
- **[Nitpick] N-1 logger context** — Decision: superseded by logger consolidation.
- **[Nitpick] N-2 in-place `payload` mutation (`routing-llm.service.ts:126–127`)** — Decision: **Fix now** (Nitpick Group A). Approach: construct a new payload object (spread) rather than mutating the caller's.
- **[Nitpick] N-3 no `modelName` guard before `resolveProvider`** — Decision: superseded by the resolve-at-construction router change.

### Cross-cutting incidentals

- **[Incidental] Legacy `{Type}` JSDoc annotations (`llm.service.interface.ts:123–128,258–268`, `assessor.service.ts:39–42`)** — Decision: **Fix in this PR.** Strip the redundant `{Type}` braces to match the new-code style.
- **[Incidental] LSP/type noise in `src/auth/api-key.service.spec.ts` (vitest matcher/mock typings)** — Decision: **Fix in this PR.** Approach: correct the mock typings (e.g. type the spies via `vi.spyOn`/`Mock` generics) so the editor diagnostics clear.
- **[Incidental] `.gitignore` gap for `.opencode/scratchpad/` and `.ts-regression-checker/`** — Decision: **Not committed** (the chosen C1 option excluded it); recommended follow-up to prevent recurrence.
- **[Incidental] Gemini full-prompt debug log (`gemini.service.ts:355`)** — Decision: **Fix now** — folded into the `LOG_LLM_CONTENT` verbose-flag work.

## Progress Log

Work is being delivered in cohesive, sequentially-applied batches (grouped by file-affinity to avoid conflicts). Baseline before any work: `npm run lint` clean, `npm run test` 461/461 passing.

### Batch 1 — Critical C1: artefact removal ✅ DONE

- **Removed from the branch (git rm):** `ACTION_PLAN.md`, `SPEC.md`, the seven `.opencode/scratchpad/*` code-review transcripts (`SECTION5_CODE_REVIEW.md`, `SECTION7_REVIEW.md`, `SECTION_6_REVIEW.md`, `code-review-section1-green.md`, `code-review-section1-red.md`, `code-review-section3-gemini-mapError.md`, `code-review-section3.md`), and the stale `.ts-regression-checker/reports/baseline/baseline.txt` (whose header named a different branch).
- **Kept (per decision):** `.opencode/agents/code-reviewer.md` (deliberate agent-model swap) and `docs/ACTION_PLAN_TEMPLATE.md` (project template).
- **Not actioned (explicitly excluded by the chosen C1 option):** adding `.opencode/scratchpad/` / `.ts-regression-checker/` to `.gitignore` — remains a recommended follow-up.
- **C2** (`release-notes/v0.3.0.md`) — Wontfix per decision; left untouched.

### Batch 2 — Core LLM refactor: logger consolidation + template-method payload dispatch ✅ DONE (reviewed: PASS)

Resolves: Repo-rules Improvement 3 & Decision "MistralService logger context"; Logging I1/N2; Error-handling N-1; De-slop N3; Repo-rules Nitpick 1 & Decision "template-method dispatch"; De-slop I4; KISS Nitpick 3 & incidental "duplicated payload type-guards"; coverage #11.

- **Logger consolidation:** base `LLMService.logger` now `new Logger(this.constructor.name)`, so each provider logs under its own context automatically. Deleted the per-provider `geminiLogger`/`mistralLogger` fields and their `Logger` imports; all references now use `this.logger`. This structurally eliminates the mislabelled `[LLMService]` error logs. Updated the Gemini spec spy from `.geminiLogger` → `.logger`.
- **Template-method payload dispatch:** added protected `isImagePromptPayload`/`isStringPromptPayload` guards plus a `mapPayload<T>(payload, { image, text })` dispatcher to the base class (throws `'Unsupported payload type'` on neither shape). `GeminiService.buildContents` and `MistralService.buildMessages` now delegate to it; the four duplicated guard definitions and the dead `isStringPromptPayload` were removed. **Behaviour change:** Mistral now fail-fasts on a malformed payload instead of silently sending `content: undefined`.
- **Verification:** `npm run lint` clean; `npm run test` 461/461 pass.

### Batch 3 — Router resolve-at-construction + registry cleanup ✅ DONE (reviewed: PASS)

Resolves: Repo-rules Improvement 4 & Decision "raw Error from send()-time resolveProvider"; KISS Improvement 1 & Nitpick 1; Schema N2; De-slop I5 & I10; Error-handling N-2 & N-3; Perf I1 (rendered moot).

- **Resolve-at-construction:** `RoutingLLMService` now resolves both providers, model names, and reasoning-effort values ONCE in the constructor (each `resolveProvider` called exactly once via a `tryResolve` helper) and caches them as private readonly fields. `send()` no longer touches the registry — the unreachable request-time raw-`Error` throw path is gone, along with the per-request scan.
- **Registry:** `formatSupportedPrefixes()` is now exported and reused by the router's aggregated error (no inline re-derivation); the pure pass-through `validateModelName` was removed. Its spec coverage was preserved by asserting the throw directly on `resolveProvider`.
- **No caller mutation:** `send()` builds a spread copy `{ ...payload, model, reasoningEffort }` instead of mutating the caller's object.
- **JSDoc:** rewritten to state config is validated + frozen at construction (removed the false "runtime changes take effect without restart" narrative).
- **Code review:** verdict PASS. All four reviewer suggestions actioned: (1) `resolveProvider` now called once per model; (2) added a "does not mutate caller payload" router test; (3) added a Mistral "Unsupported payload type" fail-fast test; (4) `ReasoningEffort` cast documented.
- **Verification:** `npm run lint` clean; `npm run test` 461/461 pass.

### Batch 4 — Error mapper hardening + robustness + security ✅ DONE (reviewed: PASS)

Resolves: KISS Improvement 2 & Nitpick 2; De-slop N4; Security #1; Error-handling I-1, I-2, I-3, I-Inc-1; Logging N1; Perf N1 (error-name array — superseded by shared probe rework).

- **Shared status probe (DRY):** exported `probeStatusCode(error, paths)` + `walkPath` helper in `llm-error-mapper.ts`; Gemini/Mistral probes now declare `GEMINI_STATUS_PATHS`/`MISTRAL_STATUS_PATHS` (identical probing order to before) instead of ~80%-duplicated hand-rolled walkers.
- **Shared network pattern:** single exported `NETWORK_ERROR_PATTERN` used by both providers (and the mapper spec's `buildProbes`); duplicated inline regexes deleted.
- **`statusCode: 0` treated as absent (Error-handling I-1):** `normaliseStatusCode` now returns `undefined` for `0`/`'0'`/`''`, so a transport error carrying `statusCode: 0` falls through to the `NetworkError` branch and the `isHttpClientError` probe classifies it as retryable. Unit tests added for both the helper and the classification path.
- **Generic client-facing messages (Security #1):** `ResourceExhaustedError`, `ProviderServerError`, and `NetworkError` are now constructed with generic module-constant messages — the raw upstream `error.body` can no longer reach any client-facing message in any environment. Classification still uses the rich internal message for regex matching. Tests assert the generic messages and absence of body content.
- **`Error.cause` (Error-handling I-2):** `buildError` (mapper) and `wrapUnclassified` (base service) now pass `{ originalError, cause: originalError }` — standard causal chain restored. Tests added.
- **Provider logs carry upstream detail (Error-handling I-3 / Logging N1):** both providers' failure logs now include `errorMessage`, `errorBody` (string-only), and `stack` alongside `{ model, payloadType, statusCode }` — the raw detail survives server-side now that client messages are generic. Both provider specs assert the new fields.
- **Filter logs the original stack (I-Inc-1):** `HttpExceptionFilter.resolveExceptionStack` prefers `originalError.stack` → `cause.stack` → own stack in the ≥500 branch; test asserts the upstream stack is logged rather than the `LlmError` allocation stack.
- **JSDoc fix (De-slop N4):** `classifyLlmError` doc corrected ("`hasStringStatus` may be called up to three times").
- **Code review:** verdict PASS. Both non-blocking suggestions actioned: Gemini log test now asserts `errorBody`; mapper spec `buildProbes` imports `NETWORK_ERROR_PATTERN`.
- **Verification:** `npm run lint` clean (0 warnings); `npm run test` 473/473 pass (12 new tests).

### Batch 5 — Conditional per-provider API keys ✅ DONE (reviewed: PASS)

Resolves: Decision "Conditional per-provider API keys" (supersedes SPEC decision #4); De-slop I5; Config hardening.

- **Schema (`src/config/environment.schema.ts`):** `GEMINI_API_KEY`/`MISTRAL_API_KEY` changed from `.string().min(1)` to `.optional()` (empty string now allowed at the type level). Added `validateProviderKeys` superRefine that requires a provider's key only when `DEFAULT_TEXT_TABLE_MODEL` or `DEFAULT_IMAGE_MODEL` resolves, via `resolveProvider`, to that provider. Message wording: "<KEY> must be set (non-empty) because a configured model routes to the <Provider> provider"; check uses `!.trim()` so whitespace-only values are treated as unset. JSDoc updated.
- **Lazy SDK clients (`gemini.service.ts`, `mistral.service.ts`):** removed eager `new GoogleGenAI`/`new Mistral` from constructors and the key-presence throw; each now has a private `getClient()` that builds and caches the SDK client on first use, throwing "<PROVIDER>_API_KEY is not set in environment" at first `send`. `_sendInternal` calls `getClient()`.
- **Specs:** constructor tests rewritten to assert lazy init (no key read / no client at construction; client built once on first send; missing/empty key rejects the first send wrapped as `LlmServiceError`). `environment.schema.spec.ts` gained a "conditional provider API keys" block (require-when-routed, allow-omitted-and-empty-when-not-routed, unrecognised-prefix skip).
- **Docs/env examples (`docs/configuration/environment.md`, `.env.example`, `.test.env.example`):** duplicate `MISTRAL_API_KEY` entry removed; both key entries now describe the conditional requirement in British English; stale routing wording ("both keys must be present") corrected.
- **Code review:** verdict PASS. Actioned all three in-scope suggestions — added empty-string "allowed when not routed" schema tests; tightened required-key messages; `!.trim()` whitespace guard. (Reviewer noted `tryResolveProvider` is a local helper wrapping the imported `resolveProvider` — no defect.)
- **Verification:** `npm run lint` clean; `npm run test` 483/483 pass; `npm run test:e2e:mocked` 53 passed / 1 todo.

### Batch 6 — Gate raw LLM content logging behind LOG_LLM_CONTENT ✅ DONE (reviewed: PASS after critical fix)

Resolves: Logging I2 & N1; Security #2 (PII at debug).

- **Schema (`src/config/environment.schema.ts`):** added `LOG_LLM_CONTENT` — initially `z.coerce.boolean().default(false)`, but code review caught a **critical privacy bug**: `z.coerce.boolean()` uses `Boolean(value)`, so the documented `LOG_LLM_CONTENT=false` would coerce to `true` and _enable_ content logging by default. Replaced with explicit truthy-only coercion (`preprocess`: string `'true'`/`'1'` → true, everything else → false). JSDoc added. Regression tests added (default false, `"false"`→false, `"true"`→true, `"1"`→true, `"0"`→false, boolean true→true).
- **Gating (`gemini.service.ts`, `mistral.service.ts`):** new `private readonly logLlmContent` (read in constructor from config). Gated the raw student-derived content debug logs only — Gemini: full-prompt `contents`, raw `responseText`, parsed JSON; Mistral: raw `responseText`, parsed JSON. All operational/error-path logs (model, temperature, status, `errorMessage`/`errorBody`/`stack`) remain ungated.
- **`.env.example`:** `LOG_LEVEL=debug` → `LOG_LEVEL=info`; added `LOG_LLM_CONTENT=false` with British-English PII-rationale comment.
- **Docs:** `docs/configuration/environment.md` gained `LOG_LLM_CONTENT` entry; `docs/development/debugging.md` notes raw LLM content additionally requires `LOG_LLM_CONTENT=true`.
- **Code review:** verdict initially FAIL (critical coercion bug). Fix applied; re-verified. No further in-scope suggestions outstanding.
- **Verification:** `npm run lint` clean; `npm run test` 489/489 pass; mocked E2E 53 passed / 1 todo.

### Batch 7 — Misc docs / stale documentation ✅ DONE (reviewed: PASS)

Resolves: De-slop I7, I1 (patterns.md), I8 (stale prefix list), N9 (trailing newline), N11 (JSDoc links), Repo-rules Incidental 2.

- **docs/modules/llm.md:** opening no longer claims "Gemini as the concrete implementation"; "Module Structure" now reflects `RoutingLLMService` + `GeminiService` + `MistralService` with `LLMService` provided via `RoutingLLMService` and exported; "Key Components" lists all three services; "Dependencies" lists both `@google/genai` and `@mistralai/mistralai`; added note that `RoutingLLMService` sets `payload.model`/`payload.reasoningEffort` authoritatively.
- **docs/architecture/patterns.md:** "Provider Pattern" and "Strategy Pattern" snippets updated to the token-based dispatcher with `MistralService` as a second concrete strategy.
- **.env.example:** added `gemini-flash-latest` to the supported-model prefix list.
- **.test.env.example:** added a trailing newline (was missing).
- **JSDoc `{@link}` (N11):** verified `LLMService` and `RoutingLLMService` are both exported, so the `{@link}` tags are valid — no change required.
- **Verification:** `npm run lint` clean (exit 0); `npm run test` 489/489 pass; mocked E2E 53 passed / 1 todo.

### Batch 8 — De-sloppification ✅ DONE (reviewed: PASS)

Resolves: De-slop I1 (llm-mock bug), I2 (dead constants), I3 (dup JSDoc), I4 (dead `isStringPromptPayload` — already removed in Batch 2), I9 (narration comment), N1 (`mapReasoningEffort` return type), N2 (double cast), N3/Logging I1 (logger context — already consolidated in Batch 2).

- **src/llm/mistral.service.ts:** `mapReasoningEffort` return type `string | undefined` → `'none' | 'high'`; `buildRequest` now returns `MistralCompleteRequest` (single `messages` cast, `as unknown as MistralCompleteRequest` double cast removed at call site).
- **src/llm/gemini.service.ts:** removed the refactor-narration comment; corrected the stale `@remarks` JSDoc in `generateAndParseResponse` to reference `buildThinkingConfig`.
- **test/utils/llm-mock.mjs:** fixed `selectMistralResponse` double-unwrap so Mistral image requests now reach `mistralImageResponse` (was dead); removed unreferenced `geminiTableResponse`/`mistralTableResponse`; removed duplicated JSDoc block on `selectGeminiResponse`; corrected selector/header JSDoc ("three"→"two" variants, removed false provider-selection claim); `serialized`→`serialised`.
- **Code review:** verdict PASS. In-scope suggestions: (1) add a mocked Mistral-image E2E to lock in the `mistralImageResponse` fix against regression (recommended follow-up, not yet added); (2) optional further cast elimination (skipped, low value).
- **Verification:** `npm run lint` clean (build success); `npm run test` 489/489 pass; mocked E2E 53 passed / 1 todo.

### Batch 9 — Performance (Big-O) ✅ DONE (reviewed: PASS)

Resolves: Perf I2 (classify error once per error, not per retry), Perf N1 (hoist HTTP-client-error set).

- **src/llm/llm.service.interface.ts:** extracted `classifyError()` (calls `mapError()` + falls back to `wrapUnclassified()`) invoked once per error; `send()` caches the `LlmError` and reuses it across retry iterations (retry count, backoff, and throw conditions unchanged). Removed `handleAttemptError()`. Clarified the JSDoc/`send()` flow and added an idempotent-retry assumption comment. Updated `llm.service.interface.spec.ts` (`mapError` spy now `toHaveBeenCalledTimes(1)`).
- **src/llm/mistral.service.ts:** hoisted the inline client-error name array to a module-level `const HTTP_CLIENT_ERROR_NAMES = new Set(...)`; `isHttpClientError` uses `.has(name)` (satisfies `unicorn/prefer-set-has`).
- **Code review:** verdict PASS. Doc-only suggestions actioned (JSDoc wording + idempotent-retry comment + `send()` flow note).
- **Verification:** `npm run lint` clean; `npm run test` 489/489 pass; mocked E2E 53 passed / 1 todo.

### Batch 10 — KISS/DRY final: error-wording alignment (I10) ✅ DONE (reviewed: PASS)

Resolves: the wording-alignment half of KISS/DRY Improvement + De-slop I10. (For the record, KISS Improvement 1, Nitpick 1, Nitpick 2, Nitpick 3 and Incidental 3 were already delivered in Batches 2/3/4 — the prior "Remaining" note was stale; only the I10 wording drift remained.)

- **`src/llm/model-registry.ts`:** added exported `formatUnsupportedModelMessage(modelNames: string[])` that single-sources the canonical `Unsupported model name(s): '<name>'. Supported model prefixes: …` phrasing (each name single-quoted, joined by `', '`); `resolveProvider` now throws via this helper.
- **`src/llm/routing-llm.service.ts`:** constructor's aggregated startup error now uses `formatUnsupportedModelMessage(badNames)`; the router no longer imports the lower-level `formatSupportedPrefixes` (it remains exported and is used only inside `model-registry.ts`).
- **Code review:** verdict PASS. No in-scope findings (reviewer confirmed the helper JSDoc is accurate).
- **Verification:** `npm run lint` clean; targeted specs 29/29; full `npm run test` 489/489 pass; mocked E2E 53 passed / 1 todo. No regression vs. the pre-batch baseline.

### Batch 11 — Final regression gate + commit/push ✅ DONE

- **Regression gate:** `npm run lint` clean (0 errors, 2 pre-existing warnings); `npm run test` 489/489 pass; `npm run test:e2e:mocked` 53 passed / 1 todo. No regressions against the pre-batch baseline.
- **Commit:** single consolidation commit of the full PR-review remediation (Batches 1–10) plus this `PR_REVIEW.md`; deliberately excludes `.opencode/scratchpad/*` artefacts (per C1) and `.playwright-mcp/*`. `release-notes/v0.3.0.md` was left **uncommitted** — it is outside the remediation scope (C2 was Wontfix/leave untouched) and was not part of any batch; flagged to the user for a separate decision.
- **Push:** branch `feature/mistral-llm-provider` pushed to `origin` with upstream tracking.

### Residual "Fix now" decisions NOT addressed in this pass (recommended follow-ups before opening the PR)

These "Fix now" items from the decision log fell outside the Batch 1–10 scope and remain open:

- **Nitpick Group B (N5–N8):** E2E/spec de-duplication — share `loadFileAsDataURI`/`TaskData` helpers between `test/assessor.e2e-spec.ts` and `test/mistral.e2e-spec.ts` and settle on `expect(response.status).toBe(201)`; delete the duplicated provider-independent auth tests in `test/mistral.e2e-spec.ts`; extract a `buildModule()` helper in `llm.module.spec.ts`; replace the `as unknown as GeminiService` triple-casts in `routing-llm.service.spec.ts` with a small construction factory.
- **Nitpick Group C micro-items (verify still outstanding):** `gemini.service.ts:81` `toLowerCase` recompute; `mistral.service.ts:301–311` two-pass filter/map. (The `isHttpClientError` set was hoisted in Batch 9; the `formatSupportedPrefixes` export absorbed the failure-path string rebuilds in Batch 3.)
- **Security #4:** tighten the permissive mimeType regex in `image.prompt.ts:66` (safe today only because `ImageValidationPipe` allowlists upstream).
- **British-English sweep (I-1 script + pre-existing incidentals):** broaden `scripts/check-british-english.sh` to `*.mjs`/`*.md`/`.env*` and extend the word list; sweep pre-existing American spellings in `assessor.controller.ts`, `config.service.ts`, docs, `CONTRIBUTING.md`, `release-notes/v0.1.7.md`, `docs/testing/PROD_TESTS_GUIDE.md`.
- **Cross-cutting incidentals:** strip legacy `{Type}` JSDoc braces in `llm.service.interface.ts:123–128,258–268` and `assessor.service.ts:39–42`; fix LSP/type noise in `src/auth/api-key.service.spec.ts` mock typings.
- **Test-coverage gaps (#1–#10, #13):** several were covered in Batches 4/8/9; remaining branch gaps and the "extend mocked Mistral E2E to IMAGE/TABLE" follow-up (flagged by the Batch 8 reviewer) are still open.
- **Non-blocking follow-ups:** consider `.gitignore` entries for `.opencode/scratchpad/` and `.ts-regression-checker/` (C1 excluded this); add a mocked Mistral-image E2E to lock in the Batch 8 `llm-mock` fix.

(End of file)

- **Follow-up recommendations (non-blocking):** add mocked Mistral-image E2E (Batch 8 review); consider `.gitignore` entries for `.opencode/scratchpad/` and `.ts-regression-checker/` (De-slop C1 note, Wontfix-adjacent).
