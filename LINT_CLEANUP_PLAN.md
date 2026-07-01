# Lint Cleanup Plan

## Background

The ESLint configuration was tightened, resulting in **2583 problems** (289 errors, 2294 warnings) across **80 files** and **43 rules**. This plan systematically resolves all violations through auto-fixing followed by targeted sub-agent batches.

## Overall Strategy

1. **Auto-fix** globally to resolve all automatically fixable issues (~224)
2. Split remaining **71 files** into three tiers by complexity
3. Each sub-agent fixes **all** violations in its assigned file(s)
4. Verify with `npm run lint`, `npm run test`, `npm run test:e2e`
5. All work lands on a **single branch**

---

## Step 0: Auto-fix

```bash
npm run lint:fix
```

Resolves 224 issues (106 errors + 118 warnings). 8 files become fully clean. 71 files remain with ~2359 issues.

---

## Step 1: Complex files — one sub-agent per file (40 sub-agents)

Each file has 10+ violations. Sub-agent fixes **all** violations in its assigned file.

| # | File | Issues | Type |
|---|---|---|---|
| 1 | `src/common/http-exception.filter.spec.ts` | 356 | spec |
| 2 | `src/config/config.service.spec.ts` | 196 | spec |
| 3 | `src/llm/gemini.service.spec.ts` | 155 | spec |
| 4 | `src/common/pipes/image-validation.pipe.spec.ts` | 103 | spec |
| 5 | `src/bootstrap.spec.ts` | 101 | spec |
| 6 | `src/common/zod-validation.pipe.spec.ts` | 99 | spec |
| 7 | `src/v1/assessor/assessor.service.spec.ts` | 82 | spec |
| 8 | `src/v1/assessor/dto/create-assessor.dto.spec.ts` | 74 | spec |
| 9 | `src/status/status.service.spec.ts` | 68 | spec |
| 10 | `src/common/json-parser.util.spec.ts` | 66 | spec |
| 11 | `src/auth/api-key.service.spec.ts` | 62 | spec |
| 12 | `src/llm/types.spec.ts` | 59 | spec |
| 13 | `src/prompt/image.prompt.spec.ts` | 55 | spec |
| 14 | `src/app.module.spec.ts` | 52 | spec |
| 15 | `src/config/config.env-example.spec.ts` | 51 | spec |
| 16 | `src/auth/api-key.strategy.spec.ts` | 48 | spec |
| 17 | `src/prompt/prompt.base.spec.ts` | 47 | spec |
| 18 | `src/v1/assessor/assessor.controller.spec.ts` | 45 | spec |
| 19 | `src/auth/auth.module.spec.ts` | 39 | spec |
| 20 | `src/llm/llm-integration.spec.ts` | 39 | spec |
| 21 | `src/status/status.controller.spec.ts` | 37 | spec |
| 22 | `src/config/config.module.spec.ts` | 35 | spec |
| 23 | `src/main.spec.ts` | 30 | spec |
| 24 | `src/testing-main.spec.ts` | 30 | spec |
| 25 | `src/llm/resource-exhausted.error.spec.ts` | 27 | spec |
| 26 | `src/prompt/table.prompt.spec.ts` | 27 | spec |
| 27 | `src/prompt/text.prompt.spec.ts` | 27 | spec |
| 28 | `src/prompt/prompt.factory.spec.ts` | 26 | spec |
| 29 | `test/pentesting.e2e-spec.ts` | 24 | e2e |
| 30 | `test/utils/app-lifecycle.ts` | 24 | test util |
| 31 | `src/common/utils/log-redactor.util.spec.ts` | 22 | spec |
| 32 | `src/auth/api-key.guard.spec.ts` | 20 | spec |
| 33 | `test/prod-tests/docker-image.prod-spec.ts` | 20 | prod-test |
| 34 | `prod-tests/docker-image.prod-spec.ts` | 19 | prod-test |
| 35 | `src/llm/llm.module.spec.ts` | 18 | spec |
| 36 | `src/v1/assessor/assessor.module.spec.ts` | 17 | spec |
| 37 | `src/common/common.module.spec.ts` | 16 | spec |
| 38 | `src/common/file-utils.spec.ts` | 15 | spec |
| 39 | `src/v1/assessor/dto/create-assessor.dto.ts` | 13 | src |
| 40 | `test/log-watcher.unit-spec.ts` | 13 | unit test |

### Fix approach for complex files

These are dominated by `@typescript-eslint/no-unsafe-*` warnings (2090 total across all files). Fix patterns:

- **`jest.fn()`** — add generic type parameter: `jest.fn<() => ReturnType>()` or cast with `as jest.Mock`
- **`jest.fn().mockImplementation(...)`** — type the mock variable or chain with typed helper
- **`jest.spyOn().mockImplementation()`** — store in typed variable
- **All other violations** in the file (unicorn rules, no-console, etc.) should also be fixed

---

## Step 2: Medium files — grouped by module (6 sub-agents)

Each sub-agent handles a batch of related files (3-9 violations each).

### M1: `src/main.ts` + `src/testing-main.ts`

| File | Issues |
|---|---|
| `src/main.ts` | 7 errors |
| `src/testing-main.ts` | 7 errors |

**Rules**: `prefer-module` (replace `require`/`module`), `prefer-await` (`.catch()` → try/catch), `prefer-top-level-await`, `catch-error-name`, `no-console`, `no-top-level-side-effects`

### M2: E2E assessment specs

| File | Issues |
|---|---|
| `test/assessor-live.e2e-spec.ts` | 7 (5 err, 2 warn) |
| `test/assessor.e2e-spec.ts` | 7 (3 err, 4 warn) |

**Rules**: `prefer-node-protocol`, `import-style`, `prefer-module`, `prefer-uint8array-base64`, `text-encoding-identifier-case`, `name-replacements`

### M3: Test utilities + prompt module spec

| File | Issues |
|---|---|
| `test/utils/log-watcher.ts` | 6 errors |
| `src/prompt/prompt.module.spec.ts` | 9 warnings |

**Rules**: `prefer-node-protocol`, `text-encoding-identifier-case`, `try-complexity`, `catch-error-name`, `no-console`, `consistent-function-scoping`, `prefer-early-return`, `no-declarations-before-early-exit`, `prefer-error-is-error`, `@typescript-eslint/no-unsafe-*`

### M4: Docker/prod-test utilities + start-app e2e

| File | Issues |
|---|---|
| `prod-tests/utils/docker-utils.ts` | 4 (0 err, 4 warn) |
| `test/prod-tests/utils/docker-utils.ts` | 4 (0 err, 4 warn) |
| `test/start-app.e2e-spec.ts` | 5 (4 err, 1 warn) |

**Rules**: `name-replacements` (`runCmd` → `runCommand`, `req` → `request`, `res` → `response`), `prefer-node-protocol`, `import-style`, `prefer-module`, `text-encoding-identifier-case`

### M5: Logging e2e + throttler e2e + status module spec

| File | Issues |
|---|---|
| `test/logging.e2e-spec.ts` | 4 errors |
| `test/throttler.e2e-spec.ts` | 3 errors |
| `src/status/status.module.spec.ts` | 5 warnings |

**Rules**: `import-style`, `prefer-node-protocol`, `prefer-module`, `name-replacements`, `prefer-at`, `prefer-number-is-safe-integer`, `prefer-number-coercion`, `new-for-builtins`, `no-manually-wrapped-comments`, `no-console`, `@typescript-eslint/no-unsafe-*`

### M6: Source common utils + health-check script

| File | Issues |
|---|---|
| `src/common/file-utils.ts` | 5 (1 err, 4 warn) |
| `src/common/json-parser.util.ts` | 3 (1 err, 2 warn) |
| `scripts/health-check.js` | 4 errors |

**Rules**: `text-encoding-identifier-case`, `catch-error-name`, `try-complexity`, `name-replacements` (e.g., `ctx` → `context`, `dir` → `directory`), `no-process-exit`, `no-console`

---

## Step 3: Trivial files — grouped by module (4 sub-agents)

Each file has 1-2 violations. Grouped by source module.

### T1: `src/llm/`

| File | Issues |
|---|---|
| `src/llm/gemini.service.ts` | 1 error |
| `src/llm/types.ts` | 1 warning |
| `src/llm/resource-exhausted.error.ts` | 1 error |

**Rules**: `try-complexity` (gemini.service.ts:62 — split try block), `name-replacements` (types.ts — rename abbreviation), `custom-error-definition` (resource-exhausted.error.ts:9 — add `options` param)

### T2: `src/common/` + `src/config/`

| File | Issues |
|---|---|
| `src/common/http-exception.filter.ts` | 1 error |
| `src/common/utils/log-redactor.util.ts` | 2 warnings |
| `src/config/config.service.ts` | 1 error |
| `src/config/env.schema.ts` | 1 warning |

**Rules**: `prefer-error-is-error` (http-exception.filter.ts:225), `name-replacements` (log-redactor.util.ts, env.schema.ts), `import-style` (config.service.ts:2)

### T3: `src/auth/` + `src/status/` + `src/prompt/`

| File | Issues |
|---|---|
| `src/auth/api-key.strategy.ts` | 1 warning |
| `src/status/status.service.ts` | 1 error |
| `src/prompt/image.prompt.ts` | 1 warning |

**Rules**: `name-replacements` (api-key.strategy.ts), `prefer-node-protocol` (status.service.ts:1 — `os` → `node:os`), `name-replacements` (image.prompt.ts)

### T4: `src/app` + pipes + assessor + test e2e

| File | Issues |
|---|---|
| `src/app.module.ts` | 2 (1 err, 1 warn) |
| `src/common/pipes/image-validation.pipe.ts` | 2 errors |
| `src/v1/assessor/assessor.controller.ts` | 2 errors |
| `src/v1/assessor/assessor.service.ts` | 1 error |
| `test/auth.e2e-spec.ts` | 2 errors |
| `test/main.e2e-spec.ts` | 2 errors |

**Rules**: `consistent-function-scoping` (app.module.ts:75), `prefer-string-slice` (image-validation.pipe.ts:109,117), `prefer-uint8array-base64` (image-validation.pipe.ts:130), `no-non-function-verb-prefix` (assessor.controller.ts:12,70), `try-complexity` (assessor.service.ts:39), `prefer-error-is-error` (assessor.service.ts:60), `prefer-module` + `import-style` + `prefer-node-protocol` (auth.e2e-spec.ts, main.e2e-spec.ts)

---

## Sub-agent Task Template

Each sub-agent receives instructions like the following:

```
Fix all ESLint violations in [FILE_PATH(S)].

Remaining violations after auto-fix:
- [Rule] (error/warn): [description at line N]

Fix approach:
- For @typescript-eslint/no-unsafe-*: add `as jest.Mock` assertions or
  generic params like `jest.fn<() => ReturnType>()`
- For unicorn rules: apply the preferred modern pattern
- For no-console: use the NestJS Logger from @nestjs/common

Context:
- British English spellings throughout
- Do not add unnecessary comments
- Follow existing code conventions

Acceptance criteria:
1. No ESLint violations remaining in the file(s)
2. No new violations introduced elsewhere
3. Tests pass: run `npm run test` (or `npm run test:e2e` as relevant)
```

---

## Verification

After all sub-agents complete:

```bash
npm run lint        # Should be clean — zero errors, zero warnings
npm run test        # All unit/integration tests pass
npm run test:e2e    # All E2E tests pass
```

---

## Summary

| Step | Sub-agents | Scope |
|---|---|---|
| Step 0: Auto-fix | 1 (trivial command) | 224 issues globally |
| Step 1: Complex | 40 | One file per agent, 10+ issues each |
| Step 2: Medium | 6 | Grouped by module, 3-9 issues per file |
| Step 3: Trivial | 4 | Grouped by module, 1-2 issues per file |
| **Total** | **~51** | **71 files, ~2359 remaining issues** |

All sub-agents run in parallel on a single branch. Merge and verify after all complete.
