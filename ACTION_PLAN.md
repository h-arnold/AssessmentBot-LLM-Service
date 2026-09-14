# Feature Delivery Plan (TDD-First) — Prompt Cache Key

## Delivery status

- Current section: Section 2 — Shared derivation helper with golden-value pin (complete)
- Current phase: Commit gate — Section 2
- Baseline: `npm run test` and `npm run test:e2e:mocked` passed on 2026-09-14; the repository regression-checker script is unavailable in this repository.

## Read-First Context

Before writing or executing this plan:

1. Read the current `SPEC.md` (v1.2) — source of truth for all behaviour, contracts, and derivation rules.
2. Treat `SPEC.md` as authoritative; do not restate or redefine material settled there.

## Scope and assumptions

### Scope

- Add optional `promptCacheKey?: string` to `StringPromptPayload` and `ImagePromptPayload` in `src/llm/llm.service.interface.ts`.
- Add a shared module-level helper `buildPromptCacheKey(referenceTask: string): string` in `src/prompt/prompt.base.ts` (`sha256(referenceTask)`, lowercase hex).
- Populate `promptCacheKey` in `Prompt.buildMessage()` (text/table default path) and `ImagePrompt.buildMessage()`.
- Forward `promptCacheKey` in `MistralService.buildRequest()` when present; omit the field entirely when absent (never send `null`).
- Pin `RoutingLLMService` spread preservation and `GeminiService` non-throwing behaviour with unit tests.
- Pin `MistralService` to the EU production server by constructing the SDK client with `server: 'eu'` (fixed policy; resolves to `https://api.eu.mistral.ai`; no environment variable introduced).

### Out of scope

- Cached-token logging/metrics.
- Gemini context caching (explicit or implicit).
- Changes to prompt templates, message ordering, DTOs, controllers, `AssessorService`, or `RoutingLLMService` code.
- Client-supplied cache keys.

### Assumptions

1. `RoutingLLMService.send()`'s payload spread already preserves unknown optional fields; only a pinning test is needed.
2. The installed Mistral SDK (≥ 2.7) accepts `promptCacheKey` on `ChatCompletionRequest`; verified against `node_modules/@mistralai/mistralai/src/models/components/chatcompletionrequest.ts:210`.
3. TaskManager/module wiring needs no changes: the helper is a plain function, not a provider.

### Module sizing (LOC)

| File                               | Current LOC | Projected after change | Projected total |
| ---------------------------------- | ----------- | ---------------------- | --------------- |
| `src/llm/llm.service.interface.ts` | 363         | +~14                   | ~377            |
| `src/prompt/prompt.base.ts`        | 149         | +~25                   | ~175            |
| `src/prompt/image.prompt.ts`       | 87          | +~5                    | ~92             |
| `src/llm/mistral.service.ts`       | 385         | +~10                   | ~397            |

No file is projected to exceed 500 lines; no file separation is required.

---

## Global constraints and quality gates

### Engineering constraints

- British English in comments and documentation.
- No `console.*`; use the existing NestJS `Logger` patterns already in touched files.
- No new dependencies — use `createHash` from `node:crypto` (already a Node built-in; the project already imports from `node:crypto` in `llm.service.interface.ts`).
- Additive changes only; no mutation of existing payload construction semantics.
- `MistralService` must not send `prompt_cache_key: null` — the field is omitted when the payload key is absent.
- Do not modify `text.user.prompt.md`, system prompt templates, or message ordering.

### TDD workflow (mandatory per section)

For each section below:

1. **Red**: write failing tests for the section's acceptance criteria.
2. **Green**: implement the smallest change needed to pass.
3. **Refactor**: tidy implementation with all tests still green.
4. Run section-level verification commands.

### Delegation mandatory-read gate (mandatory for sub-agent execution)

For each delegated phase, handoffs must include a `Mandatory Reading` list and the handoff must report `Files read` containing every mandatory file before progression.

### Shared-helper planning gate (mandatory — helper changes are expected)

Helper decision entries:

1. Helper: `buildPromptCacheKey(referenceTask: string): string`
   - Decision: `new`
   - Owning module/path: `src/prompt/prompt.base.ts` (exported at module level)
   - Call-site rationale: single derivation owned in one place, consumed by both `Prompt.buildMessage()` and `ImagePrompt.buildMessage()`; no duplicate local implementations.
   - Relevant canonical doc target: `docs/modules/llm.md`
   - Planned doc status: `Not implemented` (added to `docs/modules/llm.md` during Section 5 reconciliation)

### Regression baseline (mandatory before implementation starts)

- Before Section 1, establish a baseline snapshot using the `regression-checker` skill, per the repository workflow (AGENTS.md §5).
- Before marking the Regression and contract hardening section complete, run a comparison against that baseline and verify no regressions beyond the expected additive surface.

### Validation commands hierarchy (repository-specific)

- Lint: `npm run lint`
- British English: `npm run lint:british`
- Unit/integration tests: `npm run test`
- E2E (mocked): `npm run test:e2e:mocked`
- Build: `npm run build`

---

## Section 1 — Payload contract extension

### Objective

- Add the optional `promptCacheKey?: string` field to both `StringPromptPayload` and `ImagePromptPayload` so the rest of the feature can compile against a single contract change.

### Constraints

- Field is optional; no changes to existing fields or their optionality.
- JSDoc on the new field must describe it as a provider-agnostic, payload-derived cache key (SHA-256 hex of the reference task), forwarded only to providers that support caching.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/llm/llm.service.interface.ts`
- `@src/llm/types.spec.ts` (for existing type-test conventions)

Implementation mandatory docs:

- `@SPEC.md`
- `@src/llm/llm.service.interface.ts`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/llm/llm.service.interface.ts`

### Shared helper plan

- None in this section (helper lands in Section 2).

### Acceptance criteria

- Both payload variants declare `promptCacheKey?: string`.
- Existing type contracts are otherwise unchanged; `npm run build` and `npm run test` pass.

### Required test cases (Red first)

Backend type/contract tests (extend `src/llm/llm.service.interface.spec.ts` or the types spec):

1. A `StringPromptPayload` including `promptCacheKey` type-checks (compile-time assertion pattern consistent with existing specs).
2. An `ImagePromptPayload` including `promptCacheKey` type-checks.
3. A payload **without** `promptCacheKey` remains valid — optionality is preserved.

### Section checks

- `npm run test`
- `npm run build`
- `npm run lint && npm run lint:british`

### Optional `@remarks` JSDoc follow-through

- Add `@remarks` on the new field noting: the key is server-derived in the prompt layer, never accepted from clients, and that changing the derivation rule changes every effective cache key (deliberate contract revision required).

### Implementation notes / deviations / follow-up

- **Implementation notes:** Red-phase type assertions were added to `src/llm/llm.service.interface.spec.ts`. Because Vitest transpiles tests without type-checking, the intended red signal was verified with `npx tsc --noEmit -p tsconfig.json`, which reported four `TS2353` excess-property errors for `promptCacheKey` at the new assertions. The production contract now declares the optional field on both payload variants; type-checking, unit tests, mocked E2E tests, build, lint, and British English checks pass. The repository regression-checker is unavailable, so the authorised substitute regression gate used `npm run test` and `npm run test:e2e:mocked`.
- **Deviations from plan:** None.
- **Follow-up implications for later sections:** the field must exist before Sections 2–4 can compile.

---

## Section 2 — Shared derivation helper with golden-value pin

### Objective

- Implement `buildPromptCacheKey(referenceTask: string): string` in `src/prompt/prompt.base.ts`, returning lowercase-hex SHA-256 of the reference task, and pin the rule with a golden-value test.

### Constraints

- Single input only: `sha256(referenceTask)` — no separators, prefixes, or task-type input (SPEC product decision #4).
- The golden expectation is generated via `crypto.createHash('sha256')` during test authoring and committed as a frozen constant; on mismatch, the derivation is what changed — never the constant.
- No new dependencies.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/prompt/prompt.base.ts`
- `@src/prompt/prompt.base.spec.ts`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/prompt/prompt.base.ts`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/prompt/prompt.base.ts`

### Shared helper plan

- Helper introduced here per the global helper decision entry (`new`, owned by `src/prompt/prompt.base.ts`); implementation is delivered, with the canonical `docs/modules/llm.md` entry scheduled for the Section 5 documentation reconciliation.

### Acceptance criteria

- Helper returns 64-character lowercase hex.
- Golden value for a fixed known input matches the committed constant exactly.
- Derivation is deterministic across calls and identical for image data-URI and plain-text reference content of the same string.
- Exported at module level for use by `image.prompt.ts`.

### Required test cases (Red first)

Backend unit tests (extend `src/prompt/prompt.base.spec.ts`):

1. Golden value: fixed `referenceTask` input produces the committed expected SHA-256 hex constant.
2. Determinism: repeated calls with the same input return identical values.
3. Format: output matches `/^[0-9a-f]{64}$/`.
4. Distinct content yields distinct keys.
5. Same reference string hashed via either pathway (plain text vs image data-URI form) yields the identical key — per SPEC testing expectation.

### Section checks

- `npm run test`
- `npm run lint && npm run lint:british` (sections add JSDoc/comments; kept per-section rather than deferred to regression)

### Optional `@remarks` JSDoc follow-through

- Add `@remarks` on `buildPromptCacheKey` explaining: single-input rule is a documented contract (see `SPEC.md`), Mistral prefix caching is prefix-content-based so the key is a routing hint that groups same-task requests, and cross-task-type key sharing is intentional (task type deliberately excluded).

### Implementation notes / deviations / follow-up

- **Implementation notes:** Added the module-level `buildPromptCacheKey(referenceTask)` helper using exactly `createHash('sha256').update(referenceTask).digest('hex')`. The golden-value, determinism, format, distinct-content, and independently anchored plain-text/data-URI pathway tests pass. The helper JSDoc records the single-input contract, prefix-cache routing-hint role, and intentional cross-task-type sharing. The authorised substitute regression gate (`npm run test` and `npm run test:e2e:mocked`) passed, alongside build, type-check, lint, and British English checks.
- **Deviations from plan:** The canonical `docs/modules/llm.md` helper entry is deferred to Section 5 so the complete provider support matrix, derivation rule, and EU endpoint documentation can be reconciled in one documentation pass; no behaviour or acceptance criteria are deferred.
- **Follow-up implications for later sections:** Sections 3's call sites depend on this export.

---

## Section 3 — Prompt-layer payload population

### Objective

- Populate `promptCacheKey` on the returned payload from `Prompt.buildMessage()` (default text/table path) and `ImagePrompt.buildMessage()`, covering all three task types.

### Constraints

- Multimodal coverage is required: `ImagePrompt.buildMessage()` must set the key using the same helper and the same rule (image reference is the data-URI string held by the prompt).
- No change to `TextPrompt`, `TablePrompt` (they inherit the base `buildMessage()`), or the template files.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/prompt/prompt.base.ts`
- `@src/prompt/prompt.base.spec.ts`
- `@src/prompt/image.prompt.ts`
- `@src/prompt/image.prompt.spec.ts`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/prompt/prompt.base.ts`
- `@src/prompt/image.prompt.ts`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/prompt/prompt.base.ts`
- `@src/prompt/image.prompt.ts`

### Shared helper plan

- Consumes Section 2's helper; no new helpers.

### Acceptance criteria

- Text/table `buildMessage()` payloads carry `promptCacheKey` derived from `referenceTask`.
- Image payloads from `ImagePrompt.buildMessage()` carry `promptCacheKey` derived from the reference data URI, identical to the key a text payload would derive from the same reference string.
- Two requests with the same reference but different student tasks produce identical keys.

### Required test cases (Red first)

Backend unit tests:

1. `Prompt.buildMessage()` returns a payload whose `promptCacheKey` equals `buildPromptCacheKey(referenceTask)`.
2. Same inputs, different `studentTask` → identical `promptCacheKey`.
3. `ImagePrompt.buildMessage()` returns a payload with `promptCacheKey` set from the reference data URI.
4. Table path (via `TablePrompt`) inherits the population — one assertion through the shared base path.

### Section checks

- `npm run test`
- `npm run lint && npm run lint:british` (sections add JSDoc/comments; kept per-section rather than deferred to regression)

### Optional `@remarks` JSDoc follow-through

- None beyond Section 2's helper remarks.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _to be completed during implementation._
- **Deviations from plan:** _to be completed during implementation._
- **Follow-up implications for later sections:** payloads in flight now carry the key; Section 4 consumes it.

---

## Section 4 — Provider forwarding and routing preservation

### Objective

- `MistralService.buildRequest()` forwards `promptCacheKey` to the Mistral request when present and omits it entirely when absent; pin `RoutingLLMService` spread preservation and `GeminiService` tolerance.

### Constraints

- `GeminiService` code is unchanged (no cache-key parameter, no throw).
- `RoutingLLMService` code is unchanged; only tests are added.
- When the payload key is absent, the Mistral request must not contain `promptCacheKey` or `prompt_cache_key` at all (no `null`).

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`
- `@src/llm/mistral.service.spec.ts`
- `@src/llm/routing-llm.service.spec.ts`
- `@src/llm/gemini.service.spec.ts`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`
- `@src/llm/gemini.service.ts`
- `@src/llm/routing-llm.service.ts`

### Shared helper plan

- None; consumes the payload contract from Section 1.

### Acceptance criteria

- A text payload with `promptCacheKey` produces a Mistral request with `promptCacheKey` set to that value.
- An image payload with `promptCacheKey` produces a Mistral request with `promptCacheKey` set (multimodal forwarding).
- A payload without the field yields a request with the field absent (not `undefined`-coerced `null`).
- `RoutingLLMService.send()` delivers the key unchanged to the resolved provider.
- `GeminiService._sendInternal()` accepts a payload carrying the key without error.

### Required test cases (Red first)

Backend unit tests:

1. `MistralService` text payload forwarding (present → set).
2. `MistralService` image payload forwarding (present → set).
3. `MistralService` absent key → field omitted from the built request.
4. `RoutingLLMService` preservation through the payload spread.
5. `GeminiService` no-throw acceptance of the field (behaviour unchanged).

### Section checks

- `npm run test`
- `npm run lint && npm run lint:british` (sections add JSDoc/comments; kept per-section rather than deferred to regression)

### Optional `@remarks` JSDoc follow-through

- Consider a `@remarks` note on `MistralService.buildRequest()` stating that the field maps to the provider-native `prompt_cache_key` and is a best-effort hint (prefix mismatch still yields a miss, never incorrect output).

### Implementation notes / deviations / follow-up

- **Implementation notes:** _to be completed during implementation._
- **Deviations from plan:** _to be completed during implementation._
- **Follow-up implications for later sections:** feature code complete pending Sections 5, regression, and docs.

---

## Suggested implementation order

1. Section 1 — Payload contract extension.
2. Section 2 — Shared derivation helper with golden-value pin.
3. Section 3 — Prompt-layer payload population.
4. Section 4 — Provider forwarding and routing preservation.
5. Section 5 — Mistral EU endpoint pinning.
6. Regression and contract hardening.
7. Documentation and rollout.

---

## Section 5 — Mistral EU endpoint pinning

### Objective

- Ensure all Mistral API traffic is served by the EU production server by constructing the SDK client with `server: 'eu'`.

### Constraints

- Fixed policy, not configuration: no new environment variable; the value is pinned at the single client-construction site (`MistralService.getClient()`).
- The lazy-construction path (client built on first use) must retain its existing defensive `MISTRAL_API_KEY` check — only the options object changes.
- The SDK mechanism is the `server` option on `SDKOptions` (`new Mistral({ apiKey, server: 'eu' })`), mapping to `https://api.eu.mistral.ai` (verified in `node_modules/@mistralai/mistralai/src/lib/config.ts` — `ServerEu = 'eu'`, `ServerList['eu'] = 'https://api.eu.mistral.ai'`; the default is `ServerGlobal` → `https://api.mistral.ai`).
- No partial applications: every Mistral request — chat completions included — goes through the pinned client.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`
- `@src/llm/mistral.service.spec.ts`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`

### Shared helper plan

- None; this is a single-site change.

### Acceptance criteria

- The Mistral SDK client is constructed with `server: 'eu'` alongside `apiKey`.
- The pinning applies on the shared lazy-construction path (first client construction covers all subsequent requests).
- No new environment variables, configuration surface, or behavioural change to request payloads.

### Required test cases (Red first)

Backend unit tests (extend `src/llm/mistral.service.spec.ts`):

1. The SDK's `Mistral` constructor is invoked with `server: 'eu'` (constructor spy or module-level mock consistent with the existing spec's mocking conventions).
2. The existing request-building tests continue to pass with the pinned client (no payload/request-shape change).

### Section checks

- `npm run test`
- `npm run lint && npm run lint:british` (sections add JSDoc/comments; kept per-section rather than deferred to regression)

### Optional `@remarks` JSDoc follow-through

- Add a brief `@remarks` note on `getClient()` recording that the EU server is a deliberate product decision (data-residency policy), that the `server` SDK option exists (`global` | `eu` | `us`), and that no environment override exists by design.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _to be completed during implementation._
- **Deviations from plan:** _to be completed during implementation._
- **Follow-up implications for later sections:** none — purely a client-construction change.

---

## Regression and contract hardening

### Objective

- Prove the feature is purely additive and introduces no regressions across unit, E2E (mocked), and existing suite behaviour.

### Constraints

- Prefer focused test runs before broader validation.

### Acceptance criteria

- Full unit suite, lint, British English check, build, and mocked E2E all pass.
- No changes are present in files outside the four listed in the module-sizing table (plus specs and canonical docs).

### Required test cases/checks

1. `npm run test` (full unit project).
2. `npm run test:e2e:mocked` (mocked E2E; facility owner has live tests external to this work).
3. `npm run lint && npm run lint:british`.
4. `npm run build`.
5. Regression-checker comparison against the pre-implementation baseline (`regression-checker` skill); verify no regressions beyond the expected additive surface.
6. Verify mandatory-read evidence (`Files read`) is complete for every delegated regression handoff.

### Section checks

- Run the commands listed above and ensure green results.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _to be completed during implementation._
- **Deviations from plan:** _note any additional work discovered or done._

---

## Documentation and rollout notes

### Objective

- Update the canonical LLM module documentation to describe the optional field, derivation rule, helper, provider support matrix, and the EU-only endpoint pinning.

### Constraints

- Only documents relevant to touched areas; AGENTS.md signposts remain brief.

### Acceptance criteria

- `docs/modules/llm.md` documents: the optional `promptCacheKey` field on both payload variants, the `sha256(referenceTask)` derivation rule (single input, contract-level), the `buildPromptCacheKey` helper (reconcile the planned `Not implemented` status against the delivered implementation), the provider matrix (Mistral: forwarded via `prompt_cache_key`; Gemini: ignored), and the EU-only endpoint pinning (`server: 'eu'`, fixed policy, no environment override).
- Documentation notes that cache hits are best-effort and externally observable via Mistral's `usage.prompt_tokens_details.cached_tokens`; the service does not log them.
- Any deviations or caveats from the SPEC are recorded here.

### Required checks

1. Verify docs mention the derivation rule and helper ownership.
2. Verify docs list the provider support matrix.
3. Confirm notes/deviations fields are filled during implementation.
4. Verify mandatory-read evidence (`Files read`) is complete for delegated docs/review handoffs.
5. Reconcile planned shared-helper entries in `docs/modules/llm.md`: update the `Not implemented` entry to reflect delivery.

### Optional `@remarks` JSDoc review

- Confirm Sections 2 and 4 `@remarks` exist in code as planned; if none are needed because doc coverage suffices, record `None` with rationale.

### Implementation notes / deviations / follow-up

- **Implementation notes:** _to be completed during implementation._
- **Deviations from plan:** _to be completed during implementation._
