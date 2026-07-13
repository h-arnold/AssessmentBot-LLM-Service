# Feature Delivery Plan (TDD-First) — API-Key Strict Format & Logging Hardening

> **Live implementation status**
>
> - **Current section / phase:** Section 1 — Config schema — COMPLETE (red/green/review/regression/commit). Now starting Section 2 — `ApiKeyService` strict validate + logging hardening.
> - **Baseline (established manually; `regression-checker` CLI tooling is absent from this repo):**
>   - `npm run lint` → PASS
>   - `npm run lint:british` → PASS
>   - `npm run build` → PASS
>   - `npm test` (unit) → PASS (210 tests)
>   - `npm run test:e2e` → PASS (44 passed, 1 todo)
> - **Regression signal:** the `regression-checker` skill's `npm run regression-checker` / `scripts/builder` tooling is not present in this checkout, so the equivalent manual commands above are used as the regression gate for each phase.

## Read-First Context

Before writing or executing this plan:

1. Read the current `SPEC.md` (root). It is the source of truth for product behaviour, contracts, and scope boundaries.
2. Read `CODE_REVIEW.md` findings H1, H2, and L1, plus the permissive-format concern in `§1.H1`.
3. Read the relevant current implementations before touching them:
   - `src/config/environment.schema.ts` (Zod `configSchema`),
   - `src/config/config.service.ts` (`ConfigService`, Zod-error path),
   - `src/auth/api-key.service.ts` (current `validate` + logging),
   - `src/auth/api-key.strategy.ts` (delegating `verify` callback),
   - `src/config/throttler.config.ts` (compile-time `configSchema.parse(process.env)`),
   - `test/utils/app-lifecycle.ts` and `test/auth.e2e-spec.ts` (E2E key fixtures).
4. Use this action plan only to sequence delivery and testing; do not restate material settled in the spec.

## Scope and assumptions

### Scope

- `src/config/environment.schema.ts` — add `API_KEY_PREFIX` + strict `API_KEYS` validation.
- `src/auth/api-key.service.ts` — strict validate flow, opaque-WARN / DEBUG-full split, H2 count-only, `Set` membership.
- New `src/common/utils/crypto.utilities.ts` (+spec) and `scripts/generate-api-key.ts` (+`package.json` script).
- E2E fixture regeneration in `test/utils/app-lifecycle.ts`, `test/auth.e2e-spec.ts`, and any other `test/` literal keys.
- `.env.example` and `docs/configuration/environment.md` documentation.

### Out of scope

- Per-API-key throttling (M2), `LogRedactor` `x-api-key` coverage (L3), unused-dep removal (L2), success-path hashing, key checksums, key issuance/rotation tooling beyond the one-shot generator.
- No changes to `src/auth/api-key.strategy.ts` behaviour (it already delegates to the service). It is only re-read for context.

### Assumptions

1. The project remains on ESM with `NodeNext`; all new relative imports carry explicit `.js` extensions and JSON imports use `with { type: 'json' }`.
2. The installed `zod ^4.3.6` exposes the top-level `z.base64url()` format (verified in `node_modules/zod/v4/classic/schemas.js`). Use `z.base64url().length(32)`; do not use Zod v3-style `z.string().base64url()`.
3. `API_KEY_PREFIX` default (`abt_`) and `API_KEYS` optional-with-no-op-when-undefined keep the compile-time `configSchema.parse(process.env)` in `throttler.config.ts` valid when `process.env` lacks those keys.
4. This is an agreed **breaking change**: existing configured keys without the prefix abort startup after the schema change; E2E fixtures must be regenerated in the same plan.

---

## Global constraints and quality gates

### Engineering constraints

- Keep `ApiKeyStrategy` and the HTTP entry point thin; all validation and logging logic lives in `ApiKeyService`.
- Fail fast on invalid configured keys (Zod config validation aborts startup).
- No new runtime dependencies. Use `node:crypto` (already used via `randomInt` in `src/llm/llm.service.interface.ts`), `zod` (already present), NestJS `Logger` (per AGENTS.md logging rules), and `validator` only if explicitly chosen (spec chose Zod — do not introduce `validator` for this).
- No hand-written regular expression in the validation path. The body is validated with `z.base64url()`; the prefix is a `startsWith` check. The only permitted regex is the existing one for `API_KEY_PREFIX` charset (`/^[A-Za-z0-9_-]+$/`) used to validate the prefix configuration value itself.
- Use British English in all code comments, JSDoc, commit messages, and docs. Do not introduce `behavior`/`prioritize`/etc.
- Do not disable or override any ESLint rule (including `eslint-plugin-security` / `eslint-plugin-no-secrets`) without explicit authorisation. If a lint override is truly unavoidable, document the authorisation inline and in the section notes.

### TDD workflow (mandatory per section)

For each section: **Red** (failing tests) → **Green** (smallest change to pass) → **Refactor** (keep tests green) → run the section's verification commands.

### Delegation mandatory-read gate (mandatory for sub-agent execution)

For each delegated phase, require the sub-agent handoff to include `Files read` with explicit file paths, and block progression if any mandatory file is missing.

Testing Specialist mandatory docs (every section that delegates tests):

- `SPEC.md`
- `CODE_REVIEW.md`
- The current file(s) under test for that section.

Implementation mandatory docs:

- `SPEC.md`
- `AGENTS.md`
- `docs/development/code-style.md`
- The current implementation file(s) for that section.

Code Reviewer mandatory docs:

- `SPEC.md`
- `CODE_REVIEW.md`
- `AGENTS.md`
- All files changed in the section.

Docs mandatory docs:

- `SPEC.md`
- `.env.example`, `docs/configuration/environment.md` (as applicable).

### Validation commands hierarchy

- Lint: `npm run lint`
- British-English check: `npm run lint:british`
- Build: `npm run build`
- Unit tests: `npm test` (=`vitest run --project unit`)
- Targeted unit tests: `npm test -- src/auth/api-key.service.spec.ts` (vitest filters by path substring)
- E2E tests: `npm run test:e2e` (=`npm run build && vitest run --project e2e`)
- Targeted E2E: `npm run test:e2e -- test/auth.e2e-spec.ts`
- Coverage: `npm run test:cov`

---

## Section 1 — Config schema: `API_KEY_PREFIX` + strict `API_KEYS` validation

### Objective

- Make the Zod `configSchema` the authoritative, fail-fast gate for the new key format, before any service or E2E work depends on it.

### Constraints

- Add `API_KEY_PREFIX: z.string().regex(/^[A-Za-z0-9_-]+$/).default(DEFAULT_API_KEY_PREFIX)` and export `DEFAULT_API_KEY_PREFIX` (value `'abt_'`) from `src/config/environment.schema.ts`.
- Replace the `API_KEYS` `.refine` with an **object-level `.superRefine`** on `configSchema` that, for each `API_KEYS` entry, enforces `entry.startsWith(data.API_KEY_PREFIX)` and `z.base64url().length(32).safeParse(entry.slice(prefix.length)).success`; it must be a no-op when `API_KEYS` is `undefined`.
- Do not break the compile-time `configSchema.parse(process.env)` path in `throttler.config.ts`: a bare `process.env` without `API_KEYS`/`API_KEY_PREFIX` must still parse (defaults apply; no-op refine).
- The object-level `superRefine` **must return early (no-op) when `API_KEYS` is `undefined`** — this is the invariant that keeps `throttler.config.ts`'s module-eval parse of bare `process.env` valid in CI/container builds where `.env` is not loaded. Only a present-but-malformed `API_KEYS` aborts.

### Delegation mandatory reads

Testing Specialist mandatory docs: `SPEC.md`, `CODE_REVIEW.md`, `src/config/environment.schema.ts`, `src/config/config.service.ts`.
Implementation mandatory docs: `SPEC.md`, `CODE_REVIEW.md`, `AGENTS.md`, `docs/development/code-style.md`, `src/config/environment.schema.ts`, `src/config/throttler.config.ts`.
Code Reviewer mandatory docs: `SPEC.md`, `CODE_REVIEW.md`, `AGENTS.md`, `src/config/environment.schema.ts`.

### Shared helper plan

1. Helper: `DEFAULT_API_KEY_PREFIX` constant.
   - Decision: `new`.
   - Owning path: `src/config/environment.schema.ts` (exported).
   - Call-site rationale: schema default + CLI generator import; avoids duplicating the default across modules.
   - Relevant canonical doc target: N/A (the constant is documented at its definition site and referenced from the generator CLI docs in Section 5; no separate canonical "helpers" doc entry is warranted for a single exported constant).
   - Planned doc status: not applicable.

No shared helper beyond this constant is introduced in Section 1.

### Acceptance criteria

- `configSchema.parse({ ...validEnv, API_KEYS: 'abt_<32-char-base64url-body>' })` succeeds.
- `configSchema.parse({ ...validEnv, API_KEY_PREFIX: 'abt_', API_KEYS: 'abt_short' })` throws a ZodError (body too short).
- `configSchema.parse({ ...validEnv, API_KEY_PREFIX: 'abt_', API_KEYS: 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx' })` throws (wrong prefix).
- `configSchema.parse({ ...validEnv, API_KEY_PREFIX: 'abt_', API_KEYS: 'abt_<not!base64url>...' })` throws (bad body charset/length).
- `configSchema.parse({ ...validEnv })` (no `API_KEYS`, no `API_KEY_PREFIX`) succeeds with `API_KEY_PREFIX === 'abt_'` and `API_KEYS === undefined` (compile-time path safety).
- Custom prefix is honoured: `configSchema.parse({ ...validEnv, API_KEY_PREFIX: 'custom_', API_KEYS: 'custom_<32-char-base64url>' })` succeeds, while the same prefix with `'custom_<bad-body>'` throws and `'abt_<good-32-char-body>'` throws (wrong prefix for the configured prefix).
- `DEFAULT_API_KEY_PREFIX` is exported and equals `'abt_'`.

### Required test cases (Red first)

Backend schema tests (`src/config/config.environment-example.spec.ts` or a focused new `src/config/environment.schema.spec.ts`):

1. `API_KEY_PREFIX` defaults to `'abt_'` when absent.
2. Accepts a single fully-valid key `abt_` + 32 base64url chars.
3. Accepts multiple comma-separated fully-valid keys.
4. Rejects a key missing the prefix (`ghp_...`).
5. Rejects a key with the prefix but a body of 31 base64url chars (length boundary).
6. Rejects a key with the prefix but a body containing non-base64url characters (e.g., `!`).
7. The enforcement is a no-op when `API_KEYS` is `undefined` (no throw).
8. `DEFAULT_API_KEY_PREFIX` export equals `'abt_'`.
9. Custom prefix honoured: `API_KEY_PREFIX: 'custom_'` accepts `custom_<32-char-base64url>`, rejects `custom_<bad-body>`, and rejects `abt_<good-32-char-body>` (wrong prefix for the configured prefix).

### Section checks

- `npm test -- src/config/environment` green.
- `npm run build` green (this exercises `throttler.config.ts`'s compile-time `configSchema.parse(process.env)` against bare `process.env`).
- `npm run lint` and `npm run lint:british` green on changed files.
- Mandatory-read evidence gate passed for any delegated handoffs.
- Shared-helper planning entry recorded above; no separate canonical-doc entry required for the `DEFAULT_API_KEY_PREFIX` constant (documented at definition site + Section 5 CLI docs).

### Optional `@remarks` JSDoc follow-through

- Add a `@remarks` on `DEFAULT_API_KEY_PREFIX` / the `API_KEYS` superRefine noting: the validation is a no-op when `API_KEYS` is undefined so the compile-time `throttler.config.ts` parse of bare `process.env` stays valid; only a present-but-malformed `API_KEYS` is a hard error.

### Implementation notes / deviations / follow-up

- **Implementation notes:** `DEFAULT_API_KEY_PREFIX = 'abt_'` exported; `API_KEY_PREFIX` field added with `/^[A-Za-z0-9_-]+$/` regex + default; loose `API_KEYS` `.refine` removed and replaced by an object-level `.superRefine` (no-op when `API_KEYS === undefined`, otherwise per-entry `startsWith(prefix)` + `z.base64url().length(32)` body). Five other unit-test fixtures (`vitest.setup.ts`, `config.service.spec.ts`, `config.module.spec.ts`, `auth.module.spec.ts`, `assessor.service.spec.ts`) were updated from the old loose key format to the strict `abt_` + 32 base64url format so the full unit suite stays green under the now-strict schema.
- **Deviations from plan:** None material. `code: 'custom'` string literal used (acceptable in Zod v4) rather than `z.ZodIssueCode.custom`. `validEnv`/`validEnvironment` and `toString('base64url')`/`base64urlSlice()` tweaks were lint-driven in the test file.
- **Follow-up:** Section 2 depends on `API_KEY_PREFIX` being available via `ConfigService.get('API_KEY_PREFIX')` (now satisfied). Section 4 must update `test/utils/app-lifecycle.ts` E2E fixtures (still old format) or E2E will fail. Mock-backed specs (`gemini`/`llm`/`assessor.module`) still pass `API_KEYS: 'test-api-key'` through mocked `ConfigService`s (bypassing the schema) — harmless but format-inconsistent; align in a follow-up if desired.

---

## Section 2 — `ApiKeyService`: strict validate + logging hardening + `Set` membership

### Objective

- Rewrite `ApiKeyService.validate` to the prefix + `z.base64url().length(32)` + `Set.has` flow; implement opaque-WARN / DEBUG-full split (H1) and H2 count-only startup log; use a `Set` for membership (L1 + Perf-M).

### Constraints

- This is a constructor-signature change: `ApiKeyService` must additionally call `configService.get('API_KEY_PREFIX')` (default `'abt_'` is supplied by Section 1's schema, so the value is always defined). Update `api-key.service.spec.ts`'s mock `ConfigService.get` to return `'abt_'` (or a custom prefix under test) in addition to the prefixed `API_KEYS` array.
- Construct once in the constructor: `this.apiKeyPrefix`, the Zod body schema (`z.base64url().length(32)`), the retained `this.apiKeys` array (for the count + empty-check), and `this.apiKeySet = new Set(this.apiKeys)`.
- `validate()` flow exactly as specified in `SPEC.md` §"Authentication of an incoming request":
  1. **Explicit non-string/empty guard first** — `if (typeof apiKey !== 'string' || apiKey.length === 0 || !apiKey.startsWith(this.apiKeyPrefix))` → opaque WARN `'API key is missing or has an invalid format.'` → throw `UnauthorizedException('Invalid API key')`. Do not rely on Zod for the prefix/empty check, since `null`/`undefined`/numbers proceeding straight to `.startsWith()` would throw a `TypeError` instead of the intended `UnauthorizedException`.
  2. Slice body; `if (!this.bodySchema.safeParse(body).success)` → the **same** opaque WARN → throw.
  3. `this.apiKeySet.has(presentedKey)` → `logger.log('API key authentication attempt successful')` → return `{ apiKey: presentedKey }`.
  4. Else → `logger.warn('Authentication failed: invalid API key presented')` (opaque) + `logger.debug(\`Invalid API key: ${presentedKey}\`)`(full value) → throw`UnauthorizedException('Invalid API key')`.
- Both format-rejection branches emit the identical opaque WARN (no format oracle).
- H2: replace `this.logger.debug(\`Loaded API keys: ${JSON.stringify(this.apiKeys)}\`)` with `this.logger.debug(\`Loaded ${this.apiKeys.length} API key(s)\`)`.
- Preserve the existing empty-keys WARN `'No API keys configured. All requests will be unauthorised.'`.
- Do **not** change `src/auth/api-key.strategy.ts` behaviour.

### Delegation mandatory reads

Testing Specialist mandatory docs: `SPEC.md`, `CODE_REVIEW.md`, `src/auth/api-key.service.ts`, `src/auth/api-key.service.spec.ts`.
Implementation mandatory docs: `SPEC.md`, `CODE_REVIEW.md`, `AGENTS.md`, `docs/development/code-style.md`, `src/auth/api-key.service.ts`, `src/config/environment.schema.ts`.
Code Reviewer mandatory docs: `SPEC.md`, `CODE_REVIEW.md`, `AGENTS.md`, `src/auth/api-key.service.ts`, `src/auth/api-key.service.spec.ts`.

### Shared helper plan

1. Helper: reusable Zod body validator `z.base64url().length(32)`.
   - Decision: `keep local` (construct inline in the service; Section 1 reuses the same expression for the schema superRefine).
   - Owning path: `src/auth/api-key.service.ts` (instance field).
   - Call-site rationale: trivial expression; no shared module warranted.
   - Relevant canonical doc target: none.
   - Planned doc status: not applicable (kept local).

### Acceptance criteria

- A valid prefixed key authenticates and returns `{ apiKey }`.
- A foreign-prefix secret (`ghp_…`, an AWS `AKIA…`, a random password) is rejected at the prefix check (step 1) with `UnauthorizedException`; the WARN log does **not** contain the secret value.
- A correct-prefix-but-invalid-body key (too short, or non-base64url charset) is rejected at body validation (step 2) with the **identical** opaque WARN; no value echoed.
- A correct-format-but-unconfigured key is rejected; WARN is opaque (`Authentication failed: invalid API key presented`) and does **not** contain the key; the DEBUG log **does** contain the full key.
- Format-rejection WARN and membership-failure WARN are both opaque (no key value, no hash).
- `Set`-based membership is used (`apiKeySet.has(...)`); the configured array is retained only for the count/empty check.
- H2 startup DEBUG line is `Loaded <N> API key(s)` and contains no key value.
- `api-key.service.spec.ts` updated: the mock `ConfigService` returns `'abt_'` for `API_KEY_PREFIX` and a prefixed-format `API_KEYS` array (32-char base64url bodies).

### Required test cases (Red first)

`src/auth/api-key.service.spec.ts` (update the mock `ConfigService` to return a valid prefix and prefix-format keys):

1. Accepts a valid prefixed configured key; returns `{ apiKey }`; logs `'API key authentication attempt successful'`.
2. Rejects `undefined`/`null`/`''`/a number presented as the key with `UnauthorizedException` and the opaque WARN (non-string/empty guard at step 1 — no `TypeError`).
3. Rejects a foreign-format secret (`ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`); throws `UnauthorizedException`; `logger.warn` called with opaque message that does **not** include the secret; `logger.debug` not called with the secret.
4. Rejects a key with the prefix but a too-short body; throws; opaque WARN; no value echoed.
5. Rejects a key with the prefix but a non-base64url body; throws; opaque WARN; no value echoed.
6. Rejects a correct-format-but-unconfigured key; throws; WARN is opaque and excludes the value; DEBUG contains the full value.
7. Honour `API_KEY_PREFIX`: a valid base64url body with a different prefix (e.g. `xyz_…`) is rejected at the prefix step.
8. Membership uses `Set.has`: a second configured key authenticates; an unconfigured key does not.
9. H2: constructor logs `'Loaded <N> API key(s)'` at DEBUG and the log string does **not** contain any configured key value.
10. Empty configured keys still triggers the `'No API keys configured …'` WARN (unchanged behaviour).

### Section checks

- `npm test -- src/auth/api-key.service` green.
- `npm run build` green.
- `npm run lint` and `npm run lint:british` green on changed files.
- Mandatory-read evidence gate passed for delegated handoffs.
- **ESLint note (verified):** `eslint-plugin-no-secrets` (`'no-secrets/no-secrets': 'error'` in `eslint.config.js`) inspects string/template **literals** for high-entropy content. The DEBUG-full line `logger.debug(\`Invalid API key: ${presentedKey}\`)` interpolates a **variable**, not a secret literal, so the rule is not expected to fire on it. Do **not** add a lint-suppression comment pre-emptively (AGENTS.md forbids overriding quality gates without explicit authorisation). If during implementation the rule does fire (e.g., because a literal test fixture triggers it), escalate to the user before suppressing — do not self-authorise an override. Keep fixture key literals out of production source (use the generator to mint test keys) so the rule is not tripped on test files.

### Optional `@remarks` JSDoc follow-through

- Add a `@remarks` on `ApiKeyService.validate` documenting: (a) the opaque-WARN choice prevents secret leakage at the production `info` log level; (b) the DEBUG-full line is an accepted-risk troubleshooting escape hatch — an attacker with debug-level log access already effectively has host access (per SPEC §Agreed product decisions #4); (c) both format branches use the same opaque message to avoid a format oracle.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled when done)_
- **Deviations from plan:** _(filled when done)_
- **Follow-up:** Section 3 (generator) reuses `DEFAULT_API_KEY_PREFIX` from Section 1; Section 4 (E2E fixtures) depends on this section's enforcement.

---

## Section 3 — Key generator helper + CLI script

### Objective

- Provide operators a cryptographically secure way to mint keys matching the new format, mitigating the breaking change.

### Constraints

- `src/common/utils/crypto.utilities.ts` exports `generateApiKey(prefix: string): string` returning `prefix + crypto.randomBytes(24).toString('base64url')` (exactly 32 base64url chars).
- Use `import { randomBytes } from 'node:crypto';` (named import, per existing `randomInt` usage in `src/llm/llm.service.interface.ts`).
- `scripts/generate-api-key.ts` imports `DEFAULT_API_KEY_PREFIX` from `'../src/config/environment.schema.js'` (explicit ESM `.js` path) and prints one key for `process.env.API_KEY_PREFIX ?? DEFAULT_API_KEY_PREFIX`. It must not import NestJS or call `ConfigService`.
- Add `package.json` script `"generate:api-key": "node --experimental-strip-types scripts/generate-api-key.ts"`. Confirmed: the project has **no** `tsx`/`ts-node` devDependency, runs on `node:24-alpine` (>=22.6 supports `--experimental-strip-types`), and the only existing `scripts/` entry (`health-check.js`) is plain JS — so `node --experimental-strip-types` is the correct, dependency-free runner for the `.ts` script. No shebang or `chmod +x` is required because it is invoked via `node`, not executed directly.
- Co-locate `src/common/utils/crypto.utilities.spec.ts` with the util.

### Delegation mandatory reads

Testing Specialist mandatory docs: `SPEC.md`, `src/common/utils/crypto.utilities.ts` (new), `scripts/generate-api-key.ts` (new).
Implementation mandatory docs: `SPEC.md`, `AGENTS.md`, `docs/development/code-style.md`, `src/config/environment.schema.ts`.
Code Reviewer mandatory docs: `SPEC.md`, `AGENTS.md`, `src/common/utils/crypto.utilities.ts`, `scripts/generate-api-key.ts`, `package.json`.

### Shared helper plan

1. Helper: `generateApiKey(prefix)`.
   - Decision: `new`.
   - Owning path: `src/common/utils/crypto.utilities.ts`.
   - Call-site rationale: CLI script + future tooling; small, pure, unit-testable.
   - Relevant canonical doc target: `docs/configuration/environment.md`.
   - Planned doc status: `Not implemented`.

### Acceptance criteria

- `generateApiKey('abt_')` returns a string beginning with `abt_` whose body is exactly 32 base64url chars and passes `z.base64url().length(32).safeParse`.
- Two calls produce different bodies (CSPRNG non-determinism at call level).
- Running `npm run generate:api-key` prints exactly one line to stdout that satisfies the above.
- Running with `API_KEY_PREFIX=custom_ npm run generate:api-key` prints a `custom_`-prefixed key.

### Required test cases (Red first)

`src/common/utils/crypto.utilities.spec.ts`:

1. Output starts with the given prefix.
2. Output body length is 32 and matches `z.base64url().length(32)`.
3. Two consecutive calls produce distinct bodies.
4. `generateApiKey` with a prefix containing no regex metachars still behaves (and a custom prefix is honoured).

### Section checks

- `npm test -- src/common/utils/crypto.utilities.spec.ts` green.
- `npm run generate:api-key` prints a valid key (manual/CI smoke).
- `npm run build` green.
- `npm run lint` and `npm run lint:british` green.
- Mandatory-read evidence gate passed.

### Optional `@remarks` JSDoc follow-through

- `@remarks` on `generateApiKey`: body is `randomBytes(24).toString('base64url')` = 192 bits of entropy, matching the validator in Sections 1–2 exactly; do not shorten the body without updating both the schema validator and the service validator.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled when done)_
- **Deviations from plan:** _(filled when done)_
- **Follow-up:** Section 5 docs will reference the `generate:api-key` command.

---

## Section 4 — E2E fixture regeneration

### Objective

- Keep all authenticated E2E tests passing under the new enforced format.

### Constraints

- Regenerate API-key literals to the prefix format in `test/utils/app-lifecycle.ts` (`API_KEYS: 'test-api-key,test-api-key-2'` → two valid `abt_…` keys), and any other `test/**` literal keys (search `test/` for `Bearer`, `API_KEYS`, `apiKey`).
- **Also check `.test.env`** (loaded at runtime by `app-lifecycle.ts:79` if present; merge order is `process.env < defaults < .test.env < overrides`). The repo ships only `.test.env.example` (no `API_KEYS`), but a contributor's local `.test.env` may contain unprefixed `API_KEYS` which would override the prefixed defaults and abort app startup via config validation. If a local `.test.env` exists with `API_KEYS`, regenerate them to the prefixed form; update `.test.env.example`'s comment to note the required format if it ever references `API_KEYS`.
- Update `test/auth.e2e-spec.ts` constants (`INVALID_API_KEY = 'invalid_key'`) — keep an explicit _invalid-format_ sample and add an explicit _correct-format-but-unconfigured_ sample.
- Do not weaken existing E2E assertions; add assertions that a non-prefixed/foreign key yields `401`.

### Delegation mandatory reads

Testing Specialist mandatory docs: `SPEC.md`, `test/utils/app-lifecycle.ts`, `test/auth.e2e-spec.ts`.
Implementation mandatory docs: `SPEC.md`, `AGENTS.md`, `docs/testing/E2E_GUIDE.md`, `test/utils/app-lifecycle.ts`, `test/utils/log-watcher.ts`.

### Shared helper plan

None (no new shared helper; fixture values only).

### Acceptance criteria

- `npm run test:e2e` is green.
- `test/auth.e2e-spec.ts` asserts: a foreign-prefix key returns `401`; a correct-prefix-but-invalid-body key returns `401`; a correct-format-but-unconfigured key returns `401`; a valid prefixed key authenticates.
- `test/throttler.e2e-spec.ts`, `test/main.e2e-spec.ts`, and any other `test/**` using `app.apiKey` still pass with the regenerated prefixed fixtures.

### Required test cases (Red first)

E2E (`test/auth.e2e-spec.ts` additions — write failing first):

1. A `Bearer ghp_<32 chars>` request returns `401` (foreign prefix rejected at step 1).
2. A `Bearer abt_<31 chars>` request returns `401` (bad body length rejected at step 2).
3. A `Bearer abt_<32 chars containing non-base64url such as ! or .>` request returns `401` (bad body charset rejected at step 2).
4. A `Bearer abt_<32 valid base64url but not in API_KEYS>` request returns `401` (correct format, not configured → membership failure).
5. The valid configured prefixed key authenticates (existing assertion, now using the regenerated fixture).

### Section checks

- `npm run test:e2e -- test/auth.e2e-spec.ts` green.
- `npm run test:e2e` green (full E2E, since throttler/main reuse the fixtures).
- Mandatory-read evidence gate passed.

### Optional `@remarks` JSDoc follow-through

None (test fixtures).

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled when done)_
- **Deviations from plan:** _(filled when done)_
- **Follow-up:** must run after Sections 1 and 2 land; otherwise all authenticated E2E fails with `401`.

---

## Section 5 — Documentation and rollout

### Objective

- Update operator-facing docs to the new format, the breaking-change migration, and the generator.

### Constraints

- `.env.example`: add `API_KEY_PREFIX` (default `abt_`) above `API_KEYS`; replace the `API_KEYS` example with a prefixed form (`API_KEYS=abt_<32-char-base64url-body>`); replace the existing "Key Generation Guidance" lines (which recommend `openssl rand -base64 32`) with: "Key Generation: Use `npm run generate:api-key` to mint a key in the required format (`<prefix><32-char base64url body>`). The default prefix is `abt_`; override with `API_KEY_PREFIX=custom_ npm run generate:api-key`."
- `docs/configuration/environment.md`: document `API_KEY_PREFIX`, the required `<PREFIX><32-char base64url>` format, the `npm run generate:api-key` command, rotation, and the **breaking-change** migration (regenerate `API_KEYS` before redeploying; unprefixed configured keys abort startup).
- Reconcile the `generateApiKey` helper entry to status `Implemented` once delivered (the `DEFAULT_API_KEY_PREFIX` constant is documented at its definition site; no separate canonical-doc entry was planned for it).

### Delegation mandatory reads

Docs mandatory docs: `SPEC.md`, `.env.example`, `docs/configuration/environment.md`.

### Acceptance criteria

- `.env.example` shows `API_KEY_PREFIX` and a prefixed `API_KEYS` example; no plaintext real keys.
- `docs/configuration/environment.md` documents the format, the generator command, and the migration caveat.
- All earlier sections' `Not implemented` helper entries are reconciled to `Implemented`.

### Required checks

1. `npm run lint:british` green on docs.
2. Docs mention the breaking-change migration.
3. Mandatory-read evidence gate passed for delegated docs handoff.

### Optional `@remarks` JSDoc review

- Confirm the `@remarks` planned in Sections 1–3 were added before deleting this action plan.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled when done)_
- **Deviations from plan:** _(filled when done)_

---

## Regression and contract hardening

### Objective

- Confirm no regressions across the touched surfaces and that the new auth boundary contract holds end-to-end.

### Constraints

- Prefer focused runs before the broad suite, per the hierarchy in "Validation commands hierarchy".

### Acceptance criteria

- `npm run lint`, `npm run lint:british`, `npm run build`, `npm test`, and `npm run test:e2e` all green.
- No ESLint quality-gate overrides introduced without explicit authorisation recorded in section notes (see Section 2's verified ESLint note: the DEBUG-full line is not expected to trip `no-secrets/no-secrets` because it interpolates a variable, not a secret literal).

### Required test cases/checks

1. `npm test -- src/config/environment` and `npm test -- src/auth/api-key.service` and `npm test -- src/common/utils/crypto.utilities.spec.ts` green.
2. `npm run test:e2e -- test/auth.e2e-spec.ts` green.
3. `npm run test:e2e` green (throttler + main reuse auth fixtures).
4. `npm run lint` and `npm run lint:british` green.
5. `npm run build` green.
6. Verify mandatory-read evidence (`Files read`) is complete for every delegated regression handoff.

### Section checks

- Run the commands above and ensure green results.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled when done)_
- **Deviations from plan:** _(filled when done)_

---

## Rollout summary

### Objective

- (Per-section documentation happens in Section 5.) Capture the global rollout messaging here only.

### Constraints

- Do not duplicate Section 5's doc edits; this section records the rollout caveat only.

### Acceptance checks

1. Rollout notes call out the **breaking change**: operators must regenerate `API_KEYS` to the `abt_…` format (via `npm run generate:api-key`) before redeploying; unprefixed configured keys abort startup via config validation.
2. Spec/action-plan deviations recorded in each section's implementation notes.
3. Shared-helper entries reconciled (`generateApiKey` → `Implemented`; `DEFAULT_API_KEY_PREFIX` documented at definition site).

### Implementation notes / deviations / follow-up

- **Implementation notes:** _(filled when done)_
- **Deviations from plan:** _(filled when done)_

---

## Suggested implementation order

1. **Section 1** — config schema (`API_KEY_PREFIX` + strict `API_KEYS`). Prerequisite for Sections 2 and 4.
2. **Section 2** — `ApiKeyService` strict validate + logging hardening. Depends on Section 1.
3. **Section 3** — generator helper + CLI (can run in parallel with Section 2 once Section 1 exports `DEFAULT_API_KEY_PREFIX`).
4. **Section 4** — E2E fixture regeneration. Depends on Sections 1 and 2.
5. **Section 5** — documentation + rollout. Depends on all above.

_(Regression runs after Sections 2 and 4; full gate after Section 5.)_
