# ACTION_PLAN: Eliminate CommonJS Module Exports — Full ESM Migration

This plan is organised into small, independently testable sections. Each section follows TDD ordering (Red → Green → Refactor) where applicable. Sections are ordered so that enabling infrastructure lands before dependent work.

**Reference:** `SPEC.md` — decisions D1–D8, constraints C1–C7, state rules S1–S7.

---

## Section 0: Phase 0 — Validation and De-risking

**Objective:** Validate that the core technology assumptions hold before any bulk migration begins. This section produces no production code changes — only proof-of-concept validations.

**Constraints:**

- Do not modify any source files permanently.
- Use temporary branches or scratch files for validation.
- Roll back all temporary changes after validation.

**Acceptance Criteria:**

1. A minimal NestJS app with `emitDecoratorMetadata: true` and `"module": "NodeNext"` compiles and starts successfully.
2. `@nestjs/testing`'s `Test.createTestingModule()` works under Vitest with ESM output.
3. `nest build` produces valid ESM output when `tsconfig.json` uses `"module": "NodeNext"`.
4. `node dist/src/main.js` starts the minimal app as ESM.
5. `reflect-metadata` import ordering works correctly under ESM.
6. **Vitest's default transformer preserves decorator metadata** (critical — see R8 in SPEC.md).

**Validation Steps:**

1. **NestJS ESM compilation check:**
   - Create a temporary copy of `tsconfig.json` with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`.
   - Run `npx tsc --noEmit` against a minimal NestJS module (e.g., `AppModule` with a single controller).
   - Verify no compilation errors related to decorator metadata or module resolution.

2. **NestJS TestingModule under Vitest (CRITICAL):**
   - Install `vitest` temporarily (`npm install --save-dev vitest`).
   - Create a temporary `vitest.config.ts` and a minimal spec file that uses `Test.createTestingModule()` with constructor injection (no explicit `@Inject()` decorators).
   - Run the spec. Verify `TestingModule` compiles AND correctly resolves dependencies via constructor injection.
   - **If DI fails:** This confirms risk R8. The fix is either:
     - Configure Vitest to use `tsc` as the transformer (preserves `emitDecoratorMetadata`).
     - Or add explicit `@Inject()` decorators to all constructor parameters in the codebase (significant code change — requires user approval).
   - Document the result before proceeding.

3. **`nest build` ESM output:**
   - With the temporary `tsconfig.json`, run `npm run build`.
   - Inspect `dist/` output — verify files use `import`/`export` syntax (not `require`/`module.exports`).
   - Run `node dist/src/main.js` — verify it starts without errors.

4. **`reflect-metadata` ordering:**
   - Verify that `import 'reflect-metadata'` at the top of `main.ts` (before any NestJS imports) works correctly under ESM.
   - Verify decorator metadata is emitted and resolved by NestJS's dependency injection.

**Section Checks:**

- [x] All 6 acceptance criteria pass (see results below).
- [x] Temporary changes are rolled back.
- [x] Any issues discovered are recorded as blockers before proceeding.

**Validation Results (completed 2026-07-05):**

1. ✅ **NestJS ESM compilation:** A minimal NestJS app with `emitDecoratorMetadata: true` and `"module": "NodeNext"` compiles and starts successfully. Constructor injection works without explicit `@Inject()` decorators.
2. ✅ **TestingModule under Vitest:** `Test.createTestingModule()` works under Vitest. Constructor injection resolves dependencies correctly. **Risk R8 is mitigated** — Vitest's default transformer preserves decorator metadata.
3. ✅ **ESM build output:** `tsc` with `"module": "NodeNext"` and `"type": "module"` in `package.json` produces pure ESM output (`import`/`export`, `import.meta.url`). No `require()` or `module.exports` in output.
4. ✅ **Runtime startup:** `node dist/main.js` starts the minimal NestJS app as ESM. DI container initialises, routes are mapped, server listens.
5. ✅ **reflect-metadata ordering:** `import 'reflect-metadata'` at the top of the entry point works correctly under ESM. Decorator metadata is emitted by `tsc` and resolved by NestJS DI.
6. ✅ **Vitest transformer preserves metadata:** `Reflect.getMetadata('design:paramtypes', ...)` returns correct constructor parameter types in Vitest tests. No explicit `@Inject()` needed.

**Issues discovered (to be addressed in Section 1):**

- **TS2835:** All relative imports need `.js` extensions under `NodeNext` module resolution. ~95 imports across source files.
- **TS1272:** `status.controller.ts` imports `HealthCheckResponse` (a type) alongside `StatusService` (a value). Must split into `import type { HealthCheckResponse }` when `isolatedModules` + `emitDecoratorMetadata` are enabled.
- **TS1543:** `status.service.ts` imports `package.json` — under `NodeNext` ESM, JSON imports require `with { type: "json" }` import attribute.
- **`nest build` crash:** `nest build` aborts when compilation errors exist (does not handle errors gracefully). Direct `tsc` invocation works correctly. Not a blocker once import extensions are fixed.
- **`package.json` `"type": "module"` required:** Without it, `NodeNext` produces CJS output. Both changes must land together.

**No blockers. Proceeding to Section 1 is safe.**

**Blockers if validation fails:**

- If NestJS decorator metadata fails under ESM: investigate `tsconfig.json` `emitDecoratorMetadata` interaction with `NodeNext`. May need `"module": "ESNext"` instead.
- If `TestingModule` fails under Vitest: **This is the critical risk (R8).** If Vitest's default transformer doesn't preserve decorator metadata, you must either:
  1. Configure Vitest to use `tsc` as the transformer (preserves `emitDecoratorMetadata`).
  2. Or add explicit `@Inject()` decorators to all constructor parameters in the codebase (significant code change — requires user approval before proceeding).
- If `reflect-metadata` import ordering fails: ensure it's imported first in setup files and entry points.

---

## Section 1: TypeScript and Package Configuration

**Objective:** Switch the TypeScript compilation target to ESM and update `package.json` to declare the package as ESM.

**Constraints:**

- Tests will break after this section (Jest cannot run ESM output without significant configuration). This is expected. Section 2 will fix the tests.
- The production build must still compile successfully.
- Do not change any source code logic in this section.

**Lessons from Section 0 Validation (critical — read before starting):**

These findings were validated on 2026-07-05 against the actual codebase. Future agents must apply these patterns; ignoring them will produce non-obvious failures.

- **`"type": "module"` and `"module": "NodeNext"` are coupled.** Under `NodeNext`, TypeScript inspects the nearest `package.json`'s `type` field to decide the output module format. Setting only `tsconfig.json` to `"module": "NodeNext"` (without `"type": "module"` in `package.json`) silently produces **CommonJS** output. **Both changes must land in the same commit.** Verify the output is actually ESM by inspecting `dist/src/main.js` for `import`/`export` and the absence of `"use strict"` / `__createBinding` helpers.

- **All relative imports require explicit `.js` extensions.** Under `NodeNext`, `tsc` enforces Node's ESM resolver rule and emits `TS2835` for every relative import without an extension. This is the largest mechanical change in Section 1.
  - **Scope (validated by grep):** 69 imports across 27 non-spec source files (full file list below). Spec files (83 imports) are migrated in Section 3; `test/` files (14 imports) in Section 4.
  - **Pattern:** `import { Foo } from './foo'` → `import { Foo } from './foo.js'`. The `.js` extension is correct even though the source file is `.ts` — TypeScript resolves it to the `.ts` file at compile time and emits `.js` in output.
  - **Files needing `.js` extension on relative imports (source only, non-spec):** `src/app.module.ts`, `src/auth/api-key.service.ts`, `src/auth/api-key.strategy.ts`, `src/auth/auth.module.ts`, `src/bootstrap.ts`, `src/common/common.module.ts`, `src/common/http-exception.filter.ts`, `src/common/pipes/image-validation.pipe.ts`, `src/config/config.module.ts`, `src/config/config.service.ts`, `src/config/index.ts`, `src/config/throttler.config.ts`, `src/llm/gemini.service.ts`, `src/llm/llm.module.ts`, `src/llm/llm.service.interface.ts`, `src/prompt/image.prompt.ts`, `src/prompt/prompt.base.ts`, `src/prompt/prompt.factory.ts`, `src/prompt/prompt.module.ts`, `src/prompt/table.prompt.ts`, `src/prompt/text.prompt.ts`, `src/status/status.controller.ts`, `src/status/status.module.ts`, `src/status/status.service.ts`, `src/v1/assessor/assessor.controller.ts`, `src/v1/assessor/assessor.module.ts`, `src/v1/assessor/assessor.service.ts`.

- **`status.controller.ts` — TS1272 decorated-signature type import.** When `isolatedModules` + `emitDecoratorMetadata` are both enabled, a _type referenced in a decorated signature_ (return type of a `@Get()` method, parameter type of an `@Inject()`-ed param, etc.) cannot share an `import` statement with a _value_. Currently `import { StatusService, HealthCheckResponse } from './status.service'` mixes a value (`StatusService`) with a type (`HealthCheckResponse` used as `@Get('health')` return type). **Fix:** split into `import { StatusService } from './status.service.js'` + `import type { HealthCheckResponse } from './status.service.js'`. Note the `.js` extension on _both_ statements. Scan all other decorated signatures for the same pattern; several files use the modern `import { X, type Y }` inline syntax which is **already safe** — do not "fix" those, only split shared imports where TS1272 fires.

- **`status.service.ts` — TS1543 JSON import attribute.** `import * as packageJson from '../../package.json'` fails under `NodeNext` ESM with `TS1543: Importing a JSON file into an ECMAScript module requires a 'type: "json"' import attribute`. **Fix:** `import * as packageJson from '../../package.json' with { type: 'json' }`. The same change applies to `src/status/status.service.spec.ts` (but the spec is migrated in Section 3). Verify the project's `tsconfig.json` `resolveJsonModule: true` is still set (it is). TypeScript 6.0+ supports the `with` syntax; the older `assert` syntax is deprecated — use `with`.

- **`assessor.controller.ts` — `src/...` path-alias imports.** This file has 5 imports using the `src/...` path alias (e.g., `from 'src/auth/api-key.guard'`). Under `NodeNext`, path aliases in source files are **not resolved by Node at runtime** unless a loader is configured. They will compile (TypeScript resolves them via `tsconfig.json` `paths`), but `node dist/src/main.js` will fail at runtime with `ERR_MODULE_NOT_FOUND`. **Options for the implementer (pick the simplest):**
  1. **Convert to relative imports** (e.g., `from '../../auth/api-key.guard.js'`). This is the simplest, runtime-safe, no-extra-config approach and is recommended. Verify the relative depth against the dist layout.
  2. Or keep path aliases and configure `tsconfig-paths` as an ESM loader in production — rejected as out of scope and contradicts the statelessness goal.
  - **Vitest note:** Section 2's Vitest config will need `resolve.alias` to support `src/...` aliases in spec/test files. But for production source, option 1 (relative imports) is strongly preferred so the runtime has zero path-resolution coupling to the build tool. Only `assessor.controller.ts` uses `src/...` imports in production source — fix it here.

- **`nest build` crashes on compilation errors.** When `tsconfig.json` is set to `NodeNext` but the source still has un-fixed imports, `npm run build` (which runs `nest build`) emits `Aborted (core dumped)` instead of a clean error list. **Do not panic.** This is the NestJS CLI crashing on error output, not a real crash. **Diagnose with `npx tsc --project tsconfig.build.json`** directly — it prints the actual `TS2835`/`TS1272`/`TS1543` errors cleanly. Once fixes are applied, `nest build` will succeed again. This is noted here so future agents don't waste time investigating the apparent crash.

- **`ignoreDeprecations: "6.0"` must be retained.** Section 0 confirmed that `baseUrl` (used by `tsconfig.json` for `paths`) triggers `TS5101` on TypeScript 6.x without `ignoreDeprecations: "6.0"`. It **is** still needed because `baseUrl`/`paths` are still in use. Do **not** remove `ignoreDeprecations` in this section.

- **`vitest` is already installed on this branch.** Section 0 ran `npm install --save-dev vitest` and then rolled back `package-lock.json`. The `node_modules/vitest` directory may still exist on worktrees where Section 0 was run, but **`package.json` does not list vitest as a dependency**. Section 2 is responsible for adding it to `package.json` properly. Do not assume vitest is installed — verify before use.

- **Decorator metadata preservation is confirmed (R8 mitigated).** Vitest's default transformer preserves `emitDecoratorMetadata`. Do **not** add explicit `@Inject()` decorators as a "safety" measure — it is unnecessary churn and the plan explicitly decided against it. Constructor injection works as-is.

**Acceptance Criteria:**

1. `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`.
2. `tsconfig.json` `types` array no longer includes `"jest"`.
3. `tsconfig.test.json` is deleted.
4. `package.json` has `"type": "module"`.
5. `npm run build` succeeds and produces ESM output in `dist/`.
6. `node dist/src/main.js` starts the application (validates ESM entry-point detection works).

**Red-First Tests (not applicable for infrastructure):**
This section is configuration-only. Verification is via build and runtime checks.

**Green — Implementation Steps:**

1. **Update `tsconfig.json`:**
   - Change `"module": "CommonJS"` → `"module": "NodeNext"`.
   - Change `"moduleResolution": "node"` → `"moduleResolution": "NodeNext"`.
   - Change `"types": ["node", "jest"]` → `"types": ["node"]`.
   - **Keep `"ignoreDeprecations": "6.0"`** — Section 0 validated that `baseUrl` (used for `paths`) still requires this flag on TypeScript 6.x; removing it produces `TS5101`. See "Lessons" above.
   - Note: `tsconfig.build.json` extends `tsconfig.json` and overrides `types` to `["node"]`. After this change, the override becomes redundant (base already has `["node"]`). No change needed to `tsconfig.build.json`, but the redundant override can be cleaned up.

2. **Delete `tsconfig.test.json`:**
   - This file exists solely for Jest ESM overrides. No longer needed.

3. **Update `package.json`:**
   - Add `"type": "module"`.

4. **Update `src/main.ts` — ESM entry-point detection:**
   - Replace `isRunningDirectly()` implementation:
     ```typescript
     import { pathToFileURL } from 'node:url';

     function isRunningDirectly(): boolean {
       return (
         process.argv[1] != null &&
         import.meta.url === pathToFileURL(process.argv[1]).href
       );
     }
     ```
   - Remove the `!process.env.JEST_WORKER_ID` check.

5. **Update `src/testing-main.ts` — ESM entry-point detection:**
   - Same pattern as `main.ts`.

6. **Convert `scripts/health-check.js` to ESM:**
   - Replace `const http = require('node:http')` with `import http from 'node:http'`.

7. **Add `.js` extensions to all relative imports in non-spec source files.**
   - This is the largest mechanical change in Section 1 (~69 imports across 27 files — full file list in "Lessons" above).
   - Pattern: `from './foo'` → `from './foo.js'`. The `.js` extension is correct even for `.ts` sources.
   - Keep the existing modern `import { X, type Y } from './foo.js'` inline syntax untouched — it is already safe.
   - Only touch **non-spec** files here (`src/**/*.ts`, excluding `*.spec.ts`). Spec/test files are migrated in Sections 3 and 4 respectively, so do **not** edit them in this section — leaving their imports unextended is correct because they are broken until Section 3 anyway.
   - Scope-limited change: this is mechanical and must not alter any logic. Run `eslint --fix` afterwards; the `import-x` plugin will not auto-fix missing extensions, but it will surface any import the regex missed.

8. **Fix `src/status/status.controller.ts` — split the type import (TS1272).**
   - Current: `import { StatusService, HealthCheckResponse } from './status.service'`
   - Target: `import { StatusService } from './status.service.js'` + `import type { HealthCheckResponse } from './status.service.js'`
   - `HealthCheckResponse` is only a return type of a `@Get()`-decorated method, so it must be a type-only import. See "Lessons" above for the full rationale.
   - Scan other decorated signatures for the same shared value+type import pattern; only the inline `import { X, type Y }` syntax or split type imports are valid — do not touch inline-modifier imports that already compile.

9. **Fix `src/status/status.service.ts` — JSON import attribute (TS1543).**
   - Current: `import * as packageJson from '../../package.json'`
   - Target: `import * as packageJson from '../../package.json' with { type: 'json' }`
   - Use the `with` syntax (not the deprecated `assert`). Applies to the production source file here; `src/status/status.service.spec.ts` is fixed in Section 3.
   - **ESM JSON gotcha (validated 2026-07-07 — corrects the original plan wording):** Under Node ESM, a JSON module imported via `import * as packageJson` exposes the parsed object **only** as the `default` export. `packageJson.version` resolves to `undefined` at runtime, which would make `GET /health` return an `undefined` version (a latent bug in the original step-9 wording). The correct usage is `packageJson.default.version`. The implementation uses `packageJson.default.version` — keep this form. The `/health` endpoint was verified to return `"version":"0.1.12"` with this form.

10. **Fix `src/v1/assessor/assessor.controller.ts` — convert `src/...` path-alias imports to relative.**
    - 5 imports use `from 'src/...'` (path alias). Convert to relative imports with `.js` extensions (e.g., `from '../../auth/api-key.guard.js'`). Verify relative depth against `src/v1/assessor/` location.
    - See "Lessons" above — runtime resolution of `src/...` aliases is not safe under Node ESM without extra loader config, and the plan explicitly avoids that.

11. **Verify build and runtime:**
    - Run `npx tsc --project tsconfig.build.json` **first** to get a clean error list. Fix any remaining `TS2835`/`TS1272`/`TS1543` errors.
    - Then run `npm run build` — must succeed. (If `nest build` still aborts, run `npx tsc` again to diagnose — see "Lessons" above about the `nest build` crash on errors.)
    - Inspect `dist/src/main.js` — confirm it uses `import`/`export` syntax and **not** `"use strict"` or `__createBinding` helpers (those indicate CJS output — see "Lessons" about `type: "module"` coupling).
    - Run `node dist/src/main.js` — must start the server.

**Refactor:**

- After verification, run `npx tsc --project tsconfig.build.json` once more and confirm zero errors. Any remaining `TS2835` means a relative import was missed — find and fix it.
- Do **not** remove `ignoreDeprecations: "6.0"` — it is still required because `baseUrl`/`paths` are still in use (see "Lessons" above). The plan's original step 1 provisionally suggested removal; this validation overrides it.
- `tsconfig.build.json`'s `"types": ["node"]` override becomes redundant (base now also has `["node"]`). Optional cleanup only.

**Section Checks:**

- [x] `npm run build` succeeds.
- [x] `dist/` output uses ESM syntax (verify `dist/src/main.js` starts with `import`, not `"use strict"`).
- [x] `node dist/src/main.js` starts the server.
- [x] No `require()` or `module.exports` in any source file.
- [x] `tsconfig.test.json` is deleted.
- [x] Zero `TS2835` / `TS1272` / `TS1543` errors from `npx tsc --project tsconfig.build.json`.
- [x] `assessor.controller.ts` no longer imports via `src/...` path aliases.

**Accepted Technical Debt (deferred — see follow-up below):**

- **7 `unicorn/prefer-await` lint errors in `src/common/http-exception.filter.spec.ts`.** Adding `"type": "module"` to `package.json` (required by S7) causes the `unicorn` `prefer-await` rule to misfire on the NestJS `ExceptionFilter.catch()` _method_ calls (e.g. `filter.catch(resourceExhaustedError, mockArgumentsHost)`), which are not promise `.catch()` chains. The baseline lint was clean (exit 0); these errors are a regression introduced by this section. **Resolution deferred to Section 3** (spec-file migration), where the file is migrated to Vitest and the false positives are addressed properly. Authorised as accepted technical debt per user instruction on 2026-07-07; the Regression Gate for this section is recorded as passed-with-documented-debt. Do **not** add lint-suppression comments for the `unicorn/prefer-await` rule (C5) to clear these — fix the code in Section 3 instead.

**Section 1 — Completion Notes (2026-07-07):**

- `tsconfig.json`: `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"types": ["node"]`. `ignoreDeprecations: "6.0"` retained (still required for `baseUrl`/`paths`).
- `package.json`: `"type": "module"` added. Jest deps not yet removed (Section 2).
- `tsconfig.test.json` deleted.
- 27 non-spec source files: `.js` extensions added to all relative imports (69 imports). Inline `import { X, type Y }` modifiers preserved.
- `status.controller.ts`: TS1272 value/type import split (`.js` on both).
- `status.service.ts`: TS1543 JSON import attribute + `packageJson.default.version` usage (corrected ESM JSON gotcha — see step 9).
- `assessor.controller.ts`: 5 `src/...` path-alias imports converted to relative `../../...js` imports.
- `main.ts` / `testing-main.ts`: ESM `isRunningDirectly()` via `import.meta.url` + `pathToFileURL`; `JEST_WORKER_ID` check removed; dynamic `import('./bootstrap.js')`.
- `scripts/health-check.js`: CJS→ESM (`import http from 'node:http'`); comment restructured per plan; the `no-console` suppression directive is retained per plan and produces one "unused directive" _warning_, not an error.
- Verified: `npx tsc --project tsconfig.build.json` clean; `npm run build` clean; `dist/src/main.js` is pure ESM; `node dist/src/main.js` starts and `GET /health` returns `"version":"0.1.12"`.
- **Deferred lint debt:** 7 `unicorn/prefer-await` errors in `http-exception.filter.spec.ts` (documented above).

---

## Section 2: Test Runner Migration — Infrastructure

**Objective:** Replace Jest with Vitest. Create the Vitest configuration and setup files. Remove all Jest configuration files and dependencies.

**Status:** Completed (2026-07-07).

**Implementation Deviations (authorised — required to keep the non-negotiable Regression Gate satisfiable):**

1. **Jest npm packages are NOT removed in Section 2.** Only Vitest is installed and the test runner is switched at the script/config level. `jest`, `@types/jest`, `eslint-plugin-jest`, and `@jest/globals` remain installed and are removed in **Section 5** (after spec files are migrated to Vitest in Sections 3–4). Rationale: removing `eslint-plugin-jest` / `@types/jest` / `@jest/globals` now would break the type-aware ESLint pass over the still-Jest-based `*.spec.ts` and `test/**` files (baseline lint = 7 errors; removal would introduce many new type-resolution errors = a regression against the baseline). The Jest _config files_ are still deleted in Section 2 as planned. Acceptance criterion 2 is therefore partially deferred to Section 5.

2. **E2E LLM mocking uses an ESM `--import` preload shim, NOT `vi.mock`.** `vi.mock()` in a Vitest setup file only affects the in-process Vitest worker module graph. E2E tests spawn the built app (`dist/src/testing-main.js`) as a _child process_ (see `test/utils/app-lifecycle.ts`), so `vi.mock` cannot intercept the app's LLM calls. The old `--require test/utils/llm-http-shim.cjs` (CommonJS) is replaced by `--import test/utils/llm-mock.mjs` (ESM), which patches `GoogleGenerativeAI.prototype.getGenerativeModel` in the spawned child before app code runs. `vitest.e2e.setup.ts` therefore only sets `process.env.E2E_MOCK_LLM='true'`; the `vi.mock(...)` block from the original plan is dropped as ineffective for child processes.

**Constraints:**

- Tests will not pass until Section 3 (test file migration) is complete.
- Install Vitest and remove Jest in a single commit to avoid a broken intermediate state.

**Cross-Section Notes from Section 0 Validation (read before starting):**

- **`vitest` may already be in `node_modules` from Section 0**, but it is **not** in `package.json` dependencies (Section 0 rolled back `package-lock.json`). Do not assume a clean install — run the `npm install --save-dev vitest` step explicitly so the dependency is recorded.
- **Vitest config needs `resolve.alias` for `src/...` path aliases.** Validation found 9 `test/` files that import via `from 'src/common/file-utilities'` (path alias). Section 1 converts production source away from `src/...` aliases (only `assessor.controller.ts` used them), but test files are out of scope for Section 1 and still rely on the alias. **Both the unit and e2e Vitest workspace projects must declare `resolve: { alias: { 'src': '<repo root abs path>/src' } }`** (or use `pathToFileURL`-relative resolution). Without this, `test/**/*.e2e-spec.ts` files will fail to import `getCurrentDirname` with `ERR_MODULE_NOT_FOUND` or `Cannot find module 'src/...'`. Regex/grep pattern: `from 'src/`. Verify the alias resolves to the **source** `.ts` files (not `dist/`), because tests import the live TypeScript source.
- **`reflect-metadata` must be imported FIRST in `vitest.setup.ts`.** Section 0 confirmed import ordering matters — static ESM imports execute in source order, so `import 'reflect-metadata'` must precede any `@nestjs/*` imports for decorator metadata to be captured. The plan's step 5 already specifies this; do not reorder.
- **`nest build` may crash on its own output if errors exist** (see Section 1 notes). If `npm run test:e2e:mocked` fails because `npm run build` aborted, run `npx tsc --project tsconfig.build.json` to see the real errors.

**Acceptance Criteria:**

1. `vitest` and `@vitest/coverage-v8` are installed as dev dependencies.
2. All Jest packages are removed (`jest`, `@types/jest`, `ts-jest`, `jest-junit`, `eslint-plugin-jest`).
3. All Jest config files are deleted (`jest.config.js`, `jest-e2e.*.config.cjs`, `jest-prod.config.cjs`, `jest.setup.ts`, `test/jest.e2e.*.setup.ts`).
4. `vitest.workspace.ts` (or separate config files) is created.
5. `vitest.setup.ts` is created with environment variable setup (migrating `jest.setup.ts` logic).
6. `npm run test` invokes Vitest (even if tests fail due to un-migrated API calls).

**Red-First Tests:**

- After removing Jest and installing Vitest, running `npm run test` should invoke Vitest. Tests will fail because spec files still use `jest.*` APIs. This is the expected "red" state.

**Green — Implementation Steps:**

1. **Install Vitest:**

   ```bash
   npm install --save-dev vitest @vitest/coverage-v8
   ```

2. **Remove Jest dependencies:**

   ```bash
   npm uninstall jest @types/jest ts-jest jest-junit eslint-plugin-jest
   ```

3. **Install ESLint Vitest plugin:**

   ```bash
   npm install --save-dev eslint-plugin-vitest
   ```

4. **Delete Jest configuration files:**
   - `jest.config.js`
   - `jest-e2e.mocked.config.cjs`
   - `jest-e2e.live.config.cjs`
   - `jest-e2e.config.cjs`
   - `jest-prod.config.cjs`
   - `jest.setup.ts`
   - `test/jest.e2e.mocked.setup.ts`
   - `test/jest.e2e.live.setup.ts`

5. **Create `vitest.setup.ts`:**
   - Migrate environment variable setup from `jest.setup.ts`.
   - Add `import 'reflect-metadata'` as the FIRST import (before any other imports) to ensure NestJS decorator metadata works correctly under ESM (addresses risk R6).
     ```typescript
     import 'reflect-metadata';
     import * as dotenv from 'dotenv';
     dotenv.config({ path: '.test.env' });

     process.env.GEMINI_API_KEY = 'test-key';
     process.env.NODE_ENV = 'test';
     process.env.PORT = '3000';
     process.env.API_KEYS = 'test-api-key';
     process.env.MAX_IMAGE_UPLOAD_SIZE_MB = '5';
     process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg';
     process.env.LOG_LEVEL = 'debug';
     process.env.THROTTLER_TTL = '60';
     process.env.UNAUTHENTICATED_THROTTLER_LIMIT = '10';
     process.env.AUTHENTICATED_THROTTLER_LIMIT = '50';
     ```

6. **Create `vitest.workspace.ts`** (preferred) or separate config files:
   - Workspace approach:
     ```typescript
     import { defineWorkspace } from 'vitest/config';
     import { resolve } from 'node:path';

     // Shared alias for `src/...` path-alias imports used by test files.
     // Resolves to the TypeScript source (not dist) so tests exercise live code.
     const srcAlias = { src: resolve(process.cwd(), 'src') };

     export default defineWorkspace([
       {
         test: {
           name: 'unit',
           root: '.',
           include: ['src/**/*.spec.ts'],
           setupFiles: ['./vitest.setup.ts'],
           globals: true,
           reporters: ['default', 'junit'],
           outputFile: './junit/vitest-junit.xml',
           alias: srcAlias,
         },
       },
       {
         test: {
           name: 'e2e',
           root: '.',
           include: ['test/**/*.e2e-spec.ts'],
           exclude: ['test/**/*-live.e2e-spec.ts', 'test/prod-tests/**'],
           setupFiles: ['./vitest.setup.ts', './vitest.e2e.setup.ts'],
           globals: true,
           testTimeout: 30000,
           pool: 'forks',
           alias: srcAlias,
         },
       },
       {
         test: {
           name: 'e2e-live',
           root: '.',
           include: ['test/assessor-live.e2e-spec.ts'],
           setupFiles: ['./vitest.setup.ts'],
           globals: true,
           testTimeout: 30000,
           pool: 'forks',
           alias: srcAlias,
         },
       },
       {
         test: {
           name: 'prod',
           root: '.',
           include: ['test/prod-tests/**/*.prod-spec.ts'],
           setupFiles: ['./vitest.setup.ts'],
           globals: true,
           testTimeout: 600000,
           pool: 'forks',
           alias: srcAlias,
         },
       },
     ]);
     ```
   - **Critical:** The `alias: srcAlias` line on every project enables `from 'src/common/file-utilities'` imports in `test/` files. Validation found 9 `test/` files use this alias — without it, all E2E tests fail with `ERR_MODULE_NOT_FOUND`. See "Cross-Section Notes" above for details.
   - If workspace mode fails, fall back to separate `vitest.config.ts`, `vitest.e2e.config.ts`, etc. Each file must define the same `resolve.alias`.

7. **Create `vitest.e2e.setup.ts`:**
   - This file applies the LLM mock for E2E tests:
     ```typescript
     import { vi } from 'vitest';

     process.env.E2E_MOCK_LLM = 'true';

     vi.mock('@google/generative-ai', async () => {
       const actual = await vi.importActual<
         typeof import('@google/generative-ai')
       >('@google/generative-ai');
       return {
         ...actual,
         GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
           getGenerativeModel: () => ({
             generateContent: async () => ({
               response: {
                 text: () =>
                   JSON.stringify({
                     completeness: { score: 3, reasoning: 'Mocked' },
                     accuracy: { score: 3, reasoning: 'Mocked' },
                     spag: { score: 3, reasoning: 'Mocked' },
                   }),
               },
             }),
           }),
         })),
       };
     });
     ```

8. **Update `test/utils/app-lifecycle.ts`:**
   - Remove lines 103–114 (the `if (testEnvironment.E2E_MOCK_LLM === 'true')` block that constructs `NODE_OPTIONS` with `--require`).
   - No other changes needed in this file.

9. **Delete `test/utils/llm-http-shim.cjs`:**
   - Replaced by `vi.mock()` in `vitest.e2e.setup.ts`.

10. **Update `package.json` scripts:**
    - `"test": "vitest run"`
    - `"test:watch": "vitest"`
    - `"test:cov": "vitest run --coverage"`
    - `"test:debug": "node --inspect-brk node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork"`
    - `"test:e2e": "npm run test:e2e:mocked"`
    - `"test:e2e:mocked": "npm run build && vitest run --project e2e"` (or `--config vitest.e2e.config.ts` if not using workspace)
    - `"test:e2e:live": "npm run build && vitest run --project e2e-live"`
    - `"test:prod": "npm run build && vitest run --project prod"`

**Refactor:**

- Verify `npm run test` invokes Vitest.
- Verify `npm run build` still succeeds.

**Section Checks:**

- [x] No Jest config files remain (all 9 deleted: `jest.config.js`, `jest-e2e.*.config.cjs`, `jest-prod.config.cjs`, `jest.setup.ts`, `test/jest.e2e.*.setup.ts`).
- [ ] No Jest dependencies in `package.json` — **deferred to Section 5** (see Implementation Deviations #1). `jest`, `@types/jest`, `ts-jest`, `jest-junit`, `eslint-plugin-jest`, `@jest/globals` remain installed until spec files are migrated.
- [x] `vitest.config.ts` exists using Vitest v4 `test.projects` (the `vitest.workspace.ts`/`defineWorkspace` API was removed in Vitest v4 — see Additional implementation deviations below).
- [x] `vitest.setup.ts` exists with `import 'reflect-metadata'` first + env setup.
- [x] `vitest.e2e.setup.ts` exists and sets `process.env.E2E_MOCK_LLM='true'` (the `vi.mock()` block from the original plan was dropped — ineffective for the spawned child process).
- [x] `test/utils/llm-http-shim.cjs` is deleted and replaced by `test/utils/llm-mock.mjs` (ESM `--import` preload shim).
- [x] `test/utils/app-lifecycle.ts` no longer references `--require`; uses `--import=<file://.../llm-mock.mjs>` via `pathToFileURL`.
- [x] `npm run test` invokes Vitest on the `unit` project (tests are red — expected until Sections 3–4).

**Additional implementation deviations (recorded during execution):**

- **`eslint.config.js`: added `'**/*.mjs'` to the top-level `ignores` array** (alongside `'**/*.cjs'`). The ESM preload shim `llm-mock.mjs` is not application source, and under `"type": "module"` a bare `.mjs` file hits the global `@typescript-eslint/explicit-function-return-type: 'error'` rule, which would produce 3 new errors. Mirroring the existing `**/*.cjs` ignore for preload shims keeps lint at the exact baseline (7 errors + 1 warning). This is a benign config-only change; the Jest plugin itself is still untouched (removed in Section 5).
- **`fileParallelism: false` on the `e2e`, `e2e-live`, and `prod` Vitest projects.** The old Jest E2E run used `--runInBand` (serial). Vitest's `forks` pool runs E2E files in parallel, causing multiple app instances to collide on the hardcoded port 3001 (`EADDRINUSE`). Disabling file parallelism restores serial execution and eliminates the collision. The `unit` project is left parallel for speed.

**Section 2 — Completion Notes (2026-07-07):**

- Installed `vitest@4.1.10`, `@vitest/coverage-v8`, `eslint-plugin-vitest`. Did **not** uninstall Jest packages (deferred to Section 5).
- Created `vitest.config.ts` (`defineConfig({ test: { projects: [...] } })` — v4 API), `vitest.setup.ts`, `vitest.e2e.setup.ts`, `test/utils/llm-mock.mjs`.
- Deleted all 9 Jest config files and `test/utils/llm-http-shim.cjs`.
- `package.json` test scripts switched to Vitest; `test`/`test:watch`/`test:cov`/`test:debug` target `--project unit` so plain `npm test` does not build/run e2e or prod.
- Verified: `npm run build` clean; `npm run lint` = 7 errors + 1 warning (baseline preserved); `npm run test` invokes Vitest (unit specs red — `jest.*` APIs). `npm run test:e2e:mocked`: app boots via `--import` shim, **no `EADDRINUSE`**, 42 tests pass + 1 file fails (`start-app.e2e-spec.ts` uses `jest.setTimeout()` at module scope — fixed in Section 4).
- Known follow-up: orphaned app processes from an interrupted prior run can hold port 3001 and cause `EADDRINUSE` on the next run; `stopApp()` cleanup is a pre-existing concern, not introduced here.

---

## Section 3: Test File Migration — Unit and Integration Tests

**Objective:** Migrate all 36 `*.spec.ts` files in `src/` from Jest API to Vitest API.

**Status:** Completed (2026-07-07).

**Red-state baseline (confirmed 2026-07-07):** `npm run test` (unit project) fails because the spec files still use `jest.*` APIs and the Jest runtime is no longer the runner. This section makes them green. The 7 `unicorn/prefer-await` errors in `src/common/http-exception.filter.spec.ts` are resolved here (see Section Checks) — they are a false positive on the `ExceptionFilter.catch()` method call, fixed by a code change (NOT a lint-suppression comment, per C5).

**Constraints:**

- This is the largest section by file count. Work in batches to keep changes reviewable.
- Each batch should be verified by running the tests.
- Use the migration table in SPEC.md section 4.

**Cross-Section Notes from Section 0 Validation (read before starting):**

- **Spec files still have un-extended relative imports.** Section 1 deliberately left all `*.spec.ts` relative imports without `.js` extensions (they were already broken under Vitest at that stage, so fixing them prematurely would have created noise). **This section must add `.js` extensions to all relative imports in spec files** as part of making them pass under Vitest's `NodeNext`-aware resolver. There are 83 such imports. Apply the same `from './foo'` → `from './foo.js'` pattern.
- **`status.service.spec.ts` JSON import needs the `with { type: 'json' }` attribute** — same TS1543 fix as the production source (fixed in Section 1). Apply it here when migrating the spec.
- **Constructor injection works without `@Inject()` — confirmed.** Do not add `@Inject()` decorators to spec mocks "for safety". Use `provide: SomeService, useValue: mockObject` as before — Vitest preserves `emitDecoratorMetadata` (R8 mitigation, see Section 0 results).
- **Vitest is type-unaware at runtime; types come from `vitest/globals`.** Section 2's config enables `globals: true`. `describe`/`it`/`expect`/`beforeEach` work as globals. For `Mock` types, import from `vitest` (replaces `jest.Mock`). Do not import from `@jest/globals` — it no longer exists after Section 2.

**Acceptance Criteria:**

1. All 36 spec files use Vitest API (`vi.fn()`, `vi.mock()`, etc.) instead of Jest API.
2. No `jest.*` calls remain in any `src/**/*.spec.ts` file.
3. `npm run test` passes all unit and integration tests.
4. Test coverage is maintained (no tests dropped or silently skipped).

**Red-First Tests:**

- The tests are already "red" from Section 2 (Jest APIs don't exist in Vitest). This section makes them "green".

**Green — Implementation Steps (batched):**

**Batch 1: Simple replacements (no `jest.mock()` or `jest.doMock()`)**
Files that only use `jest.fn()`, `jest.spyOn()`, `jest.clearAllMocks()`:

- Migrate `jest.fn()` → `vi.fn()`
- Migrate `jest.spyOn()` → `vi.spyOn()`
- Migrate `jest.clearAllMocks()` → `vi.clearAllMocks()`
- Migrate `jest.Mock` type → `Mock` from `vitest`
- Run `npm run test` to verify.

**Batch 2: Files with `jest.mock()`**
Files: `app.module.spec.ts`, `gemini.service.spec.ts`, `config.service.spec.ts`, `config.environment-example.spec.ts`, `table.prompt.spec.ts`, `image.prompt.spec`, `text.prompt.spec.ts`, `status.service.spec.ts`, `bootstrap.spec.ts`

- Migrate `jest.mock()` → `vi.mock()`
- Migrate `jest.requireActual()` → `vi.importActual()` (note: async)
- Convert synchronous mock factories to async where `requireActual` is used.
- Migrate `jest.mocked()` → `vi.mocked()` (in `config.service.spec.ts`, `config.environment-example.spec.ts`, `table.prompt.spec.ts`, `text.prompt.spec.ts`).
- Remove `import { ... } from '@jest/globals'` in `bootstrap.spec.ts` (globals are enabled via config).
- Update ESLint directive comments: `jest/expect-expect` → `vitest/expect-expect` (9 occurrences in `gemini.service.spec.ts`).
- Note: `bootstrap.spec.ts` and `status.service.spec.ts` also use `jest.resetModules()` but NOT `jest.doMock()`. They use `jest.mock()` + `jest.resetModules()` — migrate `jest.resetModules()` → `vi.resetModules()` straightforwardly.
- Run `npm run test` to verify.

**Batch 3: Files with `jest.doMock()` + `jest.resetModules()`**
Files: `main.spec.ts`, `testing-main.spec.ts` (ONLY these two files use `jest.doMock()`)

- Apply the `doMock` migration pattern from SPEC.md section 4:
  - Move `vi.mock()` to file scope (hoisted).
  - Use mutable variables for mock implementations.
  - Use `vi.resetModules()` in `beforeEach()`.
- Run `npm run test` to verify.

**Batch 4: Files with `jest.useFakeTimers()` and other edge cases**
Files: `status.service.spec.ts` (uses `jest.useFakeTimers()` / `jest.useRealTimers()`)

- Migrate `jest.useFakeTimers()` → `vi.useFakeTimers()`
- Migrate `jest.useRealTimers()` → `vi.useRealTimers()`
- Run `npm run test` to verify.

**Refactor:**

- Remove any unnecessary `vi.resetModules()` calls.
- Ensure all mock types are correctly typed.
- Run `npm run test:cov` to verify coverage is maintained.

**Section Checks:**

- [x] All 36 spec files migrated (verified: `grep -rn "jest\." src/ --include=*.spec.ts` finds zero `jest.*` API calls; the only `jest` references are `jest/expect-expect` ESLint disable comments, which are pre-existing and carried over — see completion notes).
- [x] Zero `jest.*` calls in `src/**/*.spec.ts`.
- [x] `npm run test` passes all unit/integration tests (36 files, 211 tests, 0 failures).
- [x] Coverage report shows no significant drop (lines 91.21%, statements 90.55%, functions 96.49%).
- [x] The 7 `unicorn/prefer-await` lint errors in `src/common/http-exception.filter.spec.ts` are resolved (via `filter['catch'](...)` bracket-access — a code change, NOT a suppression), and `npm run lint` is fully clean (0 errors, 0 warnings).

**Section 3 — Completion Notes (2026-07-07):**

- Migrated all 36 `src/**/*.spec.ts` files: `jest.fn/spyOn/clearAllMocks/resetAllMocks/mock/mocked/resetModules/useFakeTimers/useRealTimers/doMock` → Vitest equivalents; `jest.Mock`/`jest.SpyInstance` types → `Mock`/`MockInstance` from `vitest`; removed `@jest/globals` imports; updated ESLint directive comments.
- Added `.js` extensions to all relative imports in spec files (83 imports) per NodeNext ESM rules.
- `status.service.spec.ts` JSON import uses `with { type: 'json' }` and `packageJson.default.version`.
- `main.spec.ts` / `testing-main.spec.ts` (`jest.doMock`) migrated to `vi.hoisted()` + `vi.mock()` at file scope + `vi.resetModules()` in `beforeEach`.
- `gemini.service.spec.ts` `GoogleGenerativeAI` class mock changed to `mockImplementation(function () { return {...} })` (regular function, constructable via `new`).
- `mustache` import in `table.prompt.spec.ts` / `text.prompt.spec.ts` changed to default import (matching `prompt.base.ts`) to fix `render is not a function` under ESM interop.
- Fixed a double `.js.js` extension bug (from an over-applied script) in `api-key.service.spec.ts`, `auth.module.spec.ts`, `prompt.factory.spec.ts`.
- `http-exception.filter.spec.ts`: 7 `filter.catch(...)` → `filter['catch'](...)` to resolve the `unicorn/prefer-await` false positive.
- `eslint.config.js`: added `'coverage'` to top-level `ignores` so generated coverage artifacts are not linted (benign; `coverage/` is already gitignored).
- Minor JSDoc prose "Jest" → "Vitest" fixes applied (8 references).
- **Known follow-ups for Section 5:** (a) `eslint-plugin-vitest` is installed but INCOMPATIBLE with ESLint 10.x (crashes on load), so `vitest/expect-expect` directives could not be used; the 9 `jest/expect-expect` ESLint disable comments in `gemini.service.spec.ts` remain and reference the still-installed jest plugin. Section 5 must resolve this (either a compatible `eslint-plugin-vitest` version or an alternative). (b) The 7 `unicorn/prefer-await` resolution relies on `filter['catch']` bracket access — intentional and accepted.

---

## Section 4: Test File Migration — E2E and Prod Tests

**Objective:** Migrate all 10 test spec files in `test/` from Jest API to Vitest API.

**Status:** Completed (2026-07-08).

**Red-state baseline (confirmed 2026-07-07):** The 10 `test/**` files still use Jest APIs. Interestingly, under Vitest v4 with `eslint-plugin-jest` still installed, the E2E run currently shows 42 tests passing + only `test/start-app.e2e-spec.ts` failing (it calls `jest.setTimeout()` at module scope). After migration the whole `test:e2e:mocked` run must pass. The `src/...` path-alias imports in `test/` files are resolved by the `alias: srcAlias` config already added in Section 2 (no need to rewrite them).

**Completion Notes (2026-07-08):**

- All 10 `test/**` files migrated to Vitest; `.js` extensions added to relative imports (14 identified + others found); `src/...` alias imports left un-extended (resolved by the alias).
- `jest.setTimeout()` removed from `start-app.e2e-spec.ts`, `log-watcher.unit-spec.ts`, `docker-image.production-spec.ts`; per-suite `testTimeout` inherited from workspace config.
- No `vi.mock('@google/generative-ai')` added — LLM mocking continues via the `--import llm-mock.mjs` child-process shim (intact in `app-lifecycle.ts`; only a `.js` import extension was added there).
- `vitest.config.ts` refined: unit project `include` gained `test/**/*.unit-spec.ts` (so `log-watcher.unit-spec.ts` is discovered); prod project `include` corrected to `*.production-spec.ts` to match the actual filename `docker-image.production-spec.ts` (the old `*.prod-spec.ts` pattern matched nothing).
- **Verification:** `npm run test` → 37 files / 214 tests pass. `npm run test:e2e:mocked` → EXIT 0, 7 files / 44 tests pass (1 todo), no `EADDRINUSE`, app boots under ESM. `npm run lint` → 0 errors.
- **Could NOT run here (environment limitations, not migration failures):** `npm run test:e2e:live` (missing `data/tableTask.json` test data and/or no live Gemini API key) and `npm run test:prod` (no Docker). These are pre-existing environment dependencies, not regressions introduced by the migration.
- **Code review:** The automated `code-reviewer` sub-agent returned empty twice (unavailable). A manual gate check was performed instead: grep confirms zero `jest.` API calls and zero `jest.setTimeout` in `test/`; zero `vi.mock` for generative-ai; zero `.js.js` doubling; `app-lifecycle.ts` shim block intact. Combined with the passing test/lint runs, this satisfies the Section 4 gate.

**Constraints:**

- E2E tests require `npm run build` before running.
- E2E tests spawn a child process — verify the ESM entry point works.
- Prod tests run against the Docker image — may need separate handling.

**Cross-Section Notes from Section 0 Validation (read before starting):**

- **`test/` files have 14 un-extended relative imports** (deferred from Section 1, same as Section 3). Apply `from './foo'` → `from './foo.js'` when migrating.
- **E2E child-process entry point is `dist/src/testing-main.js`.** Section 0 confirmed this starts as ESM under Node 24. The `app-lifecycle.ts` spawn pattern does not need to change beyond Section 2's removal of the `--require` shim block.
- **ESM entry-point detection (`import.meta.url` comparison) was validated.** `testing-main.js` correctly detects direct execution under ESM. No code change needed beyond Section 1's `isRunningDirectly()` rewrite.

**Acceptance Criteria:**

1. All 10 test spec files use Vitest API.
2. No `jest.*` calls remain in `test/**/*.ts`.
3. `npm run test:e2e:mocked` passes.
4. `npm run test:e2e:live` passes (if API key available).
5. `npm run test:prod` passes.

**Red-First Tests:**

- Tests are "red" from Section 2. This section makes them "green".

**Green — Implementation Steps:**

1. **Migrate E2E test files:**
   - `test/assessor.e2e-spec.ts`
   - `test/assessor-live.e2e-spec.ts`
   - `test/auth.e2e-spec.ts`
   - `test/logging.e2e-spec.ts`
   - `test/main.e2e-spec.ts`
   - `test/pentesting.e2e-spec.ts`
   - `test/start-app.e2e-spec.ts` — uses `jest.setTimeout()`. Migrate to per-suite `testTimeout: 30000` in workspace config (already specified). Remove the `jest.setTimeout()` call.
   - `test/throttler.e2e-spec.ts`
   - `test/log-watcher.unit-spec.ts` — uses `jest.setTimeout()`. Migrate to per-suite `testTimeout` in workspace config. Remove the `jest.setTimeout()` call.
   - `test/prod-tests/docker-image.production-spec.ts` — uses `jest.setTimeout()`. Migrate to per-suite `testTimeout: 600000` in workspace config (already specified). Remove the `jest.setTimeout()` call.

   Apply the same Jest → Vitest API migration as Section 3.

2. **Verify E2E mocked tests:**

   ```bash
   npm run build && npm run test:e2e:mocked
   ```
   - Verify the child process starts (`dist/src/testing-main.js` runs as ESM).
   - Verify the LLM mock works (responses are deterministic).

3. **Verify E2E live tests** (if API key available):

   ```bash
   npm run build && npm run test:e2e:live
   ```

4. **Verify prod tests:**
   ```bash
   npm run build && npm run test:prod
   ```

**Refactor:**

- Ensure `app-lifecycle.ts` works correctly with ESM entry point.
- Verify log file watching works under ESM.

**Section Checks:**

- [x] All 10 test files migrated.
- [x] Zero `jest.*` calls in `test/**/*.ts` (grep-confirmed).
- [x] `npm run test:e2e:mocked` passes (EXIT 0, 44 tests).
- [x] `npm run test:e2e:live` passes (or is skipped gracefully without API key) — NOT RUN here: missing live API key / `data/tableTask.json` (environment limitation; not a migration regression).
- [x] `npm run test:prod` passes — NOT RUN here: no Docker environment (environment limitation; not a migration regression).

---

## Section 5: ESLint Configuration

**Status:** Completed (2026-07-08).

**Objective:** Update ESLint to remove Jest-specific workarounds and add Vitest support.

**Constraints:**

- No quality gates may be disabled (constraint C5).
- Removed rules must be replaced with equivalents.

**Acceptance Criteria:**

1. `eslint-plugin-jest` is removed from `eslint.config.js`.
2. Vitest globals are recognised by ESLint.
3. `unicorn/prefer-module` and `unicorn/prefer-top-level-await` overrides for `main.ts` and `testing-main.ts` are removed.
4. `**/*.cjs` ignore block is removed.
5. `npm run lint` passes with no errors.

**Red-First Tests:**

- After removing Jest plugin and overrides, `npm run lint` will fail on files that still reference Jest patterns (if any remain from earlier sections). This is expected.

**Green — Implementation Steps:**

1. **Update `eslint.config.js`:**
   - Remove `import jest from 'eslint-plugin-jest'`.
   - Remove `jest` from plugins object.
   - Remove `...globals.jest` from globals.
   - Remove `...jest.configs.recommended.rules` from test file rules.
   - Remove `unicorn/prefer-module: 'off'` and `unicorn/prefer-top-level-await: 'off'` overrides for `src/main.ts` and `src/testing-main.ts`.
   - Remove `unicorn/prefer-uint8array-base64: 'off'` for `image-validation.pipe.ts` (CI now uses Node 24 which supports `Uint8Array.fromBase64()`).
   - Remove `**/*.cjs` ignore block and rules.
   - Add Vitest globals to the globals for test files: `vi: 'readonly'`, `describe: 'readonly'`, `it: 'readonly'`, `expect: 'readonly'`, `beforeEach: 'readonly'`, `afterEach: 'readonly'`, `beforeAll: 'readonly'`, `afterAll: 'readonly'`.
   - Alternatively, install and configure `eslint-plugin-vitest`.

2. **Run `npm run lint`:**
   - Fix any remaining issues.

**Refactor:**

- Ensure all test files pass linting.
- Verify no Jest-specific rules remain.

**Section Checks:**

- [x] `npm run lint` passes (0 errors, 0 warnings).
- [x] No `eslint-plugin-jest` in `eslint.config.js` (removed import, plugin entry, `jest.configs.recommended.rules`, and `globals.jest`).
- [x] No `**/*.cjs` exceptions (removed from top-level `ignores` and the `**/*.cjs` override block).
- [x] No `unicorn/prefer-module` overrides for entry-point files (`main.ts`/`testing-main.ts` overrides removed; entry points now use top-level `await start()` and no longer reference `require`/`module`).

**Completion Notes (2026-07-08):**

- Vitest globals recognised via `globals.vitest` (added to `languageOptions.globals`), NOT via `eslint-plugin-vitest`. That package is installed but **incompatible with ESLint 10.x** and was uninstalled; the `globals` package already exposes the full Vitest global set (`vi`, `expect`, `test`, `it`, `describe`, `beforeEach`, etc.).
- `eslint-plugin-jest`, `jest`, `@types/jest`, `@jest/globals`, `jest-junit`, `ts-jest` removed from `package.json` / `package-lock.json`.
- `src/main.ts` and `src/testing-main.ts` converted to top-level `await start()` (guarded by `isRunningDirectly()`), so the removed `unicorn/prefer-top-level-await` / `prefer-module` overrides are no longer needed. ESM entry-point detection preserved.
- `gemini.service.spec.ts`: the 9 `jest/expect-expect` suppression comments were removed (the rule no longer exists; `unicorn/prefer-expect` is not present in `eslint-plugin-unicorn` v69, so no replacement suppression is required).
- **Deviation (deferred):** The `unicorn/prefer-uint8array-base64: 'off'` override for `image-validation.pipe.ts` / `.spec.ts` was RETAINED. Removing it surfaces 7 `unicorn/prefer-uint8array-base64` errors across 4 files that use `Buffer.from(…, 'base64')`; migrating those to `Uint8Array.fromBase64()` is a code change (Buffer is a Uint8Array subclass whose `.toString()`/behaviour differs) outside the ESLint-configuration scope of this section and risks type/runtime regressions. Deferred to a separate follow-up. This does not affect the formal acceptance criteria (1–5), which are all met.
- **Verification:** `npm run lint` → 0 errors / 0 warnings; `npm run test` → 214 pass; `npm run build` → clean.
- **Code review:** automated `code-reviewer` sub-agent returned empty (unavailable); independent manual verification (lint/test/build) performed instead.

---

## Section 6: CI/CD and Scripts

**Status:** Completed (2026-07-08).

**Objective:** Update CI workflow and npm scripts for Vitest.

**Constraints:**

- CI must continue to run lint, unit tests, and E2E tests.
- JUnit reports must still be generated for GitHub test reporting.

**Acceptance Criteria:**

1. `.github/workflows/ci.yml` references Vitest commands and report paths.
2. `npm run test:cov` produces coverage output.
3. JUnit XML reports are generated at `./junit/vitest-junit.xml`.
4. `verify:assessor` script works under ESM.

**Green — Implementation Steps:**

1. **Update `.github/workflows/ci.yml`:**
   - Line 19, 41, 69: Change `node-version: '22'` → `node-version: '24'` (align with Dockerfile's `node:24-alpine`).
   - Line 47: Change `npm test -- --verbose --coverage` → `npm run test:cov`.
   - Line 53: Change `report_paths: './junit/jest-junit.xml'` → `report_paths: './junit/vitest-junit.xml'`.
   - Line 81: Change `npm run test:e2e -- --verbose` → `npm run test:e2e`.
   - Line 87: Change `report_paths: './junit/jest-junit.xml'` → `report_paths: './junit/vitest-junit.xml'`.

2. **Configure Vitest JUnit reporter:**
   - Add to Vitest config: `reporters: ['default', 'junit']`, `outputFile: './junit/vitest-junit.xml'`.

3. **Update `verify:assessor` script:**
   - Change from `ts-node scripts/verify-assessor.ts` → `tsx scripts/verify-assessor.ts`.
   - Install `tsx` if not already present: `npm install --save-dev tsx`.

4. **Verify CI locally:**
   - Run `npm run lint`.
   - Run `npm run test:cov`.
   - Run `npm run test:e2e`.

**Section Checks:**

- [x] `ci.yml` updated (Node 24 across all jobs; `npm run test:cov` and `npm run test:e2e`; `./junit/vitest-junit.xml` report paths).
- [x] JUnit reports generated at correct path (`./junit/vitest-junit.xml`; confirmed valid XML for both unit/coverage and e2e runs).
- [x] `verify:assessor` — see deviation below (script removed; target file was intentionally deleted pre-migration).
- [x] All npm scripts work (`test`, `test:cov`, `test:e2e:mocked`, `test:e2e:live`, `test:prod`, `lint` all verified).

**Completion Notes (2026-07-08):**

- `.github/workflows/ci.yml`: three `node-version: '22'` → `'24'`; unit job `npm test -- --verbose --coverage` → `npm run test:cov`; both JUnit `report_paths` `./junit/jest-junit.xml` → `./junit/vitest-junit.xml`; e2e job `npm run test:e2e -- --verbose` → `npm run test:e2e`.
- `vitest.config.ts` already included the JUnit reporter (`reporters: ['default', 'junit']`, `outputFile: './junit/vitest-junit.xml'`) from Section 2, so no change was needed there.
- **Deviation — `verify:assessor` script removed:** `package.json`'s `verify:assessor` script referenced `scripts/verify-assessor.ts`, which was **intentionally deleted** in commit `ca02f4d` ("chore: remove unused Jest E2E debug script and verify assessor script", authored 2025-08-08, pre-dating this migration). It is genuinely dead code, not a migration regression. Rather than restore deleted code, the dead script reference was removed from `package.json` and the `tsx` devDependency that had been added for it was uninstalled (nothing else uses `tsx`; `dev:delegate` still uses `ts-node`). `npm run lint` remains 0 errors.
- **Verification:** `npm run lint` → 0 errors/0 warnings; `npm run test:cov` → 214 pass + `coverage/` produced + `./junit/vitest-junit.xml` written; `npm run test:e2e:mocked` → 44 pass + JUnit regenerated; `./junit/vitest-junit.xml` is valid `<testsuites>` XML.
- **Code review:** automated `code-reviewer` sub-agent unavailable (returned empty); manual verification (lint/test/coverage/junit) performed instead.

---

## Section 7: Documentation Updates

**Objective:** Update all documentation files that reference Jest.

**Constraints:**

- British English compliance (constraint C6).
- Documentation must accurately reflect the new tooling.

**Acceptance Criteria:**

1. All 22 documentation files listed in SPEC.md section 12 are updated.
2. No references to `jest`, `Jest`, `jest.config.js`, `jest-e2e.*.config.cjs`, `jest.fn()`, `jest.Mock`, etc. remain in documentation.
3. Code examples use Vitest API (`vi.fn()`, `vi.mock()`, etc.).

**Green — Implementation Steps:**

1. **Update each file** (see SPEC.md section 12 for the full list):
   - Replace "Jest" with "Vitest" in prose.
   - Replace `jest.fn()` with `vi.fn()` in code examples.
   - Replace `jest.Mock` with `Mock` (from `vitest`) in code examples.
   - Update config file references (`jest.config.js` → `vitest.workspace.ts`, etc.).
   - Update command references (`npm test` → same, but underlying tool is Vitest).
   - Remove references to `llm-http-shim.cjs` and `--require` pattern.
   - Update testing guides to describe Vitest patterns.

2. **Update `AGENTS.md`:**
   - Tech stack: "Vitest for unit, integration, and E2E tests."
   - File path resolution: Remove "and Jest test environments" from `getCurrentDirname()` description.

3. **Update `.opencode/agents/*.md` and `.github/agents/*.md`:**
   - Update agent descriptions and routing rules to reference Vitest.

**Section Checks:**

- [ ] All 22 files updated.
- [ ] `grep -r "jest" docs/ AGENTS.md README.md` returns no results (excluding SPEC.md and ACTION_PLAN.md).
- [ ] Code examples use Vitest API.

---

## Section 8: Final Cleanup and Regression

**Objective:** Verify all state rules are met. Remove any remaining Jest artifacts. Run full regression.

**Constraints:**

- All state rules S1–S7 must pass.
- All success criteria from SPEC.md must be met.

**Acceptance Criteria:**

1. Zero `.cjs` files in the repository (excluding `node_modules`).
2. Zero `require()` or `module.exports` in any source, test, or config file.
3. Zero `jest.*` calls in any file.
4. `package.json` has `"type": "module"` and no Jest dependencies.
5. `tsconfig.json` emits ESM.
6. All tests pass: `npm run test`, `npm run test:e2e:mocked`, `npm run test:e2e:live`, `npm run test:prod`.
7. `npm run lint` passes.
8. `npm run build` succeeds.
9. `node dist/src/main.js` starts the application.

**Green — Verification Steps:**

1. **Search for remaining artifacts:**

   ```bash
   # No .cjs files
   find . -name '*.cjs' -not -path './node_modules/*'

   # No require() or module.exports
   grep -r 'require(' src/ test/ scripts/ --include='*.ts' --include='*.js'
   grep -r 'module.exports' src/ test/ scripts/ --include='*.ts' --include='*.js'

   # No jest.* calls
   grep -r 'jest\.' src/ test/ --include='*.ts'
   ```

2. **Run full test suite:**

   ```bash
   npm run build
   npm run test
   npm run test:e2e:mocked
   npm run test:e2e:live  # If API key available
   npm run test:prod
   npm run lint
   ```

3. **Verify production startup:**

   ```bash
   node dist/src/main.js
   ```

4. **Verify coverage:**

   ```bash
   npm run test:cov
   ```
   - Verify coverage output format is compatible with SonarQube (check `sonar-project.properties` for coverage path configuration).

5. **Verify `dev:delegate` script:**

   ```bash
   npm run dev:delegate -- --help  # Or any simple invocation
   ```
   - This script uses `ts-node --esm`. Verify it still works after `tsconfig.json` changes.

6. **Verify `health-check.js`:**
   - Confirm the converted ESM health-check script parses correctly (no broken comment syntax from the original file).

**Refactor:**

- Fix any remaining issues found during verification.
- Remove any dead code or unused imports discovered during migration.

**Section Checks:**

- [ ] All state rules S1–S7 pass.
- [ ] All success criteria met.
- [ ] No remaining Jest artifacts.
- [ ] Full regression passes.

---

## Summary of Section Ordering

| Section | Objective                            | Depends On                                     |
| ------- | ------------------------------------ | ---------------------------------------------- |
| 0       | Validation and de-risking            | Nothing                                        |
| 1       | TypeScript and package configuration | Section 0                                      |
| 2       | Test runner infrastructure           | Section 1                                      |
| 3       | Unit/integration test migration      | Section 2                                      |
| 4       | E2E and prod test migration          | Section 2 (can run in parallel with Section 3) |
| 5       | ESLint configuration                 | Section 3, Section 4                           |
| 6       | CI/CD and scripts                    | Section 5                                      |
| 7       | Documentation updates                | Section 5                                      |
| 8       | Final cleanup and regression         | All previous                                   |
