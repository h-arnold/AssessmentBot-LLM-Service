# Code Review — Section 3 RED-phase test changes

**File under review:** `src/llm/gemini.service.spec.ts`
**Scope:** RED-phase tests for `GeminiService.mapError()` and `providerName` (Section 3, ACTION_PLAN test cases 1–23).
**Reviewer:** code-reviewer agent
**Date:** 2026-07-17

---

## Files read

- `SPEC.md` (full — classification priority #9, unrecognised 4xx → InvalidRequestError #11, 5xx-retryable #10, HTTP status table, provider error-mapping interface)
- `AGENTS.md` (full — British English, ESM `.js`, no console, no quality-gate override)
- `src/llm/gemini.service.spec.ts` (full — in scope)
- `ACTION_PLAN.md` Section 3 (lines 330–449 — required test cases #1–#23)
- `src/llm/llm.service.interface.ts` (lines 95–169 — `send()` retry/`wrapUnclassified` flow — to confirm SDK-fail / JsonParser-fail assertions are possible)
- `src/common/errors/*.ts` (all nine error classes + barrel) — confirmed `getStatus()`/status/retryable values match the SPEC table
- `src/common/errors/llm-service.error.ts` — confirmed `LlmServiceError` message format `LLM service error: <msg>`
- `node_modules/@google/genai/dist/node/node.d.ts` (lines 444–463) — `ApiError`/`ApiErrorInfo` typing (`status: number`, `message: string`)
- `tsconfig.json` / `tsconfig.build.json` / `vitest.config.ts` / `package.json` — confirmed build excludes specs; vitest uses esbuild (no runtime type-check)

---

## Prioritised IN-SCOPE findings

### Critical

None.

### High

None.

### Medium

**M1 — Misleading test title for the 5xx retry case (line 233).**
The `describe('error handling')` test is titled `'should not retry on non-429 errors'` but, after the Section 3 / product-decision-#10 change, it now _asserts_ 3 calls (`LLM_MAX_RETRIES + 1`) and a `ProviderServerError`. The title contradicts the test body and ACTION_PLAN #23 ("this is classified as `ProviderServerError` (retryable = true), so it will now retry up to `LLM_MAX_RETRIES`"). This is a documentation/contract clarity defect that will mislead the next reader and risks a future "fix" that reverts the call-count assertion.

- **Fix:** Rename to `'should retry on 5xx server errors and throw ProviderServerError after exhausting retries'` (British English already in use). Keep the body as-is.

### Low

**L1 — Redundant missing `getStatus()` assertion on a few `mapError` cases.**
Most category cases assert `result!.getStatus()` (RateLimit 429, ResourceExhausted 503, ProviderServer 502, Auth 502, ContentFiltered 400, ContextLength 400, InvalidRequest 400, Network 502). However two `NetworkError` cases (line 603 `ETIMEDOUT`, line 610 `fetch failed`) and the two `ResourceExhausted` priority/plain-string cases (line 435 `{ status: 'RESOURCE_EXHAUSTED' }`, line 442 priority) omit the `getStatus()` check. The `ETIMEDOUT` case at line 603 also omits `getStatus()` while the `ECONNREFUSED` and `fetch failed` cases include it.

- **Fix (optional, recommended for symmetry):** Add `expect(result!.getStatus()).toBe(502)` to the `ETIMEDOUT` case (line ~606) and the plain-object `RESOURCE_EXHAUSTED` case (line ~437) so every case pins the full status contract. Not blocking — these are covered by sibling cases.

**L2 — `getStatus()` not asserted on the priority/string cases is acceptable but worth noting.**
The priority cases (lines 442–451, 519–528) assert `retryable` and `providerName` but not `getStatus()`. Functionally fine since class identity implies status, but for completeness L1's suggestion applies.

### Nitpick

**N1 — `callMapError` cast helper is acceptable** (lines 95–99). Accessing the protected `mapError` via an `as unknown as {...}` cast is the established pattern for testing protected methods and is fine. No change needed.

**N2 — British English verified.** All comments/identifiers/strings in the changed spec use British spellings (`behaviour` not present but `Error communicating with or validating response from Gemini API` is neutral). No American spellings introduced. No `console.*` in the spec. Imports use ESM `.js` extensions. No legacy `'Failed to get a valid and structured response from the LLM.'` string remains (confirmed by grep). ✓

---

## Verification against the checklist (item-by-item)

1. **mapError cases** — all 22+ cases present and assert `instanceof`, `getStatus()` (where applicable), `retryable`, and `providerName === 'gemini'`. ✓
   - RateLimitError(429/t) — line 395 ✓
   - ResourceExhaustedError(503/f, incl. priority over RateLimit) — lines 422–451 ✓
   - ProviderServerError(502/t for 500 & 503) — lines 454–477 ✓
   - AuthenticationError(502/f for 401/403) — lines 480–503 ✓
   - ContentFilteredError(400/f, priority over ContextLength, safety-triggered) — lines 506–539 ✓
   - ContextLengthExceededError(400/f) — lines 542–553 ✓
   - InvalidRequestError(400/f generic + unrecognised 4xx 418/422) — lines 556–591 ✓
   - NetworkError(502/t for ECONNREFUSED/ETIMEDOUT/fetch failed) — lines 594–616 ✓
   - undefined for `{foo:'bar'}` — line 621 ✓; undefined for string/null — lines 625–632 ✓

2. **Priority correctness** — 429 + RESOURCE_EXHAUSTED → ResourceExhaustedError (line 442–451) ✓; 400 both patterns → ContentFilteredError (line 519–528) ✓; 400 safety-triggered → ContentFilteredError not InvalidRequestError (line 530–539) ✓.

3. **Unrecognised 4xx → InvalidRequestError (#11)** — 418 (line 569–579) and 422 (line 581–591) both → `InvalidRequestError` (HTTP 400, retryable false), NOT undefined. ✓ Conforms exactly with SPEC #11.

4. **Updated retry tests** —
   - "should not retry on non-429 errors" (line 233): now `ProviderServerError`, `toHaveBeenCalledTimes(3)` (maxRetries 2 + 1), `rejects.toThrow(ProviderServerError)`. ✓ With `LLM_MAX_RETRIES = 2` (setup line 82) the loop runs attempts 0,1,2 = 3 calls; throws on attempt === maxRetries. Correct.
   - "SDK fails" (`new Error('SDK Error')`, line 168–177): → `LlmServiceError`, message `'LLM service error: SDK Error'`. ✓ Confirmed against `wrapUnclassified` in `llm.service.interface.ts` lines 126–132.
   - "JsonParserUtil fails" (line 188–203): → `LlmServiceError`, message `'LLM service error: Malformed or irreparable JSON string provided.'` ✓.

5. **ZodError test unchanged** (line 179–186) — still `rejects.toThrow(ZodError)`, bypasses `mapError()`. ✓ ; ResourceExhaustedError retry tests preserved (line 317–391, `toHaveBeenCalledTimes(1)` for retryable=false). ✓

6. **No legacy string** — confirmed absent. ✓

7. **British English / ESM / cast helper** — all conform (see N1/N2). ✓

8. **Correctness/possibility** — every assertion would PASS against a CORRECT `mapError()` implementation per SPEC. No false-pass, impossible, or wrong-status/retryable assertion detected. The only string-status fixtures (lines 408, 436) correctly use plain objects (not `ApiError`), and all `ApiError` fixtures use numeric `status` — so no TypeScript type error is introduced (confirmed `ApiErrorInfo.status: number`). ✓

---

## Verdict

**REVIEW CLEAN — proceed to green** (one Medium clarity fix recommended, non-blocking).

All in-scope assertions match the SPEC contract, ACTION_PLAN Section 3 test cases #1–#23, and the agreed classification priority order. The only outstanding item is the misleading test title at line 233 (Medium M1), which should be renamed before merge for reviewer clarity but does not block the RED→GREEN transition. No Critical/High findings.
