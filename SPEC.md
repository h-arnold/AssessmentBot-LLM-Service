# API-Key Strict Format & Logging Hardening Specification

## Status

- Draft v1.0
- Addresses `CODE_REVIEW.md` findings **H1** (failed API key value logged at WARN), **H2** (all configured keys logged in plaintext at startup), **L1** (non-constant-time API-key compare), and the permissive-format root cause that lets foreign secrets through the auth boundary.

## Purpose

This document defines the intended behaviour for tightening API-key validation and logging at the authentication boundary of the AssessmentBot LLM Service.

The feature will be used to:

- Stop secrets (API keys intended for other environments, or unrelated credentials) from being written to production logs when authentication fails.
- Reject foreign-format secrets at the format gate before they reach the membership check, so they can never be mistaken for a valid-format AssessmentBot key.
- Give operators a deterministic, recognisable API-key format (prefix + high-entropy body) and a generator, aligned with current industry practice.
- Keep a debug-only troubleshooting escape hatch that records the full presented value, with an explicit, accepted risk justification.

This feature is **not** intended to:

- Introduce hashing of invalid presented keys (agreed to be of low value because an invalid key cannot be mapped back to a legitimate key).
- Change the success-path logging, the throttling strategy, or the `User` object shape.
- Add new runtime dependencies.
- Issue, rotate, or store API keys in a database; keys remain operator-configured via the `API_KEYS` environment variable.

## Agreed product decisions

1. **Validation strictness — prefix-based strict format (Option A).** Presented keys must match `<API_KEY_PREFIX><BODY>` where `BODY` is a 32-character base64url string. Foreign-format secrets are rejected at the format gate. This is an agreed **breaking change**: existing deployments must regenerate keys.
2. **Format validation delegated to an expert-maintained library.** The body is validated with Zod v4's built-in `z.base64url()` string-format validator (already a project dependency); the prefix is checked with a trivial `startsWith`. No hand-written regular expression is added to the validation path.
3. **WARN logging is fully opaque.** A failed authentication event at WARN contains an opaque message and never the presented key value or a hash of it.
4. **DEBUG logging retains the full presented key.** By explicit decision: an attacker with debug-level log access already effectively has host access, so the residual risk is accepted. This keeps a real troubleshooting escape hatch for misconfigured-client scenarios.
5. **H2 startup log is redacted to a count.** The constructor no longer serialises configured keys; it logs only the count of loaded keys.
6. **Body charset and length are fixed.** Body is exactly 32 base64url characters (`[A-Za-z0-9_-]`), produced by `crypto.randomBytes(24).toString('base64url')` (192 bits of entropy).
7. **Prefix is configurable with a stable default.** `API_KEY_PREFIX` defaults to `abt_`. The configured keys (and presented keys) must start with this prefix.
8. **Assumption:** the application fails fast on misconfiguration. If a configured key in `API_KEYS` does not match the required format, the app does not start (config schema validation), so there is no need for a separate load-time format warning.

## Existing system constraints

### Backend or API constraints already in place

- Authentication uses `passport-http-bearer` (RFC 6750); `passport-http-bearer` extracts the bearer token and performs **no format validation**. Validation is the responsibility of `ApiKeyService.validate` (`src/auth/api-key.service.ts`), called by `ApiKeyStrategy.validate` (`src/auth/api-key.strategy.ts`).
- The configured key set is provided via `ConfigService.get('API_KEYS')`, sourced from the `API_KEYS` environment variable (comma-separated), validated at startup by the Zod `configSchema` in `src/config/environment.schema.ts`. `throttler.config.ts` also imports `configSchema` and parses `process.env` at module-eval time for compile-time decorator config.
- The default production `LOG_LEVEL` is `info`; pino emits `info` and above. WARN therefore fires at the default production level; DEBUG does not.
- The `LoggerErrorInterceptor` does not log request bodies, so student data is not currently surfaced; this feature does not change that.

### Current data-shape constraints

- The `User` object (`src/auth/user.interface.ts`) returned by `validate` is `{ apiKey: <string> }` and is attached to `req.user`. Its shape is preserved.
- The current `API_KEYS` Zod refine only requires `/^[a-zA-Z0-9_-]+$/` per entry, which is far too permissive (any foreign alphanumeric/`-`/`_` token passes).

### Consumer architecture constraints

- This is a backend API service with no frontend. There is no UI layout concern.
- E2E tests (`test/`) and E2E fixture helpers (`test/utils/app-lifecycle.ts`) provision `API_KEYS` directly and send `Authorization: Bearer <key>`; they are callers of this contract and must adopt the new format.

### Minimum library versions and compile-time configuration constraints

- **Zod version:** the project depends on `zod ^4.3.6`. The body validator uses Zod v4's top-level **`z.base64url()`** format (verified present at `node_modules/zod/v4/classic/schemas.js` and `.../mini/schemas.js`); the body-length check is `z.base64url().length(32)`. Do not use the Zod v3-style `z.string().base64url()` API.
- **Compile-time config parse:** `src/config/throttler.config.ts` imports `configSchema` and calls `configSchema.parse(process.env)` at module-eval time (before `.env` files are loaded). The new schema must therefore remain parse-valid against bare `process.env`, which in many environments lacks `API_KEYS` and `API_KEY_PREFIX`. Concretely: `API_KEY_PREFIX` keeps its `.default('abt_')` so it is defined when absent, and the `API_KEYS` enforcement is a **no-op when `API_KEYS` is `undefined`** (the object-level `superRefine` returns early), so a missing `API_KEYS` never aborts the compile-time parse. Only a present-but-malformed `API_KEYS` aborts startup.
- **ESM import path for the generator constant:** the default prefix constant is exported from `src/config/environment.schema.ts` as `DEFAULT_API_KEY_PREFIX` and is also used as the schema default via `z.string().default(DEFAULT_API_KEY_PREFIX)`. The CLI script under `scripts/` imports it with an explicit relative ESM path and `.js` extension, e.g. `import { DEFAULT_API_KEY_PREFIX } from '../src/config/environment.schema.js';`.

## Domain and contract recommendations

### Why this approach is preferable

- **Correctness:** a recognisable prefix means a foreign secret (a GitHub token, an AWS key, a pasted password) cannot pass the format gate, so it can never be treated as a valid-format key or echoed as one.
- **Maintainability:** format validation is delegated to Zod's maintained `z.base64url()` rather than a bespoke regular expression, so the hard correctness surface is owned by an expert-maintained library.
- **Secure-by-default logging:** opaque WARN guarantees no secret reaches the production log level regardless of what a client submits; the full-key escape hatch lives only at DEBUG behind an explicit risk decision.

### Recommended data shapes

#### Presented/validated API key (string)

```text
<API_KEY_PREFIX><32-char base64url body>
```

- Example (default prefix): `abt_8k2q_a1BcDeFgHiJkLmNoPqRsTuVwXyZ012345678`
- Body charset: `[A-Za-z0-9_-]` (matches Zod's `z.base64url()`).
- Full key length = `len(API_KEY_PREFIX) + 32`.

#### Authentication failure log lines

- WARN (production-visible, opaque): `Authentication failed: invalid API key presented`
- DEBUG (troubleshooting, full value): `Invalid API key: <presented value>`
- Format-rejection log (opaque): `API key is missing or has an invalid format.`

### Validation recommendation

#### Backend (authoritative)

- Reject a presented key immediately if it is not a string, is empty, or does not start with `API_KEY_PREFIX`.
- Reject a presented key if its body (the substring after the prefix) does not pass `z.base64url().length(32).safeParse(body).success`.
- Both format-rejection branches (missing/invalid prefix, and valid-prefix/invalid-body) emit the **identical opaque WARN message** (`'API key is missing or has an invalid format.'`) so that no format-oracle information leaks to the client.
- Authorise only if the full presented key is an exact member of the configured set.
- Use a `Set` for membership so the authorisation check is constant-time-ish and O(1) (also addresses **L1** and the per-request linear scan).
- `ApiKeyService.validate` must throw `UnauthorizedException('Invalid API key')` for every rejection branch; no internal branch distinction is exposed to the client.
- On membership failure (correct format, not configured), in addition to the opaque WARN, emit `logger.debug('Invalid API key: ' + presentedKey)` carrying the full presented value.
- The config schema must validate every entry of `API_KEYS` with the same `startsWith(prefix)` + `z.base64url().length(32)` body rule via an **object-level `superRefine`** (so it can read the parsed `API_KEY_PREFIX` sibling), and the rule must be a no-op when `API_KEYS` is `undefined`. The app fails fast (aborts startup) only when `API_KEYS` is present and malformed.

#### Out of scope for validation

- No checksum segment is added to the key (the membership store is an in-memory `Set`, so a checksum would add no value).
- No external validation call is made (this is not a third-party-key validator).

## Feature architecture

### Placement

- Validation and logging logic is owned by `ApiKeyService` (`src/auth/api-key.service.ts`).
- Format and prefix configuration is owned by the Zod `configSchema` (`src/config/environment.schema.ts`) and exposed through `ConfigService`.
- A key generator helper and CLI script are added under `src/common/utils/` and `scripts/` respectively (new files only; no existing entry points duplicated).
- No parallel entry point for API-key validation is introduced; `ApiKeyStrategy` continues to delegate solely to `ApiKeyService`.

### Out of scope for this surface

- Per-API-key throttling (CODE_REVIEW **M2**) — separate workstream.
- `LogRedactor` `x-api-key` header coverage (CODE_REVIEW **L3**) — separate workstream.
- Success-path hash logging for detecting abuse of a valid key — deferred (see Open questions).
- Removing the unused `@modelcontextprotocol/sdk` / `@openai/codex-sdk` dependencies (CODE_REVIEW **L2**) — out of scope.

## Data loading and orchestration

### Required datasets or dependencies

- `ConfigService.get('API_KEY_PREFIX')` — string, default `abt_`.
- `ConfigService.get('API_KEYS')` — `string[] | undefined`, each element matching the strict format.

### Prefetch or initialisation policy

#### Startup

- The `configSchema` validates `API_KEY_PREFIX` and every `API_KEYS` entry before the app starts; a malformed configured key aborts startup (fail fast).
- `ApiKeyService` constructs the configured-prefix string, the Zod body validator, and the authoritative `Set` of configured keys once at construction; it retains the original `API_KEYS` array (for the H2 count) and the `Set` (for membership). No per-request allocation of these.

#### Manual refresh

- No runtime refresh of configured keys is introduced. Keys change via config and process restart, as today.

## Main user-facing surface specification

Not applicable. This feature has no user-facing frontend surface. The observable surface is the HTTP `401 Unauthorized` response for invalid keys, whose message and status code are unchanged from today.

## Workflow specification

### Authentication of an incoming request

#### Eligible inputs or preconditions

- A request carries an `Authorization: Bearer <key>` header (handled by `passport-http-bearer`), or no/invalid header.

#### Behaviour

- `ApiKeyStrategy.validate` enforces the `Bearer ` scheme (unchanged) and delegates the key to `ApiKeyService.validate`.
- `ApiKeyService.validate`:
  1. If the presented value is not a non-empty string starting with `API_KEY_PREFIX` → opaque WARN `'API key is missing or has an invalid format.'`, throw `UnauthorizedException('Invalid API key')`.
  2. Else slice the body and validate it with `z.base64url().length(32)`; on failure → opaque WARN `'API key is missing or has an invalid format.'`, throw `UnauthorizedException('Invalid API key')`.
  3. Else check `Set.has(presentedKey)`; on success → `logger.log('API key authentication attempt successful')`, return `{ apiKey: presentedKey }`.
  4. Else (correct format, not configured) → `logger.warn('Authentication failed: invalid API key presented')` (opaque), `logger.debug('Invalid API key: ' + presentedKey)` (full value), throw `UnauthorizedException('Invalid API key')`.

### Startup configuration loading

#### Behaviour

- `configSchema` rejects a `process.env`/`.env` combination where any `API_KEYS` entry fails `startsWith(API_KEY_PREFIX)` + `z.base64url().length(32)` body, aborting startup with the Zod error.
- `ApiKeyService` constructor logs at DEBUG only the count using the retained configured-keys array: `Loaded ${this.apiKeys.length} API key(s)` (H2). The empty-keys WARN (`'No API keys configured. All requests will be unauthorised.'`) is preserved unchanged.

## Error, loading, and empty-state rules

### Blocking failure

- Misconfigured `API_KEYS` (wrong prefix, wrong body length, non-base64url body) blocks startup via Zod config validation. The operator is told via the existing `ConfigService` Zod-error path.

### Empty states

#### No API keys configured

- The existing `'No API keys configured. All requests will be unauthorised.'` WARN at startup is preserved. The DEBUG line reports `Loaded 0 API key(s)`.

## Accessibility and usability notes

Not applicable (no UI).

## Backend changes required to support agreed behaviour

1. **Config schema** (`src/config/environment.schema.ts`)
   - Add `API_KEY_PREFIX` (validated string, default `abt_`), plus an exported `DEFAULT_API_KEY_PREFIX` constant for reuse by the generator.
   - Replace the loose `API_KEYS` `.refine(/^[a-zA-Z0-9_-]+$/)` with an **object-level `superRefine`** on `configSchema` that enforces per-entry `startsWith(API_KEY_PREFIX)` + `z.base64url().length(32)` body, and that is a no-op when `API_KEYS` is `undefined`.
2. **`ApiKeyService` (`src/auth/api-key.service.ts`)**
   - Inject/derive `API_KEY_PREFIX`; build the Zod body schema and the `Set` of configured keys once.
   - Rewrite `validate()` to the prefix + `z.base64url().length(32)` + `Set.has` flow above.
   - Replace the H1 WARN (`Invalid API key: ${JSON.stringify(validKey)}`) with opaque WARN + DEBUG-full split.
   - Replace the H2 startup DEBUG (`Loaded API keys: ${JSON.stringify(this.apiKeys)}`) with the count-only form.
3. **Generator** (new `src/common/utils/crypto.utilities.ts` + `scripts/generate-api-key.ts`)
   - `generateApiKey(prefix)` = `prefix + crypto.randomBytes(24).toString('base64url')`.
   - CLI prints one key using `process.env.API_KEY_PREFIX ?? DEFAULT_API_KEY_PREFIX`.
4. **E2E fixtures** (`test/utils/app-lifecycle.ts`, `test/auth.e2e-spec.ts`, and any other `test/` literal keys)
   - Regenerate fixture API keys to the new format and update `API_KEYS` values used by E2E helpers.
5. **Docs** (`.env.example`, `docs/configuration/environment.md`)
   - Document `API_KEY_PREFIX`, the required key format, and the generator command.

## Planning handoff notes

- The config-schema change is a prerequisite for the `ApiKeyService` change: the service can assume the configured set already conforms to the strict format. Sequence the plan accordingly (schema red-green before service red-green).
- The E2E fixture regeneration depends on both being landed; E2E must run only after the new format is enforced everywhere, otherwise all authenticated E2E tests will fail with `401`.
- Per the planner workflow, the action plan must be red-first (failing tests before implementation) for each section.

## Testing expectations

- **Unit/integration:** `ApiKeyService.spec.ts` — format rejection of foreign secrets (no value echoed at WARN), opaque-WARN for membership failure, DEBUG-full for membership failure, `Set`-based membership, H2 count-only startup log, prefix honoured. `crypto.utilities.spec.ts` — generator determinism and body length. `environment.schema`/config spec — `API_KEY_PREFIX` default + `API_KEYS` strict-format enforcement (positive and negative).
- **E2E:** `auth.e2e-spec.ts`, `throttler.e2e-spec.ts`, `main.e2e-spec.ts`, and any `test/**` helper provisioning keys — pass with prefixed-format fixture keys; reject non-prefixed/foreign keys with `401`.
- **Regression:** `npm run lint`, `npm run lint:british`, `npm run build`, `npm test`, `npm run test:e2e` all green.

## Documentation and rollout notes

- `.env.example`: replace the `API_KEYS` example with the prefixed form; add `API_KEY_PREFIX`; replace the `openssl` generation guidance with the `npm run generate:api-key` command.
- `docs/configuration/environment.md`: document `API_KEY_PREFIX`, the required key format, generation, rotation, and the migration/breaking-change caveat.
- **Rollout caveat:** this is a **breaking change**. Operators must regenerate `API_KEYS` with the prefix before redeploying; unprefixed configured keys will abort startup.
- **Deferred follow-up:** success-path hash logging for detecting abuse of a valid key; per-API-key throttling (M2); `LogRedactor` `x-api-key` header coverage (L3).

## V1 scope recommendation

### Include in v1

- `API_KEY_PREFIX` config + strict `API_KEYS` schema validation.
- `ApiKeyService` prefix + `z.base64url()` + `Set` rewrite and the WARN-opaque / DEBUG-full / H2-count logging changes.
- Generator helper + CLI script + `package.json` script.
- E2E fixture regeneration and updated unit/integration/E2E tests.
- `.env.example` and `docs/configuration/environment.md` updates.

### Defer from v1

- Success-path key hashing for valid-key abuse correlation.
- Per-API-key throttling (M2) and `LogRedactor` `x-api-key` header coverage (L3).
- Key checksums, key issuance/rotation tooling beyond the one-shot generator.

## Open questions

1. Should the success path also emit a hashed key identifier (DEBUG or INFO) to enable correlation of abuse of a _valid_ key across many source IPs? Deferred to a follow-up; not required to satisfy H1/H2.
