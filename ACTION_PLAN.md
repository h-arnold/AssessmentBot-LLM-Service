# Cleanup & SDK Migration Plan — Assessor → Gemini Path

## Read-First Context

Before writing or executing this plan:

1. Read `AGENTS.md` (project instructions; mandatory).
2. Read `docs/development/code-style.md` (canonical style and policy; mandatory).
3. Read the de-sloppification review findings that originated this plan (assessor → gemini path).
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

- _(Fill during implementation.)_

---

## Section 2 — Remove dead `messages`/`uri` branches in `GeminiService` (preserve required empty text part)

### Objective

- Remove the `messages` extraction in `GeminiService.buildContents` (image branch) and the `uri`/`fileData` branch in `mapImageParts`, because no producer on the request path emits `messages` or `uri`.
- **Preserve the leading empty-string text part** (see Assumption 2): image `buildContents` must continue to return `['', ...imageParts]`.

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

### Section checks

- `npm test -- src/llm/gemini.service.spec.ts src/v1/assessor/assessor.service.spec.ts src/prompt/prompt.base.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- None.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Section 3 — De-duplicate status-code extraction and remove redundant logging

### Objective

- Remove `GeminiService.extractStatusCode` (duplicate of `LLMService.extractErrorStatusCode`).
- Remove the redundant try/catch error logging in `GeminiService._sendInternal`, since `LLMService.send` already logs terminal failures.

### Constraints

- The subclass (`GeminiService`) will no longer call `extractErrorStatusCode` once its `_sendInternal` try/catch is removed, so **no change to the base class is required**. Keep `LLMService.extractErrorStatusCode` `private` (do **not** make it `protected`); Assumption 5 holds ("no base-class change expected"). Any text suggesting the base class must change for the subclass to reuse the extractor is obsolete and should be ignored.
- Error-handling semantics (retry on 429, `ResourceExhaustedError` on quota, terminal throw) must be unchanged.
- Confirm the new `@google/genai` errors expose `status`/`message` (Assumption 5); if so, no change to the base class.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/llm/gemini.service.ts`, `src/llm/llm.service.interface.ts`, `src/llm/gemini.service.spec.ts`

### Acceptance criteria

- `GeminiService` has no `extractStatusCode` method; it reuses the base extractor (or reads `error.code` separately if needed).
- `_sendInternal` no longer wraps the call in a try/catch that re-logs; it returns `this.generateAndParseResponse(...)` directly.
- `gemini.service.spec.ts` error/retry/resource-exhausted suites still pass (they assert thrown errors and call counts).
- Failed requests are logged exactly once (by the base class).

### Required test cases (Red first)

1. **Red**: Confirm the existing `gemini.service.spec.ts` error/retry suites still pass after removing the subclass catch (they should — base class owns logging). Assert no duplicate log if a logger spy is in place.
2. **Red**: Confirm `extractStatusCode` is no longer referenced anywhere (grep).

### Section checks

- `npm test -- src/llm/gemini.service.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- None.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

---

## Section 4 — Inject `ConfigService` for image MIME types (policy deviation fix)

### Objective

- Stop reading `process.env.ALLOWED_IMAGE_MIME_TYPES` directly inside `ImagePrompt.readImageFile`; obtain the allowed MIME types via `ConfigService` in line with project policy.

### Constraints

- `ImagePrompt` is instantiated with `new` in `PromptFactory`, so the array is passed into its constructor.
- The value is `string[]` from `ConfigService.get('ALLOWED_IMAGE_MIME_TYPES')`; the schema default handles the fallback (do not re-implement one).
- `PromptModule` must import `ConfigModule` so `ConfigService` is injectable into `PromptFactory`. Update `src/prompt/prompt.module.ts` and the `PromptFactory` test modules (`src/prompt/prompt.factory.spec.ts`, `src/prompt/prompt.module.spec.ts`) accordingly; otherwise DI resolution fails.
- `allowedMimeTypes` is appended as the **fifth** positional parameter of the `ImagePrompt` constructor, immediately after `systemPrompt` (i.e. `(inputs, logger, images?, systemPrompt?, allowedMimeTypes)`). All `new ImagePrompt(...)` call sites must pass it.

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
- `ImagePrompt` constructor accepts `allowedMimeTypes: string[]` (fifth positional parameter, after `systemPrompt`) and uses it for the MIME check.
- `PromptFactory` injects `ConfigService` and passes `configService.get('ALLOWED_IMAGE_MIME_TYPES')` into `new ImagePrompt(...)`.
- `image.prompt.spec.ts` constructs `ImagePrompt` with an explicit `allowedMimeTypes` array (no `process.env` mutation required) at **all** call sites: lines 46, 74, 89, 102, 116, 131, 148, 160 (8 occurrences), and the production call site in `prompt.factory.ts` (line 186).
- `PromptModule` (`src/prompt/prompt.module.ts`) declares `imports: [ConfigModule]`.
- `prompt.factory.spec.ts` and `prompt.module.spec.ts` `TestingModule` setups import `ConfigModule` (or provide `ConfigService`) so `PromptFactory` resolves.

### Required test cases (Red first)

1. **Red**: In `image.prompt.spec.ts`, remove every `process.env.ALLOWED_IMAGE_MIME_TYPES = ...` setup (lines 19, 109, 154) and pass an explicit `allowedMimeTypes` array to **all** `ImagePrompt` constructor calls (lines 46, 74, 89, 102, 116, 131, 148, 160). Assert (a) allowed MIME accepted, (b) disallowed MIME rejected, (c) path traversal/absolute rejected. Run; it fails because the constructor no longer reads `process.env` and the call sites are missing the new argument.
2. **Red**: Add a test that an empty/undefined mimeType is rejected.

### Section checks

- `npm test -- src/prompt/image.prompt.spec.ts src/prompt/prompt.factory.spec.ts src/prompt/prompt.module.spec.ts`
- `npm run lint`

### Optional `@remarks` JSDoc follow-through

- Document on `ImagePrompt`/`readImageFile` that allowed MIME types are supplied via `ConfigService` (injected through `PromptFactory`), not read from `process.env`.

### Implementation notes / deviations / follow-up

- _(Fill during implementation.)_

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
- `package.json` no longer lists `@google/generative-ai`; `@google/genai` (`^2.10.0`) remains. Lockfile updated via install.
- `GeminiModelParameters` removed from `src/llm/types.ts`.
- `gemini.service.spec.ts` mocks `@google/genai` (not `@google/generative-ai`) and asserts the new shapes; error tests use `ApiError` from `@google/genai` (extends `Error`, exposes `status: number`), constructed as `new ApiError({ message, status })`.
- No reference to `@google/generative-ai` remains in `src/` (grep).

### Required test cases (Red first)

1. **Red**: Update `gemini.service.spec.ts` mock to import `GoogleGenAI` from `@google/genai` and return `{ models: { generateContent: mockGenerateContent } }`. Update `createValidResponse` to return `{ text: '<json>' }` (not `{ response: { text: () => ... } }`). Additionally:
   - Update the `should initialise the SDK correctly` test: the constructor call is now `new GoogleGenAI({ apiKey: 'test-api-key' })`, so change the assertion from `toHaveBeenCalledWith('test-api-key')` to `toHaveBeenCalledWith({ apiKey: 'test-api-key' })`.
   - Remove the now-defunct `mockGetGenerativeModel` declaration and **both** `expect(mockGetGenerativeModel).toHaveBeenCalledWith(...)` assertions (the SDK no longer exposes `getGenerativeModel`; these would be undefined and fail to compile). The `mockGenerateContent` call-shape assertions in Red #2/#3 supersede them.
     Run; it fails against the old `@google/generative-ai` mock/shape and the stale `mockGetGenerativeModel` references.
2. **Red**: Update the string-payload test assertion to `expect(mockGenerateContent).toHaveBeenCalledWith({ model: 'gemini-2.5-flash-lite', contents: ['test prompt'], config: { systemInstruction: 'system prompt', temperature: 0, thinkingConfig: { thinkingBudget: 0 } } })`.
3. **Red**: Update the multimodal test assertion to `expect(mockGenerateContent).toHaveBeenCalledWith({ model: 'gemini-2.5-flash', contents: ['', { inlineData: { mimeType: 'image/png', data: 'test-data' } }], config: { systemInstruction: 'system prompt', temperature: 0, thinkingConfig: { thinkingBudget: 0 } } })`.
4. **Red**: Replace `GoogleGenerativeAIFetchError` usages in error/retry tests with `ApiError` from `@google/genai`. Construct as `new ApiError({ message: 'Rate limited', status: 429 })` — note the constructor takes an `ApiErrorInfo` object `{ message, status }`, not a `(message, status)` tuple. Confirm `ApiError.status` (number) is read by the base `LLMService.extractErrorStatusCode`, so no base-class change is needed.

### Section checks

- `npm test -- src/llm/gemini.service.spec.ts`
- `npm run lint`
- `grep -r "@google/generative-ai" src` returns nothing.

### Optional `@remarks` JSDoc follow-through

- Note in `GeminiService` that `result.text` is used (the new SDK exposes the concatenated text via a getter) and that `thinkingConfig.thinkingBudget = 0` disables thinking for the 2.5 models.

### Implementation notes / deviations / follow-up

- Confirmed during planning: the new SDK exports `ApiError` (`extends Error`) with a `status: number` property, constructor `new ApiError({ message, status })`. The base `LLMService.extractErrorStatusCode` already reads `error.status`, so no base-class change is required. Verify the `ContentListUnion` typing accepts the flat `['', ...imageParts]` / `[user]` `contents` array during implementation.

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

- Collapsing `executeAssessment` must not change logged output meaningfully.

### Delegation mandatory reads

- `AGENTS.md`, `docs/development/code-style.md`
- `src/v1/assessor/assessor.service.ts`, `src/prompt/prompt.base.ts`, `package.json`

### Acceptance criteria

- `file-type` absent from `package.json` (and lockfile); no `src/` import references it.
- `AssessorService` has a single `createAssessment` method (no private `executeAssessment`).
- `Prompt.render` uses `this.constructor.name` and `Object.keys(this)` directly.

### Required test cases (Red first)

1. **Red**: `assessor.service.spec.ts` calls `createAssessment`; ensure it still passes after the wrapper collapse (regression guard).
2. **Red**: `prompt.base.spec.ts` still passes after render-guard removal.
3. Confirm `file-type` removal via `grep -r "file-type" src` returning nothing.

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
- `npm run lint:british` passes.
- No remaining references to removed symbols (`buildUserMessageParts`, `extractStatusCode`, `messages` on image payloads in source, `process.env.ALLOWED_IMAGE_MIME_TYPES` in `image.prompt.ts`, `file-type`, `@google/generative-ai`).
- The `@google/genai` migration builds and the e2e suite (if wired) still exercises the assessor endpoint.

### Required test cases/checks

1. `npm run lint`
2. `npm test`
3. `npm run lint:british`
4. `grep -r "@google/generative-ai" src` → nothing (except none expected).
5. `grep -r "buildUserMessageParts\|extractStatusCode\|file-type" src` → nothing.
6. (Recommended) `npm run build && npm run test:e2e:mocked`.
7. Live confirmation: `npm run test:e2e:live` was executed in Section 5.5. Re-run it here only if the codebase changed materially after that point (e.g. a Section 6/7 edit that could alter the request path); otherwise the Section 5.5 result stands as the real-API validation.

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
- `docs/architecture/modules.md` reference to `file-type` (line 85) is removed if still present.
- Any README/architecture references to `@google/generative-ai` are updated to `@google/genai`.
- No deviations from the "no new user-facing behaviour" assumption.

### Required checks

1. Grep docs for `buildUserMessageParts`, `file-type`, `@google/generative-ai`, and stale `messages`/`uri` references; remove or correct.
2. Confirm the Section 4 and Section 5 `@remarks` are present in `image.prompt.ts` and `gemini.service.ts`.
3. Verify mandatory-read evidence is complete for any delegated docs/review handoffs.

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
   5.5. Section 5.5 (live E2E validation against the real Gemini API) — run immediately after Section 5 so any new-SDK shape defect (especially the multimodal empty-string text part) is caught and fixed in Section 5 before tidying
6. Section 6 (misc tidying)
7. Section 7 (consolidate duplicate spec)
8. Regression and contract hardening
9. Documentation and rollout notes
