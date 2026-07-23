# Mistral LLM Provider — Specification

## Status

- Draft v2.3 — revised after third Planner-Reviewer pass to fix the live-E2E vitest project `include` gap, address the `MISTRAL_API_KEY`-now-required blast radius across unit-test mocks and `.test.env`-less E2E runs, resolve the caller-precedence contradiction, and add the Shared-helper planning decision for the duplicated Mistral/Gemini error-mapping logic.

### Change history

- **v2.3:** Resolved third-pass Planner-Reviewer findings:
  - **Live E2E project include (CRITICAL).** `vitest.config.ts` defines the `e2e-live` project with an explicit `include: ['test/assessor-live.e2e-spec.ts']` (a single-file array, not a glob). The new `test/mistral-live.e2e-spec.ts` would not run under `npm run test:e2e:live` until `vitest.config.ts` is updated. Added a new backend change updating `vitest.config.ts` `e2e-live` `include` to an explicit two-element array covering both live test files (a glob is **not** used — see IMPROVEMENT finding from the second review pass: a glob could accidentally include files not intended for the `e2e-live` project configuration).
  - **Existing Gemini live test silent flip (CRITICAL).** The new schema defaults `DEFAULT_TEXT_TABLE_MODEL`/`DEFAULT_IMAGE_MODEL` to `mistral-small-latest`. The existing `test/assessor-live.e2e-spec.ts` calls `startApp(logFilePath)` with no `environmentOverrides`, so once the new defaults land, the Gemini live regression test would silently route to Mistral — defeating its purpose. Added a new product decision (#11) pinning per-suite `environmentOverrides` for any live or mocked E2E that targets a specific provider; recorded as backend changes for `assessor-live.e2e-spec.ts` and `assessor.e2e-spec.ts` overrides and mirrored in the action plan.
  - **`MISTRAL_API_KEY` blast radius (CRITICAL).** With `MISTRAL_API_KEY: z.string().min(1)` mandatory, any E2E or unit-test run where the env lacks it will fail at Zod validation before the app starts — including mocked E2E and unit specs whose mock `ConfigService` returns empty for unknown keys. Added a backend change adding `MISTRAL_API_KEY: 'dummy-key-for-testing'` to `app-lifecycle.ts` `defaultTestValues` parallel to the existing `GEMINI_API_KEY` dummy, plus a concrete unit-test mock audit (see action plan Section 7) enumerating every mock `ConfigService`/`configObjectSchema.parse` site that must return a non-empty `MISTRAL_API_KEY` and the four new model/effort vars.
  - **Caller-precedence contradiction (IMPROVEMENT).** The previous action plan introduced "caller-supplied `model`/`reasoningEffort` is not overwritten by server config", which contradicted the spec's routing pseudocode (unconditional `payload.model = modelName`) and the "Out of scope: per-request model selection" non-goal. Resolved by removing caller-precedence from the contract entirely — server config always wins. The only call-site of the routing layer (`AssessorService`, via `promptFactory`) never sets `model`/`reasoningEffort`, so the precedence rule was dead code. Updated "Routing decision flow" pseudocode comment and added product decision #12 to make the rule explicit; the action-plan constraint is removed.
  - **Shared-helper planning gate (IMPROVEMENT).** `MistralService.mapError()` re-implements `GeminiService`'s `extractStatusCode`/`hasStringStatus`/`isResourceExhausted`/`isRateLimit`/`buildError`/`extractMessage` cascade — ~150 lines of near-duplicate logic. The repo's KISS/DRY prime directive and the ACTION_PLAN template's mandatory Shared-helper planning gate require this to be a recorded decision. Added product decision #13: extract the provider-agnostic classification cascade into a shared helper module (`src/llm/llm-error-mapper.ts`) parameterised by probe hooks; both `GeminiService` and `MistralService` adopt it. Updated backend change #3 and backend change #5 (Gemini refactor) accordingly.
  - **`responseFormat`/`safePrompt` softening (IMPROVEMENT).** `_sendInternal` sends `responseFormat: { type: 'json_object' }` and `safePrompt: false`. Not every model in the registry necessarily supports `json_object` (e.g. some `pixtral-*` / `open-mistral-*` variants). Softened these from hard contract to "recommended defaults; implementer may drop per-model if live tests fail." Added to "Resolved open questions" #6.
  - **Gemini `'low'` == `'off'` redundancy (IMPROVEMENT).** Both `'off'` and `'low'` currently map to `thinkingBudget: 0` for Gemini, making the two test cases indistinguishable. Marked this as a known v1 limitation in the mapping table and the action plan; Section 5 keeps both tests but documents that they assert the same request shape intentionally (a single `"off"|"low" → 0` assertion would mask the gap).
  - **Runtime `resolveProvider()` failure behaviour (NITPICK).** Clarified that `resolveProvider()` throwing at `send()` time (if an operator edits env at runtime to an unsupported model) maps to `InvalidRequestError` via `MistralService`/`GeminiService` — the run-time edit is not a startup-validated path.
  - **`HTTPValidationError` clarity (NITPICK).** Noted in the SDK-shapes section that `HTTPValidationError` (422) is intentionally folded into `InvalidRequestError` by the priority order, not specially classified.
- **v2.2:** Resolved Planner-Reviewer findings:
  - **API-key validation contradiction.** Product decision #4 already makes both `GEMINI_API_KEY` and `MISTRAL_API_KEY` required and non-empty via the Zod schema. The previous `RoutingLLMService` constructor step 3 (runtime key check, "no check for unselected providers") duplicated Zod's role and contradicted decision #4. Removed step 3; the router constructor now only validates model names (aggregated, fail-fast). Provider services retain their existing defensive own-key checks (unchanged).
  - **Mock response shape.** Added the exact `ChatCompletionResponse`-shaped mock object (`choices[0].message.content` JSON string) so `MistralService._sendInternal` parsing is unambiguous.
  - **RoutingLLMService constructor comment.** Clarified that model/reasoning-effort config is read at `send()` time (run-time config changes take effect without restart); the constructor only validates model names and stores provider instances.
- **v2.1:** Resolved reviewer finding on the Mistral SDK mock mechanism. Verified from `node_modules/@mistralai/mistralai/esm/sdk/sdk.js` that `Mistral.prototype.chat` is a lazy getter backed by a private `_chat` field (`get chat() { return (this._chat ?? (this._chat = new Chat(this._options))); }`) — the constructor does **not** assign `this.chat` as an own property (unlike the Gemini SDK, which assigns `this.models = ...`). The earlier Gemini-style getter/setter intercept (which relied on intercepting an own-property assignment that never happens for Mistral) is replaced with a prototype getter override returning a mock `Chat` object. Updated the mock-shim product decision (#9), backend change #12, and resolved open question #4 accordingly. No other decisions changed.
- **v2.0:** Resolved critical review finding #1: `RoutingLLMService` no longer extends `LLMService`. It now implements a shared `ILlmService` interface alongside the abstract base class. The DI token in `LlmModule` changes from the `LLMService` class token to a string token (`'LLM_SERVICE'`). `AssessorService` injection is updated accordingly. Researched `@mistralai/mistralai` v2.5.0 SDK: documented exact client class (`Mistral`), chat method (`chat.complete()`), error class (`MistralError` with `statusCode`, `body`), reasoning-effort enum (`none`|`minimal`|`low`|`medium`|`high`|`xhigh`), image-chunk shape (`ImageURLChunk` with data URIs), and system-message support. Resolved open questions #1 and #2. Added concrete constructor signatures. Clarified model-name validation strategy. Added mock-shim implementation notes. Updated reasoning-effort mapping table with Mistral native values.

## Purpose

This document defines the intended behaviour for adding Mistral as a second LLM provider alongside the existing Gemini provider, with model and reasoning-effort configuration per task type.

The feature will be used to:

- Allow the application to route assessment prompts to either Gemini or Mistral models, determined by the model name configured for each task type (text/table vs. image).
- Provide a fully-fledged `MistralService` extending the abstract `LLMService`, implementing `_sendInternal`, `mapError`, and `providerName` — matching the existing `GeminiService` pattern.
- Allow operators to configure model names and reasoning effort per task type via environment variables, without code changes.
- Introduce a shared `ILlmService` interface so that the routing dispatcher and the abstract provider class satisfy the same contract without forcing the router into the provider inheritance hierarchy.
- Enable both live (API-key-gated) and mocked E2E tests for the Mistral provider, with mocks derived from real Mistral API responses.

This feature is **not** intended to:

- Remove or deprecate the Gemini provider — both providers coexist and are selectable per task type.
- Introduce a plugin system or dynamic provider discovery — the set of supported providers is known at build time.
- Change the `LlmResponse` shape, the `AssessorService` contract (beyond the injection token change), or the HTTP API surface.
- Add support for any LLM provider other than Gemini (existing) and Mistral (new).

## Agreed product decisions

1. **Provider selection is per-task-type, inferred from model name.** The `DEFAULT_TEXT_TABLE_MODEL` and `DEFAULT_IMAGE_MODEL` environment variables determine which model is used for each task type. The provider (Gemini or Mistral) is inferred by matching the model name against a hardcoded registry of known model prefixes.

2. **`RoutingLLMService` does not extend `LLMService`.** A new shared interface `ILlmService` (exporting `send(payload)` → `Promise<LlmResponse>`) is introduced. Both the abstract `LLMService` class and the new `RoutingLLMService` class implement this interface. `LlmModule` provides the router under a string DI token (`'LLM_SERVICE'`). `AssessorService` injects `@Inject('LLM_SERVICE')` instead of `LLMService`. This avoids forcing the dispatcher into the provider-class hierarchy.

3. **Reasoning effort is an abstract, provider-agnostic concept.** Four abstract levels are defined: `'off' | 'low' | 'high' | 'max'`. Each provider's `_sendInternal` maps these to the provider's native parameters. The level is determined per task type from `TEXT_REASONING_EFFORT` and `IMAGE_REASONING_EFFORT` environment variables, and is carried in the payload as an optional `reasoningEffort` field. Mistral's native values (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`) are mapped from the abstract levels; Gemini maps them to `thinkingConfig.thinkingBudget` integers.

4. **Both API keys are independently required.** `GEMINI_API_KEY` (existing, remains required) and `MISTRAL_API_KEY` (new, required) must both be present in the environment. A provider that is not used for any task type still requires its key to be set (to a dummy value if necessary). Making keys conditionally required is deferred.

5. **The abstract `LlmPayload` types gain optional fields.** `StringPromptPayload` and `ImagePromptPayload` each gain two optional fields: `model?: string` and `reasoningEffort?: ReasoningEffort`. These are filled by `RoutingLLMService` before delegation. When absent, each provider falls back to its own defaults (current hardcoded behaviour for Gemini, the env-var-configured defaults for Mistral).

6. **Supported model names are declared in a shared model registry.** A new module (`src/llm/model-registry.ts`) defines a static mapping of model name prefixes to provider identifiers. The registry is the single source of truth for routing decisions and is also used for startup validation. Only models whose prefixes appear in the registry are supported.

7. **All three services are registered as providers.** `LlmModule` registers `GeminiService`, `MistralService`, and `RoutingLLMService` as independent `@Injectable()` providers. Each provider service's constructor validates its **own** API key at instantiation time (the existing `GeminiService` pattern — throw if `GEMINI_API_KEY`/`MISTRAL_API_KEY` is empty). `RoutingLLMService` validates the configured model names against the registry in its constructor and **does not** re-check API keys (see "Runtime validation" below — Zod already enforces both keys). Instantiation order is `GeminiService` → `MistralService` → `RoutingLLMService` (NestJS topological sort based on constructor injection). The `LLM_SERVICE` string token exports the router.

8. **Error mapping follows the established contract.** `MistralService.mapError()` follows the same classification priority order documented in `docs/llm/error-handling.md`, mapping `MistralError` (the SDK's HTTP error class, with `statusCode` number and `body` string) and `HTTPClientError` (network errors) to the existing `LlmError` subclasses.

9. **Mocked E2E tests support both providers.** The existing `llm-mock.mjs` ESM preload shim is extended to also patch the Mistral SDK alongside `GoogleGenAI.prototype.models`, returning a realistic happy-path response. The two SDKs use **different mock patterns**: the Gemini SDK assigns `this.models = new Models(...)` as an own property in its constructor, so the existing shim uses a getter/setter intercept on `GoogleGenAI.prototype.models` (the setter silently drops the own-property assignment). The Mistral SDK exposes `chat` as a lazy getter on `Mistral.prototype` backed by a private `_chat` field (`get chat() { return (this._chat ?? (this._chat = new Chat(this._options))); }`) and the constructor never assigns `this.chat` as an own property, so the Mistral mock overrides the prototype getter directly (`Object.defineProperty(Mistral.prototype, 'chat', { configurable: true, get() { return mockChat; } })`) — no setter is required. Both patches coexist in the same shim and produce the same `LlmResponse` structure as the real APIs, but with distinguishable mock-specific reasoning text.

10. **Live E2E tests for Mistral follow the same `assessor-live.e2e-spec.ts` pattern.** A new `mistral-live.e2e-spec.ts` file exercises the full assessor pipeline configured to use Mistral models, requiring `MISTRAL_API_KEY` in `.test.env`. Results from running live tests are captured to refine the mocked responses used in `llm-mock.mjs`.

11. **Per-E2E provider pinning via `environmentOverrides`.** Because the schema's `DEFAULT_TEXT_TABLE_MODEL`/`DEFAULT_IMAGE_MODEL` defaults are `mistral-small-latest`, any live or mocked E2E that targets a _specific_ provider (e.g. the existing Gemini regression suites) must explicitly pin `DEFAULT_TEXT_TABLE_MODEL`/`DEFAULT_IMAGE_MODEL` to that provider's models via `startApp`'s `environmentOverrides` parameter. The default env shipped by `app-lifecycle.ts` is provider-neutral; tests that do not pin their model(s) will route through the configured default (Mistral) and may exercise the wrong provider. Both the existing `assessor-live.e2e-spec.ts` and `assessor.e2e-spec.ts` fall in this category and must be updated in this change.

12. **Server-side configuration is authoritative for `model` and `reasoningEffort`.** `RoutingLLMService.send()` always sets `payload.model` and `payload.reasoningEffort` from the resolved server config, overwriting any pre-existing values on the incoming payload. This is consistent with the "Out of scope: per-request model selection from the API consumer" non-goal: only the server decides which model and reasoning effort to use per task type. In practice this rule is a no-op for the current call-site — `AssessorService` builds payloads via `promptFactory`, which never sets `model` or `reasoningEffort` — but making it explicit prevents future drift if a caller ever attempts to set these fields.

13. **The provider error-mapping cascade is a shared helper.** `MistralService.mapError()` and `GeminiService.mapError()` follow an identical priority order and share ~150 lines of near-duplicate helper logic (`extractStatusCode`, `hasStringStatus`, `isResourceExhausted`, `isRateLimit`, `buildError`, `extractMessage`). Per the repo's KISS/DRY prime directive and the action-plan template's mandatory Shared-helper planning gate, the provider-agnostic classification cascade is extracted into a single shared module (`src/llm/llm-error-mapper.ts`) parameterised by probe hooks (`extractStatusCode`, message-pattern sets, and a configurable HTTP-status probe shape that knows about both Gemini's `error.status`/`error.code`/`error.response.status` shapes and Mistral's `MistralError.statusCode`/`.body` shape, plus `HTTPClientError` subclass-name matching for Mistral). `GeminiService` and `MistralService` both adopt the shared helper; the only per-provider code that remains is the probe configuration and `providerName`. This is a v1 contract decision, not a deferral.

## Existing system constraints

### Backend constraints already in place

- `LLMService` is an abstract class with `send()` (public, non-abstract, with retry loop), abstract `_sendInternal(payload)`, abstract `mapError(error)`, and abstract `providerName`.
- `GeminiService` extends `LLMService` and is the current sole implementation. It hardcodes its model selection from payload type: `gemini-2.5-flash-lite` for text/table, `gemini-2.5-flash` for images.
- `LlmModule` currently binds `LLMService` to `GeminiService` via `{ provide: LLMService, useClass: GeminiService }` and exports `LLMService`.
- The error handling library at `src/common/errors/` provides the nine `LlmError` subclasses and is fully provider-agnostic.
- `JsonParserUtility` is used by `GeminiService` to parse and repair LLM response text before Zod validation.
- `AssessorService` injects `LLMService` (class token) and calls `send(payload)` — it is a transparent pass-through. **This changes**: it will now inject a string token instead.

### Current data-shape constraints

- `LlmPayload` is a union of `StringPromptPayload` and `ImagePromptPayload`, each with `system`, optional `temperature`, and content-specific fields. Neither carries `model` or `reasoningEffort`.
- `LlmResponse` (Zod-validated) has `completeness`, `accuracy`, and `spag` criteria, each with `score` (0–5) and `reasoning` (string). This shape is provider-agnostic and is not changed.

### Mistral SDK (`@mistralai/mistralai` v2.5.0) — researched shapes

- **Client class:** `Mistral` (from `@mistralai/mistralai`). Instantiated via `new Mistral({ apiKey })`. Access API surface via sub-clients: `client.chat`, `client.models`, etc.
- **Chat method:** `client.chat.complete(request, options?)` — takes `ChatCompletionRequest`, returns `Promise<ChatCompletionResponse>`. There is also a `stream()` method (not used).
- **Request shape (`ChatCompletionRequest`):** Required fields `model: string`, `messages: Array<ChatCompletionRequestMessage>`. Optional fields include `temperature`, `maxTokens`, `reasoningEffort` (`ReasoningEffort` enum: `'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'`), `responseFormat`, `safePrompt`, `randomSeed`, `tools`.
- **Response shape (`ChatCompletionResponse`):** Has `choices: Array<ChatCompletionChoice>`. Each choice has `message?: AssistantMessage`. The assistant message has `content?: string | Array<ContentChunk> | null`. For simple text responses, `content` is a plain string.
- **Message types** are a discriminated union on `role`: `SystemMessage` (`{ role: 'system', content: string | ...}`), `UserMessage` (`{ role: 'user', content: string | ContentChunk[] }`), `AssistantMessage`, `ToolMessage`.
- **Image content:** `UserMessage.content` can be an array of `ContentChunk` items, including `ImageURLChunk` (`{ type: 'image_url', imageUrl: string | ImageURL }`). `ImageURL` has `{ url: string }` where `url` can be a `data:` URI.
- **Error class (`MistralError`):** Extends `Error`. Key properties: `statusCode` (number), `body` (string — raw response body), `message` (inherited from `Error`), `headers` (Headers), `rawResponse` (Response). A variant `SDKError extends MistralError` is the fallback for unmapped HTTP errors. `HTTPValidationError extends MistralError` for 422 responses — **not specially classified**; the priority order below folds any 4xx (including 422) that is not 400/401/403/429/5xx into `InvalidRequestError`.
- **Network errors (`HTTPClientError`):** Extends `Error`. Subclasses: `ConnectionError`, `RequestTimeoutError`, `RequestAbortedError`, `InvalidRequestError`, `UnexpectedClientError`. These have a `cause` property and a `name` string (e.g., `'ConnectionError'`). They do **not** have `statusCode` — they represent transport-layer failures, not HTTP responses.

## Domain and contract recommendations

### Why this approach is preferable

- **Separation of concerns:** The shared `ILlmService` interface extracts the contract (a `send()` method), leaving the abstract `LLMService` class to own retry logic and provider contracts, while `RoutingLLMService` owns dispatch. No inheritance mismatch.
- **Backward compatibility:** Adding optional `model` and `reasoningEffort` fields to `LlmPayload` does not break existing callers. `GeminiService` continues to work with or without these fields.
- **Testability:** Both providers can be unit-tested independently. The router can be tested with mocked providers. The interface makes mocking trivial. E2E mocks are derived from real responses.

### `ILlmService` interface

Location: `src/llm/llm.service.interface.ts` (alongside existing types).

```ts
/**
 * Shared contract for any service capable of sending prompts to an LLM.
 * Implemented by both the abstract {@link LLMService} provider base class
 * and the {@link RoutingLLMService} dispatcher.
 */
export interface ILlmService {
  send(payload: LlmPayload): Promise<LlmResponse>;
}

// LLMService already satisfies this — it has send()
// RoutingLLMService implements it directly
```

### DI token

```ts
/** String token for injecting the LLM service dispatcher. */
export const LLM_SERVICE_TOKEN = 'LLM_SERVICE';
```

### Recommended data shapes

#### ReasoningEffort type (in `llm.service.interface.ts`)

```ts
/**
 * Abstract reasoning-effort level. Each provider maps these to its native parameter.
 * - 'off':  No reasoning — fastest, deterministic.
 * - 'low':  Minimal reasoning.
 * - 'high': Significant reasoning.
 * - 'max':  Maximum reasoning (may be expensive/slow).
 */
export type ReasoningEffort = 'off' | 'low' | 'high' | 'max';
```

#### Updated StringPromptPayload

```ts
export type StringPromptPayload = {
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  reasoningEffort?: ReasoningEffort;
};
```

#### Updated ImagePromptPayload

```ts
export type ImagePromptPayload = {
  system: string;
  images: Array<{ mimeType: string; data?: string }>;
  temperature?: number;
  model?: string;
  reasoningEffort?: ReasoningEffort;
};
```

#### Model registry (`src/llm/model-registry.ts`)

```ts
export type ProviderId = 'gemini' | 'mistral';

export interface ModelEntry {
  provider: ProviderId;
  /** The model name must start with this prefix to match. */
  prefix: string;
}

/**
 * Ordered list of supported model→provider mappings.
 * The first matching entry wins (checked in declaration order).
 * Model names are matched case-sensitively against each entry's `prefix`.
 *
 * The Gemini and Mistral prefix sets are provider-disjoint (no model name can
 * match prefixes from both providers), so ordering across providers is
 * immaterial. Ordering within a provider matters only for same-provider
 * prefix overlaps (e.g. `gemini-2.5-flash` is a prefix of
 * `gemini-2.5-flash-lite`); longer, more-specific prefixes are intentional
 * here — `gemini-2.5-flash-lite` correctly maps to `gemini` because
 * `gemini-2.5-flash` is a prefix of it.
 */
export const SUPPORTED_MODELS: readonly ModelEntry[] = [
  // Gemini models
  { provider: 'gemini', prefix: 'gemini-2.5-flash' },
  { provider: 'gemini', prefix: 'gemini-2.0-flash' },
  // Mistral models
  { provider: 'mistral', prefix: 'mistral-small-latest' },
  { provider: 'mistral', prefix: 'pixtral-' },
  { provider: 'mistral', prefix: 'open-mistral-' },
] as const;

/**
 * Resolves a model name to its provider identifier.
 * @throws {Error} If the model name does not match any known prefix.
 */
export function resolveProvider(modelName: string): ProviderId { ... }

/**
 * Validates that a model name is supported. Throws a descriptive Error if not.
 * @throws {Error} If the model name does not match any known prefix.
 */
export function validateModelName(modelName: string): void { ... }
```

### Shared error-mapper helper API (`src/llm/llm-error-mapper.ts`)

Product decision #13 introduces a shared helper that owns the provider-agnostic classification cascade. The spec owns the helper's contract:

```ts
/**
 * Per-provider probe configuration supplied to {@link classifyLlmError}.
 * Each provider supplies its own probe implementation; the cascade is
 * shared.
 */
export interface LlmErrorMapperProbes {
  /** Provider identifier embedded in every produced `LlmError` instance. */
  providerName: string;
  /**
   * Extracts a numeric HTTP status code from a raw error, or returns
   * `undefined` when no status can be extracted. Each provider knows its
   * SDK's status-bearing fields.
   *
   * Gemini probes: `error.status`, `error.statusCode`, `error.code`,
   * `error.response.status`, `error.error.status`, `error.error.code`
   * (string values coerced to numbers).
   * Mistral probes: `MistralError.statusCode` (numeric), with the same
   * fallback shapes as Gemini for non-`MistralError` inputs.
   */
  extractStatusCode: (error: unknown) => number | undefined;
  /**
   * Case-insensitive match against the SDK's string-status conventions.
   * Gemini uses status strings like `'RESOURCE_EXHAUSTED'`,
   * `'RATE_LIMIT_EXCEEDED'`, `'429'`, `'rate_limit_exceeded'`,
   * `'resource_exhausted'`. Mistral errors do not use string statuses;
   * the Mistral probe implementation returns `false` for all inputs.
   */
  hasStringStatus: (error: unknown, value: string) => boolean;
  /**
   * Regex matching network-failure message patterns. Shared across
   * providers (`ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch
   * failed|network`).
   */
  networkPattern: RegExp;
  /**
   * Whether the input is an `HTTPClientError` subclass (Mistral only).
   * Gemini returns `false`. The check is by `error.name` membership in
   * the SDK's subclass-name set — see the warning below.
   * @defaultValue `() => false` — if omitted, the helper treats all errors
   *   as if the `HTTPClientError` probe returned `false`.
   */
  isHttpClientError?: (error: unknown) => boolean;
}

/**
 * Classifies a raw error from `_sendInternal` into an `LlmError` subclass
 * (or `undefined` when no pattern matches), following the priority order
 * documented in `docs/llm/error-handling.md`.
 *
 * Behaviour:
 * 1. Non-object or `null`/`undefined` inputs return `undefined`.
 * 2. `extractStatusCode()` and `hasStringStatus()` are called once each.
 *    Message is extracted from `error.message` (and `error.body` for
 *    Mistral) — see `buildError`.
 * 3. Priority order (highest first): `ResourceExhaustedError`,
 *    `RateLimitError`, `AuthenticationError`, `ContentFilteredError`,
 *    `ContextLengthExceededError`, `InvalidRequestError`,
 *    `ProviderServerError`, `NetworkError`, `undefined`.
 * 4. Tie-breaks: resource-exhausted > rate-limit; content-filtered >
 *    context-length.
 * 5. `error_` is narrowed to `Error | undefined` for `originalError` on
 *    the produced `LlmError` (non-`Error` inputs produce
 *    `originalError: undefined`).
 */
export function classifyLlmError(
  probes: LlmErrorMapperProbes,
  error: unknown,
): LlmError | undefined;
```

#### Mistral `HTTPClientError.InvalidRequestError` name — do **not** match in our `InvalidRequestError` classification

The Mistral SDK exports `HTTPClientError` subclasses including one named `InvalidRequestError`. This is a **name collision** with our own `LlmError` subclass `InvalidRequestError`, but the two are semantically different:

- Mistral's `HTTPClientError.InvalidRequestError` is a **network-layer / client-side error** (a programming error in the SDK call, not an HTTP response status). It is one of the transport-error subclasses alongside `ConnectionError`, `RequestTimeoutError`, and `RequestAbortedError`.
- Our `InvalidRequestError` is an **LlmError subclass** meaning "the provider returned an HTTP 4xx response code that was not specifically classified" (e.g. 418, 422, or generic 400). It is identified by HTTP status code, not by error name.

The `classifyLlmError` cascade **must not** classify an error as our `InvalidRequestError` based on `error.name === 'InvalidRequestError'`. Our `InvalidRequestError` classification is driven solely by HTTP status code (any 4xx not handled by the more specific rules). The `isHttpClientError` probe for Mistral matches on the **transport-layer subclass names** only: `'ConnectionError'`, `'RequestTimeoutError'`, `'RequestAbortedError'`, `'UnexpectedClientError'` — and **deliberately excludes `'InvalidRequestError'`** to avoid false positives. If a future SDK version adds `InvalidRequestError` as an `HTTPClientError` subclass name while also presenting a 4xx HTTP status, the HTTP-status rule wins (per the priority order) and the `isHttpClientError` check is only consulted when no HTTP status is present.

### Reasoning effort mapping table

| Abstract level | Mistral `reasoningEffort` | Gemini `thinkingBudget` |
| -------------- | ------------------------- | ----------------------- |
| `'off'`        | Omitted from request      | `0`                     |
| `'low'`        | `'low'`                   | `0`                     |
| `'high'`       | `'medium'`                | `1024`                  |
| `'max'`        | `'xhigh'`                 | `8192`                  |

The Gemini token budgets for `'high'` and `'max'` are sensible defaults that can be tuned in a follow-up. The `'off'` and `'low'` levels both default to `0` for Gemini (current behaviour — `thinkingBudget: 0`). Note: this makes the `'low'` and `'off'` levels **indistinguishable at the request level for Gemini** — both produce `thinkingBudget: 0`. This is a known v1 limitation (Gemini has no native `'low'`-equivalent); the mapping table is preserved so the abstract `ReasoningEffort` type remains provider-agnostic. The Section 5 unit tests deliberately keep separate test cases for `'off'` and `'low'` to document the gap rather than collapse it (a single combined case would mask the limitation). Tuning `'low'` to a small non-zero budget (e.g. `256`) is deferred.

### Validation recommendation

#### Environment schema additions

```ts
// In configObjectSchema (environment.schema.ts):
MISTRAL_API_KEY: z.string().min(1),                                        // required
DEFAULT_TEXT_TABLE_MODEL: z.string().default('mistral-small-latest'),      // validated at module init
DEFAULT_IMAGE_MODEL: z.string().default('mistral-small-latest'),           // validated at module init
TEXT_REASONING_EFFORT: z.enum(['off', 'low', 'high', 'max']).default('low'),
IMAGE_REASONING_EFFORT: z.enum(['off', 'low', 'high', 'max']).default('high'),
```

- Model names (`DEFAULT_TEXT_TABLE_MODEL`, `DEFAULT_IMAGE_MODEL`) are accepted as plain strings by the Zod schema (no registry coupling). Validation against the model registry happens in `RoutingLLMService`'s constructor at module init — if a configured model does not match any registry prefix, a descriptive `Error` is thrown (fail-fast).
- `GEMINI_API_KEY` remains as-is (required, `z.string().min(1)`).

#### Runtime validation

`RoutingLLMService`'s constructor performs these checks (in order):

1. Read `DEFAULT_TEXT_TABLE_MODEL` and `DEFAULT_IMAGE_MODEL` from `ConfigService`.
2. Call `validateModelName()` on each **inside a try/catch**, collecting any thrown errors. After both calls, if either threw, throw a single aggregated descriptive `Error` listing every unrecognised model name and the set of supported model prefixes (e.g. `Unsupported model name: '<name>'. Supported model prefixes: gemini-2.5-flash, gemini-2.0-flash, mistral-small-latest, pixtral-, open-mistral-`). `validateModelName()` throws on the first invalid model — the router must call it for both models and aggregate, so a misconfigured environment reports every problem in one start-up failure rather than failing one at a time.
3. **No API-key check in the constructor.** Both `GEMINI_API_KEY` and `MISTRAL_API_KEY` are already enforced as required and non-empty by the Zod environment schema (see product decision #4 and the environment-schema additions). The `RoutingLLMService` constructor does **not** re-check API keys — that would duplicate Zod's role and contradict decision #4's "both keys independently required" rule. Provider services (`GeminiService`, `MistralService`) retain their existing defensive constructor checks (throw if their own key is empty) for the case where a service is instantiated outside the validated `ConfigService` path (e.g. direct unit-test instantiation); those checks are unchanged from the existing `GeminiService` pattern and are not part of the routing layer's responsibility.

## Feature architecture

### Placement

- `src/llm/llm.service.interface.ts` — new `ILlmService` interface, `LLM_SERVICE_TOKEN` constant, `ReasoningEffort` type, updated payload types.
- `src/llm/model-registry.ts` — new: `SUPPORTED_MODELS`, `resolveProvider()`, `validateModelName()`.
- `src/llm/routing-llm.service.ts` — new: `RoutingLLMService implements ILlmService`.
- `src/llm/mistral.service.ts` — new: `MistralService extends LLMService`.
- `src/llm/llm.module.ts` — updated: register all three services, change token mapping.
- `src/v1/assessor/assessor.service.ts` — updated: injection token from `LLMService` to `LLM_SERVICE_TOKEN`.

### Proposed high-level tree

```text
src/llm/
├── llm.service.interface.ts     # UPDATED: +ILlmService, +LLM_SERVICE_TOKEN, +ReasoningEffort, +optional payload fields
├── llm.module.ts                # UPDATED: three services, string token export
├── types.ts                     # Unchanged
├── types.spec.ts                # Unchanged
├── gemini.service.ts            # UPDATED: read payload.model/reasoningEffort when present
├── gemini.service.spec.ts       # UPDATED: new tests for optional fields
├── mistral.service.ts           # NEW
├── mistral.service.spec.ts      # NEW
├── routing-llm.service.ts       # NEW: implements ILlmService
├── routing-llm.service.spec.ts  # NEW
├── model-registry.ts            # NEW
├── model-registry.spec.ts       # NEW
├── llm.service.interface.spec.ts # Unchanged (or minimal helper updates)
└── llm.module.spec.ts           # UPDATED: verify module wiring

src/v1/assessor/
└── assessor.service.ts          # UPDATED: @Inject(LLM_SERVICE_TOKEN) instead of LLMService
```

### Constructor signatures (implementation reference)

```ts
// MistralService
constructor(
  configService: ConfigService,
  private readonly jsonParserUtility: JsonParserUtility,
)
// Reads MISTRAL_API_KEY from config. Instantiates new Mistral({ apiKey }).

// RoutingLLMService
constructor(
  private readonly configService: ConfigService,
  private readonly geminiService: GeminiService,
  private readonly mistralService: MistralService,
)
// Validates both configured model names against the registry (aggregated
// error on failure). Does NOT check API keys — Zod already enforces both.
// Model and reasoning-effort config values are read at send() time, not
// at construction, so runtime config changes take effect without restart.
// Stores provider instances for delegation.

// GeminiService — UNCHANGED (already has ConfigService, JsonParserUtility)

// AssessorService — UPDATED
constructor(
  @Inject(LLM_SERVICE_TOKEN) private readonly llmService: ILlmService,
  private readonly promptFactory: PromptFactory,
)
// llmService type changes from LLMService to ILlmService.
```

### Out of scope for this surface

- Dynamic provider registration or hot-reload of model configuration.
- The `LlmResponse` shape or the Assessor HTTP controller layer.
- Making API keys conditionally required based on which provider is configured.
- Support for LLM providers other than Gemini and Mistral.
- Per-request model selection from the API consumer (model is always determined by server-side config).

## Behavioural model

### Routing decision flow

```
RoutingLLMService.send(payload)
  │
  ├─ Determine task type:
  │   'images' in payload → IMAGE task
  │   otherwise            → TEXT_TABLE task
  │
  ├─ Look up model name from config:
  │   IMAGE       → configService.get('DEFAULT_IMAGE_MODEL')
  │   TEXT_TABLE  → configService.get('DEFAULT_TEXT_TABLE_MODEL')
  │
  ├─ Look up reasoning effort from config:
  │   IMAGE       → configService.get('IMAGE_REASONING_EFFORT')
  │   TEXT_TABLE  → configService.get('TEXT_REASONING_EFFORT')
  │
  ├─ Resolve provider via model-registry:
  │   resolveProvider(modelName) → ProviderId
  │   Maps to GeminiService or MistralService
  │
  ├─ Augment payload with resolved config (authoritative — see product decision #12):
  │   payload.model = modelName          // always overwrites any caller-supplied value
  │   payload.reasoningEffort = reasoningEffort level   // ditto
  │
  └─ Delegate to the selected provider:
       geminiService.send(payload)  or  mistralService.send(payload)
       (Each provider's send() includes its own retry logic — the router
        does NOT implement separate retries.)
```

### MistralService._sendInternal flow

```
MistralService._sendInternal(payload)
  │
  ├─ Determine model:
  │   payload.model ?? 'mistral-small-latest'  (fallback default)
  │
  ├─ Determine reasoning effort:
  │   payload.reasoningEffort → mapped to Mistral ReasoningEffort enum
  │
  ├─ Build messages array:
  │
  │   TEXT/IMAGE:
  │     messages = [
  │       { role: 'system', content: payload.system },
  │       { role: 'user', content: <varies below> }
  │     ]
  │
  │     TEXT: user content = payload.user  (plain string)
  │     IMAGE: user content = [
  │       ...payload.images.map(img => ({
  │         type: 'image_url' as const,
  │         imageUrl: `data:${img.mimeType};base64,${img.data}`
  │       }))
  │     ]
  │
  ├─ Call Mistral SDK:
  │   result = await client.chat.complete({
  │     model,
  │     messages,
  │     temperature: payload.temperature ?? 0,
  │     reasoningEffort: <mapped value>,
  │     safePrompt: false,                       // Recommended, not hard contract
  │     responseFormat: { type: 'json_object' }, // Recommended, not hard contract
  │   })
  │
  │   Note: `safePrompt: false` and `responseFormat: { type: 'json_object' }`
  │   are recommended defaults, not hard contract — some models in the registry
  │   (e.g. certain `pixtral-*` / `open-mistral-*` variants) may reject
  │   `json_object`. If live tests (Section 8) surface such a rejection for a
  │   registered model, implementer may drop the offending field for that
  │   model. See "Resolved open questions" #6.
  │
  ├─ Extract response text:
  │   responseText = result.choices?.[0]?.message?.content ?? ''
  │   (content is string for non-streaming text responses)
  │
  ├─ Parse and repair JSON via JsonParserUtility
  │
  └─ Validate with LlmResponseSchema → return LlmResponse
```

### GeminiService._sendInternal changes

`_sendInternal` already handles text vs image payloads and builds the Gemini-native request shape. The changes are:

1. **Model selection:** Read `payload.model` if present; fall back to current hardcoded logic (`gemini-2.5-flash-lite` for text, `gemini-2.5-flash` for image).
2. **Reasoning effort:** Read `payload.reasoningEffort` if present; map to `thinkingConfig.thinkingBudget` using the mapping table above; fall back to current hardcoded `thinkingBudget: 0`.

All other behaviour (image-part mapping, response parsing, Zod validation, error logging) is unchanged.

### Mistral error mapping

`MistralService.mapError()` follows the same classification priority order as `GeminiService`, delegating to the shared helper in `src/llm/llm-error-mapper.ts` (product decision #13, backend change #3b). Mistral supplies a probe configuration that reads `MistralError` properties (`statusCode`, `body`, `message`) and matches `HTTPClientError` subclass names (`'ConnectionError'`, `'RequestTimeoutError'`, etc.); the shared cascade then classifies as follows:

1. **ResourceExhaustedError** — `statusCode === 429` with `body`/`message` matching quota/resource-exhausted pattern.
2. **RateLimitError** — `statusCode === 429` with rate-limit pattern or generic 429 (no quota message).
3. **AuthenticationError** — `statusCode === 401 || statusCode === 403`.
4. **ContentFilteredError** — `statusCode === 400` with safety/blocked/filter pattern in body/message.
5. **ContextLengthExceededError** — `statusCode === 400` with context-length pattern.
6. **InvalidRequestError** — any other 4xx `statusCode`.
7. **ProviderServerError** — any 5xx `statusCode`.
8. **NetworkError** — `error` is an `HTTPClientError` (has `name` like `'ConnectionError'`, `'RequestTimeoutError'` etc.) and no extractable HTTP status code. Also matches bare `Error` with network-failure message pattern (`ECONNREFUSED`, `ETIMEDOUT`, `fetch failed`).
9. **`undefined`** — none of the above.

The implementation uses private helpers for status-code extraction (`extractStatusCode(error)` — probes `statusCode` on `MistralError` and falls back to other shapes) and message-pattern matching. Non-object and `null`/`undefined` inputs return `undefined` (Gemini-implementation tolerance; same convention used for consistency).

## Error, loading, and empty-state rules

Not applicable — this is a backend-only change with no new UI-facing errors. All error states are already handled by the existing `LlmError` hierarchy and `HttpExceptionFilter`.

## Backend changes required

1. **Update `src/llm/llm.service.interface.ts`**:
   - Add `ReasoningEffort` type export (`'off' | 'low' | 'high' | 'max'`).
   - Add optional `model?: string` and `reasoningEffort?: ReasoningEffort` fields to `StringPromptPayload` and `ImagePromptPayload`.
   - Add `ILlmService` interface with `send(payload: LlmPayload): Promise<LlmResponse>`.
   - Add `LLM_SERVICE_TOKEN = 'LLM_SERVICE'` string constant export.
   - Ensure `LLMService` is marked as `implements ILlmService` (it already satisfies the contract via its `send()` method).

2. **Create `src/llm/model-registry.ts`**:
   - Define `ProviderId`, `ModelEntry`, `SUPPORTED_MODELS` (ordered array), `resolveProvider()`, `validateModelName()`.
   - Gemini prefixes: `'gemini-2.5-flash'`, `'gemini-2.0-flash'`.
   - Mistral prefixes: `'mistral-small-latest'`, `'pixtral-'`, `'open-mistral-'`.

3. **Create `src/llm/mistral.service.ts`**:
   - Extends `LLMService`. Declares `providerName = 'mistral'`.
   - Constructor: `ConfigService`, `JsonParserUtility`. Reads `MISTRAL_API_KEY`; instantiates `Mistral` client.
   - `_sendInternal(payload)`: builds messages array (system + user with text or image_url content), calls `client.chat.complete()`, extracts `choices[0].message.content`, parses via `JsonParserUtility`, validates with `LlmResponseSchema`.
   - `mapError(error)`: delegates to the shared helper from backend change **3b** with a Mistral-specific probe configuration (probes `MistralError.statusCode`/`.body` and matches `HTTPClientError` subclass names like `'ConnectionError'`, `'RequestTimeoutError'`).
   - Reasoning-effort mapping from abstract level to Mistral `ReasoningEffort` enum.

3b. **Create `src/llm/llm-error-mapper.ts`** (shared helper — product decision #13):

- Exports a function (e.g. `classifyLlmError(probes, error): LlmError | undefined`) that implements the provider-agnostic classification priority order documented in `docs/llm/error-handling.md`. Parameters are: a `providerName` string; an `extractStatusCode(error)` hook (provider-supplied — each provider knows its SDK's status-bearing fields); message-pattern regexes for resource-exhausted / rate-limit / content-filtered / context-length / network; and a `hasStringStatus(error, value)` hook for string-status conventions (Gemini uses `RESOURCE_EXHAUSTED`/`RATE_LIMIT_EXCEEDED`/`'429'` string statuses; Mistral does not — its function returns `false`).
- Both `GeminiService` and `MistralService` adopt this helper; per-provider code is reduced to probe configuration and `providerName`.
- Add `src/llm/llm-error-mapper.spec.ts` unit tests covering the cascade and tie-breaking independent of either provider's SDK shapes.

4. **Create `src/llm/routing-llm.service.ts`**:
   - `implements ILlmService`. Does **not** extend `LLMService`.
   - Constructor: `ConfigService`, `GeminiService`, `MistralService`. Calls `validateModelName()` on both configured models, collecting both errors into a single aggregated `Error` before throwing. **Does not check API keys** — both keys are already enforced as required by the Zod environment schema (product decision #4); the provider services' own constructors retain their existing defensive key checks.
   - `send(payload)`: implements the routing decision flow (determine task type → lookup model/effort config → resolve provider → **set** `payload.model`/`payload.reasoningEffort` from server config, overwriting any caller-supplied values per product decision #12 → delegate `provider.send(payload)`).
   - Does **not** implement retry logic (providers handle their own retries).
   - If `resolveProvider()` throws at `send()` time (e.g. operator changes env at runtime to an unsupported model), the resulting `Error` propagates out of the delegated `provider.send()` and is caught by the provider's `mapError()` cascade — surfacing as `InvalidRequestError`. This is documented behaviour, not a startup path.

5. **Update `src/llm/gemini.service.ts`**:
   - In `_sendInternal`, read `payload.model` for model selection (the router always sets this; fall back to existing hardcoded logic only when the service is used standalone without the router).
   - In `_sendInternal`, read `payload.reasoningEffort` and map to `thinkingConfig.thinkingBudget` (fall back to `0` when absent). Use the mapping table from this spec.
   - **Refactor `mapError()`** to delegate to the shared helper from backend change **3b**, supplying the existing Gemini probe configuration (`error.status`/`error.code`/`error.response.status`/`error.error.status`/`error.error.code` shapes, plus the existing `RESOURCE_EXHAUSTED`/`RATE_LIMIT_EXCEEDED`/`'429'` string statuses). The existing `gemini.service.spec.ts` tests must continue to pass unchanged — the refactor is behaviour-preserving.
   - All other behaviour unchanged.

6. **Update `src/llm/llm.module.ts`**:
   - Register `GeminiService` (provider for router injection).
   - Register `MistralService` (provider for router injection).
   - Register `RoutingLLMService`.
   - Change `LLMService` class-token provider to `{ provide: LLM_SERVICE_TOKEN, useExisting: RoutingLLMService }`.
   - Export `LLM_SERVICE_TOKEN`.
   - Import `ConfigModule`, `CommonModule` (unchanged).

7. **Update `src/v1/assessor/assessor.service.ts`**:
   - Change constructor injection: `@Inject(LLM_SERVICE_TOKEN) private readonly llmService: ILlmService`.
   - Import `ILlmService` and `LLM_SERVICE_TOKEN` from `src/llm/llm.service.interface.js`.
   - The `llmService` field type changes from `LLMService` to `ILlmService`.

8. **Update `src/config/environment.schema.ts`**:
   - Add `MISTRAL_API_KEY: z.string().min(1)`.
   - Add `DEFAULT_TEXT_TABLE_MODEL: z.string().default('mistral-small-latest')`.
   - Add `DEFAULT_IMAGE_MODEL: z.string().default('mistral-small-latest')`.
   - Add `TEXT_REASONING_EFFORT: z.enum(['off', 'low', 'high', 'max']).default('low')`.
   - Add `IMAGE_REASONING_EFFORT: z.enum(['off', 'low', 'high', 'max']).default('high')`.

9. **Update `.env.example` and `.test.env.example`**:
   - Add the five new environment variables with inline documentation.

10. **Update `docs/llm/error-handling.md`**:
    - **Replace** the existing "Worked Example: `GeminiService.mapError()`" section with a new "Worked Example: Shared `classifyLlmError` helper" section that describes the shared helper from backend change #3b as the canonical pattern. The old text describes private helpers (`extractStatusCode`, `hasStringStatus`, `isResourceExhausted`, `isRateLimit`, `buildError`) that are deleted from `GeminiService` in backend change #5; references to those must be removed or moved into the new "Worked Example" as historical context.
    - Under the new "Worked Example", add two subsections: a "Gemini Provider" subsection describing the Gemini probe configuration, and a "Mistral Provider" subsection describing: SDK error shapes (`MistralError.statusCode`/`.body`, `HTTPClientError` subclass names — including the **`InvalidRequestError` name-collision warning**), the Mistral-specific probe configuration supplied to `classifyLlmError`, classification priority, and testing conventions specific to Mistral.

11. **Update `vitest.config.ts`** (CRITICAL — otherwise the new live test does not execute):
    - The `e2e-live` project currently has `include: ['test/assessor-live.e2e-spec.ts']` (an explicit single-file array, not a glob). Change it to an **explicit two-element array** `['test/assessor-live.e2e-spec.ts', 'test/mistral-live.e2e-spec.ts']` — do **not** use a glob (a glob could accidentally include files not intended for the `e2e-live` project configuration, which has distinct `setupFiles`, timeouts, and pool settings).
    - The existing Gemini live test continues to run; the new Mistral live test runs in the same project as a separate file.

12. **Update `test/assessor-live.e2e-spec.ts` and `test/assessor.e2e-spec.ts`** (CRITICAL — provider-pinning; see product decision #11):
    - Both files currently call `startApp(logFilePath)` with no `environmentOverrides`. With the new schema defaults of `mistral-small-latest`, the Gemini regression tests would silently route to Mistral.
    - Update both `startApp` calls to pass `environmentOverrides` pinning `DEFAULT_TEXT_TABLE_MODEL: 'gemini-2.5-flash-lite'` and `DEFAULT_IMAGE_MODEL: 'gemini-2.5-flash'` so the existing assertions continue to exercise the Gemini provider.
    - The new `test/mistral-live.e2e-spec.ts` (backend change #13) and `test/mistral.e2e-spec.ts` (backend change #15) pin `mistral-small-latest` via their own overrides.

13. **Create `test/mistral-live.e2e-spec.ts`**:
    - Mirror `assessor-live.e2e-spec.ts` structure.
    - Requires `MISTRAL_API_KEY` in `.test.env`.
    - Uses `environmentOverrides` to pin `DEFAULT_TEXT_TABLE_MODEL=mistral-small-latest` and `DEFAULT_IMAGE_MODEL=mistral-small-latest`.
    - Tests text, table, and image assessment flows through the live pipeline.
    - Captures real response data for mock refinement.

14. **Update `test/utils/llm-mock.mjs`**:
    - Keep the existing `GoogleGenAI.prototype.models` patch unchanged (it uses a getter/setter intercept because the Gemini SDK assigns `this.models` as an own property in its constructor).
    - Add a second patch for the Mistral SDK using a **prototype getter override** (not the Gemini getter/setter pattern — the Mistral SDK exposes `chat` as a lazy getter on `Mistral.prototype` backed by a private `_chat` field, and never assigns `this.chat` as an own property). The shim calls `Object.defineProperty(Mistral.prototype, 'chat', { configurable: true, get() { return mockChat; } })` where `mockChat` is a `{ complete: async () => ChatCompletionResponse }` object. No setter is required. The mock `ChatCompletionResponse` has the exact shape:
      ```js
      {
        choices: [
          {
            message: {
              content:
                '{"completeness":{"score":3,"reasoning":"Mistral mocked response for completeness."},"accuracy":{"score":3,"reasoning":"Mistral mocked response for accuracy."},"spag":{"score":3,"reasoning":"Mistral mocked response for SPaG."}}',
            },
          },
        ],
      }
      ```
      so `MistralService._sendInternal` can extract `result.choices[0].message.content` as a JSON string, parse it via `JsonParserUtility`, and validate against `LlmResponseSchema`.
    - The two mocks are distinguished only by the literal reasoning-text prefix (`"Mistral mocked response for …"` vs the existing `"Mocked response for …"`). Both produce an identical `LlmResponse` shape; differentiation relies on substring matching in test assertions. Do not assume structural differences.

15. **Update `test/utils/app-lifecycle.ts`** (CRITICAL — `MISTRAL_API_KEY` blast radius):
    - Add `MISTRAL_API_KEY: 'dummy-key-for-testing'` to `defaultTestValues` (parallel to the existing `GEMINI_API_KEY: 'dummy-key-for-testing'`). Without this, every mocked E2E run that does not supply `MISTRAL_API_KEY` in `.test.env` fails at Zod validation before the app starts.
    - Live E2E continues to supply the real `MISTRAL_API_KEY` via `.test.env` (which overrides defaults).

16. **Create `test/mistral.e2e-spec.ts`** (mocked Mistral E2E):
    - Mirror `assessor.e2e-spec.ts` structure, setting `DEFAULT_TEXT_TABLE_MODEL=mistral-small-latest` and `DEFAULT_IMAGE_MODEL=mistral-small-latest` in environment overrides via `startApp`'s `environmentOverrides` parameter.
    - Tests auth/validation (reuse from assessor) and a successful assessment returning the Mistral mock response.

17. **Update test files:**
    - `assessor.service.spec.ts`: Update `LLMService` injection to use `ILlmService` and the string token. The existing mock can be a plain object satisfying `ILlmService` (no need to mock `LLMService` abstract class).
    - `gemini.service.spec.ts`: Add tests for optional `model`/`reasoningEffort` fields — verify model override is used when present, verify reasoning-effort mapping is applied.
    - `llm.module.spec.ts`: Verify all three services are registered and `LLM_SERVICE_TOKEN` resolves to `RoutingLLMService`.
    - Existing `llm.service.interface.spec.ts` retry-loop tests: unchanged (they test the abstract `LLMService` base, which is independent of the routing layer).
    - **Generic audit task:** grep for every `Test.createTestingModule({ imports: [...LlmModule...] })` and every `configObjectSchema.parse` call in `src/**/*.spec.ts` and `test/**/*.ts`. For each, verify the mock `ConfigService`/env returns a non-empty `MISTRAL_API_KEY` (and the four new model/effort vars where the router constructor or any provider constructor runs in that test's module). Document the audit findings in the action-plan section check.

## Testing expectations

### Unit tests

| Test file                            | What it covers                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model-registry.spec.ts`             | `resolveProvider()` for each known prefix; case sensitivity; `validateModelName()` throws on unknown models; `validateModelName()` does not throw on known models.                                                                                                                                                                                                                                                                |
| `llm-error-mapper.spec.ts` (new)     | Shared classification cascade: priority order, tie-breaking (resource-exhausted > rate-limit; content-filtered > context-length), unrecognised 4xx → `InvalidRequestError`, 5xx → `ProviderServerError`, network-pattern with no HTTP status → `NetworkError`, non-object/null → `undefined`. Tested with synthetic probe inputs (not real SDK shapes) so the cascade is verifiable in isolation.                                 |
| `mistral.service.spec.ts`            | `_sendInternal` with text payload (mocked SDK → verify request shape, model, reasoning effort, response parsing). `_sendInternal` with image payload (verify image_url chunks). `mapError()` delegates to shared helper with Mistral probe config — all nine error categories using representative `MistralError`/`HTTPClientError` shapes. Non-object/null inputs → `undefined`. Priority conflicts. Error message propagation.  |
| `routing-llm.service.spec.ts`        | Constructor validates both model names (throws on unknown). `send()` routes text payload to correct provider. `send()` routes image payload to correct provider. `send()` **sets** `model` and `reasoningEffort` on the payload from server config (overwriting any caller-supplied value, per product decision #12). Unknown-model constructor validation throws. Delegation to correct provider's `send()` is verified via spy. |
| `gemini.service.spec.ts` (updated)   | New tests: `payload.model` overrides default model for text; `payload.model` overrides default model for image; `payload.reasoningEffort` maps to correct `thinkingBudget` for each level (including the `'low'` == `'off'` indistinguishable case); absent `model`/`reasoningEffort` uses defaults (regression). All existing `mapError()` cases preserved unchanged after refactor onto shared helper.                          |
| `assessor.service.spec.ts` (updated) | Injection changed to `ILlmService` via token; mock is a plain object with `send()`. Mock `ConfigService` returns non-empty `MISTRAL_API_KEY` (and the four new model/effort vars) so `MistralService` class-provider instantiation succeeds. Existing test assertions unchanged.                                                                                                                                                  |
| `llm.module.spec.ts` (updated)       | Verify `LLM_SERVICE_TOKEN` resolves to `RoutingLLMService` instance. Verify `GeminiService` and `MistralService` are independently injectable. Mock `ConfigService` returns non-empty `MISTRAL_API_KEY` and the four new model/effort vars.                                                                                                                                                                                       |

### E2E tests

| Test file                        | Type                | What it covers                                                                                                                                                                                                                                                                                       |
| -------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/mistral-live.e2e-spec.ts`  | Live                | Requires `MISTRAL_API_KEY`. Spawns app with `environmentOverrides` pinning Mistral models. Tests successful text, table, image assessments. Used to capture real responses for mock refinement. Run via the `e2e-live` vitest project (backend change #11 updates `vitest.config.ts` to include it). |
| `test/mistral.e2e-spec.ts`       | Mocked              | Uses `E2E_MOCK_LLM=true` and extended `llm-mock.mjs`. Pins Mistral models via `environmentOverrides`. Tests full pipeline with Mistral mock. Auth/validation assertions.                                                                                                                             |
| `test/assessor.e2e-spec.ts`      | Mocked (regression) | Existing tests continue to pass. Pins Gemini models via `environmentOverrides` (backend change #12). Gemini mock still works.                                                                                                                                                                        |
| `test/assessor-live.e2e-spec.ts` | Live (regression)   | Existing tests continue to pass. Pins Gemini models via `environmentOverrides` (backend change #12).                                                                                                                                                                                                 |

### Regression

- All existing Gemini unit tests pass.
- All existing Gemini E2E tests (mocked and live) pass with provider-pinning `environmentOverrides` in place (backend changes #11, #12).
- Every mocked E2E that boots `app-lifecycle.ts` continues to start successfully once `MISTRAL_API_KEY` is added to `defaultTestValues` (backend change #15).
- `vitest.config.ts` `e2e-live` `include` updated (backend change #11) — both live test files execute under `npm run test:e2e:live`.
- `npm run lint`, `npm run lint:british`, `npm run build` all pass.

## Documentation and rollout notes

- `docs/llm/error-handling.md`: Add Mistral provider subsection under "Worked Example" with SDK error shapes and `mapError()` guidance.
- `docs/configuration/environment.md`: Document the five new environment variables.
- `AGENTS.md`: Already references `docs/llm/error-handling.md` — no change needed.
- Release notes: Flag the new Mistral provider, routing architecture, and `DEFAULT_TEXT_TABLE_MODEL`/`DEFAULT_IMAGE_MODEL` configuration.

## V1 scope recommendation

### Include in v1

- `ILlmService` interface and `LLM_SERVICE_TOKEN`.
- `model-registry.ts` with Gemini and Mistral model prefixes.
- `MistralService` with full `_sendInternal`, `mapError`, `providerName`.
- `RoutingLLMService` implementing `ILlmService` — server-side config authoritatively overwrites `payload.model`/`payload.reasoningEffort` (no caller-precedence, product decision #12).
- `LlmPayload` type extensions (`model`, `reasoningEffort`).
- `GeminiService` updates for optional `model`/`reasoningEffort` — including the refactor of `mapError()` to delegate to the shared helper.
- **Shared error-mapper helper** (`src/llm/llm-error-mapper.ts`) with unit tests — both `GeminiService` and `MistralService` adopt it (product decision #13).
- `LlmModule` and `AssessorService` DI wiring updates.
- Environment schema additions and `.env.example`/`.test.env.example` updates.
- All unit tests listed above.
- Live E2E tests for Mistral, plus `vitest.config.ts` `e2e-live` include update (backend changes #11, #13).
- Mocked E2E support for Mistral (extend `llm-mock.mjs`), plus `test/mistral.e2e-spec.ts`.
- Provider-pinning `environmentOverrides` on existing `assessor.e2e-spec.ts` and `assessor-live.e2e-spec.ts` to Gemini models (backend change #12).
- `MISTRAL_API_KEY` dummy default in `test/utils/app-lifecycle.ts` `defaultTestValues` (backend change #15).
- Documentation updates.

### Defer from v1

- Making API keys conditionally required per provider.
- Hot-reloading model configuration without application restart.
- Per-request model selection from the API consumer (decided against — see product decision #12).
- Support for additional LLM providers (OpenAI, Anthropic, etc.).
- Circuit-breaker or per-provider retry configuration.
- Configurable Gemini thinking budgets via separate env vars (the `'low'` ↔ `0` indistinguishable-from-`'off'` gap remains; tuning is deferred).
- The `@remarks` JSDoc requirement on `RoutingLLMService` documenting why it does not extend `LLMService`.

## Resolved open questions

1. **Mistral SDK exact API shape (v2.5.0):** Researched and documented above. Client class is `Mistral`; chat method is `client.chat.complete()`; error class is `MistralError` with `statusCode` and `body`; network errors are `HTTPClientError` subclasses; `reasoningEffort` values are `none`|`minimal`|`low`|`medium`|`high`|`xhigh`; image content is `ImageURLChunk` with data URI string in `imageUrl`.

2. **Image content framing for Mistral:** Researched. Mistral supports `SystemMessage` with `role: 'system'` and `UserMessage` with `content` as a `ContentChunk[]`. Images use `ImageURLChunk` (`{type: 'image_url', imageUrl: string}`) where the URL can be a `data:` URI. The system prompt is sent as a separate system message; images go in the user message's content array. This is documented in the `_sendInternal` flow above.

3. **Gemini reasoning-effort token budgets:** Resolved in the mapping table above. `high` → `1024`, `max` → `8192`. These are hardcoded defaults in `GeminiService`; making them configurable is deferred.

4. **Mock response data and SDK mock mechanism for Mistral E2E:** Resolved — initial mock uses hardcoded text with `"Mistral mocked response"` markers. After live tests are run, the mock data may be updated with more realistic response text captured from the live API. The SDK mock mechanism is also resolved: the Mistral SDK v2.5.0 exposes `chat` as a lazy getter on `Mistral.prototype` (backed by a private `_chat` field) rather than assigning `this.chat` as an own property, so the shim overrides the prototype getter directly — it does **not** use the Gemini-style getter/setter intercept (which relies on intercepting an own-property assignment that never happens for Mistral).

5. **RoutingLLMService inheritance design:** Resolved — Approach B (separate class, string DI token, shared `ILlmService` interface). No inheritance from `LLMService`.

6. **`safePrompt` and `responseFormat` for Mistral:** Resolved — `safePrompt: false` and `responseFormat: { type: 'json_object' }` are **recommended defaults, not hard contract**. Not every model in the registry necessarily supports `json_object` (e.g. some `pixtral-*` / `open-mistral-*` variants). The model registry (backend change #2) does **not** encode per-model capability flags — if live tests (action plan Section 9) surface a `json_object` rejection for a registered model, the implementer must add a small hard-coded exception list inside `MistralService._sendInternal` (e.g. `const MODELS_REJECTING_JSON_OBJECT: readonly string[] = [ ...prefix patterns... ];` checked against the resolved model name) and conditionally omit `responseFormat` for matching prefixes. A model prefix list approach mirrors the registry's existing prefix-match style and keeps the exception local to the provider. The Section 4 unit tests assert `messages`/`model`/`temperature`/`reasoningEffort` shape and **verify the presence** of `safePrompt: false` and `responseFormat: { type: 'json_object' }` for models not on the exception list; `responseFormat` omission for exception-listed prefixes is asserted separately if/when any prefix is added. `safePrompt` is never hard-asserted on its value (it is provider-side guidance; future SDK changes could rename or remove it).

7. **Caller-precedence for `model`/`reasoningEffort`:** Resolved — there is no caller-precedence. Server-side config always overwrites (product decision #12). The only call-site (`AssessorService` via `promptFactory`) never sets these fields, so the overwrite is a no-op today but explicitly prevents future drift.

8. **Runtime `resolveProvider()` failure on config edit:** Resolved — if an operator edits env at runtime to an unsupported model name, `resolveProvider()` throws at `send()` time. The error propagates through `provider.send()` and is caught by the provider's `mapError()` cascade, surfacing as `InvalidRequestError`. This is documented behaviour; the constructor's startup validation does not protect the runtime-edit path.

## Planning handoff notes

- The implementation order should be (action plan sections mirror this):
  1. `ILlmService` interface, `LLM_SERVICE_TOKEN`, `ReasoningEffort` type, payload field extensions (with audit of every `Test.createTestingModule` mock `ConfigService` for `MISTRAL_API_KEY`).
  2. Environment-schema additions + `test/utils/app-lifecycle.ts` `defaultTestValues` `MISTRAL_API_KEY` dummy + `.env.example`/`.test.env.example` updates (enables Sections 3–4 to type-check against the new `Config` keys).
  3. `model-registry.ts` (no dependencies).
  4. **Shared error-mapper helper** (`src/llm/llm-error-mapper.ts`) with unit tests (depends on error classes only).
  5. `MistralService` (depends on model-registry for model-prefix knowledge in `_sendInternal`, depends on the shared error-mapper helper).
  6. `GeminiService` updates — including the `mapError()` refactor onto the shared helper (depends on the shared helper; behaviour-preserving, so the existing `gemini.service.spec.ts` tests serve as regression).
  7. `RoutingLLMService` (depends on model-registry and both provider services).
  8. `LlmModule` wiring updates (depends on all three services).
  9. `AssessorService` injection update (depends on token and interface).
  10. All unit tests (write red tests before each implementation step).
  11. E2E mocks + `test/mistral.e2e-spec.ts` + provider-pinning overrides on existing `test/assessor.e2e-spec.ts`.
  12. Live E2E tests + `test/mistral-live.e2e-spec.ts` + `vitest.config.ts` `e2e-live` include update + provider-pinning overrides on existing `test/assessor-live.e2e-spec.ts`.
  13. Regression + documentation.
- The `assessor-live.e2e-spec.ts` file provides the canonical pattern for live E2E tests. The new `mistral-live.e2e-spec.ts` mirrors its structure, with explicit `environmentOverrides` pinning Mistral models and the mirror live test pinning Gemini models (product decision #11).
- The `llm-mock.mjs` extension must not break the existing Gemini mock — both patches coexist. The two patches use **different mechanisms** (Gemini: getter/setter intercept on `GoogleGenAI.prototype.models` to drop the own-property assignment; Mistral: prototype getter override on `Mistral.prototype.chat` returning a mock `Chat` object). Implementers must verify the `Mistral.prototype.chat` getter override is `configurable: true` so it does not conflict with the SDK's own lazy-getter definition. The two mocks are distinguished only by their literal reasoning-text prefix (no structural difference).
- The `@mistralai/mistralai` v2.5.0 package is already installed in the workspace (`npm install` was run during research).
