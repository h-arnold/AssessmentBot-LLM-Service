# SPEC: Eliminate CommonJS Module Exports — Full ESM Migration

## Purpose

Remove the requirement for CommonJS module output from the codebase. The codebase currently writes ESM syntax (`import`/`export`) in all source files but compiles to CommonJS (`"module": "CommonJS"` in `tsconfig.json`) solely because Jest's ESM support is incomplete. This migration switches the test runner from Jest to Vitest (which supports ESM natively), enabling the entire project — source, tests, and production build output — to use pure ESM.

## Background

The ESLint configuration already documents this intent (`eslint.config.js`, lines 237–248):

> _"Jest runs inside a CommonJS environment (tsconfig.module = CommonJS) that lacks both top-level await support and the Uint8Array.fromBase64() method... These overrides will be removed when the project migrates from Jest to Vitest (which supports ESM natively), eliminating both constraints in a single change."_

The source code is already pure ESM syntax. Zero `require()`, `module.exports`, `__dirname`, or `__filename` calls exist in any `.ts` source file. The CommonJS requirement is entirely in configuration and test infrastructure.

## Decisions

| #   | Decision                                                                         | Rationale                                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Full ESM everywhere — production build output AND tests                          | Eliminates all CommonJS. `package.json` gets `"type": "module"`. `tsconfig.json` emits ESM. `node dist/src/main.js` runs as ESM.                                                               |
| D2  | All test types migrate to Vitest (unit, integration, E2E, prod)                  | Single test runner, single configuration, consistent mocking APIs. Removes all `.cjs` Jest config files.                                                                                       |
| D3  | Vitest replaces Jest entirely — no hybrid approach                               | Avoids maintaining two test runners and two sets of configuration.                                                                                                                             |
| D4  | `tsconfig.json` uses `"module": "NodeNext"` and `"moduleResolution": "NodeNext"` | The most correct ESM configuration for Node.js. Enforces explicit file extensions in imports where required by Node's ESM resolver.                                                            |
| D5  | NestJS v11 ESM compatibility is validated early                                  | NestJS v11.1.27 can run ESM output but the ecosystem is primarily CJS-tested. Early validation de-risks the migration.                                                                         |
| D6  | Vitest globals enabled (`globals: true` in config)                               | Avoids adding `import { describe, it, expect, vi } from 'vitest'` to all 46 test files. The `describe`/`it`/`expect`/`beforeEach` API is identical to Jest's globals, so this minimises churn. |
| D7  | Vitest workspace mode for multi-suite configuration                              | A single `vitest.workspace.ts` manages unit, E2E, live, and prod test suites. Cleaner than maintaining 4 separate config files.                                                                |
| D8  | E2E LLM mocking via `vi.mock()` in Vitest setup file                             | Replaces the `llm-http-shim.cjs` + `--require` pattern. The mock is applied in the E2E Vitest setup file using `vi.mock('@google/generative-ai')`, which works natively with ESM.              |

## Scope

### In scope

1. **TypeScript configuration** — Change `tsconfig.json` to emit ESM. Update `tsconfig.build.json` and `tsconfig.test.json` accordingly.
2. **Package configuration** — Add `"type": "module"` to `package.json`. Remove Jest dependencies. Add Vitest dependencies.
3. **Test runner migration** — Replace all Jest configuration (1 `jest.config.js` + 4 `.cjs` configs) with a Vitest workspace configuration. Convert all 46 test files (36 `*.spec.ts` in `src/` + 10 test specs in `test/`) from Jest API to Vitest API.
4. **Entry-point detection** — Replace `require.main === module` in `main.ts` and `testing-main.ts` with ESM-compatible pattern.
5. **Utility scripts** — Convert `health-check.js` to ESM. Replace `llm-http-shim.cjs` with Vitest-native mocking.
6. **ESLint configuration** — Remove Jest-specific workarounds. Replace `eslint-plugin-jest` with Vitest equivalent. Remove `unicorn/prefer-module` and `unicorn/prefer-top-level-await` overrides that exist solely for Jest compatibility.
7. **npm scripts** — Update all test-related scripts to use Vitest. Update `test:debug` to remove `-r ts-node/register` (CJS hook).
8. **CI/CD configuration** — Update any CI references from Jest to Vitest (coverage reporters, JUnit output).
9. **Documentation** — Update `AGENTS.md`, `docs/development/workflow.md`, and other docs that reference Jest.

### Out of scope

- Changing the NestJS framework version or upgrading NestJS itself.
- Migrating from `ts-node` to `tsx` for script execution (though `ts-node` ESM hooks may need updating).
- Adding new features or refactoring business logic.
- Changing the Dockerfile base image or build pipeline structure.

## Constraints

| #   | Constraint                                                  | Detail                                                                                                                                                                                                |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | All existing tests must pass after migration                | No test may be dropped or silently skipped. Coverage must be maintained.                                                                                                                              |
| C2  | NestJS decorator metadata must continue working             | `emitDecoratorMetadata: true` and `experimentalDecorators: true` must remain functional under ESM output.                                                                                             |
| C3  | Production startup must work identically                    | `node dist/src/main.js` must start the server. The `isRunningDirectly()` check must work under ESM.                                                                                                   |
| C4  | E2E tests must still spawn the built app as a child process | The `app-lifecycle.ts` pattern of spawning `dist/src/testing-main.js` must continue to work.                                                                                                          |
| C5  | No quality gate may be disabled                             | Per `AGENTS.md`: "Do not disable or override any quality gate (including linter rules) without explicit authorisation." ESLint rules removed must be replaced with equivalents, not silently dropped. |
| C6  | British English compliance                                  | All new code, comments, and documentation must use British English.                                                                                                                                   |
| C7  | `supertest` E2E pattern preserved                           | E2E tests use `supertest` for HTTP assertions. This library works with Vitest.                                                                                                                        |

## Contracts and Changes

### 1. TypeScript Configuration (`tsconfig.json`)

**Current:**

```json
{
  "compilerOptions": {
    "module": "CommonJS",
    "moduleResolution": "node",
    "types": ["node", "jest"]
  }
}
```

**Target:**

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  }
}
```

Note: If Vitest globals are enabled (decision D6), test files will not need explicit imports. However, TypeScript still needs type information for `describe`, `it`, `expect`, `vi`, etc. This is handled by Vitest's type augmentation — either add `"vitest/globals"` to the `types` array, or ensure the Vitest config's `globals: true` automatically augments the global types (which it does when `/// <reference types="vitest/globals" />` is included or when `@types/vitest` is resolved). The implementation agent should verify which approach works with the chosen Vitest version.

- `tsconfig.build.json` inherits and excludes test files — no structural change needed.
- `tsconfig.test.json` — **Delete this file.** It exists solely to override `module` to `ES2022` for Jest's ESM mode and to configure `ts-node.esm`. Neither is needed after migration. The `ts-node` ESM configuration is no longer relevant since `ts-node` is only used for the `dev:delegate` and `verify:assessor` scripts, which already pass `--esm` explicitly or will be updated.

### 2. Package Configuration (`package.json`)

**Add:**

```json
{
  "type": "module"
}
```

**Remove dependencies:**

- `jest`, `@types/jest`, `ts-jest`, `jest-junit`, `eslint-plugin-jest`

**Add dependencies:**

- `vitest` (test runner)
- `@vitest/coverage-v8` (coverage provider)
- `eslint-plugin-vitest` (or equivalent lint rules)

**Update scripts:**

| Current                                                                                                                | Target                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `"test": "jest"`                                                                                                       | `"test": "vitest run"`                                                                                        |
| `"test:watch": "jest --watch"`                                                                                         | `"test:watch": "vitest"`                                                                                      |
| `"test:cov": "jest --coverage"`                                                                                        | `"test:cov": "vitest run --coverage"`                                                                         |
| `"test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand"` | `"test:debug": "node --inspect-brk node_modules/.bin/vitest run --pool=forks --poolOptions.forks.singleFork"` |
| `"test:e2e": "npm run test:e2e:mocked"`                                                                                | `"test:e2e": "vitest run --config vitest.e2e.config.ts"`                                                      |
| `"test:e2e:mocked": "npm run build && jest --config ./jest-e2e.mocked.config.cjs --runInBand"`                         | `"test:e2e:mocked": "npm run build && vitest run --config vitest.e2e.config.ts"`                              |
| `"test:e2e:live": "npm run build && jest --config ./jest-e2e.live.config.cjs --runInBand"`                             | `"test:e2e:live": "npm run build && vitest run --config vitest.e2e.live.config.ts"`                           |
| `"test:prod": "npm run build && jest --config ./jest-prod.config.cjs --runInBand"`                                     | `"test:prod": "npm run build && vitest run --config vitest.prod.config.ts"`                                   |

### 3. Test Runner Configuration

**Remove files:**

- `jest.config.js`
- `jest-e2e.mocked.config.cjs`
- `jest-e2e.live.config.cjs`
- `jest-e2e.config.cjs` (appears to be dead code — not referenced by any npm script)
- `jest-prod.config.cjs`
- `jest.setup.ts` (replace with Vitest setup)
- `test/jest.e2e.mocked.setup.ts` (logic moves into Vitest E2E config/workspace)
- `test/jest.e2e.live.setup.ts` (logic moves into Vitest E2E config/workspace)
- `test/utils/llm-http-shim.cjs` (replaced by Vitest `vi.mock()` — see section 6)

**Create files:**

- `vitest.workspace.ts` — Workspace definition managing all test suites (unit, E2E, live, prod)
- `vitest.setup.ts` — Global setup for unit/integration tests (replaces `jest.setup.ts`)
- `vitest.e2e.setup.ts` — E2E-specific setup (applies LLM mock via `vi.mock()`)

Alternatively, if workspace mode proves problematic, fall back to separate config files:

- `vitest.config.ts` — Unit and integration tests
- `vitest.e2e.config.ts` — E2E tests (mocked)
- `vitest.e2e.live.config.ts` — Live E2E tests
- `vitest.prod.config.ts` — Production environment tests

### 4. Jest API → Vitest API Migration

All 46 test files (36 `*.spec.ts` in `src/` + 10 test specs in `test/`) require translation. The following table covers all Jest APIs found in the codebase:

**Runtime APIs:**

| Jest API               | Files Using It                                                                                   | Vitest Equivalent                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `jest.fn()`            | ~18 files, ~115 calls                                                                            | `vi.fn()`                                                               |
| `jest.mock()`          | 9 files, 13 calls                                                                                | `vi.mock()`                                                             |
| `jest.doMock()`        | 2 files (`main.spec.ts`, `testing-main.spec.ts`), 4 calls                                        | See "doMock migration pattern" below                                    |
| `jest.spyOn()`         | 4 files, 6 calls                                                                                 | `vi.spyOn()`                                                            |
| `jest.requireActual()` | 1 file (`gemini.service.spec.ts`), 1 call                                                        | `vi.importActual()` (async)                                             |
| `jest.resetModules()`  | 5 files, 8 calls                                                                                 | `vi.resetModules()`                                                     |
| `jest.clearAllMocks()` | 10 files, 12 calls                                                                               | `vi.clearAllMocks()`                                                    |
| `jest.setTimeout()`    | 3 files (`log-watcher.unit-spec.ts`, `start-app.e2e-spec.ts`, `docker-image.production-spec.ts`) | `testTimeout` in Vitest config, or `vi.setConfig({ testTimeout: ... })` |
| `jest.mocked()`        | Used for type casting                                                                            | `vi.mocked()`                                                           |

**Type APIs:**

| Jest Type        | Approximate Occurrences          | Vitest Equivalent                            |
| ---------------- | -------------------------------- | -------------------------------------------- |
| `jest.Mock`      | ~56 occurrences across ~12 files | `Mock` (imported from `vitest`) or `vi.Mock` |
| `jest.Mocked<T>` | 2 occurrences in docs            | `Mocked<T>` (imported from `vitest`)         |

**Test structure APIs (no change needed):**

- `describe`, `it`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll` — identical API.
- `expect.hasAssertions()` — supported natively by Vitest.

**ESLint directive changes:**

- Comments referencing the `jest/expect-expect` rule (9 occurrences in `gemini.service.spec.ts`) must be updated to reference `vitest/expect-expect` instead.

**`@jest/globals` import:**

- `bootstrap.spec.ts` imports from `@jest/globals` — change to `import { ... } from 'vitest'` (or remove if globals are enabled).

#### `jest.doMock()` migration pattern

The `jest.doMock()` + `jest.resetModules()` pattern (used in `main.spec.ts`, `testing-main.spec.ts`, `app.module.spec.ts`, `status.service.spec.ts`, `bootstrap.spec.ts`) is the trickiest migration. Jest's `doMock()` registers a mock that takes effect on the next `require()`, and `resetModules()` clears the module cache so subsequent `import()` calls re-execute the module with the new mock.

In Vitest, `vi.mock()` is always hoisted to the top of the file and cannot be called conditionally inside `beforeEach()`. The equivalent pattern uses `vi.mock()` with a factory that reads from a mutable variable, combined with `vi.resetModules()`:

```typescript
// Before (Jest):
beforeEach(() => {
  jest.resetModules();
  jest.doMock('./bootstrap', () => ({ bootstrap: mockBootstrap }));
});
it('should call bootstrap', async () => {
  const { start } = await import('./main');
  await start();
  expect(mockBootstrap).toHaveBeenCalled();
});

// After (Vitest):
let mockBootstrap: () => void;
vi.mock('./bootstrap', () => ({ bootstrap: mockBootstrap }));

beforeEach(() => {
  vi.resetModules();
  mockBootstrap = vi.fn();
});
it('should call bootstrap', async () => {
  const { start } = await import('./main');
  await start();
  expect(mockBootstrap).toHaveBeenCalled();
});
```

**Key behavioural difference:** Vitest's `vi.mock()` is hoisted to the top of the file automatically (like Jest's), but `vi.mock()` with factory functions in ESM mode uses `vi.importActual()` (async) instead of `jest.requireActual()` (sync). This requires converting synchronous mock factories to async where `requireActual` is used.

### 5. Entry-Point Detection (`main.ts`, `testing-main.ts`)

**Current (CommonJS):**

```typescript
function isRunningDirectly(): boolean {
  return (
    typeof require !== 'undefined' &&
    require.main === module &&
    !process.env.JEST_WORKER_ID
  );
}
```

**Target (ESM):**

```typescript
import { pathToFileURL } from 'node:url';

function isRunningDirectly(): boolean {
  return (
    process.argv[1] != null &&
    import.meta.url === pathToFileURL(process.argv[1]).href
  );
}
```

The `JEST_WORKER_ID` check is no longer needed since Vitest does not set this environment variable. The `process.argv[1] != null` guard prevents a crash when the script is loaded via `node -e` or in a REPL where `process.argv[1]` is `undefined`.

### 6. Utility Scripts

**`scripts/health-check.js`:**
Convert from `require('node:http')` to `import http from 'node:http'`. Since `package.json` will have `"type": "module"`, the `.js` extension will be treated as ESM.

**`test/utils/llm-http-shim.cjs`:**
This file is loaded via `--require` (CJS-only) to monkey-patch the Gemini SDK for mocked E2E tests. With Vitest, the mocking strategy changes entirely (see decision D8):

- The `.cjs` file is **deleted**.
- The `--require` approach is removed from `test/utils/app-lifecycle.ts` (lines 103–114). The entire `if (testEnvironment.E2E_MOCK_LLM === 'true')` block that constructs `NODE_OPTIONS` with `--require "${shimPath}"` must be removed. No other changes are required in `app-lifecycle.ts`.
- E2E LLM mocking is instead handled by `vi.mock('@google/generative-ai')` in the Vitest E2E setup file (`vitest.e2e.setup.ts`). This mock intercepts the `GoogleGenerativeAI` class and returns deterministic responses, replacing the prototype monkey-patch.

### 7. ESLint Configuration (`eslint.config.js`)

**Remove:**

- `eslint-plugin-jest` import and plugin registration
- Jest globals (`...globals.jest`)
- All Jest-specific rule blocks (`jest.configs.recommended.rules`)
- `unicorn/prefer-module: 'off'` overrides for `src/main.ts` and `src/testing-main.ts` (no longer needed — ESM natively supports these patterns)
- `unicorn/prefer-top-level-await: 'off'` overrides for the same files (ESM supports top-level await)
- `unicorn/prefer-uint8array-base64: 'off'` override for `image-validation.pipe.ts` — **Remove this override.** CI will be updated to Node.js 24 (matching the Dockerfile), which supports `Uint8Array.fromBase64()`. The override was only needed because CI previously used Node.js 22.
- `**/*.cjs` ignore block (no more `.cjs` files)

**Add:**

- `eslint-plugin-vitest` (or configure globals for Vitest: `vi`, `describe`, `it`, `expect`, etc.)
- Vitest-specific rule configuration for test files

### 8. CI/CD Configuration (`.github/workflows/ci.yml`)

**Changes required:**

| Line       | Current                                  | Target                                                                                 |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| 19, 41, 69 | `node-version: '22'`                     | `node-version: '24'` (align with Dockerfile's `node:24-alpine`)                        |
| 47         | `npm test -- --verbose --coverage`       | `npm run test:cov` (Vitest coverage uses different flags)                              |
| 53         | `report_paths: './junit/jest-junit.xml'` | `report_paths: './junit/vitest-junit.xml'` (or whatever Vitest JUnit reporter outputs) |
| 81         | `npm run test:e2e -- --verbose`          | `npm run test:e2e`                                                                     |
| 87         | `report_paths: './junit/jest-junit.xml'` | `report_paths: './junit/vitest-junit.xml'`                                             |

**JUnit reporter:** Use Vitest's built-in `reporters: ['junit']` with `outputFile: './junit/vitest-junit.xml'`. No additional package needed.

**Coverage:** Replace `jest --coverage` (which uses Istanbul) with `vitest run --coverage` (which uses `@vitest/coverage-v8`). The coverage output format may differ; verify that SonarQube and CI coverage uploads still work.

### 9. Dockerfile

**No changes required.** The production Dockerfile runs `node dist/src/main.js`. With `"type": "module"` in `package.json` and ESM output from `tsc`, Node.js will load the file as ESM automatically. The `health-check.js` script will also be ESM.

### 10. `getCurrentDirname()` Utility

**No changes required.** The utility already returns `process.cwd()` and does not use `__dirname` or `import.meta.url`. It works identically in ESM.

### 11. Scripts (`verify:assessor`, `dev:delegate`)

**`verify:assessor` script:** Currently `ts-node scripts/verify-assessor.ts`. Under `"type": "module"`, `ts-node` without `--esm` will fail. Migrate to `tsx scripts/verify-assessor.ts` for better ESM support and simpler configuration.

**`dev:delegate` script:** Already uses `ts-node --esm`. No change needed, but verify it works after `tsconfig.json` changes.

### 12. Documentation Updates

The following files contain Jest references that must be updated:

| File                                          | Nature of References                                         |
| --------------------------------------------- | ------------------------------------------------------------ |
| `AGENTS.md`                                   | Tech stack lists Jest; file-utilities guidance mentions Jest |
| `README.md`                                   | Tech stack lists Jest                                        |
| `LINT_CLEANUP_PLAN.md`                        | References `jest.fn()`, `jest.Mock` patterns                 |
| `docs/architecture/overview.md`               | Lists Jest as testing framework                              |
| `docs/copilot-environment.md`                 | Mentions Jest for test env setup                             |
| `docs/modules/utilities.md`                   | Documents `getCurrentDirname()` Jest compatibility           |
| `docs/deployment/cicd.md`                     | References Jest/Istanbul for coverage, JUnit paths           |
| `docs/development/debugging.md`               | VS Code debug config for Jest, CLI examples                  |
| `docs/development/git-workflow.md`            | Example commit message referencing Jest                      |
| `docs/development/workflow.md`                | Testing pyramid describes Jest; coverage enforcement         |
| `docs/development/code-style.md`              | Code examples use `jest.fn()`, `jest.Mocked<>`               |
| `docs/testing/README.md`                      | Framework lists, config file names, mocking guidance         |
| `docs/testing/E2E_GUIDE.md`                   | Mocked/live config file names, shim documentation            |
| `docs/testing/PRACTICAL_GUIDE.md`             | Code examples use `jest.fn()`                                |
| `docs/testing/PROD_TESTS_GUIDE.md`            | References `jest-prod.config.cjs`                            |
| `.opencode/agents/code-reviewer.md`           | Testing checklist references Jest                            |
| `.opencode/agents/agent-orchestrator.md`      | Routing rules reference Jest                                 |
| `.opencode/agents/testing-specialist.md`      | Entire file describes Jest patterns                          |
| `.opencode/agents/action-plan-implementer.md` | E2E routing rule references Jest                             |
| `.opencode/agents/docs.md`                    | Agent description references Jest                            |
| `.github/agents/reviewer.agent.md`            | Coverage guidance references Jest                            |
| `.github/agents/testing.agent.md`             | Coverage expectations reference Jest                         |

## State Rules

| #   | Rule                                           | Detail                                                           |
| --- | ---------------------------------------------- | ---------------------------------------------------------------- |
| S1  | No `require()` in any source or test file      | Enforced by `import-x/no-commonjs` ESLint rule (already active). |
| S2  | No `module.exports` in any source or test file | Enforced by `import-x/no-commonjs` ESLint rule.                  |
| S3  | No `.cjs` files in the repository              | After migration, all config files use `.ts` or `.js` (ESM).      |
| S4  | No Jest dependencies in `package.json`         | All Jest packages removed.                                       |
| S5  | All test files use Vitest API                  | No `jest.*` calls remain.                                        |
| S6  | `tsconfig.json` emits ESM                      | `"module": "NodeNext"` or equivalent.                            |
| S7  | `package.json` has `"type": "module"`          | All `.js` files treated as ESM by default.                       |

## Non-Goals

- Migrating from `ts-node` to `tsx` (out of scope; `ts-node` ESM hooks are sufficient).
- Changing the NestJS version or framework.
- Adding new business logic or features.
- Restructuring the module system beyond what is required for ESM.
- Changing the Docker build pipeline or base image.

## Open Questions

| #   | Question                                                                                                           | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Does `@nestjs/testing`'s `TestingModule` work correctly under Vitest with ESM output?                              | **Research completed — conditional yes.** GitHub issue #17047 (May 2026) confirms that `TestingModule` DI fails when Vitest uses SWC/esbuild because they don't emit decorator metadata. However, our project uses `tsc` for compilation, which correctly emits metadata with `emitDecoratorMetadata: true`. The risk is that Vitest's default transformer may override `tsc` output. **Mitigation:** Configure Vitest to use `tsc` as the transformer (via `@analogjs/vite-plugin-angular` or similar), or validate in Phase 0 that the default Vitest transformer preserves metadata. If it doesn't, the fallback is to add explicit `@Inject()` decorators to all constructor parameters (significant code change). |
| Q2  | Does `nest build` (NestJS CLI) correctly produce ESM output when `tsconfig.json` is set to `"module": "NodeNext"`? | **Validation required.** The CLI uses `tsc` under the hood. Asset copying and watch mode need verification.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Q3  | Should Vitest workspace mode be used instead of multiple config files?                                             | **Resolved: Yes, use workspace mode (decision D7).** A single `vitest.workspace.ts` is cleaner. Fall back to separate configs only if workspace mode proves problematic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Q4  | How should the `llm-http-shim.cjs` mocking pattern be replaced?                                                    | **Resolved: Use `vi.mock()` in E2E setup (decision D8).** The shim file and `--require` approach are deleted. `vi.mock('@google/generative-ai')` in `vitest.e2e.setup.ts` replaces the prototype monkey-patch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Q5  | Does `reflect-metadata` work correctly under ESM?                                                                  | **Research completed — yes.** The `reflect-metadata` package is ESM-compatible. The key requirement is that it must be imported BEFORE any decorated classes are loaded. In ESM, import order is deterministic (static analysis), so importing it in the setup file or in `main.ts` before other imports will work correctly. No ESM-specific issues found in the `microsoft/reflect-metadata` repository.                                                                                                                                                                                                                                                                                                             |

## Risks

| #   | Risk                                                               | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------ | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | NestJS decorator metadata fails under ESM output                   | Low        | High   | Validate with a minimal NestJS app early (Phase 0). `emitDecoratorMetadata` is supported by `tsc` in ESM mode.                                                                                                                                                                                                                                                                                                                                                                                                  |
| R2  | `vi.mock()` hoisting behaves differently from `jest.mock()` in ESM | Medium     | Medium | Vitest explicitly supports ESM mock hoisting. Test with the most complex mock patterns first (`gemini.service.spec.ts`, `bootstrap.spec.ts`).                                                                                                                                                                                                                                                                                                                                                                   |
| R3  | `tsconfig-paths` does not resolve path aliases under Vitest ESM    | Low        | Medium | Vitest has built-in path alias support via `resolve.alias` in config. Configure explicitly.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| R4  | E2E child process spawning fails with ESM entry point              | Low        | High   | The child process runs the built `dist/` output. Validate that `node dist/src/testing-main.js` starts correctly with `"type": "module"`.                                                                                                                                                                                                                                                                                                                                                                        |
| R5  | Some npm scripts or CI steps reference Jest directly               | Medium     | Low    | Grep for all `jest` references in scripts, CI configs, and documentation. Section 12 enumerates all documentation files.                                                                                                                                                                                                                                                                                                                                                                                        |
| R6  | `reflect-metadata` import ordering breaks under ESM                | Low        | High   | Research confirms `reflect-metadata` is ESM-compatible. Ensure `import 'reflect-metadata'` is the FIRST import in `main.ts` and `vitest.setup.ts` before any NestJS imports. Validate in Phase 0.                                                                                                                                                                                                                                                                                                               |
| R7  | `verify:assessor` script breaks under `"type": "module"`           | Medium     | Low    | The script uses `ts-node` without `--esm`. Update the npm script to include `--esm` flag or migrate to `tsx`.                                                                                                                                                                                                                                                                                                                                                                                                   |
| R8  | Vitest's default transformer doesn't preserve decorator metadata   | Medium     | High   | **Research finding:** GitHub issue #17047 confirms that Vitest with SWC/esbuild fails to emit decorator metadata, breaking NestJS DI. Our project uses `tsc` which emits metadata correctly, but Vitest's default transformer may override this. **Mitigation:** In Phase 0, validate that Vitest's default transformer preserves metadata. If not, configure Vitest to use `tsc` as the transformer, or add explicit `@Inject()` decorators to all constructor parameters (fallback, significant code change). |

## Success Criteria

1. `npm run build` produces ESM output in `dist/`.
2. `node dist/src/main.js` starts the application successfully.
3. `npm run test` runs all unit/integration tests via Vitest and all pass.
4. `npm run test:e2e:mocked` runs E2E tests via Vitest and all pass.
5. `npm run test:e2e:live` runs live E2E tests via Vitest and all pass.
6. `npm run test:prod` runs production tests via Vitest and all pass.
7. `npm run lint` passes with no Jest-specific overrides or `.cjs` exceptions.
8. Zero `.cjs` files remain in the repository (excluding `node_modules`).
9. Zero `require()` or `module.exports` in any source, test, or config file.
10. `package.json` has `"type": "module"` and no Jest dependencies.
