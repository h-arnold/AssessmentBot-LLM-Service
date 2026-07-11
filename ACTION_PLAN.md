# Cleanup & SDK Migration Plan — Assessor → Gemini Path

## Read-First Context

Before writing or executing this plan:

1. Read `AGENTS.md` (project instructions; mandatory).
2. Read `docs/development/code-style.md` (canonical style and policy; mandatory).
3. The de-sloppification review findings that originated this plan are not persisted in the repository; the cleanup items they surfaced are captured directly in the sections below, so there is no separate artefact to read.
4. Consult the official Google Gen AI SDK (`@google/genai`) reference before implementing Section 5:
   - `https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentParameters.html`
   - `https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html`
   - `https://ai.google.dev/gemini-api/docs/migrate` (JavaScript before/after)

This plan implements the cleanup items from the review **and** migrates `GeminiService` from the deprecated `@google/generative-ai` SDK (archived 2025-12-16, end-of-life 2025-08-31) to the maintained, GA `@google/genai` SDK. **No `SPEC.md` is required**: the work is code removal, de-duplication, tidying, and a like-for-like SDK swap with corrected request/response shapes — no change to the user-facing assessment behaviour or contracts.

## Scope and assumptions

### Scope

- The request path `assessor.controller.ts` → `assessor.service.ts` → `prompt.factory.ts` → prompt classes → `llm.service.interface.ts` → `gemini.service.ts`, plus supporting files touched along that path.
- Cleanup items: dead code (`buildUserMessageParts`, `messages`/`uri` branches), duplicated status-code extraction, redundant error logging, direct `process.env` access in `image.prompt.ts`, an unused dependency, a one-caller service wrapper, defensive no-ops, and a mislabelled duplicate spec.
- **SDK migration**: `GeminiService` moves from `@google/generative-ai` to `@google/genai`, correcting the request/response shapes (including the thinking configuration).

### Out of scope

- Any change to assessment scoring, the `LlmResponse` schema, the public REST API shape, or the retry/backoff policy.
- Switching from the Gemini Developer API to Vertex AI (the `apiKey` constructor path is retained).
- Adopting the newer Interactions API or streaming — only `models.generateContent` is used.

### Assumptions

1. **No new user-facing behaviour.** Image payloads remain images-only; the textual task fields (`reference`/`template`/`studentResponse`) for image tasks continue to be carried as images.
2. **The leading empty-string text part is required and must be preserved.** Per the Gemini API, a multimodal (image) content turn must include at least one text part. The current code satisfies this with `['', ...imageParts]` (the `?? ''` fallback). An empty string is sufficient and is what production sends today, so the image `buildContents` branch must continue to emit `['', ...imageParts]` — only the dead `messages` extraction around it is removed.
   - **Pending-live-verification framing (load-bearing):** production sends `['', ...imageParts]` only because `ImagePrompt.buildMessage` (`src/prompt/image.prompt.ts` lines 88–92) returns `{ system, images }` with no `messages` field, so `GeminiService.buildContents` falls back to `textPrompt = ''`. The existing `gemini.service.spec.ts` `createImagePayload()` fixture, however, sets `messages: [{ content: 'Test message' }]` (line 58), so today's tests exercise a **non-empty** `'Test message'` text part — never `''`. After Section 2 drops `messages`, the test will send `['', ...imageParts]` for the first time. **The empty-string acceptance under the new SDK is therefore unconfirmed until Section 5.5's live run passes the IMAGE case.** Treat Assumption 2 as settled for code-shaping purposes (Sections 1–5) but unverified at the API boundary; Section 5.5 owns the confirmation and its failure-triage block owns the contingency.
3. **Target SDK:** `@google/genai` (already a dependency at `^2.10.0`). The new `generateContent` shape is `{ model, contents, config }`, where `contents` accepts a flat array of strings/parts and `config` carries `systemInstruction`, `temperature`, and `thinkingConfig`. Response text is read via the `result.text` getter (not `result.response.text()`).
4. `ConfigService.get('ALLOWED_IMAGE_MIME_TYPES')` returns `string[]`; `file-type` is unused in `src/` and safe to remove.
5. The new SDK surfaces errors as `ApiError` (`extends Error`) with a numeric `status` property (constructor `new ApiError({ message, status })`), so the base `LLMService` status extraction and retry logic continue to work unchanged (no base-class change expected).

---

## Global constraints and quality gates

### Engineering constraints

- Keep API/entry points thin and delegate behaviour to services.
- Fail fast on invalid inputs.
- Avoid defensive guards that hide wiring issues (e.g. `this && this.constructor`).
- Keep changes minimal, localised, and consistent with repository conventions.
- Use British English in comments and documentation.

### TDD workflow (mandatory per section)

For each section below:

1. **Red**: write/adjust failing tests for the section's acceptance criteria.
2. **Green**: implement the smallest change needed to pass.
3. **Refactor**: tidy implementation with all tests still green.
4. Run section-level verification commands.

### Validation commands (repository-correct)

- Lint: `npm run lint`
- Unit tests (single file): `npm test -- <path-to-spec>`
- Full unit suite: `npm test`
- Build (needed for e2e): `npm run build`
- British-English check: `npm run lint:british`

---

## Section 1 — Remove dead `ImagePrompt.buildUserMessageParts`

### Objective

- Delete the unused, always-empty `buildUserMessageParts` method on `ImagePrompt` and its test stub, which imply capability that never runs.

### Constraints

- Do not alter `ImagePrompt.buildMessage` behaviour.
- Keep `image.prompt.spec.ts` green.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/prompt/image.prompt.ts`, `src/prompt/prompt.base.spec.ts`

### Acceptance criteria

- `ImagePrompt` exposes no `buildUserMessageParts` method.
- `prompt.base.spec.ts` no longer declares a `buildUserMessageParts` stub (this also removes its `import('@google/generative-ai').Part[]` reference).
- `npm test -- src/prompt/image.prompt.spec.ts src/prompt/prompt.base.spec.ts` passes.

### Required test cases (Red first)

1. **Red**: In `prompt.base.spec.ts`, remove the `buildUserMessageParts` stub from `TestPrompt`; the suite must still compile and pass.
2. (No behaviour test required; pure deletion.)

### Section checks

- `npm test -- src/prompt/image.prompt.spec.ts src/prompt/prompt.base.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- None.

### Implementation notes / deviations / follow-up

- Completed: `buildUserMessageParts` removed from `ImagePrompt` (`src/prompt/image.prompt.ts`) and its stub from `TestPrompt` in `src/prompt/prompt.base.spec.ts`. Confirmed `prompt.base.ts` does not declare it (not abstract), so no contract change. RED (test stub removal) ran by Testing Specialist → 17 tests green; GREEN (method removal) ran by Implementation → 17 tests + lint green; Code Reviewer APPROVED. No deviations.

---

## Section 2 — Remove dead `messages`/`uri` branches in `GeminiService` (preserve required empty text part)

### Objective

- Remove the `messages` extraction in `GeminiService.buildContents` (image branch) and the `uri`/`fileData` branch in `mapImageParts`, because no producer on the request path emits `messages` or `uri`.
- **Preserve the leading empty-string text part** (see Assumption 2): image `buildContents` must continue to return `['', ...imageParts]`. Note (confirmed against `src/prompt/image.prompt.ts` lines 88–92): production already sends `''` because `ImagePrompt.buildMessage` omits `messages`; only the `gemini.service.spec.ts` fixture (`messages: [{ content: 'Test message' }]`) currently exercises a non-empty text part. After this section the test will exercise `''` for the first time; the live-API confirmation of that shape is owned by Section 5.5, not this section.

### Constraints

- Must remain behaviour-neutral: image payloads continue to be sent as `['', ...imageParts]`.
- Do **not** add real text emission to `ImagePrompt.buildMessage`.
- Update `ImagePromptPayload` type and all fixtures accordingly.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/llm/gemini.service.ts`, `src/llm/llm.service.interface.ts`
- `src/llm/gemini.service.spec.ts`, `src/v1/assessor/assessor.service.spec.ts`, `src/prompt/prompt.base.spec.ts`

### Acceptance criteria

- `buildContents` for image payloads returns `['', ...imageParts]` (leading empty text part required by Gemini + image parts). No `messages` extraction remains.
- `mapImageParts` handles only the inline `data` shape; the `uri` branch is gone.
- `ImagePromptPayload.messages` is removed from the type.
- `uri?` is removed from the `ImagePromptPayload.images` element type in `src/llm/llm.service.interface.ts` (becomes `Array<{ mimeType: string; data?: string }>`); no producer emits `uri`.
- `gemini.service.spec.ts` `createImagePayload` no longer sets `messages`; the `mockGenerateContent` assertion expects `['', { inlineData: { mimeType, data } }]`.
- `assessor.service.spec.ts` and `prompt.base.spec.ts` fixtures no longer set `messages`.

### Required test cases (Red first)

1. **Red**: In `gemini.service.spec.ts`, change `createImagePayload()` to drop `messages` and update the multimodal test so `expect(mockGenerateContent).toHaveBeenCalledWith([...])` expects `['', { inlineData: { mimeType: 'image/png', data: 'test-data' } }]`. Run it; it fails against the old code (which still injects `'Test message'`).
2. Update `assessor.service.spec.ts` mock multimodal payload to drop `messages` and `prompt.base.spec.ts` `TestPrompt.buildMessage` to drop `messages`.

### Implementation notes / deviations / follow-up

- **Do not confuse the `uri` field being removed (the `uri?: string` on `ImagePromptPayload.images`) with the unrelated `uri` _parameter_ of the local `parseDataUri` helper in `src/prompt/image.prompt.ts`** (the data-URI parser). `parseDataUri`'s `uri` parameter parses base64 data URIs and is unrelated to the removed `uri?` image-source field; it **must not** be renamed or deleted. Only the `uri` branch of `mapImageParts` and the `uri?` field on the `ImagePromptPayload.images` element type are removed.

### Section checks

- `npm test -- src/llm/gemini.service.spec.ts src/v1/assessor/assessor.service.spec.ts src/prompt/prompt.base.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- None.

### Implementation notes / deviations / follow-up

- Completed: removed `messages` extraction in `buildContents` (image branch now returns `['', ...imageParts]`) and the `uri`/`fileData` branch in `mapImageParts`; removed `messages?` and `uri?` from `ImagePromptPayload`. RED produced a genuine failure (multimodal test expected `''`, old code injected `'Test message'`) which GREEN resolved. Code review flagged a real `tsc` compile error (type-predicate filter incompatible with `Part` union) — fixed by reverting to `.filter(Boolean) as Part[]` — plus a stale JSDoc `uri?` reference (updated). `npm run build` now passes with zero tsc errors. No deviations from Assumption 2 (leading empty-string text part preserved). Note: `grep -n "messages" src/llm/llm.service.interface.ts` still matches two unrelated comments ("error messages"); addressed at final regression if the strict grep is enforced.

---

## Section 3 — De-duplicate status-code extraction and remove redundant logging

### Objective

- Remove `GeminiService.extractStatusCode` (duplicate of `LLMService.extractErrorStatusCode`).
- Remove the redundant try/catch error logging in `GeminiService._sendInternal`, since `LLMService.send` already logs terminal failures.
- **Preserve the operationally useful context that the subclass catch currently emits** (`model`, `payloadType`, HTTP `statusCode`, and for validation failures the `ZodError.issues` detail), so that removing the catch does not regress failure triage. See _Observability preservation_ below for the concrete replacement mechanism.

### Constraints

- The subclass (`GeminiService`) will no longer call `extractErrorStatusCode` once its `_sendInternal` try/catch is removed, so **no change to the base class is required**. Keep `LLMService.extractErrorStatusCode` `private` (do **not** make it `protected`); Assumption 5 holds ("no base-class change expected"). Any text suggesting the base class must change for the subclass to reuse the extractor is obsolete and should be ignored.
- Error-handling semantics (retry on 429, `ResourceExhaustedError` on quota, terminal throw) must be unchanged.
- Confirm the new `@google/genai` errors expose `status`/`message` (Assumption 5); if so, no change to the base class.
- **Interaction with Section 5 (forward note, to prevent a cross-section misread):** Section 5 migrates the SDK throw to `ApiError`, which exposes only `status` (no `statusCode`, no `response.status`). After Section 5 lands, the subclass's inline status read (item 1 below) therefore simplifies to `error.status`. The base `LLMService.extractErrorStatusCode` — which still handles `status`/`statusCode`/`response.status` and remains untouched **and `private`** — continues to drive retry/resource-exhausted classification against `ApiError.status` via its existing `status` branch. The two sections read together: subclass logs the Gemini-specific context inline (no base-class call, no `protected` widening); base class silently picks up `ApiError.status` through its existing extractor. Do **not** widen `extractErrorStatusCode` to `protected` to "deduplicate" status extraction across both layers — that would re-introduce the very duplication this section removes.
- **Observability preservation**: the current `_sendInternal` catch (`gemini.service.ts` lines 69–91) logs structured context `{ model, payloadType, statusCode }` with the message `'Error communicating with or validating response from Gemini API'`, plus a separate `this.logger.error('Zod validation failed', error.issues)` for `ZodError`. The base class's `throwTerminalSendError` logs only the stack and a generic `'LLM request failed after N attempt(s) (...)'` message — it does **not** emit `model`, `payloadType`, `statusCode`, or `ZodError.issues`. Removing the subclass catch wholesale therefore loses operationally useful fields. Preserve that context by retaining a **single** enriched error log inside `_sendInternal` that:
  1. Reads `model` from `buildModelParams(payload)`, `payloadType` via `isImagePromptPayload`, and `statusCode` once from `this.extractStatusCode(error)` (a renamed local helper or a direct `error.status`/`error.statusCode` read) — do **not** re-invoke the base-class private extractor.
  2. Calls `this.geminiLogger.error({ model, payloadType, statusCode }, 'Error communicating with or validating response from Gemini API', stack?)`.
  3. For `error instanceof ZodError`, additionally logs `this.geminiLogger.error('Zod validation failed', error.issues)` before re-throwing (matches the current behaviour at `gemini.service.ts` line 84).
  4. Re-throws the original error unchanged (the base class still owns retry/`ResourceExhaustedError` wrapping and the "logged exactly once" terminal log).
- The net behaviour after this section is: the subclass logs the Gemini-specific enriched context **once** on its catch, then re-throws; the base class logs its generic terminal failure **once** via `throwTerminalSendError`. This is the same count as today (the current subclass log was _additional_ to the base-class log), only the redundant `extractStatusCode` helper is gone. If the implementer can instead enrich the thrown error (e.g. attach `cause`/properties so the base-class log carries the context) without a base-class change, that is an acceptable equivalent — but a base-class edit is **not** permitted by the constraints above.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/llm/gemini.service.ts`, `src/llm/llm.service.interface.ts`, `src/llm/gemini.service.spec.ts`

### Acceptance criteria

- `GeminiService` has no `extractStatusCode` private method; the status code it logs is read inline (or via a small local read) without calling the base-class private extractor.
- `_sendInternal` retains a single catch that logs the enriched context `{ model, payloadType, statusCode }` once (and `ZodError.issues` for validation failures), then re-throws the original error unchanged — it does **not** swallow, re-wrap, or independently retry. There is no separate "communicating with … Gemini API" log path beyond this one catch.
- `gemini.service.spec.ts` error/retry/resource-exhausted suites still pass (they assert thrown errors and call counts). A logger spy (if added) confirms the enriched context (`model`, `payloadType`, `statusCode`) is present in exactly one subclass log entry per failed attempt, and that the base-class terminal log is the second (non-duplicated) log entry.
- Failed requests are logged at most once by the subclass (enriched context) and once by the base class (generic terminal), i.e. no net increase in log volume versus today.

### Required test cases (Red first)

1. **Red**: In `gemini.service.spec.ts`, extend the existing error/retry suites to assert that on a failed `generateContent` the subclass emits a log entry containing `model`, `payloadType`, and `statusCode`, then re-throws. Run it; it passes against the current code (which already does this) and continues to pass after the section's deduplication, proving the context is preserved.
2. **Red**: Confirm (do **not** invent a new shape) the existing `it('should throw a ZodError for an invalid response structure', ...)` at `gemini.service.spec.ts` line ~173 — which mocks `generateContent` to resolve to a response whose `text()` returns `'{"invalid": "structure"}'` and lets the real `JsonParserUtility` + `LlmResponseSchema.parse` throw — also asserts via a logger spy that the subclass logs `'Zod validation failed'` with `error.issues` before the `ZodError` propagates. Run; it passes against the current code (the subclass catch at `gemini.service.ts` lines 83–86 already emits this log) and must continue to pass after the refactor. The parse/validate step is the **only** real `ZodError` source in this path — do **not** construct a mock that makes `generateContent` itself throw a `ZodError`, which is not a real failure mode for either SDK and would pass for the wrong reason.
3. **Red**: Confirm `extractStatusCode` is no longer referenced anywhere (grep).

### Section checks

- `npm test -- src/llm/gemini.service.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- None.

### Implementation notes / deviations / follow-up

- Completed: removed the duplicate `GeminiService.extractStatusCode` and replaced the call in the `_sendInternal` catch with an inline `error_.status ?? error_.statusCode ?? error_.response?.status` read (renamed to `error_` to satisfy the `unicorn/name-replacements` lint rule). The base-class `LLMService.extractErrorStatusCode` is untouched and remains `private`. The enriched context `{ model, payloadType, statusCode }` is still logged once via `geminiLogger`, and the `Zod validation failed` + `error.issues` log via `this.logger` is preserved; the original error is re-thrown. RED added two behaviour-preserving regression guards (enriched-context spy + Zod-issues spy) that pass against both pre- and post-change code. Code review APPROVED; `npm run build` clean. No base-class change, no deviation from the observability-preservation requirement.

---

## Section 4 — Inject `ConfigService` for image MIME types (policy deviation fix)

### Objective

- Stop reading `process.env.ALLOWED_IMAGE_MIME_TYPES` directly inside `ImagePrompt.readImageFile`; obtain the allowed MIME types via `ConfigService` in line with project policy.

### Constraints

- `ImagePrompt` is instantiated with `new` in `PromptFactory`, so the array is passed into its constructor.
- The value is `string[]` from `ConfigService.get('ALLOWED_IMAGE_MIME_TYPES')`; the schema default handles the fallback (do not re-implement one).
- `PromptModule` must import `ConfigModule` so `ConfigService` is injectable into `PromptFactory`. Update `src/prompt/prompt.module.ts` and the `PromptFactory` test modules (`src/prompt/prompt.factory.spec.ts`, `src/prompt/prompt.module.spec.ts`) accordingly; otherwise DI resolution fails.
- `allowedMimeTypes: string[]` is inserted as the **third** positional parameter of the `ImagePrompt` constructor, becoming `(inputs, logger, allowedMimeTypes, images?, systemPrompt?)`. It is **required** (not optional), because there is no defensible default inside `ImagePrompt` once the `process.env` read is removed and the project's fail-fast principle (AGENTS.md "Security First / Fail fast on invalid inputs") must be honoured. All `new ImagePrompt(...)` call sites must pass it. This is a re-ordering, not an append: `images` shifts from 3rd to 4th and `systemPrompt` shifts from 4th to 5th. Every call site is already touched by this section, so the marginal edit cost of re-ordering is zero.
- **Why 3rd-required, not 5th-optional (revised from an earlier draft):** appending as the 5th positional arg `(inputs, logger, images?, systemPrompt?, allowedMimeTypes?)` would force the two data-URI path tests (`src/prompt/image.prompt.spec.ts` lines 132 and 149, currently `new ImagePrompt(inputs, logger)`) to become `new ImagePrompt(inputs, logger, undefined, undefined, allowed)` — two `undefined` holes in the middle of a positional call, which is the brittle pattern AGENTS.md's "fail fast" directive exists to prevent. The 3rd-required ordering avoids every `undefined` hole (`new ImagePrompt(inputs, logger, allowed)` for those two sites). It is also inconsistent-by-design with the sibling `TextPrompt`/`TablePrompt` constructors (`(inputs, logger, userTemplateName?, systemPrompt?)`), neither of which needs `ConfigService`; that inconsistency is the _point_ — only `ImagePrompt` validates MIME types, so only it receives `allowedMimeTypes`. Do **not** retrofit `allowedMimeTypes` onto `TextPrompt`/`TablePrompt`.
- After this change, `ImagePrompt.readImageFile` no longer reads `process.env.ALLOWED_IMAGE_MIME_TYPES`, but the assignment remains in **two** other locations that this section must account for:
  - `vitest.setup.ts` (line 11) sets `process.env.ALLOWED_IMAGE_MIME_TYPES = 'image/png,image/jpeg'` globally for all unit tests.
  - `src/v1/assessor/assessor.service.spec.ts` (lines 44–45 within `getMockEnvironmentValue`, and line 72 in `beforeAll`) sets it because its mock `ConfigService.get(...)` reads `process.env` via `getMockEnvironmentValue`.

  These assignments are **not** consumed by `ImagePrompt` after this section. **Mandatory cleanup (not implementer judgement)**: switch `assessor.service.spec.ts`'s mock `ConfigService.get` to return an explicit literal array `['image/png','image/jpeg']` for `'ALLOWED_IMAGE_MIME_TYPES'` (rather than going through `process.env`), and delete the `process.env.ALLOWED_IMAGE_MIME_TYPES` assignments in that file (lines 44–45, 72) and in `vitest.setup.ts` (line 11). This makes the Regression section's `grep -rn "process.env.ALLOWED_IMAGE_MIME_TYPES" src/prompt` (item 8) unconditional rather than gated on an implementer's choice, and keeps the suite's MIME contract in one place. The deletion must include a one-line code comment (in `assessor.service.spec.ts` and the schema-default path in `environment.schema.ts` if touched) explaining that the array is now supplied via `ConfigService` (not `process.env`) so future maintainers do not re-introduce the direct read. If the deletion is skipped (e.g. another module still reads the env var unexpectedly), stop and surface the surprise rather than leaving a residual — the regression-grep item above depends on it.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/prompt/image.prompt.ts`, `src/prompt/prompt.factory.ts`
- `src/config/config.service.ts`, `src/config/environment.schema.ts`, `src/prompt/image.prompt.spec.ts`

### Shared helper plan

- **Helper decision**: `reuse` — `ConfigService.get('ALLOWED_IMAGE_MIME_TYPES')` already wired through `ConfigModule`/`CommonModule`. No new helper.
- **Owning path**: `src/config/config.service.ts` (provided by `ConfigModule`).
- **Call-site rationale**: `PromptFactory` lives in `PromptModule`, but `PromptModule` does **not** currently import `ConfigModule` and `ConfigModule` is not `@Global()`. Injecting `ConfigService` into `PromptFactory` therefore requires two coupled changes: (1) add `imports: [ConfigModule]` to `PromptModule`; (2) inject `ConfigService` into `PromptFactory`'s constructor and pass `configService.get('ALLOWED_IMAGE_MIME_TYPES')` into `new ImagePrompt(...)`. This keeps domain code free of `process.env`.

> **Verified during review (load-bearing correction)**: `PromptModule` (`src/prompt/prompt.module.ts`) currently declares only `providers: [PromptFactory, Logger]` and `exports: [PromptFactory]`; it does **not** import `ConfigModule`. The corresponding test modules (`prompt.factory.spec.ts`, `prompt.module.spec.ts`) likewise do not import `ConfigModule`. All three must gain `imports: [ConfigModule]` (or provide `ConfigService`) when `PromptFactory` gains the `ConfigService` dependency, otherwise NestJS DI fails at runtime / module-compile time. The original assertion that "PromptFactory already lives in PromptModule (imports ConfigModule)" is **false** and must not be relied upon.

### Acceptance criteria

- `ImagePrompt.readImageFile` no longer references `process.env`.
- `ImagePrompt` constructor signature becomes `(inputs, logger, allowedMimeTypes: string[], images?, systemPrompt?)` — `allowedMimeTypes` is the **required third** positional parameter (see _Constraints_); `images` and `systemPrompt` remain optional and shift one slot right. `readImageFile` uses the stored `allowedMimeTypes` for the MIME check.
- `PromptFactory` injects `ConfigService` and passes `configService.get('ALLOWED_IMAGE_MIME_TYPES')` into `new ImagePrompt(...)` as the **third** argument (`new ImagePrompt(imageInputs, this.logger, this.configService.get('ALLOWED_IMAGE_MIME_TYPES'), dto.images, systemPrompt)`).
- `image.prompt.spec.ts` constructs `ImagePrompt` with an explicit `allowedMimeTypes` array (no `process.env` mutation required) at **all** call sites. The spec currently calls `new ImagePrompt(...)` at 8 locations; an implementer should find every occurrence with `grep -n "new ImagePrompt" src/prompt/image.prompt.spec.ts` (at time of writing: lines 47, 75, 90, 103, 117, 132, 149, 161) rather than trusting the numbers here, because spec line numbers drift as the file is edited. Each call site inserts `allowedMimeTypes` immediately after `logger` (the two data-URI-only sites at lines 132 and 149 become `new ImagePrompt(inputs, logger, allowed)` — no `undefined` holes). The production call site is in `prompt.factory.ts` (at time of writing: line 186) — confirm via `grep -n "new ImagePrompt" src/prompt/prompt.factory.ts`.
- `PromptModule` (`src/prompt/prompt.module.ts`) declares `imports: [ConfigModule]`.
- `prompt.factory.spec.ts` and `prompt.module.spec.ts` `TestingModule` setups import `ConfigModule` (or provide `ConfigService`) so `PromptFactory` resolves.

### Required test cases (Red first)

1. **Red**: In `image.prompt.spec.ts`, remove every `process.env.ALLOWED_IMAGE_MIME_TYPES = ...` setup (find them with `grep -n "process.env.ALLOWED_IMAGE_MIME_TYPES" src/prompt/image.prompt.spec.ts`; at time of writing: lines 19, 110, 155 — not 19/109/154) and pass an explicit `allowedMimeTypes` array to **all** `ImagePrompt` constructor calls (locate every `new ImagePrompt(...)` with the grep above). Assert (a) allowed MIME accepted, (b) disallowed MIME rejected, (c) path traversal/absolute rejected. Run; it fails because the constructor no longer reads `process.env` and the call sites are missing the new argument.
2. **Red**: Add a test that an empty/undefined mimeType is rejected.
3. **Red** (matches the 3rd-required ordering in _Constraints_): Confirm with `grep -n "new ImagePrompt(inputs, logger, undefined" src/prompt/image.prompt.spec.ts` that **no** call site passes `undefined` as a positional placeholder. The two data-URI-only sites (lines 132, 149) must read `new ImagePrompt(inputs, logger, <array-literal>)` and never `new ImagePrompt(inputs, logger, undefined, undefined, ...)`. Run; this is a code-quality sentinel, not a runtime failure, and prevents the brittle 5-positional-with-holes shape from sneaking back in.

### Section checks

- `npm test -- src/prompt/image.prompt.spec.ts src/prompt/prompt.factory.spec.ts src/prompt/prompt.module.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- Document on `ImagePrompt`/`readImageFile` that allowed MIME types are supplied via `ConfigService` (injected through `PromptFactory`), not read from `process.env`.

### Implementation notes / deviations / follow-up

- Completed: `ImagePrompt` now takes a REQUIRED 3rd positional `allowedMimeTypes: string[]` (constructor reorder: `images`→4th, `systemPrompt`→5th); `readImageFile` uses `this.allowedMimeTypes` (no `process.env` read). `PromptFactory` injects `ConfigService` and passes `configService.get('ALLOWED_IMAGE_MIME_TYPES')`; `PromptModule` imports `ConfigModule`. All 8 `new ImagePrompt(...)` call sites pass `allowedMimeTypes` (no `undefined` holes; the two data-URI-only sites use `new ImagePrompt(inputs, logger, allowed)`). `assessor.service.spec.ts` mock returns a literal `['image/png','image/jpeg']` and its `process.env.ALLOWED_IMAGE_MIME_TYPES` assignments (beforeAll + `getMockEnvironmentValue`) were removed, as was the line in `vitest.setup.ts`; a comment notes the value is now via `ConfigService`. RED produced a genuine TS compile failure (new 3rd arg collided with old `images` param); GREEN resolved it. Code review APPROVED; `npm run build` clean. Note: the `assessor.service.spec.ts` mock routes the literal array through `getMockEnvironmentValue` (rather than a direct `if (key === ...) return [...]` in the `vi.fn`) — functionally equivalent (no `process.env` read), accepted as it satisfies the acceptance criteria and the regression grep.

---

## Section 5 — Migrate `GeminiService` to the `@google/genai` SDK

### Objective

- Replace the deprecated `@google/generative-ai` SDK with the maintained, GA `@google/genai` SDK in `GeminiService`, correcting the request/response shapes per the official TypeDoc.
- Correct the thinking configuration to the supported shape: `config.thinkingConfig = { thinkingBudget: 0 }` for the Gemini 2.5 models used here (the old top-level `thinking: { budget: 0 }` was not recognised by the API).

### Constraints

- Preserve the `LLMService` base class, its retry/backoff logic, and the `GeminiService extends LLMService` contract and `_sendInternal` signature.
- Use `ai.models.generateContent({ model, contents, config })`:
  - `contents` is a flat array: `[payload.user]` for text, `['', ...imageParts]` for images.
  - `config.systemInstruction` = `payload.system` (string accepted), `config.temperature` = `payload.temperature ?? 0`, `config.thinkingConfig = { thinkingBudget: 0 }`.
- Read the response via `result.text ?? ''` (the `GenerateContentResponse.text` getter), not `result.response.text()`.
- Remove `GeminiModelParameters` from `src/llm/types.ts` (it extended the old SDK's `ModelParams`).
- Keep `Part` typing from `@google/genai`.
- **`_sendInternal` debug log must be updated**: it currently logs `modelParameters.generationConfig?.temperature ?? 0`. Once `buildModelParams` returns `{ model, config }` (no `generationConfig`), update the log to read `modelParameters.config.temperature ?? 0`. The `modelParameters` local is no longer typed as `GeminiModelParameters`.
- **Final `generateAndParseResponse` signature**: `private async generateAndParseResponse(payload: LlmPayload): Promise<LlmResponse>`. It calls `this.buildModelParams(payload)` (returns `{ model, config }`) and `this.buildContents(payload)` internally, then `this.client.models.generateContent({ model, contents, config })`. `_sendInternal` calls `return this.generateAndParseResponse(payload);` directly — do **not** pass a separate `contents` argument (the current `(modelParameters, contents)` signature is retired).
- **Local return type for `buildModelParams`**: introduce a named type, e.g. `type GeminiRequest = { model: string; config: GenerateContentConfig }`, now that `GeminiModelParameters` is removed. Use it for the `buildModelParams` return and the `_sendInternal` / `generateAndParseResponse` locals.
- **`: Part` is type-only in `@google/genai`**: the `Part` export is an `interface`, not a value. The import `{ GoogleGenAI, type Part }` already uses `type` for `Part`; preserve the `type` modifier verbatim. Do not import `Part` as a value (`{ Part }`) — under `verbatimModuleSyntax` this errors at build time.
- **`@google/generative-ai` removal has a test/ artefact**: removing `@google/generative-ai` from `package.json` also breaks `test/utils/llm-mock.mjs` (used by the mocked E2E suite). That shim is rewritten in the dedicated **Section 5.1** below; `gemini.service.spec.ts` is updated in this section. Do not delete `@google/generative-ai` from `package.json` until both Section 5 and Section 5.1 are complete and their checks pass.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/llm/gemini.service.ts`, `src/llm/types.ts`, `src/llm/llm.service.interface.ts`
- `src/llm/gemini.service.spec.ts`
- Official reference: `GenerateContentParameters`, `GenerateContentConfig`, `ThinkingConfig` (TypeDoc URLs in Read-First Context), and the JavaScript migration guide.

### Shared helper plan

- **Helper decision**: `keep local` — the payload-building helpers (`buildContents`, `mapImageParts`, `buildModelParams`) stay in `GeminiService`; only their return shapes change to match the new SDK.
- No new shared helper is introduced.

### Acceptance criteria

- `gemini.service.ts` imports `{ GoogleGenAI, type Part }` from `@google/genai`; no import from `@google/generative-ai`.
- Constructor: `this.client = new GoogleGenAI({ apiKey: this.configService.get('GEMINI_API_KEY') })`.
- `generateAndParseResponse(payload)` internally calls `this.client.models.generateContent({ model, contents: this.buildContents(payload), config })` (where `model`/`config` come from `buildModelParams(payload)`) and uses `result.text ?? ''`.
- `buildModelParams(payload)` returns `{ model, config: { systemInstruction, temperature, thinkingConfig: { thinkingBudget: 0 } } }`.
- **Section 5.1 gate (must be honoured before the `package.json` edit below is made):** Section 5.1 (rewrite `test/utils/llm-mock.mjs` for `@google/genai` and run `npm run test:e2e:mocked`) is part of the same delivery unit as this section. Removing `@google/generative-ai` from `package.json` before Section 5.1 is complete and its `npm run test:e2e:mocked` check is green will break the mocked E2E suite (the shim's `import` throws). Work this section and Section 5.1 back-to-back; only remove the dependency from `package.json` once both unit (`npm test -- src/llm/gemini.service.spec.ts`) and mocked-E2E (`npm run test:e2e:mocked`) checks pass.
- `package.json` no longer lists `@google/generative-ai` (action gated on the bullet above); `@google/genai` (`^2.10.0`) remains. Lockfile updated via install.
- `GeminiModelParameters` removed from `src/llm/types.ts`.
- `gemini.service.spec.ts` mocks `@google/genai` (not `@google/generative-ai`) and asserts the new shapes; error tests use `ApiError` from `@google/genai` (extends `Error`, exposes `status: number`), constructed as `new ApiError({ message, status })`. The `vi.mock('@google/genai', ...)` factory must preserve `ApiError` (spread `...actual` and override only `GoogleGenAI`), exactly mirroring the current `@google/generative-ai` mock which preserves `GoogleGenerativeAIFetchError` — otherwise Red #4 fails with `ApiError is not a constructor` because the whole package is stubbed.
- No reference to `@google/generative-ai` remains in `src/` (grep `src`). Section 5.1 additionally guarantees no reference remains in `test/`.

### Required test cases (Red first)

1. **Red**: Update `gemini.service.spec.ts` mock to import `GoogleGenAI` from `@google/genai` and return `{ models: { generateContent: mockGenerateContent } }`. Update `createValidResponse` to return `{ text: '<json>' }` (not `{ response: { text: () => ... } }`). Additionally:
   - Update the `should initialise the SDK correctly` test: the constructor call is now `new GoogleGenAI({ apiKey: 'test-api-key' })`, so change the assertion from `toHaveBeenCalledWith('test-api-key')` to `toHaveBeenCalledWith({ apiKey: 'test-api-key' })`.
   - Remove the now-defunct `mockGetGenerativeModel` declaration and **both** `expect(mockGetGenerativeModel).toHaveBeenCalledWith(...)` assertions (the SDK no longer exposes `getGenerativeModel`; these would be undefined and fail to compile). The `mockGenerateContent` call-shape assertions in Red #2/#3 supersede them. (Helper note: the `testRetryBehaviorSuccess`/`testRetryBehaviorFailure` helpers at `gemini.service.spec.ts` lines ~215–246 chain off `mockGenerateContent` directly, not `mockGetGenerativeModel`, so they survive the migration unchanged — do **not** try to thread any `getGenerativeModel`-shaped helper through them.)
   - **`vi.mock('@google/genai', ...)` must preserve `ApiError`**: the current `vi.mock('@google/generative-ai', async () => ({ ...actual, GoogleGenerativeAI: vi.fn() }))` spreads `...actual` so `GoogleGenerativeAIFetchError` stays real (the retry suites construct it directly). The replacement must do the same for `@google/genai` — spread `...actual` and override only `GoogleGenAI`. If the whole package is stubbed, Red #4 fails with `ApiError is not a constructor` because error tests do `new ApiError({ message, status })`.
     Run; it fails against the old `@google/generative-ai` mock/shape and the stale `mockGetGenerativeModel` references.
2. **Red**: Update the string-payload test assertion to `expect(mockGenerateContent).toHaveBeenCalledWith({ model: 'gemini-2.5-flash-lite', contents: ['test prompt'], config: { systemInstruction: 'system prompt', temperature: 0, thinkingConfig: { thinkingBudget: 0 } } })`.
3. **Red**: Update the multimodal test assertion to `expect(mockGenerateContent).toHaveBeenCalledWith({ model: 'gemini-2.5-flash', contents: ['', { inlineData: { mimeType: 'image/png', data: 'test-data' } }], config: { systemInstruction: 'system prompt', temperature: 0, thinkingConfig: { thinkingBudget: 0 } } })`.
4. **Red**: Replace `GoogleGenerativeAIFetchError` usages in error/retry tests with `ApiError` from `@google/genai`. Construct as `new ApiError({ message: 'Rate limited', status: 429 })` — note the constructor takes an `ApiErrorInfo` object `{ message, status }`, not a `(message, status)` tuple. Import `ApiError` from the real `@google/genai` module (it is preserved by the `vi.importActual` spread documented in Red #1 — do not re-mock it). Confirm `ApiError.status` (number) is read by the base `LLMService.extractErrorStatusCode` via its existing `status` branch, so no base-class change is required **and none is permitted** (see Section 3's _Constraints_: `extractErrorStatusCode` stays `private`, the subclass reads `status` inline — they are independent reads of the same numeric field, not a shared extractor). Replace **all** `GoogleGenerativeAIFetchError` construction sites; the `resource-exhausted` suite's ad-hoc `(originalError as Error & { status?: number }).status = statusCode` workaround (which set `.status` on a plain `Error`) can become an `ApiError({ message: <msg>, status: 429 })` so the status field is real, not monkey-patched.

### Section checks

- `npm test -- src/llm/gemini.service.spec.ts`
- `npm run lint`
- `grep -rn "@google/generative-ai" src` returns nothing.
- **Section 5.1 must also be completed and its checks passed before `@google/generative-ai` is removed from `package.json`.** The `src/` grep above is intentionally scoped to `src/`; Section 5.1 owns the `test/` grep and the `test/utils/llm-mock.mjs` rewrite.

### Optional `@remarks` JSDoc follow-through

- Note in `GeminiService` that `result.text` is used (the new SDK exposes the concatenated text via a getter) and that `thinkingConfig.thinkingBudget = 0` disables thinking for the 2.5 models.

### Implementation notes / deviations / follow-up

- Confirmed during planning: the new SDK exports `ApiError` (`extends Error`) with a `status: number` property, constructor `new ApiError({ message, status })`. The base `LLMService.extractErrorStatusCode` already reads `error.status`, so no base-class change is required. Verify the `ContentListUnion` typing accepts the flat `['', ...imageParts]` / `[user]` `contents` array during implementation.

---

## Section 5.1 — Rewrite the mocked-E2E LLM shim for `@google/genai`

### Objective

- Update `test/utils/llm-mock.mjs` so the mocked E2E suite (`vitest.config.ts` `e2e` project → `vitest.e2e.setup.ts` sets `E2E_MOCK_LLM=true` → `app-lifecycle.ts` injects `llm-mock.mjs` as a `--import` shim) keeps working after `@google/generative-ai` is removed and `GeminiService` switches to `@google/genai`. Without this rewrite the mocked E2E suite either fails to start (import of the removed dependency) or returns the wrong response shape, and `test/assessor.e2e-spec.ts` no longer gets a `201` with `completeness`.

### Why here (placement rationale)

- This is load-bearing, not optional. The current `llm-mock.mjs` imports `GoogleGenerativeAI` from `@google/generative-ai` and patches `GoogleGenerativeAI.prototype.getGenerativeModel` to return `{ generateContent: async () => ({ response: { text: () => ... } }) }`. After Section 5: (a) `@google/generative-ai` is removed from `package.json` → the `import` throws; (b) `GoogleGenerativeAI` no longer exists in the request path, which is `new GoogleGenAI({ apiKey }).models.generateContent(...)`; (c) the response shape changes from `result.response.text()` to the `result.text` getter. All three mismatch. The Section 5 grep `grep -rn "@google/generative-ai" src` is intentionally `src/`-scoped, so it will pass even though `test/utils/llm-mock.mjs` still references the old SDK. This section closes that gap.

### Constraints

- The shim must continue to set up **before** the app boots (it is injected via `NODE_OPTIONS="--import=<shim>"` in `app-lifecycle.ts` when `E2E_MOCK_LLM==='true'`), and must not require a network call.
- Patch the new SDK's surface in the new shape, mirroring how Section 5 calls it:
  - `import { GoogleGenAI } from '@google/genai'`
  - patch the instance method `GoogleGenAI.prototype.models` (or the `models.generateContent` function on the shared `Models` class) so that calling `<client>.models.generateContent({ model, contents, config })` resolves to a value whose `text` getter returns `JSON.stringify(mockResponse)`.
  - **Concrete anchor (read before implementing):** inspect `node_modules/@google/genai/dist/genai.d.ts` for the `class GoogleGenAI` declaration and its `models` field. The safest cross-instance patch is to define a getter on `GoogleGenAI.prototype` for `models` that returns a stable `{ generateContent }` object — patching `Models.prototype` (the class backing `GoogleGenAI.prototype.models`) is an acceptable equivalent but requires resolving the `Models` export from the package. Choose whichever surface the SDK's runtime (not just the types) actually exposes; verify by running `npm run test:e2e:mocked` after the patch (Green below).
- The patched `generateContent` must return an object exposing the `result.text` getter (not `result.response.text()`), since `GeminiService.generateAndParseResponse` reads `result.text ?? ''`.
- The mock must be argument-agnostic (ignore `model`/`contents`/`config`), matching the current behaviour. Do not throw on unexpected inputs; the shim is for the happy-path assessor e2e.
- Leave the `mockResponse` payload (`completeness`/`accuracy`/`spag` all `score: 3`) unchanged so assertions on those keys still pass.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `test/utils/llm-mock.mjs` (current contents, below for reference)
- `test/utils/app-lifecycle.ts` (the `E2E_MOCK_LLM==='true'` branch at lines 108–128 that injects the shim via `NODE_OPTIONS`)

### Acceptance criteria

- `test/utils/llm-mock.mjs` imports from `@google/genai` (no `@google/generative-ai` import).
- The patched `models.generateContent` resolves to `{ get text() { return JSON.stringify(mockResponse); } }` (a getter, not `result.response.text()`) so the migrated `GeminiService` reads it transparently.
- `npm run test:e2e:mocked` (`vitest run --project e2e`) passes: `test/assessor.e2e-spec.ts` `POST /v1/assessor` returns `201` with `completeness`/`accuracy`/`spag`.
- `grep -rn "@google/generative-ai" test` returns nothing.
- No new `process.env` reads or real network calls are introduced by the shim.

### Required test cases / checks (Red first)

1. **Red**: Run `npm run test:e2e:mocked` against the post-Section-5 code **before** rewriting the shim. It must fail (the app process either fails to start because `@google/generative-ai` is gone, or `POST /v1/assessor` returns `500` because the patched method does not exist / the response shape is wrong). This confirms Section 5.1 is necessary. Capture the failure mode.
2. **Green**: Rewrite `llm-mock.mjs` per _Acceptance criteria_; re-run `npm run test:e2e:mocked`. It must pass.
3. Grep `test/` for `@google/generative-ai` and `GoogleGenerativeAI`; both must return nothing.

### Section checks

- `npm run test:e2e:mocked` → green.
- `npm run lint`
- `grep -rn "@google/generative-ai" test src` returns nothing (covers both trees once Section 5 + 5.1 are done).

### Reference: current `llm-mock.mjs` (to replace)

```js
import { GoogleGenerativeAI } from '@google/generative-ai';

const mockResponse = {
  completeness: { score: 3, reasoning: 'Mocked response for completeness.' },
  accuracy: { score: 3, reasoning: 'Mocked response for accuracy.' },
  spag: { score: 3, reasoning: 'Mocked response for SPaG.' },
};

GoogleGenerativeAI.prototype.getGenerativeModel =
  function getGenerativeModel() {
    return {
      generateContent: async () => ({
        response: {
          text: () => JSON.stringify(mockResponse),
        },
      }),
    };
  };
```

### Optional `@remarks` JSDoc follow-through

- None (test-only file, no JSDoc).

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Section 5.5 — Live E2E validation of the migrated SDK (real Gemini API)

### Objective

- Prove the migrated `@google/genai` shapes work against the **live** Gemini API before any further tidying, so SDK-shape defects (multimodal leading empty-string text part, `thinkingConfig`, `systemInstruction` as a string, the `result.text` getter, error/retry behaviour) are caught at the earliest sensible point and fixed in Section 5 rather than leaking into Sections 6–7 or the final regression.

### Why here (placement rationale)

- Sections 1–4 do **not** change the SDK call path; a live run before Section 5 would only re-validate the _old_ SDK. Section 5 is the only section that rewrites the SDK integration, so it is the earliest point at which a live run can validate the _new_ shapes.
- Sections 6–7 are pure tidying (dead-code collapse, spec consolidation) that do not alter the `generateContent` call, so validating immediately after Section 5 gives a tight feedback loop and avoids rework.

### Prerequisites

- Network egress to the Gemini API and a **real** `GEMINI_API_KEY`. `test:e2e:live` spawns the built app via `startApp`, whose environment merge order is `process.env < defaults < .test.env < overrides`; the default `GEMINI_API_KEY` is the placeholder `dummy-key-for-testing`, so a shell `GEMINI_API_KEY` is **overridden**. Provide the real key in a `.test.env` file at the repo root (e.g. `GEMINI_API_KEY=<real-key>`).
- `E2E_MOCK_LLM` must **not** be `true`. The `e2e-live` vitest project loads only `vitest.setup.ts` (not `vitest.e2e.setup.ts`, which sets `E2E_MOCK_LLM=true`), so the real `GeminiService` is used.
- A successful `npm run build` (the `test:e2e:live` script builds first, but run it explicitly if reusing a prior build).

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `test/assessor-live.e2e-spec.ts`, `test/utils/app-lifecycle.ts`
- `src/llm/gemini.service.ts` (post-Section-5 state)

### Acceptance criteria

- `npm run test:e2e:live` passes: the TEXT, TABLE, and IMAGE `POST /v1/assessor` cases all return `201` with `completeness`, `accuracy`, and `spag` in the body.
- The IMAGE case (which sends `['', ...imageParts]` to the live API) succeeds — confirming Assumption 2's leading empty-string text part is accepted by the live Gemini 2.5 models. This is the one behavioural risk the unit tests cannot surface.
- No `ApiError`/shape-related failures in the app log for the migrated request/response shapes.

### Required checks (Red/Green)

1. **Baseline (optional but recommended)**: before starting Section 5, run `npm run test:e2e:live` once against the current code to confirm credentials, network, and the live path are healthy. This isolates any later failure as migration-induced. If the baseline already fails, stop and fix environment/credentials first.
2. **Green**: after Section 5 is complete and its unit suite passes, run `npm run test:e2e:live`. It must pass against the real API.

### Failure triage (adjust Section 5 code accordingly, then re-run)

- IMAGE case fails with a multimodal / "text part required" error → Assumption 2 (`['', ...imageParts]`) is **not** accepted by the live API; revisit `buildContents` to emit a real (non-empty) text part and update this plan's Assumption 2, plus the Section 2/5 `contents` assertions, accordingly. This is a behaviour change beyond pure cleanup and should be flagged back to the planner.
- TEXT/TABLE fail with config / `thinking` / `systemInstruction` errors → correct `buildModelParams` shapes (Section 5).
- Response parsing fails or `result.text` is undefined → correct `generateAndParseResponse` (Section 5).
- Auth/quota (429) errors → expected if the key is invalid or rate-limited; verify the key and respect the in-test 2s delays. Not a code defect unless reproducible with a valid key.

### Section checks

- `npm run test:e2e:live` → all three cases (TEXT, TABLE, IMAGE) green.

### Optional `@remarks` JSDoc follow-through

- None beyond Section 5's `@remarks`.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Section 6 — Misc tidying

### Objective

- Remove the unused `file-type` dependency.
- Collapse `AssessorService.executeAssessment` into `createAssessment`.
- Remove defensive no-op guards in `Prompt.render` (`this && this.constructor`, `this ? Object.keys(this)`).
- Remove `@remarks`/JSDoc referencing the deleted `buildUserMessageParts`.

### Constraints

- Collapsing `executeAssessment` means inlining its body into `createAssessment` and deleting the private method. The `createAssessment` try/catch **stays**, including its `'Assessment failed for task type: X.'` log with the error stack (it is the controller-facing failure log, distinct from the `LLMService` terminal log). Do **not** remove or simplify that log; only the `executeAssessment` indirection is removed. The logged output after this section must be identical to before.
- `file-type` is removed from `package.json` and the lockfile, but `mime-detect` (the library actually used at `src/common/pipes/image-validation.pipe.ts:2`) **stays**. The Section 6 grep `grep -r "file-type" src` must return nothing; a separate `grep -rn "from 'file-type'" src test` is the authoritative removal check (the dependency is used in `src/` only if such an import exists).
- The defensive render guards removed in `Prompt.render` are `this && this.constructor ? this.constructor.name : typeof this` (lines 111–112) and `this ? Object.keys(this).join(', ') : 'undefined'` (lines 113–114); replace them with the unconditional `this.constructor.name` and `Object.keys(this).join(', ')`. These debug-log statements remain (they are not no-op dead code), only the truthiness guards around them are stripped.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/v1/assessor/assessor.service.ts`, `src/prompt/prompt.base.ts`, `package.json`

### Acceptance criteria

- `file-type` absent from `package.json` (and lockfile); `grep -rn "from 'file-type'" src test` returns nothing. (`mime-detect` remains present and imported by `image-validation.pipe.ts`.)
- `AssessorService` has a single `createAssessment` method (no private `executeAssessment`); the `try { ... } catch (error) { this.logger.error('Assessment failed for task type: X.', error.stack); throw error; }` block is preserved around the inlined body.
- `Prompt.render` uses `this.constructor.name` and `Object.keys(this).join(', ')` directly (truthiness guards removed); the two `this.logger.debug(...)` statements remain.

### Required test cases (Red first)

1. **Red**: `assessor.service.spec.ts` calls `createAssessment`; ensure it still passes after the wrapper collapse (regression guard).
2. **Red**: `prompt.base.spec.ts` still passes after render-guard removal.
3. Confirm `file-type` removal via `grep -rn "from 'file-type'" src test` returning nothing. (Sanity: `grep -rn "from 'mime-detect'" src` still returns one hit at `src/common/pipes/image-validation.pipe.ts:2` — that line must remain.)
4. **Red** (dead-code sentinel, mirrors the dead-code removal pattern used in Sections 1 and 7): `grep -n "executeAssessment" src/v1/assessor/assessor.service.ts` must return nothing after the collapse. The regression-guard test in Red #1 alone does not catch a partial inline that renames the helper rather than deleting it; this grep asserts the symbol is genuinely gone. (Justification for the collapse, confirmed at planning time: `grep -rn "executeAssessment" src` returns a single caller — the `try`-block at `assessor.service.ts` line 43 — so the indirection is dead weight, not a reused boundary.)

### Section checks

- `npm test -- src/v1/assessor/assessor.service.spec.ts src/prompt/prompt.base.spec.ts`
- `npm run lint`
- `npm run lint:british`

### Optional `@remarks` JSDoc follow-through

- None.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Section 7 — Consolidate mislabelled duplicate spec

### Objective

- Delete `src/llm/llm-integration.spec.ts` (mislabelled "integration" tests that only unit-test `ResourceExhaustedError`) after folding its unique assertions into `src/llm/resource-exhausted.error.spec.ts`.

### Constraints

- Do not reduce coverage of `ResourceExhaustedError`.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/llm/llm-integration.spec.ts`, `src/llm/resource-exhausted.error.spec.ts`

### Acceptance criteria

- `resource-exhausted.error.spec.ts` covers instantiation, `name`, `originalError` preservation, construction without `originalError`, and the array-filter / try-catch usage patterns previously only in `llm-integration.spec.ts`.
- `llm-integration.spec.ts` is deleted.
- `npm test -- src/llm/resource-exhausted.error.spec.ts` passes.

### Required test cases (Red first)

1. **Red**: Add the unique assertions from `llm-integration.spec.ts` (pattern-matching filter, try-catch capture) into `resource-exhausted.error.spec.ts` as new `it(...)` blocks.
2. Delete `llm-integration.spec.ts`; confirm no other file imported it.

### Section checks

- `npm test -- src/llm/resource-exhausted.error.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- None.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Regression and contract hardening

### Objective

- Verify the full unit suite and lint remain green after all changes, and that no behaviour regressed.

### Constraints

- Prefer focused test runs before broader validation.

### Acceptance criteria

- `npm run lint` passes.
- `npm test` (full unit suite) passes.
- `npm run build && npm run test:e2e:mocked` passes (the mocked E2E suite exercises the assessor endpoint via the rewritten `llm-mock.mjs` shim from Section 5.1; this is **mandatory**, not optional, because it is the integration check that the SDK migration did not break the request/response path end-to-end).
- `npm run lint:british` passes.
- No remaining references to removed symbols across `src test docs` (covers `@google/generative-ai`, `GoogleGenerativeAI`, `GoogleGenerativeAIFetchError`, `getGenerativeModel`, `buildUserMessageParts`, `extractStatusCode`, `executeAssessment`, `messages` on image payloads in source, `uri?` on `ImagePromptPayload.images`, `process.env.ALLOWED_IMAGE_MIME_TYPES` in `image.prompt.ts`, and `from 'file-type'`).
- The `@google/genai` migration builds (`npm run build`) and both the mocked and live e2e suites still exercise the assessor endpoint.

### Required test cases/checks

1. `npm run lint`
2. `npm test`
3. `npm run build && npm run test:e2e:mocked` (mandatory — catches the SDK migration end-to-end via the shim)
4. `npm run lint:british`
5. `grep -rn "@google/generative-ai\|GoogleGenerativeAI\|GoogleGenerativeAIFetchError\|getGenerativeModel" src test docs` → nothing.
6. `grep -rn "buildUserMessageParts\|extractStatusCode\|from 'file-type'\|executeAssessment" src test` → nothing. (`executeAssessment` is in the list per Section 6 Red #4; the symbol must be gone, not merely unused.)
7. **`ImagePromptPayload` shape regression (Section 2):** `grep -n "messages" src/llm/llm.service.interface.ts` → nothing (Section 2 removed `messages?: Array<{ content: string }>` from `ImagePromptPayload`). `grep -n "uri?:" src/llm/llm.service.interface.ts` → nothing (Section 2 removed the `uri?: string` field from `ImagePromptPayload.images`). Scoped to that one file because `messages` is a high-frequency token elsewhere in the LLM module.
8. `grep -rn "process.env.ALLOWED_IMAGE_MIME_TYPES" src/prompt` → nothing (Section 4). **Mandatory (not optional)**: per the now-mandatory Section 4 follow-up note, the `process.env.ALLOWED_IMAGE_MIME_TYPES` assignments in `vitest.setup.ts` and `src/v1/assessor/assessor.service.spec.ts` are also removed; this regression grep is unconditional, not conditional on implementer choice.
9. Live confirmation: `npm run test:e2e:live` was executed in Section 5.5. Re-run it here only if the codebase changed materially after that point (e.g. a Section 6/7 edit that could alter the request path); otherwise the Section 5.5 result stands as the real-API validation.

### Section checks

- All commands above return green.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Documentation and rollout notes

### Objective

- Ensure docs and JSDoc reflect the cleaned-up path and the new SDK; no behavioural docs change required.

### Constraints

- Only modify documents relevant to the touched areas.

### Acceptance criteria

- JSDoc on `ImagePrompt`, `GeminiService.buildContents`, `GeminiService.generateAndParseResponse`, `GeminiService.buildModelParams`, and `ImagePromptPayload` accurately reflects the final shapes (no `messages`/`uri`/`buildUserMessageParts`; `result.text` getter; `config.thinkingConfig`).
- `docs/architecture/modules.md` (line 85): the `file-type: File type detection` entry is **corrected**, not merely deleted. The actual code (`src/common/pipes/image-validation.pipe.ts` line 2) uses `mime-detect`, so the line should read `mime-detect: File type detection`. If `mime-detect` is not otherwise listed in that Dependencies block, add it.
- README/architecture references to `@google/generative-ai` are updated to `@google/genai`. Known occurrences to update (confirm via `grep -rn "@google/generative-ai\|GoogleGenerativeAI\|getGenerativeModel" docs`):
  - `docs/modules/llm.md` (line 328): `**@google/generative-ai** - Google Gemini API client` → `**@google/genai** - Google Gemini API client`.
  - `docs/testing/E2E_GUIDE.md` (line 62): the sentence describing the mock shim patching `@google/generative-ai` by overriding `GoogleGenerativeAI.prototype.getGenerativeModel` must be **rewritten** (not just a package-name swap), because the new shim (per Section 5.1) imports `GoogleGenAI` from `@google/genai` and patches `models.generateContent`. Replace the description to match the new mechanism, and reference the `result.text` getter rather than `result.response.text()`.
- `test/utils/llm-mock.mjs` is rewritten per Section 5.1 (its inline `@google/generative-ai` import is gone), so a docs-wide grep for `@google/generative-ai` returns nothing across `docs/`, `src/`, and `test/`.
- No deviations from the "no new user-facing behaviour" assumption.

### Required checks

1. `grep -rn "buildUserMessageParts\|extractStatusCode\|@google/generative-ai\|GoogleGenerativeAI\|getGenerativeModel\|file-type\|GoogleGenerativeAIFetchError" docs src test` → nothing. (Section 5.1 guarantees `test/` is clean; this check covers the whole repo.)
2. Confirm the Section 4 and Section 5 `@remarks` are present in `image.prompt.ts` and `gemini.service.ts`.
3. Re-read `docs/testing/E2E_GUIDE.md` (around line 62) and `docs/architecture/modules.md` (around line 85) to confirm the rewritten `@google/genai` / `mime-detect` descriptions are accurate (post-edit).
4. Verify mandatory-read evidence is complete for any delegated docs/review handoffs.

### Optional `@remarks` JSDoc review

- Confirm Section 4 (`ConfigService` for MIME types) and Section 5 (`result.text` getter; `thinkingConfig.thinkingBudget`) `@remarks` are present.
- If no further `@remarks` are needed, record `None`.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Suggested implementation order

1. Section 1 (remove `buildUserMessageParts`)
2. Section 2 (remove `messages`/`uri` dead branches + preserve `['', ...images]`)
3. Section 3 (de-duplicate status-code extraction + remove redundant logging)
4. Section 4 (ConfigService injection for MIME types)
5. Section 5 (migrate to `@google/genai`) — do this before Section 6 so the `Part`/response-shape changes are settled
6. Section 5.1 (rewrite `test/utils/llm-mock.mjs` for `@google/genai` + run `test:e2e:mocked`) — runs immediately after Section 5 so the mocked E2E suite does not regress; **must be complete before `@google/generative-ai` is removed from `package.json`** (see the Section 5 _Acceptance criteria_ gate)
7. Section 5.5 (live E2E validation against the real Gemini API) — runs immediately after Sections 5 and 5.1 so any new-SDK shape defect (especially the multimodal empty-string text part of Assumption 2, which Sections 1–5 leave unverified) is caught and fixed in Section 5 before tidying
8. Section 6 (misc tidying)
9. Section 7 (consolidate duplicate spec)
10. Regression and contract hardening
11. Documentation and rollout notes
