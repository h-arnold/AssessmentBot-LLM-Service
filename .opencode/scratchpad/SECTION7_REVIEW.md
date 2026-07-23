# Code Review — ACTION_PLAN.md Section 7: Environment Schema, App-Lifecycle Defaults, and Unit-Test Mock Audit

**Reviewer:** Code Reviewer agent (tencent/hy3)
**Date:** 2026-07-23
**Scope:** Section 7 only — five new env vars, `.env.example`/`.test.env.example` docs, `app-lifecycle.ts` default, and the unit-test mock/process.env audit.

---

## Verdict: PASS

Section 7 is implemented correctly and minimal. The schema additions exactly match SPEC v2.3 types/defaults (acceptance criteria 1–6). Both env templates document all five new variables in British English (criteria 7–8). `app-lifecycle.ts` carries the `MISTRAL_API_KEY` dummy (criterion 9). The audit is effective: all **351 unit tests pass**, `npm run lint`, `npm run lint:british`, and `npm run build` are clean (criterion 10). No scope creep — no model registry, no `MistralService`, no routing service, and no premature `ConfigService.get()` mock-switch additions for the model/effort vars.

---

## Files read (full)

- `ACTION_PLAN.md` (Sections 1, 5, 7, 8, 10, 11 and constraints)
- `SPEC.md` v2.3 (§ "Environment schema additions", backend changes #8, #9, #15, product decisions #4, #11)
- `AGENTS.md`
- `src/config/environment.schema.ts` (changed)
- `src/config/environment.schema.spec.ts` (changed)
- `.env.example` (changed)
- `.test.env.example` (changed)
- `test/utils/app-lifecycle.ts` (changed)
- 7 patched spec files (diffs verified): `src/auth/auth.module.spec.ts`, `src/config/config.module.spec.ts`, `src/config/config.service.spec.ts`, `src/prompt/prompt.factory.spec.ts`, `src/prompt/prompt.module.spec.ts`, `src/status/status.module.spec.ts`, `src/v1/assessor/assessor.service.spec.ts`
- `src/config/config.module.ts` (context: confirms `ConfigModule` wraps Nest `ConfigModule.forRoot({ envFilePath: '.env' })`; real `ConfigService` performs Zod validation)
- `src/v1/assessor/assessor.module.spec.ts` (context: confirms `.overrideProvider(ConfigService)` — real parse not run, so absent from the 7)
- `src/llm/llm.module.spec.ts` (context: same — mock override, real parse not run)
- `src/v1/assessor/assessor.service.spec.ts` lines 75–134 (confirm mock override + process.env patch)
- `src/prompt/prompt.factory.spec.ts` lines 1–35 (confirm `ConfigModule` real import + patch)
- Working-tree state via `git diff HEAD`, `git status`, `git check-ignore .test.env`

---

## Acceptance-criteria verification

| #   | Criterion                                                                                                                 | Result                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `MISTRAL_API_KEY` non-empty                                                                                               | ✅ `z.string().min(1)` (schema line 69); spec test confirms rejection of empty                                                                                                                                                      |
| 2   | `DEFAULT_TEXT_TABLE_MODEL` default `'mistral-small-latest'`                                                               | ✅ schema line 70; spec asserts default                                                                                                                                                                                             |
| 3   | `DEFAULT_IMAGE_MODEL` default `'mistral-small-latest'`                                                                    | ✅ schema line 71; spec asserts default                                                                                                                                                                                             |
| 4   | `TEXT_REASONING_EFFORT` default `'low'`                                                                                   | ✅ schema line 72; spec asserts default                                                                                                                                                                                             |
| 5   | `IMAGE_REASONING_EFFORT` default `'high'`                                                                                 | ✅ schema line 73; spec asserts default                                                                                                                                                                                             |
| 6   | Invalid reasoning effort rejected by Zod                                                                                  | ✅ spec tests reject `'nonsense'` for both TEXT and IMAGE effort                                                                                                                                                                    |
| 7   | `.env.example` documents all new vars                                                                                     | ✅ 5 vars with British-English inline docs (lines 37–53)                                                                                                                                                                            |
| 8   | `.test.env.example` has all five with placeholders                                                                        | ✅ `MISTRAL_API_KEY=YOUR_MISTRAL_API_KEY_HERE` + 4 model/effort vars (lines 8–21)                                                                                                                                                   |
| 9   | `app-lifecycle.ts` `defaultTestValues` has `MISTRAL_API_KEY: 'dummy-key-for-testing'`                                     | ✅ line 98 (parallel to `GEMINI_API_KEY`)                                                                                                                                                                                           |
| 10  | Audit complete — every `ConfigModule`/`LlmModule` import and `configObjectSchema.parse` has a non-empty `MISTRAL_API_KEY` | ✅ 351/351 tests green; grep over `*.spec.ts` confirms the 7 real-`ConfigService` sites patched; the 2 mock-override sites (`llm.module.spec.ts`, `assessor.module.spec.ts`) replace `ConfigService` entirely so no real parse runs |

---

## Critical

None.

---

## Improvement

None blocking. The implementation is faithful to the plan and SPEC.

---

## Nitpick / Observations (non-blocking)

1. **`src/v1/assessor/assessor.service.spec.ts` `process.env.MISTRAL_API_KEY` patch is technically redundant.**
   This spec overrides `ConfigService` with a mock (`useValue: mockConfigService`, line 121), so the real `ConfigService` Zod parse never runs and `MISTRAL_API_KEY` is not consumed from `process.env` in this file (and `MistralService` is not yet a registered provider until Section 5). The line is harmless and keeps the file consistent with the other six patches, so it is **not** flagged as scope creep — but it is not strictly necessary today. Note for Section 5: when `MistralService` becomes a class provider in `LlmModule`, this spec will need `MISTRAL_API_KEY` returned by the **mock's** `getMockEnvironmentValue` switch (plan criterion #22), not only from `process.env`. Worth bearing in mind during the Section 5 handoff.

2. **Out-of-scope change present in working tree: `.opencode/agents/code-reviewer.md`.**
   `git diff` shows this file was edited (model assignment `opencode/hy3-free` → `openrouter/tencent/hy3`). It is unrelated to Section 7 and is not a Section 7 acceptance criterion. Recommend either confirming it is an intentional, separate change or excluding it from the Section 7 commit to keep the change set focused. It does not affect Section 7 functionality.

3. **Pre-existing working-tree secret (not a Section 7 issue).**
   `.test.env` (gitignored — confirmed via `.gitignore` line 21, not tracked) contains a real-looking `GEMINI_API_KEY`. This is pre-existing, not introduced by Section 7, and not committed. No action required for this review, but the key should be rotated if it was ever shared. The three specs that only patch `MISTRAL_API_KEY` (prompt/prompt.factory/prompt.module/status) obtain `GEMINI_API_KEY` from this injected `.test.env`, which is consistent with their pre-Section-7 behaviour.

---

## Audit completeness notes

- The seven patched files are the **real-`ConfigService`** sites (they import `ConfigModule` / a module that imports it without overriding `ConfigService`), so the Zod parse runs against `process.env` and the new required `MISTRAL_API_KEY` must be present. The patches add exactly `process.env.MISTRAL_API_KEY = 'test-key'` in a `beforeAll` block and nothing else — verified minimal via `git diff`.
- The two `ConfigModule`-importing specs that are **not** patched (`src/llm/llm.module.spec.ts`, `src/v1/assessor/assessor.module.spec.ts`) both call `.overrideProvider(ConfigService).useValue(mockConfigService)`, replacing the real service; the Zod parse therefore never executes, so they require no `process.env` change. This is the correct, intended boundary and matches the plan's note that mock-override sites are owned by Section 5.
- Grep cross-check: every `*.spec.ts` that sets `process.env.GEMINI_API_KEY` also now sets `process.env.MISTRAL_API_KEY`, and every `ConfigModule` import is accounted for (patched if real, mocked if overridden). No unpatched real-`ConfigService` site remains.

---

## Automated check results

- `npm run lint` → clean (no errors/warnings)
- `npm run lint:british` → "British English compliance verified"
- `npm run build` → `nest build` succeeded
- `npm test` → **Test Files 50 passed (50); Tests 351 passed (351)** (matches the expected count)

---

## Conclusion

SECTION 7 REVIEW CLEAN — PASS. All acceptance criteria (1–10) satisfied, no Critical or Improvement findings, only minor non-blocking observations. No scope creep detected.
