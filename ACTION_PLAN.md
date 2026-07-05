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

- [ ] All 5 acceptance criteria pass.
- [ ] Temporary changes are rolled back.
- [ ] Any issues discovered are recorded as blockers before proceeding.

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
   - Remove `"ignoreDeprecations": "6.0"` if no longer needed.
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

7. **Verify build and runtime:**
   - Run `npm run build` — must succeed.
   - Inspect `dist/src/main.js` — must use `import`/`export` syntax.
   - Run `node dist/src/main.js` — must start the server.

**Refactor:**

- Review any TypeScript compilation errors that arise from `NodeNext` module resolution (e.g., missing `.js` extensions in relative imports). Fix them.

**Section Checks:**

- [ ] `npm run build` succeeds.
- [ ] `dist/` output uses ESM syntax.
- [ ] `node dist/src/main.js` starts the server.
- [ ] No `require()` or `module.exports` in any source file.
- [ ] `tsconfig.test.json` is deleted.

---

## Section 2: Test Runner Migration — Infrastructure

**Objective:** Replace Jest with Vitest. Create the Vitest configuration and setup files. Remove all Jest configuration files and dependencies.

**Constraints:**

- Tests will not pass until Section 3 (test file migration) is complete.
- Install Vitest and remove Jest in a single commit to avoid a broken intermediate state.

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
         },
       },
     ]);
     ```
   - If workspace mode fails, fall back to separate `vitest.config.ts`, `vitest.e2e.config.ts`, etc.

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

- [ ] No Jest config files remain.
- [ ] No Jest dependencies in `package.json`.
- [ ] `vitest.workspace.ts` (or config files) exist.
- [ ] `vitest.setup.ts` exists with environment setup.
- [ ] `vitest.e2e.setup.ts` exists with LLM mock.
- [ ] `test/utils/llm-http-shim.cjs` is deleted.
- [ ] `test/utils/app-lifecycle.ts` no longer references `--require`.
- [ ] `npm run test` invokes Vitest (tests will fail — that's expected until Section 3).

---

## Section 3: Test File Migration — Unit and Integration Tests

**Objective:** Migrate all 36 `*.spec.ts` files in `src/` from Jest API to Vitest API.

**Constraints:**

- This is the largest section by file count. Work in batches to keep changes reviewable.
- Each batch should be verified by running the tests.
- Use the migration table in SPEC.md section 4.

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

- [ ] All 36 spec files migrated.
- [ ] Zero `jest.*` calls in `src/**/*.spec.ts`.
- [ ] `npm run test` passes all unit/integration tests.
- [ ] Coverage report shows no significant drop.

---

## Section 4: Test File Migration — E2E and Prod Tests

**Objective:** Migrate all 10 test spec files in `test/` from Jest API to Vitest API.

**Constraints:**

- E2E tests require `npm run build` before running.
- E2E tests spawn a child process — verify the ESM entry point works.
- Prod tests run against the Docker image — may need separate handling.

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

- [ ] All 10 test files migrated.
- [ ] Zero `jest.*` calls in `test/**/*.ts`.
- [ ] `npm run test:e2e:mocked` passes.
- [ ] `npm run test:e2e:live` passes (or is skipped gracefully without API key).
- [ ] `npm run test:prod` passes.

---

## Section 5: ESLint Configuration

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

- [ ] `npm run lint` passes.
- [ ] No `eslint-plugin-jest` in `eslint.config.js`.
- [ ] No `**/*.cjs` exceptions.
- [ ] No `unicorn/prefer-module` overrides for entry-point files.

---

## Section 6: CI/CD and Scripts

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

- [ ] `ci.yml` updated.
- [ ] JUnit reports generated at correct path.
- [ ] `verify:assessor` works.
- [ ] All npm scripts work.

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
