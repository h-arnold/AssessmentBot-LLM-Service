# Research Findings Summary

## Date: 2026-07-04

## Purpose

Research critical assumptions before proceeding with Jest → Vitest migration and full ESM adoption.

---

## 1. CI Node Version Update

**Decision:** Update CI from Node 22 to Node 24

**Rationale:**

- Dockerfile already uses `node:24-alpine`
- Eliminates technical debt from keeping `unicorn/prefer-uint8array-base64` ESLint override
- Node 24 supports `Uint8Array.fromBase64()` natively
- Aligns CI environment with production environment

**Impact:**

- Remove `unicorn/prefer-uint8array-base64: 'off'` override from `eslint.config.js`
- Update `.github/workflows/ci.yml` lines 19, 41, 69: `node-version: '22'` → `node-version: '24'`

---

## 2. NestJS TestingModule + Vitest Compatibility

**Research Source:** GitHub issue nestjs/nest#17047 (opened 2026-05-28, closed 2026-06-03)

**Finding:**

- **Critical Issue:** Vitest with SWC/esbuild fails to emit decorator metadata
- **Root Cause:** SWC and esbuild don't support `emitDecoratorMetadata` TypeScript compiler option
- **Symptom:** `TestingModule` dependency injection fails — injected services become `undefined`
- **Affected Scenarios:** Constructor injection without explicit `@Inject()` decorators

**Why This Matters for Our Project:**

- Our project uses `tsc` (TypeScript compiler) which DOES emit decorator metadata correctly
- However, Vitest's default transformer may override `tsc` output
- If Vitest uses SWC/esbuild internally, we'll hit this issue

**Mitigation Strategy (Phase 0 Validation):**

1. Test `TestingModule` with constructor injection (no `@Inject()` decorators)
2. If DI fails, two options:
   - **Option A:** Configure Vitest to use `tsc` as transformer (preserves metadata)
   - **Option B:** Add explicit `@Inject()` decorators to all constructor parameters (significant code change)

**Risk Level:** HIGH — Could require adding `@Inject()` to 50+ constructor parameters

**Status:** Requires validation in Phase 0 before proceeding

---

## 3. reflect-metadata ESM Compatibility

**Research Source:** microsoft/reflect-metadata repository issues, Node.js ESM documentation

**Finding:**

- `reflect-metadata` is fully ESM-compatible
- No ESM-specific issues found in the repository
- Key requirement: Must be imported BEFORE any decorated classes are loaded

**ESM Import Order:**

- ESM has deterministic import order (static analysis)
- Importing `reflect-metadata` first in setup files or entry points works correctly
- No special handling needed beyond ensuring it's the first import

**Implementation:**

- Add `import 'reflect-metadata'` as first line in:
  - `src/main.ts`
  - `src/testing-main.ts`
  - `vitest.setup.ts`
  - `vitest.e2e.setup.ts`

**Risk Level:** LOW — Well-understood, straightforward implementation

---

## 4. Updated Documentation

### SPEC.md Updates

- **Section 8 (CI/CD):** Added Node version update from 22 → 24
- **Section 7 (ESLint):** Changed `unicorn/prefer-uint8array-base64` from "keep" to "remove"
- **Open Questions:**
  - Q1 updated with research findings on TestingModule compatibility
  - Q5 added: reflect-metadata ESM compatibility (resolved: yes)
- **Risks:**
  - R6 updated: reflect-metadata is ESM-compatible, just needs correct import order
  - R8 added: Vitest transformer decorator metadata issue (HIGH risk)

### ACTION_PLAN.md Updates

- **Section 0 (Phase 0):**
  - Added acceptance criterion #6: Vitest transformer preserves decorator metadata
  - Enhanced validation step #2 with detailed TestingModule DI test
  - Updated blockers section with TestingModule failure scenarios
- **Section 5 (ESLint):** Updated to remove `unicorn/prefer-uint8array-base64` override
- **Section 6 (CI/CD):** Added Node version update step

---

## 5. Critical Path Items

### Must Validate in Phase 0

1. ✅ NestJS ESM compilation with `emitDecoratorMetadata`
2. ⚠️ **TestingModule DI with Vitest (CRITICAL)**
3. ✅ `nest build` ESM output
4. ✅ `reflect-metadata` import ordering

### Potential Blockers

- If Vitest transformer doesn't preserve decorator metadata:
  - **Option A:** Configure Vitest to use `tsc` (preferred)
  - **Option B:** Add `@Inject()` decorators (fallback, requires user approval)

---

## 6. Next Steps

1. **Proceed with Phase 0 validation** — focus on TestingModule DI test
2. **Document TestingModule test result** before proceeding to Section 1
3. **If DI fails:** Present options to user before continuing
4. **If DI passes:** Continue with migration as planned

---

## 7. References

- GitHub Issue: https://github.com/nestjs/nest/issues/17047
- NestJS Vitest Recipe: https://docs.nestjs.com/recipes/vitest
- reflect-metadata: https://github.com/microsoft/reflect-metadata
- Node.js ESM: https://nodejs.org/api/esm.html
