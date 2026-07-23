# Code Review — RED Phase: ACTION_PLAN Section 1 (ILlmService Interface, Token, Payload Extensions)

**Reviewer**: Code Reviewer (tencent/hy3)
**Scope**: RED-phase test changes only
**Mandatory reading**: ACTION_PLAN.md §1, SPEC.md v2.3 (ILlmService interface, DI token, Recommended data shapes, product decisions #2 & #5), and the current state of the two changed test files + the two source context files.
**Date**: 2026-07-23

---

## Summary

**Verdict: PASS** — The RED test changes are correct, minimal, and in-scope. Both test files reference the not-yet-existing `ILlmService`/`LLM_SERVICE_TOKEN` symbols, producing exactly 5 expected failures (all at the `module.get(LLM_SERVICE_TOKEN)` call sites) while every other test file remains green. No source files were modified and no `MISTRAL_API_KEY` mock was added. The changes precisely satisfy Section 1 acceptance criteria #6 and #7 and are fit to proceed to GREEN.

---

## Automated checks observed

| Check                   | Result                                                                                    | Notes                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test` (unit, full) | 5 failed / 341 passed across 50 files                                                     | All 5 failures are in the two in-scope files; 48 other files pass. No out-of-scope test failures.                                                                                                                                                                                                                                   |
| Failure nature          | `Nest could not find given element (this provider does not exist in the current context)` | Observed **only** at `src/llm/llm.module.spec.ts:93` and `src/v1/assessor/assessor.service.spec.ts:131` — the two `module.get(LLM_SERVICE_TOKEN)` lines. This is the expected RED failure: `LLM_SERVICE_TOKEN` (currently `undefined` because it is not exported from `llm.service.interface.js` yet) is not a registered provider. |
| `npm run lint`          | exit 0                                                                                    | No new lint violations. (Expected — vitest/esbuild tolerates the missing named imports, leaving `LLM_SERVICE_TOKEN` as `undefined` at runtime rather than a hard import error.)                                                                                                                                                     |
| `npm run build`         | exit 0                                                                                    | Expected — `*.spec.ts` files are excluded from the build tsconfig, so the missing `LLM_SERVICE_TOKEN` export does not surface during `nest build`.                                                                                                                                                                                  |

The named imports themselves did **not** break compilation/import because the project's test transform (esbuild) permits missing named exports (they resolve to `undefined`); `ILlmService` is a type-only import and is fully erased. The RED failure mode is therefore exactly the intended one: the token is unknown to the DI container at runtime, not a compile-time crash.

---

## Scope verification (git)

- `git status` / `git diff --name-only` reports **three** modified files:
  1. `src/llm/llm.module.spec.ts` — IN SCOPE (RED change).
  2. `src/v1/assessor/assessor.service.spec.ts` — IN SCOPE (RED change).
  3. `.opencode/agents/code-reviewer.md` — **OUT OF SCOPE but benign**: the only diff is a one-line model swap (`opencode/hy3-free` → `openrouter/tencent/hy3`), i.e. the agent-config wiring for this very review session. It is not a source/test file, does not touch the feature, and does not affect the RED review. **Not a blocker.** Noted for transparency only.
- No source files (`src/llm/llm.service.interface.ts`, `src/llm/llm.module.ts`, `src/v1/assessor/assessor.service.ts`) were modified. ✓
- No `MISTRAL_API_KEY` mock was added to either test file (verified via `grep` — absent). ✓ Consistent with Section 1 ("No MISTRAL_API_KEY mock is required yet").

---

## Change-by-change conformance

### `src/v1/assessor/assessor.service.spec.ts`

- Line 11: `import { ILlmService, LLM_SERVICE_TOKEN } from '../../llm/llm.service.interface.js';` replaces the former `LLMService` import. ✓ Acceptance #6.
- Line 71: `let llmService: ILlmService;` — field type changed from `LLMService` to `ILlmService`. ✓ Acceptance #6.
- Line 120: `.overrideProvider(LLM_SERVICE_TOKEN)` replaces `.overrideProvider(LLMService)`. ✓ Acceptance #6.
- Line 131: `llmService = module.get<ILlmService>(LLM_SERVICE_TOKEN);` replaces `module.get<LLMService>(LLMService)`. ✓ Acceptance #6.
- Lines 124–125: `.overrideProvider(GeminiService).useValue({ send: vi.fn() })` is **preserved** (import `GeminiService` at line 9 still present and still used). ✓ "GeminiService override retained" / "defensive override retained".
- All existing assertions (`expect(llmService.send).toHaveBeenCalledWith(...)`, mock `createMockLlmResponse`, `__proto__` check, etc.) are unchanged. ✓ "All existing assertions remain identical."
- No `MISTRAL_API_KEY` mock added. ✓ (Correct for Section 1; the four new vars + `MISTRAL_API_KEY` are deferred to Section 5.)

### `src/llm/llm.module.spec.ts`

- Line 6: `import { LLM_SERVICE_TOKEN } from './llm.service.interface.js';` replaces the former `LLMService` import. ✓ Acceptance #7.
- Line 93: `const llmService = module.get(LLM_SERVICE_TOKEN);` replaces `module.get(LLMService)`. ✓ Acceptance #7.
- Assertion remains `expect(llmService).toBeDefined();`. ✓ Matches the explicit RED instruction in §1 "Required test cases" item 2 ("Assertion remains `toBeDefined()`"). The stronger "resolves to a `GeminiService` instance" wording in acceptance #7 describes the eventual GREEN wiring and is intentionally tightened in Section 5; the minimal `toBeDefined()` assertion is the correct RED form.
- No `MISTRAL_API_KEY` mock added. ✓ (Correct for Section 1.)

### Temporary-wiring intent (Section 1)

The tests continue to rely on `LlmModule` providing `LLM_SERVICE_TOKEN` — currently still wired to `LLMService`/`GeminiService` in source (GREEN will change it to `{ provide: LLM_SERVICE_TOKEN, useClass: GeminiService }`). The test overrides are correctly written against the token, so they will resolve once GREEN lands. The temporary nature is acknowledged and is **not** flagged as a defect; Section 5 explicitly supersedes these overrides.

---

## Findings (in-scope)

**No in-scope issues found.** The changes are minimal, correct, and aligned with Section 1 acceptance criteria #6 and #7, the SPEC `ILlmService` interface / `LLM_SERVICE_TOKEN = 'LLM_SERVICE'` contract, and the product decisions #2 (router does not extend `LLMService`; string token) and #5 (optional payload fields — not exercised by these test files but also not contradicted).

- **Critical**: none.
- **Improvement**: none.
- **Nitpick**: none.

## Notes / transparency

- The only file touched beyond the two in-scope test files is `.opencode/agents/code-reviewer.md`, a benign agent-config model swap unrelated to the feature. It does not affect this RED review and is not a blocker.
- `lint` and `build` both exit 0 at RED; this is consistent with the project's test transform tolerating the not-yet-defined imports and with `*.spec.ts` being excluded from the build. No action required.

---

## Verdict

**RED REVIEW CLEAN — proceed to GREEN.**

(The GREEN implementation must add `ILlmService`, `LLM_SERVICE_TOKEN = 'LLM_SERVICE'`, and `ReasoningEffort` to `src/llm/llm.service.interface.ts`, mark `LLMService implements ILlmService`, add optional `model`/`reasoningEffort` payload fields, rewire `LlmModule` to `{ provide: LLM_SERVICE_TOKEN, useClass: GeminiService }` (removing the old `LLMService` class-token entry), and update `AssessorService` to inject `@Inject(LLM_SERVICE_TOKEN) private readonly llmService: ILlmService`. After that, the 5 currently-failing tests must turn green.)
