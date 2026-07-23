# Code Review — ACTION_PLAN.md Section 6: GeminiService Updates and Shared-Helper Refactor

**Reviewer:** Code Reviewer agent
**Date:** 2026-07-23
**Scope:** `src/llm/gemini.service.ts`, `src/llm/llm-error-mapper.ts`, `src/llm/mistral.service.ts`, `src/llm/gemini.service.spec.ts` (uncommitted working-tree changes = Section 6)

---

## Summary

**Verdict: PASS** — The Section 6 changes are behaviour-preserving, delete the six duplicated private helpers from `GeminiService` as required, preserve the original Gemini probe shapes, correctly extract `normaliseStatusCode` into the shared helper (KISS, behaviour-preserving for both providers), and add the `payload.model` / `payload.reasoningEffort` → `thinkingBudget` mapping with the documented v1 limitation. All automated gates are green (166 LLM unit tests, 440 full unit tests, lint 0/0, lint:british clean, build success). One cosmetic spec-indentation nitpick and two non-blocking observation notes are recorded below.

---

## Automated Checks (all green)

| Check                | Command                                  | Result                        |
| -------------------- | ---------------------------------------- | ----------------------------- |
| Unit (LLM project)   | `npx vitest run --project unit src/llm/` | **166 passed (166 expected)** |
| Full unit suite      | `npm test`                               | **440 passed (440 expected)** |
| Lint                 | `npm run lint`                           | **0 violations**              |
| British English lint | `npm run lint:british`                   | **clean**                     |
| Build                | `npm run build`                          | **success**                   |

The `gemini.service.spec.ts` suite alone runs **63 tests, all passing**, including the full `mapError` regression block.

---

## Acceptance Criteria Verification (1–9)

| #   | Criterion                                                                                            | Status  | Evidence                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `payload.model` overrides hardcoded model                                                            | ✅ PASS | `buildModelParams`: `payload.model ?? (image ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite')`; spec test "should use payload.model override for text payloads" asserts `model: 'gemini-2.5-flash'`.                                                                                                                                                                                                        |
| 2   | `payload.model` absent → hardcoded (regression)                                                      | ✅ PASS | Spec regression tests + existing `basic functionality` tests assert `gemini-2.5-flash-lite` / `gemini-2.5-flash`.                                                                                                                                                                                                                                                                                          |
| 3   | `reasoningEffort='off'` → `thinkingBudget: 0`                                                        | ✅ PASS | `mapThinkingBudget` `default: return 0`; spec test asserts `thinkingBudget: 0`.                                                                                                                                                                                                                                                                                                                            |
| 4   | `reasoningEffort='low'` → `0`, documented as indistinguishable                                       | ✅ PASS | `mapThinkingBudget` `default: return 0`; method JSDoc + spec test comment both document the v1 limitation; test intentionally kept separate from `'off'`.                                                                                                                                                                                                                                                  |
| 5   | `reasoningEffort='high'` → `1024`                                                                    | ✅ PASS | `case 'high': return 1024`; spec test asserts `thinkingBudget: 1024`.                                                                                                                                                                                                                                                                                                                                      |
| 6   | `reasoningEffort='max'` → `8192`                                                                     | ✅ PASS | `case 'max': return 8192`; spec test asserts `thinkingBudget: 8192`.                                                                                                                                                                                                                                                                                                                                       |
| 7   | `reasoningEffort` absent → `0`                                                                       | ✅ PASS | `default: return 0`; regression spec test asserts `thinkingBudget: 0`.                                                                                                                                                                                                                                                                                                                                     |
| 8   | `mapError()` delegates to `classifyLlmError()` with Gemini probe config; old private helpers removed | ✅ PASS | `mapError` is now a one-line `return classifyLlmError(GEMINI_PROBES, error);`. Git diff confirms `isResourceExhausted`, `isRateLimit`, `extractMessage`, `buildError`, `extractStatusCode`, `normaliseStatusCode`, `hasStringStatus` are all **deleted** from `GeminiService`. The five private static pattern constants (`CONTENT_FILTERED_PATTERN`, etc.) are also removed (moved to the shared helper). |
| 9   | Existing `gemini.service.spec.ts` `mapError` tests pass unchanged                                    | ✅ PASS | 63/63 spec tests pass; the `describe('mapError', …)` block contents are byte-identical to HEAD (no `-`/`+` lines in the diff for the mapError body).                                                                                                                                                                                                                                                       |

### Probe-config preservation (criterion 8 detail)

- `GEMINI_PROBES.extractStatusCode` probes `error.status`, `error.statusCode`, `error.code`, `error.response.status`, `error.error.status`, `error.error.code` with string→number coercion via the shared `normaliseStatusCode`. Matches the SPEC/plan shapes exactly.
- `GEMINI_PROBES.hasStringStatus` checks `error.status`, `error.code`, `error.error.status`, `error.error.code` **case-insensitively** (lowercases both `value` and the candidate). Matches SPEC (`RESOURCE_EXHAUSTED`/`RATE_LIMIT_EXCEEDED`/`'429'`/`'rate_limit_exceeded'`/`'resource_exhausted'`).
- `networkPattern` identical to the original (`/ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network/i`).
- No `isHttpClientError` probe supplied for Gemini (correct — Gemini has none).

### `normaliseStatusCode` extraction (sanctioned small extension)

- The function is now defined **once** in `src/llm/llm-error-mapper.ts` (exported) and imported by both `gemini.service.ts` and `mistral.service.ts`.
- Its implementation is identical to the previously-local versions in both providers (verified by diff), so the change is behaviour-preserving for **both** providers. This was a reviewer-sanctioned Improvement from Section 4; not flagged as scope creep.
- No remaining duplicate `normaliseStatusCode` definitions (grep confirms single definition + two imports).

### No duplication left (cascade helpers live only in shared helper)

- `isResourceExhausted`, `isRateLimit`, `buildError`, `extractMessage` appear **only** in `llm-error-mapper.ts`.
- `extractStatusCode` / `hasStringStatus` exist in the two provider files **only as per-provider probe hooks** inside `GEMINI_PROBES` / `MISTRAL_PROBES` (these are SDK-shape probes, not the cascade logic — exactly as the SPEC's product decision #13 intends: "the only per-provider code that remains is the probe configuration and `providerName`").
- Acceptance criterion satisfied in spirit and letter.

---

## In-Scope Issues

### Critical

None.

### Improvement

None blocking. Two verified-safe observations for awareness:

1. **(Verified-safe behaviour alignment — positive, not a defect)** The original `GeminiService.mapError` applied its `NetworkError` branch via `if (NETWORK_PATTERN.test(message))` _after_ the status branches, which (for any `status` not already caught by 401/403/400/4xx/5xx — e.g. an HTTP `200` carrying the word "network" in its message) would classify as `NetworkError`. The shared `classifyLlmError` correctly gates `NetworkError` behind `statusCode === undefined`, matching `docs/llm/error-handling.md` ("NetworkError — Error objects with a network-failure message pattern and **no** extractable HTTP status"). The refactor therefore brings Gemini **into** spec compliance for this edge case. No test relies on the old (arguably-incorrect) behaviour — all network-spec tests use `Error` instances with no status. No action required; recorded so the implementer is aware this is an intentional, tested improvement rather than a silent regression.

2. **(Stale docs — owned by Section 11, not Section 6)** `docs/llm/error-handling.md` still contains the legacy "Worked Example: `GeminiService.mapError()`" referencing `GeminiService.extractStatusCode()` and the now-deleted private helpers (lines ~89, 264–276). This is **expected and explicitly owned by Section 11** of the plan, so it is **not** a Section 6 defect. Recommend the Section 11 pass reconcile it (the plan's acceptance criterion #2 already requires this). Not blocking for Section 6.

### Nitpick

1. **`gemini.service.spec.ts` — incidental de-indentation of `describe('error handling')`.** Git diff of the spec shows, beyond the intended RED-phase `describe('optional model and reasoningEffort payload fields', …)` block, a single one-line change:

   ```
   -  describe('error handling', () => {
   +describe('error handling', () => {
   ```

   The `describe('error handling')` block was de-indented from 2 spaces to column 0. Because JavaScript scoping is brace-based (not indentation-based), the block remains lexically **inside** `describe('GeminiService')` — confirmed by the 63/63 passing tests (`callMapError`, defined inside `describe('GeminiService')`, is still in scope for the `mapError` tests). The `mapError` block content itself is byte-identical to HEAD. **Impact:** cosmetic only; tests unaffected. **Recommendation:** re-indent `describe('error handling', () => {` back to 2 spaces so the diff is strictly "only the RED describe block added" as the plan's verification heuristic requires, and to keep nesting indentation consistent with the rest of the file. Non-blocking.

2. **`gemini.service.ts` comment accuracy (lines 195–199).** The explanatory comment states the six helpers "have been extracted into the shared `classifyLlmError` helper in `llm-error-mapper.ts`". This is slightly imprecise: `extractStatusCode`/`hasStringStatus` are now _probe hooks_ in `GEMINI_PROBES` (consumed by `classifyLlmError`), and `normaliseStatusCode` is now a _shared exported function_ — only `isResourceExhausted`/`isRateLimit`/`buildError`/`extractMessage` are literally inside `classifyLlmError`'s module. The comment is harmless and directionally correct; tightening it would improve precision. Non-blocking.

---

## Standards Compliance (Universal + Project)

- **No `console.*`** in any touched source file — all logging via `Logger` from `@nestjs/common` (and base-class `this.logger`). ✅
- **No empty `catch` blocks.** ✅
- **British English** in comments and identifiers — verified by `npm run lint:british` (clean) and manual review (`normalisation`, `behaviour`, `prioritise`-style terms consistent). ✅
- **No `any` types** — uses `unknown` + `Record<string, unknown>` + type guards throughout. ✅
- **Explicit return types** on all methods (`mapError(): LlmError | undefined`, `mapThinkingBudget(): number`, `buildModelParams(): GeminiRequest`, etc.). ✅
- **Cognitive complexity** within threshold — `mapError` reduced to a single delegation; `mapThinkingBudget` is a trivial switch; probe hooks are linear. ✅
- **NestJS conventions** — `@Injectable()`, class registered as provider, DI via constructor; no direct `@nestjs/config` misuse. ✅
- **KISS/DRY** — duplication removed; shared helper consumed by both providers; no speculative abstraction. ✅
- **ESM compliance** — imports use `.js` extensions; `getCurrentDirname()` not needed here. ✅
- **No secrets / no default values introduced without instruction.** ✅

---

## Files Read (mandatory + supporting)

1. `ACTION_PLAN.md` — full; Section 6 (lines 484–571) in detail.
2. `SPEC.md` (v2.3) — product decision #13, "GeminiService._sendInternal changes", "Reasoning effort mapping table", error-mapping sections.
3. `src/llm/gemini.service.ts` — under review (351 lines).
4. `src/llm/llm-error-mapper.ts` — under review (327 lines).
5. `src/llm/mistral.service.ts` — under review (355 lines).
6. `src/llm/gemini.service.spec.ts` — under review (911 lines); mapError block verified unchanged; new payload-field tests present.
7. `docs/llm/error-handling.md` — canonical error contract (noted stale, owned by Section 11).
8. `AGENTS.md` — project conventions.

Supporting evidence gathered: `git diff` of all four changed files; `grep` for the six helper names across `src/llm/`; `git show HEAD:…` comparison of the mapError block; automated check runs (166 / 440 / lint / lint:british / build).

---

## Final Determination

**SECTION 6 REVIEW CLEAN** — no Critical or Improvement-blocking findings. The refactor satisfies all nine acceptance criteria, the shared-helper extraction is KISS and behaviour-preserving for both providers, and every automated gate is green. The two Nitpick items (cosmetic spec indentation; comment precision) are non-blocking cleanups the implementer may optionally apply.
