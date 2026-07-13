# Comprehensive Code Review — AssessmentBot LLM Service

**Date:** 2026-07-13
**Scope:** `src/**`, `test/**`, configs, dependencies
**Method:** Four parallel focused reviews (Security, Performance, Repo-Rule Compliance, Latent Bugs), synthesised.

---

## Executive Summary

The codebase is well-structured, with strong fundamentals: zero dependency vulnerabilities, Zod-validated DTOs, a centralised config service, ESM compliance, and correct abstract-`LlmService` usage. No critical security vulnerabilities (auth bypass, RCE, SSRF, SQLi) were found.

The most important issues are **correctness bugs in the IMAGE assessment path** — these silently produce wrong scores rather than crashing, so they would pass tests and ship unnoticed. The remaining issues are performance waste on every request, a handful of coding-standard violations, and a couple of secret-in-logs defects.

| Area        | Critical | High | Medium | Low |
| ----------- | -------- | ---- | ------ | --- |
| Security    | 0        | 2    | 4      | 4   |
| Performance | 0        | 1    | 3      | 1   |
| Compliance  | 0        | 0    | 4      | 3   |
| Latent Bugs | 1        | 2    | 3      | 4   |

**Top priorities:** H1/H2 (IMAGE prompt contradiction & missing role mapping), H3 (broken Buffer path → HTTP 500), the API-key logging defects, and the per-request disk reads.

---

## 1. Security

### H1 — Failed API key value logged at WARN (default prod log level)

- **File:** `src/auth/api-key.service.ts:75`
  ```ts
  this.logger.warn(`Invalid API key: ${JSON.stringify(validKey)}`);
  ```
- **Issue:** The supplied API key (which passes the `[a-zA-Z0-9_-]{10,}` format check) is logged at **WARN**. The default production `LOG_LEVEL` is `info`, and pino logs `info` _and above_, so WARN messages **are emitted in production by default**.
- **Exploit scenario:** A misconfigured client submitting any well-formed-but-invalid key causes that secret to be persisted to log sinks. If a client accidentally sends a key intended for another environment, that real credential is now in the logs. An attacker can also spray many requests with arbitrary `key` values to flood logs with attacker-controlled strings (log noise / log-injection).
- **Fix:** Do **not** log the key value. Log only an opaque event, e.g. `this.logger.warn('Authentication failed: invalid API key presented')`. If correlation is needed, truncate/hash (e.g. last 4 chars), never the full value.

### H2 — All configured API keys logged in plaintext at startup

- **File:** `src/auth/api-key.service.ts:39`
  ```ts
  this.logger.debug(`Loaded API keys: ${JSON.stringify(this.apiKeys)}`);
  ```
- **Issue:** Every valid API key is serialised into a single log line. DEBUG is below the default `info` level, so it does **not** fire at default production settings — however, DEBUG is commonly enabled during incident troubleshooting, and the shipped `.env.example` explicitly recommends `LOG_LEVEL=debug`. When enabled, **all** secrets are written in one place and persisted by log aggregation.
- **Exploit scenario:** A developer enables `LOG_LEVEL=debug` (per the project's own docs) for a prod incident; all API keys are captured by the logging backend. Any reader of those logs obtains every valid key.
- **Fix:** Remove the line entirely, or log only the **count**: `this.logger.debug(\`Loaded ${this.apiKeys.length} API key(s)\`)`.

### M1 — `images[]` not validated by the image pipe

- **File:** `src/v1/assessor/assessor.controller.ts:72-78`, `src/v1/assessor/dto/create-assessor.dto.ts:94`
  ```ts
  images: z.array(imageObject).optional(),  // imageObject = { path: z.string(), mimeType: z.string() }
  ```
- **Issue:** The image-validation pipe only covers `reference`/`template`/`studentResponse`. The `images` array (`{path, mimeType}`) accepts arbitrary `path`/`mimeType` with no format/allow-list validation, and the controller never runs `ImageValidationPipe` over it. Path-traversal and MIME allow-list are only enforced _later_ inside `ImagePrompt.readImageFile` (`src/prompt/image.prompt.ts:158-196`), which is defence-in-depth, not boundary validation.
- **Exploit scenario (mitigated but inconsistent):** A client can supply `images` with arbitrary `path`/`mimeType`. The downstream `readImageFile` blocks `..`, absolute paths, and non-allowed MIME types and confines reads to `docs/ImplementationPlan/Stage6/ExampleData/ImageTasks`, so practical impact is low (read of a fixed example-data directory only). Still, accepting unvalidated attacker-controlled `path`/`mimeType` relies entirely on a later guard.
- **Fix:** Validate `images` in the controller via `ImageValidationPipe` (or a schema where `path` is a relative non-traversal segment and `mimeType` ∈ `ALLOWED_IMAGE_MIME_TYPES`), so all input is validated at the boundary per the project's Zod mandate.

### M2 — Throttling keyed per-IP, not per-API-key

- **File:** `src/config/throttler.config.ts:37-55`, `src/app.module.ts:130-137`, `src/v1/assessor/assessor.controller.ts:40`
- **Issue:** `@nestjs/throttler` (v6) keys by client IP by default. The authenticated route limit (`AUTHENTICATED_THROTTLER_LIMIT` default 90 per `THROTTLER_TTL` default 10000 ms ≈ 9 req/s) therefore bounds a single **IP**, not a single **API key**. There is no per-key throttling, no key revocation on abuse, and no global ceiling on LLM spend.
- **Exploit scenario:** A single leaked/valid API key used from a botnet (many source IPs) is not rate-limited per key, enabling cost-based DoS (each request triggers a billable Gemini call with retry/backoff) and abuse. Conversely, a shared NAT IP can be throttled even with distinct keys.
- **Fix:** Add a custom throttler key generator that keys authenticated routes by `req.user.apiKey` (the `User` object returned from `ApiKeyStrategy.validate`), so limits are enforced per credential. Consider a coarse global cost cap too.

### L1 — Non-constant-time API-key compare

- **File:** `src/auth/api-key.service.ts:70`
- **Issue:** `apiKeys.includes(validKey)` is a linear, non-timing-safe compare.
- **Fix:** Use a `Set` (also a performance win, see Performance M1) or `timingSafeEqual`.

### L2 — Unused dependencies (supply-chain surface)

- **File:** `package.json`
- **Issue:** `@modelcontextprotocol/sdk` and `@openai/codex-sdk` are in `dependencies` but never imported in `src/`.
- **Fix:** Remove them.

### L3 — `LogRedactor` misses `x-api-key` header

- **File:** `src/common/utils/log-redactor.utility.ts:27-29`
- **Issue:** Redacts only `authorization`/`cookie`; an `x-api-key` header would leak in request logs.
- **Fix:** Align with `http-exception.filter.ts:284` and include `x-api-key`.

### L4 — Direct `process.env.NODE_ENV` reads bypass `ConfigService`

- **Files:** `src/common/http-exception.filter.ts:83`, `src/common/zod-validation.pipe.ts:54`, `src/app.module.ts:103` — `process.env.NODE_ENV === 'production'`
- **Issue:** AGENTS.md mandates `ConfigService` for env access. More importantly, if `NODE_ENV` is unset, `process.env.NODE_ENV === 'production'` is `false`, so 5xx responses return the **real error message** to clients (not a stack — `sendResponse` never emits `stack`, so this is limited to message disclosure, not stack-trace leakage).
- **Fix:** Inject `ConfigService` and use `configService.get('NODE_ENV')` (which defaults to `'production'`), guaranteeing the safe branch by default (see Compliance M4).

### Informational

- Prompt injection is inherent but **mitigated** (response strictly validated by `LlmResponseSchema`; Mustache is logic-less; templates are server-controlled).
- `systemPromptFile` DTO field is accepted but never used — dead input.
- No CORS/Helmet — acceptable for an internal key-auth API; optional hardening.
- Verified: `LoggerErrorInterceptor` does **not** log request bodies (standard `req` serializer omits body), so student data/base64 images are not logged. No secrets are committed.

---

## 2. Performance

_(All issues are constant-factor / I/O waste on the per-request critical path — none are algorithmic O(n²) bottlenecks, but each is a clear, low-risk win. The dominant latency is the unavoidable outbound LLM call.)_

### HIGH — Redundant static template disk reads on every request

- **Files:** `src/prompt/prompt.factory.ts:59`, `src/prompt/prompt.base.ts:132`, `src/common/file-utilities.ts:56-79`
- **Issue:** `readMarkdown()` iterates up to **3 candidate paths** doing `path.resolve()` + `fs.readFile()` (real I/O) per call, and is invoked for both the system and user template on **every** request — even though the content is immutable for the process lifetime.
- **Big-O:** Current = O(N·C) I/O syscalls over N requests (C ≤ 3 candidate dirs). With a lazily-populated `Map<filename, string>` cache = O(M) total reads where M = distinct templates (~5), per-request cost becomes **O(1) amortised → 0 I/O on cache hit**. Improvement ≈ N×.
- **Fix:** Cache template contents in a module/service-level `Map` keyed by filename.

### MEDIUM — `apiKeys.includes()` linear scan on every authenticated request

- **File:** `src/auth/api-key.service.ts:70`
- **Big-O:** Current O(k) per request (k = configured keys); O(N·k) over N requests. A `Set` lookup is **O(1)** → O(N) total. Improvement ≈ k×.
- **Fix:** Build `this.apiKeySet = new Set(apiKeys)` in the constructor and use `.has()` (doubles as security L1 fix).

### MEDIUM — `buildModelParams`/`buildContents` computed twice per LLM request

- **File:** `src/llm/gemini.service.ts:44-45` and `:178-179`
- **Big-O:** `buildContents` is O(n) over image parts and runs **2× per attempt**, amplified across R retries ⇒ O(2·R·n). Build once ⇒ O(R·n).
- **Fix:** Pass already-computed `config`/`contents` into `generateAndParseResponse` (or merge the two methods).

### MEDIUM — Unconditional `JSON.stringify(…, null, 2)` on the hot path

- **Files:** `src/llm/gemini.service.ts:151`, `:191`; `src/prompt/prompt.base.ts:74`
- **Issue:** These stringify calls are evaluated as function arguments **before** the logger runs — so they execute even when the line is dropped at `info` level. For image tasks, L74 stringifies full base64 image data; L151 stringifies the entire rendered user message.
- **Big-O:** O(n) allocation/serialisation per request (n = payload size, can be tens of KB→MB), done unconditionally. Optimal = O(1) when debug/verbose disabled.
- **Fix:** Guard with `if (logger.isLevelEnabled('debug'))`, or pass the raw object to pino (avoid pre-stringifying).

### LOW/MEDIUM — Allowed-MIME-types list re-lowercased & linearly scanned per image/request

- **Files:** `src/prompt/image.prompt.ts:171-174`, `src/common/pipes/image-validation.pipe.ts:66,85`
- **Big-O:** Current O(k·m) (k = images, m = allowed types) rebuilding the array and scanning each call. Precompute a `Set<string>` once ⇒ O(1) membership, O(k+m) setup.
- **Fix:** Build `this.allowedMimeTypesLower: Set<string>` once.

### LOW — Constant `patterns.some()` scan in retry classification

- **File:** `src/llm/llm.service.interface.ts:231` — O(5) over a fixed array, only on the error path. Noted for completeness; not worth changing.

---

## 3. Repo-Rule Compliance

_(Per `AGENTS.md`. Checks that PASSED: ESM compliance — `"type":"module"`, `module/moduleResolution: NodeNext`, all relative imports carry `.js` extensions, JSON imports use `with { type: 'json' }`; `@nestjs/config` only used inside config module; no `PinoLogger`/`@InjectPinoLogger`; abstract `LlmService` + `jsonrepair` used correctly; Zod validation present; no `console.*` in source; no real `any` types; statelessness maintained; tests co-located; no committed secrets.)_

### MEDIUM — British-English slips not caught by CI

- **Files:** `src/common/http-exception.filter.spec.ts:206,228,277,344` (`behavior` ×4), `src/llm/llm.module.spec.ts:32,35` (`behavior` ×2), `src/config/config.service.spec.ts:132` (`prioritize`)
- **Rule:** AGENTS.md mandates British English in all code/comments/docs.
- **Fix:** `behavior`→`behaviour`, `prioritize`→`prioritise`. Note the `lint:british` script (`scripts/check-british-english.sh`) omits these words — a tooling gap; expand the wordlist.

### MEDIUM — Linter override comments without recorded authorisation

- **Files:** `src/config/config.service.ts:50,52,77`, `src/prompt/image.prompt.ts:190`, `src/common/file-utilities.ts:63`
- **Rule:** AGENTS.md — "Do not disable or override any quality gate … without explicit authorisation."
- **Fix:** Refactor to satisfy the security lint rules, or document explicit authorisation for each suppression. (A `.opencode/plugins/no-eslint-silence.ts` plugin exists to detect exactly this.)

### MEDIUM — Direct `process.env` reads outside the config module

- **Files:** `src/app.module.ts:80` (`LOG_FILE`), `src/common/http-exception.filter.ts:83` (`NODE_ENV`), `src/common/zod-validation.pipe.ts:54` (`NODE_ENV`)
- **Rule:** Environment access should go through `ConfigService`.
- **Fix:** Inject `ConfigService` and use `configService.get(...)`. Add `LOG_FILE` to the Zod config schema so it can be exposed (currently E2E-only, absent from schema). (Overlaps security L4.)

### LOW — `import.meta.url` in entrypoint guards

- **Files:** `src/main.ts:40`, `src/testing-main.ts:42`
- **Note:** This is the standard "is this the main module" check, not directory resolution, so `getCurrentDirname()` cannot replace it. Flagged for awareness.

### LOW — `AGENTS.md` doc inconsistency (`json-repair` vs `jsonrepair`)

- **Note:** The doc says `json-repair`; the actual dependency/import is `jsonrepair`. Code is correct; update the doc to avoid confusion.

### LOW — `lint:british` wordlist gap

- **File:** `scripts/check-british-english.sh:10-27`
- **Note:** Omits common Americanisms (`behavior`, `prioritize`, `sanitize`, `color`, `normalize`, `utilize`, `catalog`, `gray`). Expand for full coverage.

---

## 4. Latent Bugs

### CRITICAL/HIGH — Image system prompt contradicts itself on image ordering

- **File:** `src/prompt/templates/image.system.prompt.md` (lines 9–11 vs 19–21)
- **Bug:** "The Images" states #1 = reference, #2 = template, #3 = student. But "Step 1" tells the model `Template: {description of the third image}` and `Student Submission: {description of the second image}` — the **opposite** mapping. Data-URI path sends images in order `[reference, template, student]` (`image.prompt.ts:132-136`).
- **Trigger:** Every IMAGE assessment.
- **Impact:** The model receives conflicting instructions about which image is the student's work. Wrong scores (e.g. all-zero or misattributed) are produced **silently** — passes tests, ships undetected.
- **Fix:** Make Step 1 consistent: `Template: {description of the second image}`, `Student Submission: {description of the third image}`.

### HIGH — File-based IMAGE payloads have no role/order mapping

- **Files:** `src/prompt/image.prompt.ts:63-74,93-104`, `src/v1/assessor/dto/create-assessor.dto.ts:94`
- **Bug:** When `dto.images` (`{path, mimeType}`) is supplied, `buildImagesFromFiles()` uses **client-determined order** with no role field, and the text fields `referenceTask`/`studentTask`/`emptyTask` are **ignored**. The schema has no role discriminator and no validation that exactly 3 images are supplied in the right order.
- **Trigger:** Any IMAGE request populating the `images` array.
- **Impact:** The model cannot reliably know which image is which → incorrect assessments.
- **Fix:** Add a `role` field (`reference`/`template`/`student`) to the image object, or strictly validate/order the array before sending; decide whether text fields should still be included.

### HIGH — Advertised IMAGE `Buffer` support is broken (→ HTTP 500)

- **Files:** `src/prompt/prompt.factory.ts:179-188`, `src/prompt/image.prompt.ts:116-137`, `src/v1/assessor/dto/create-assessor.dto.ts:74,79,84`
- **Bug:** The DTO schema accepts `Buffer`s for `reference`/`template`/`studentResponse` (and a test asserts it). But `instantiatePrompt` converts with `dto.reference.toString()` (default UTF-8, no base64/`data:` prefix). `buildImagesFromDataUris` then calls `parseDataUri` whose regex `/^data:(.+);base64,(.*)$/` fails → throws a raw `Error`.
- **Trigger:** Any caller passing binary `Buffer` image fields.
- **Impact:** Throws a plain `Error`, not `BadRequestException` → surfaces as **HTTP 500** instead of 400; the documented Buffer capability never works.
- **Fix:** Convert Buffers to data URIs before building: `data:${mimeType};base64,${buffer.toString('base64')}` (needs MIME detection, e.g. `detectBufferMime`), or remove `Buffer` from the IMAGE schema and tests.

### MEDIUM — `ImageValidationPipe` silently skips non-`data:` strings → later 500

- **File:** `src/common/pipes/image-validation.pipe.ts:80-82`
- **Bug:** `validateString` returns early for any string not starting with `data:`, doing no validation. Such input then throws a raw `Error` in `buildImagesFromDataUris`.
- **Trigger:** IMAGE request where an image field is a plain (non-data-URI) string.
- **Impact:** Malformed-but-schema-valid input yields a generic **HTTP 500** rather than a clean 400.
- **Fix:** Reject non-`data:` image strings in the pipe, or have `buildImagesFromDataUris` throw `BadRequestException`.

### MEDIUM — Retry/classification may not match `@google/genai` error shape

- **Files:** `src/llm/llm.service.interface.ts:212-317`, `src/llm/gemini.service.ts:56-82`
- **Bug:** `isResourceExhaustedError`/`isRateLimitError` only recognise `status`/`statusCode`/`response.status` + message substrings. The SDK may surface 429/quota via `code`, `error.status`, or nested `error`. A mismatch means a retryable 429 is not retried, or a quota-exhausted error is wrongly retried.
- **Trigger:** Gemini returns 429 / `RESOURCE_EXHAUSTED`.
- **Impact:** Broken rate-limit recovery in production (worse UX or wasted retries + delayed 503).
- **Fix:** Verify the real `@google/genai` v2.x error structure and broaden `extractErrorStatusCode` (also read `error.code`, `error.error?.status`).

### MEDIUM — JSON trim heuristic can mis-slice trailing `}`

- **File:** `src/common/json-parser.utility.ts:55-64`
- **Bug:** When no ` ```json ` fence is found, the code slices from the first `{` to the **last** `}` in the whole string. Trailing prose containing a `}` breaks `JSON.parse`/`jsonrepair`.
- **Trigger:** Fenced-less JSON followed by commentary containing a `}`.
- **Impact:** Spurious "Malformed JSON" 400s on otherwise-valid output.
- **Fix:** Use `jsonrepair` directly on the whole string, or locate the balanced closing brace.

### LOW — Empty leading text part for multimodal contents

- **File:** `src/llm/gemini.service.ts:118` — `return ['', ...imageParts]`. Harmless but unnecessary; confirm SDK accepts a leading empty part.

### LOW — `throttler.config.ts` parses full env schema at import time

- **File:** `src/config/throttler.config.ts:24` — Requires `GEMINI_API_KEY` (no default) in `process.env` at module-eval time; importing hard-fails the whole app if that one key is missing, even for unrelated routes.
- **Fix:** Parse only throttler-related keys, or document that full config is required at startup.

### LOW — ZodError logged with array passed as `stack`

- **File:** `src/llm/gemini.service.ts:75` — `this.logger.error('Zod validation failed', error.issues)` passes an array as the `stack` argument (cosmetic).
- **Fix:** Log `error.issues` as a structured second arg or stringify it.

---

## 5. Recommended Remediation Order

1. **IMAGE prompt contradiction (Bug H1)** + **role/order mapping (Bug H2)** — highest-impact correctness risk; produces wrong scores silently.
2. **Broken Buffer path (Bug H3)** + **`ImageValidationPipe` skip (Bug M1)** — converts HTTP 500 into proper 400s.
3. **API-key logging defects (Sec H1/H2)** — stop leaking secrets in logs (cheapest, highest default-impact).
4. **Static-template disk-read cache (Perf HIGH)** — removes O(N) repeated I/O from 100% of requests.
5. **`Set`-based lookups** (api keys H1/L1 + MIME types) — O(1) per request.
6. **Duplicate `build*` compute + unconditional `JSON.stringify` (Perf M/M)** — removes O(n) waste on the hot path.
7. **Compliance items** — British-English fixes, linter-override authorisation, `ConfigService` routing of `process.env`.
8. **Retry error-shape verification (Bug M2)** + **JSON trim heuristic (Bug M3)** — verify against the live SDK.

---

## Appendix — Detailed Sub-Reports

- Security: full findings (including code snippets, exploit scenarios, and the `NODE_ENV` default nuance) are incorporated directly in §1 above.
- Performance, Compliance, and Latent-Bug reports were produced by parallel reviewer agents and synthesised above.
