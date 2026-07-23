# Code Review — GREEN-phase Section 3: `GeminiService.mapError()` + `providerName`

**Reviewer**: Code Reviewer agent
**Date**: 2026-07-17
**Scope**: IN-SCOPE only — `src/llm/gemini.service.ts` (implementation), `src/llm/llm.service.interface.ts` (the `Number()` coercion change), `src/llm/gemini.service.spec.ts` (confirm still asserts correctly & satisfied).
**Out of scope**: Section 4 `http-exception.filter` sanitisation tests; Section 2 `llm.service.interface.spec.ts` retry logic.

---

## Files read

1. `SPEC.md` (full — particularly §"Agreed product decisions" #9, #11, #12; "HTTP status code table"; "Provider error-mapping interface"; "Classification priority order")
2. `AGENTS.md` (full — British English, no console.*, quality-gate discipline)
3. `src/llm/gemini.service.ts` (full, 449 lines)
4. `src/llm/llm.service.interface.ts` (full, 257 lines — includes the `Number()` coercion change under review)
5. `src/llm/gemini.service.spec.ts` (full, 637 lines — 44 tests)
6. `src/common/errors/llm-error.base.ts` (base `LlmError` constructor shape)
7. `src/common/errors/network.error.ts` (NetworkError constructor + 502/retryable)
8. `src/common/errors/resource-exhausted.error.ts` (ResourceExhaustedError constructor + 503/non-retryable)
9. `git diff` for `llm.service.interface.ts` (confirmed the `Number()` coercion is the only interface change)

Automated checks run:

- `npm run lint` → PASS (no warnings/errors)
- `npm run build` → PASS (`nest build` succeeds; GeminiService implements abstract `providerName` + `mapError`)
- `npx vitest run src/llm/gemini.service.spec.ts` → PASS (44/44)

---

## Verification against SPEC (the 13 points)

| #   | Requirement                                                                                                            | Result                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `providerName = 'gemini'`                                                                                              | ✅ Line 42                                                                                                                                                                                                                        |
| 2   | Classification priority order                                                                                          | ✅ ResourceExhausted → RateLimit → Auth(401/403) → ContentFiltered(400+safety) → ContextLength(400+ctx) → InvalidRequest(400 & any 4xx) → ProviderServer(5xx) → NetworkError(no status) → undefined. Matches order in `mapError`. |
| 3   | **#11** unrecognised 4xx (418/422) → InvalidRequestError, NOT undefined                                                | ✅ Lines 159-162: `statusCode >= 400 && < 500` → InvalidRequestError. No 4xx falls through to `undefined`. Confirmed by spec tests at lines 569-591.                                                                              |
| 4   | **#9d** 5xx with ECONNREFUSED-style message → ProviderServerError (not NetworkError)                                   | ✅ 5xx branch (165-167) precedes NetworkError branch (170-179), which is only reached when `statusCode === undefined`.                                                                                                            |
| 5   | NetworkError only when NO status + network msg                                                                         | ✅ Guarded by `statusCode` checks above; line 170-179 requires no matching status and a network-failure regex.                                                                                                                    |
| 6   | Non-object (string/null/undefined) → undefined without throwing                                                        | ✅ Top guard lines 125-127; `extractStatusCode`/`hasStringStatus`/`isErrorObject` all defensively guard `typeof !== 'object'`. No throw path reachable.                                                                           |
| 7   | Each returned `LlmError` built with `this.providerName`                                                                | ✅ via `buildError(...)` (line 244) and the NetworkError branch (line 176).                                                                                                                                                       |
| 8   | `originalError` narrowed to `Error` only (`isErrorObject`)                                                             | ✅ `buildError` line 243; NetworkError branch (171) only reached when `isErrorObject(error)` true.                                                                                                                                |
| 9   | `extractStatusCode` handles status/statusCode/code/response.status/error.status/error.code (number + string-coercible) | ✅ Lines 256-285 + `normaliseStatusCode` (293-300).                                                                                                                                                                               |
| 10  | `hasStringStatus` checks error.status/error.code/error.error.status/error.error.code case-insensitively                | ✅ Lines 311-329.                                                                                                                                                                                                                 |
| 11  | Build restored; lint + British English clean                                                                           | ✅ Build PASS, lint PASS. British English confirmed in comments (`normalise`, `coerces`, `nested`, `recognised`, `classifies`).                                                                                                   |
| 12  | Base `Number()` coercion safe no-op for numeric ConfigService                                                          | ✅ `Number(2) === 2`; `Number('2') === 2`. Minimal 2-line change; justified (defensive for string-coercible config).                                                                                                              |
| 13  | `'Unknown error'` for non-Error object mapping consistent                                                              | ✅ Line 131-132 / 129-132 of interface `wrapUnclassified`. Supplies `'Unknown error'` for non-Error objects in `mapError` (gemini line 130-132). No test asserts exact string; behaviour non-regressive.                          |

### Focused scrutiny on the three flagged risks

**(a) Any 4xx code path returning undefined?** — No. The `InvalidRequestError` branch (159-162) is the _catch-all_ for `400 ≤ statusCode < 500`. Every 4xx is intercepted there. The only statuses that reach `undefined` are: `statusCode === undefined` AND not a network message (plain unrecognised object), which is the intended SPEC behaviour. ✅

**(b) Could a 5xx + ECONNREFUSED message wrongly become NetworkError?** — No. `extractStatusCode` returns the 5xx number, so the `statusCode >= 500` branch (165-167) fires first and returns `ProviderServerError`. NetworkError is structurally unreachable whenever any status code is extracted. ✅

**(c) Could `mapError` throw on null/string?** — No. Top guard returns `undefined` immediately for `!error || typeof error !== 'object'`. All helper methods independently guard against non-objects. The base-class `handleAttemptError` try/catch is an additional safety net regardless. ✅

---

## Findings

### Critical

None.

### High

None.

### Medium

None.

### Low

- **`gemini.service.ts:130-132` — `'Unknown error'` fallback message is hard-coded in `mapError`** but the equivalent in the base `wrapUnclassified` (llm.service.interface.ts:129) is the SPEC-sanctioned `"LLM service error: Unknown error"`. These two "Unknown error" conventions diverge in phrasing. For `mapError`, the bare `'Unknown error'` becomes the `message` of the _specific_ error class (e.g. InvalidRequestError's message), which is acceptable since that path only triggers for a plain object with a 4xx status but no message — the status semantics are preserved. This is a _consistency_ observation, not a defect; SPEC #13 only requires the convention not regress behaviour. **Recommendation (optional):** consider sourcing the literal from a shared constant if future providers need identical phrasing. Not blocking.

- **`gemini.service.ts:171` — NetworkError `originalError` passes `error` directly** rather than re-confirming `isErrorObject`. This is safe _only_ because the surrounding `if` already guarantees `isErrorObject(error)`. Minor readability improvement: inline `this.isErrorObject(error) ? error : undefined` for symmetry with `buildError`, or add a one-line comment noting the guard above guarantees the type. Not blocking.

### Nitpick

- **`gemini.service.ts:121` JSDoc** lists `9. undefined — none of the above match.` which is accurate, but the preceding prose steps 1-9 are 1-indexed while the code comments use `// 1.` … `// 8.` — the JSDoc's "9" corresponds to the implicit `return undefined`. Consistent enough; no change required.
- British English / spelling: all comments reviewed — `normalise`, `recognised`, `classifies`, `nested`, `coerces` are correct British English. No `console.*` calls present. ✅

---

## Verdict

**REVIEW CLEAN — proceed to commit.**

All 13 SPEC verification points pass. The three high-risk questions (a) 4xx→undefined leak, (b) 5xx-precedence misclassification, (c) throw on null/string are each conclusively satisfied. Lint and build are green; 44/44 in-scope tests pass. The `Number()` coercion in `llm.service.interface.ts` is a minimal, safe no-op for numeric `ConfigService` values. No Critical/High/Medium blocking issues. The two Low/Nitpick items are optional consistency/readability tweaks that do not block the green phase.
