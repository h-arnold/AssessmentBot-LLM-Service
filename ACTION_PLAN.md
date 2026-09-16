# Feature Delivery Plan (TDD-First) — Multi-Part Prompt Support

## Read-First Context

Before writing or executing this plan:

1. Read the current `SPEC.md` (multi-part prompt support, Draft v1.2). It is the source of truth for contracts, decisions, and scope boundaries.
2. Relevant companion doc: `docs/modules/llm.md` (updated in the documentation section of this plan).
3. The previous `ACTION_PLAN.md` at this path (prompt cache key) is delivered; per SPEC documentation notes it is intentionally replaced by this plan. Do not treat the old plan's content as live.
4. Do not restate material settled in the spec; sequence delivery and testing here.

## Scope and assumptions

### Scope

- New schema-first `MultiPartPromptPayload` contract (Zod schemas with `z.infer`-derived public types) added to the `LlmPayload` union in `src/llm/llm.service.interface.ts`, with schema validation of the multi-part variant at each `ILlmService.send()` entry point (routing entry before its inspection; provider base entry before `describePayload`/retry; `ZodError` propagating directly, no `mapError()`, no retry).
- Third `mapPayload` dispatch branch with pinned guard ordering (image → text → `'messages' in payload` presence), and `describePayload` multi-part summary.
- `RoutingLLMService.send()` image-presence-based routing for the new variant.
- Multi-part conversation mapping in `GeminiService` (`buildContents` widened to role-tagged turns) and `MistralService` (`buildMessages` chunk-array mapping).
- Provider parameter handling (`model`, `temperature`, `reasoningEffort`), `promptCacheKey` forwarding (Mistral only, ignored by Gemini), and accurate provider log labelling for the new variant.
- Unit test coverage per SPEC testing expectations; regression suites for existing variants stay green.
- Documentation update to `docs/modules/llm.md`.

### Out of scope

- Prompt layer (`src/prompt/**`), controllers, DTOs, HTTP surface, Zod schemas/validation for the **legacy** payload variants (`StringPromptPayload` / `ImagePromptPayload` — schema-first is scoped to the multi-part variant only), new `LlmError` classes, live-provider E2E tests, part kinds other than text/image, tool roles, the multi-part prompt base class, and `promptCacheKey` derivation for conversations (deferred to the V2 workstream).

### Assumptions

1. All product-level decisions are those recorded in `SPEC.md` decisions 1–13; no further user decisions are required.
2. Tests mock the provider SDKs at module level, following the established patterns in `gemini.service.spec.ts` and `mistral.service.spec.ts`.
3. British English, NestJS `Logger`, no `console.*`, and no lint-rule disabling apply throughout.

---

## Global constraints and quality gates

### Engineering constraints

- Keep API/entry points thin and delegate behaviour to services; no controller work exists here.
- Fail fast on provider rejections; no defensive rewriting of requests (SPEC decision 4).
- Existing `StringPromptPayload` / `ImagePromptPayload` behaviour — including the silent drop of data-less images in both providers — is **unchanged**; any behavioural fork must live only in new multi-part mapping code.
- Keep changes minimal, localised, and consistent with repository conventions (explicit `.js` relative imports, `with { type: 'json' }` for JSON imports, `getCurrentDirname()` for paths).
- Use British English in all comments and documentation.

### TDD workflow (mandatory per section)

For each section below:

1. **Red**: write failing tests for the section's acceptance criteria.
2. **Green**: implement the smallest change needed to pass.
3. **Refactor**: tidy implementation with all tests still green.
4. Run section-level verification commands.

### Delegation mandatory-read gate (mandatory for sub-agent execution)

When a section is delegated to sub-agents, the plan enforces mandatory documentation reads:

1. list required file paths under each delegated phase below
2. require the sub-agent handoff to include `Files read` with explicit file paths
3. verify every mandatory file is listed before accepting the handoff
4. if any mandatory file is missing, return the work to the same sub-agent and block progression

### Shared-helper planning gate (mandatory when helper changes are expected)

Helper decision entries (agreed before implementation):

1. Helper: `MultiPartPromptPayload` / message / part contract (schema-first)
   - Decision: `new` — Zod schemas (`ReasoningEffortSchema` mirroring the existing `'off' | 'low' | 'high' | 'max'` type union exactly, `TextContentPartSchema`, `ImageContentPartSchema`, `LlmContentPartSchema`, `LlmConversationMessageSchema`, `MultiPartPromptPayloadSchema`) with public types derived via `z.infer`, all living in `src/llm/llm.service.interface.ts` alongside the existing payload types, **unless** the post-Section-1 measurement (below) shows the file projected past 500 lines, in which case a `src/llm/multi-part-prompt.schema.ts` module is extracted and the interface file re-exports the new names (schemas and types).
   - Owning module/path: `src/llm/llm.service.interface.ts` (primary) or `src/llm/multi-part-prompt.schema.ts` (extraction fallback).
   - Call-site rationale: base-class validation, guards, routing, and both providers all consume the contract; co-location with `LlmPayload` keeps imports minimal.
   - Relevant canonical doc target: `docs/modules/llm.md`.
   - Planned doc status: `Not implemented`.
2. Helper: per-provider conversation mapping
   - Decision: `keep local` — Gemini mapping belongs in/as a private helper of `GeminiService` (extending the existing `buildContents` pipeline); Mistral mapping in/as a private helper of `MistralService` (extending `buildMessages`). **No cross-provider shared mapping utility**: their native shapes differ enough that a shared mapper would need per-provider adapters (indirection without reuse). One measured exception: if both providers are found to need an identical message-level part-to-chunk pre-step, record it in these notes before extracting.
   - Owning module/path: `src/llm/gemini.service.ts`, `src/llm/mistral.service.ts` (or extracted sibling helper files if the 500-line threshold forces separation — see LOC table below).
   - Call-site rationale: each provider's `_sendInternal` already delegates to per-payload builders; the multi-part path extends that same pattern.
   - Relevant canonical doc target: `docs/modules/llm.md`.
   - Planned doc status: `Not implemented`.

**LOC / file separation check (measured before each provider/contract section's Green step):**

| File                               | Current LOC | Projected delta                                           | Projected total | Action if > 500                                                                             |
| ---------------------------------- | ----------- | --------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `src/llm/llm.service.interface.ts` | 382         | +100–160 (schemas add JSDoc/boilerplate over plain types) | 482–542         | Extract `multi-part-prompt.schema.ts`; interface file re-exports schemas and inferred types |
| `src/llm/gemini.service.ts`        | 389         | +60–120                                                   | 449–509         | Extract conversation mapping to `src/llm/gemini.multi-part.mapper.ts`                       |
| `src/llm/mistral.service.ts`       | 400         | +60–120                                                   | 460–520         | Extract conversation mapping to `src/llm/mistral.multi-part.mapper.ts`                      |
| `src/llm/routing-llm.service.ts`   | 148         | +20–40                                                    | 168–188         | No separation expected                                                                      |

Extraction decisions must be recorded in the section's implementation notes when taken.

### Validation commands hierarchy

- Lint: `npm run lint`
- Unit/integration: `npm run test`
- E2E (mocked): `npm run test:e2e:mocked`
- Build: `npm run build`

---

## Section 1 — Multi-part contract types, guards, and base-class dispatch

### Objective

- Introduce the schema-first `MultiPartPromptPayload` contract (Zod schemas, `z.infer`-derived types, role-discriminated messages, text/image parts), extend the `LlmPayload` union, add the provider-entry boundary validation in base `send()` (the routing-entry validation is deferred to Section 2), and wire the third `mapPayload` branch and `describePayload` summary in the abstract `LLMService` base class.

### Constraints

- SPEC decisions 1–5, 6, 8–13. Image `data` is required; system messages are typed to text-only parts; guard order is image → text → messages-presence; the final `'Unsupported payload type'` throw is retained.
- The schemas are the source of truth; public types are derived via `z.infer`. Structural rules: `messages` `.min(1)`, `parts` `.min(1)` per message; no format refinement beyond string-typed fields (SPEC decision 2).
- Boundary validation: base `send()` parses the payload against `MultiPartPromptPayloadSchema` once, **only when the multi-part variant is detected, before the retry loop and before `describePayload`** (so no summary code touches an unvalidated payload); a failed parse propagates as `ZodError` with the same no-`mapError()`, no-retry contract as the existing in-loop `ZodError` bypass (the parse sits outside the loop — it must not be placed inside the per-attempt try). In this section, `RoutingLLMService.send()` is not yet wired to parse (that lands with Section 2's routing tests); the routing-side validation must not be implemented twice here.
- Existing types, guards, and `describePayload` behaviour for the two existing variants are untouched.
- Import the contract names consistently; use explicit `.js` extensions.
- **Declared deviation — provider compile coupling (planned, not improvised).** Extending the `LlmPayload` union breaks both providers' compilation: the missing third `mapPayload` handler and union-member field reads such as `payload.system` in `buildModelParams` / `buildMessages`. Section 1 therefore also:
  - extends `mapPayload`'s `handlers` parameter type with an **optional** `conversation?: (payload: MultiPartPromptPayload) => T` handler (narrowed payload type `MultiPartPromptPayload`, generic return `T` identical to the existing image/text handlers); when absent, the multi-part variant falls through to the existing final `'Unsupported payload type'` throw — so both providers' **existing `mapPayload` call sites compile unchanged**;
  - adds a single temporary early guard to each provider's `_sendInternal` — `if (this.isMultiPartPromptPayload(payload)) { throw new Error('Unsupported payload type'); }` — which is both the interim dispatch path and the negative-narrowing point that lets the providers' existing union-member field reads (`payload.system`) compile;
  - adds a new `isMultiPartPromptPayload` type guard to the base class (`'messages' in payload` presence check).
    This is one interim mechanism with a single throw site per provider, **replaced** in Sections 3–4. Between Sections 2 and 3–4, a routed multi-part payload fails fast at the provider placeholder rather than reaching the SDK — an intentional interim state, pinned by the placeholder test.
- Regression baseline: before Section 1's Red step, establish the repo regression baseline using the `regression-checker` skill; record the baseline run in implementation notes. **Deviation (user-authorised 2026-09-16): the `regression-checker` skill is available, but its referenced CLI and configuration are absent from this repository (no `npm run regression-checker`, no `scripts/builder`, no `.ts-regression-checker` config), so the baseline and all regression gates use the user-authorised substitute `npm run test` + `npm run test:e2e:mocked` instead. Baseline evidence is recorded in Section 1's implementation notes.**

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/llm/llm.service.interface.spec.ts`
- `@docs/testing/README.md`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/llm/llm.service.interface.ts`
- `@docs/modules/llm.md`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/llm/llm.service.interface.ts`
- `@src/llm/llm.service.interface.spec.ts`

### Shared helper plan

- Helper entry 1 above executes in this section (schemas and types). Perform the LOC measurement at the start of the Green step; record the placement decision (co-located vs `multi-part-prompt.schema.ts`) in implementation notes.

### Acceptance criteria

- `MultiPartPromptPayload` compiles from the schemas via `z.infer` with the SPEC recommended shapes: system-role messages accept text parts only; user/assistant messages accept text and image parts (`data: string` required on image parts); `messages` and per-message `parts` carry `.min(1)`.
- `mapPayload` dispatches the new variant via a third branch after the existing guards; malformed payloads still hit `'Unsupported payload type'`. The handler contract is pinned: optional key `conversation`, narrowed payload type `MultiPartPromptPayload`, generic return type `T` (identical to the existing image/text handlers), absent handler falls through to the existing final throw.
- Both providers compile and run against the extended union, with a single interim throw site each: a multi-part payload reaching a provider `_sendInternal` hits the early guard's throw and never reaches the provider SDK.
- Existing guard behaviour and exceptions are byte-for-byte unchanged for the existing variants (including that legacy variants are not schema-validated).
- Boundary validation: a valid multi-part payload passes the schema check at the top of base `send()` — **before** `describePayload` and the retry loop; structurally invalid payloads (empty `messages`/`parts`, unknown role/`kind`, missing image `data`) raise `ZodError` re-thrown directly, with no `mapError()`, no retry, and no provider SDK contact.
- `describePayload` yields a conversation summary (e.g. "conversation prompt with N message(s)") for multi-part payloads.
- `npm run build` is green at the end of this section.

### Required test cases (Red first)

Backend model tests (unit — `llm.service.interface.spec.ts`):

1. `mapPayload` dispatches a multi-part payload to the conversation handler.
2. `mapPayload` dispatch order: image-variant payload still hits the image handler; string-variant still hits the text handler; multi-part hits conversation handler; unrelated shape still throws `'Unsupported payload type'`.
3. `describePayload` summary text for a multi-part payload (singular/plural message counts).
4. Existing-variant regression: image and text dispatch summaries and error paths unchanged (including that legacy variants are not schema-validated).
5. Schema validation: a valid multi-part payload parses; empty `messages`, empty `parts`, unknown role/`kind`, and missing image `data` raise `ZodError` re-thrown directly without `mapError()`/retry and without the provider SDK being touched; `.min(1)` structural rules verified.
6. Type-level compile checks (via targeted type assertions where feasible) that system-role messages reject image parts, that image parts require `data`, and that `z.infer<typeof ReasoningEffortSchema>` equals the existing `ReasoningEffort` type.

Backend service tests (unit — provider placeholder gate, `gemini.service.spec.ts` / `mistral.service.spec.ts`):

7. Provider placeholder gate: a multi-part payload reaching either provider's `_sendInternal` throws the placeholder error without touching the mocked SDK (follows the existing malformed-payload test pattern in both provider suites).

### Section checks

- `npm run test -- src/llm/llm.service.interface.spec.ts`
- `npm run test -- src/llm/gemini.service.spec.ts`
- `npm run test -- src/llm/mistral.service.spec.ts`
- `npm run build` (type-level contract checks; proves the compile coupling is resolved)
- `npm run lint`
- Mandatory-read evidence gate passed for all delegated handoffs in this section.
- Shared-helper placement and provider placeholder decisions recorded below.

### Optional `@remarks` JSDoc follow-through

- Add `@remarks` on `MultiPartPromptPayload` recording: (a) schema-first typing via `z.infer` with the single boundary parse at `send()` (SPEC decision 12), (b) `promptCacheKey` derivation deferred to the V2 workstream (SPEC decision 7), (c) provider-side system/parts mapping pointer to `docs/modules/llm.md`.

### Implementation notes / deviations / follow-up

- **Implementation notes:** Baseline established 2026-09-16 against `5c1d9c1251e3b3593ea7314e7b3ac3bc1edf61b8` on `feature/multi-part-prompt-support`, before implementation. `npm run test`: 54 files passed, 530 tests passed (15.46s). `npm run test:e2e:mocked`: build passed, 8 files passed, 52 tests passed and 1 existing todo (125.71s). The initial E2E invocation hit the 120-second shell timeout; the complete rerun with a 600-second timeout passed. No test failures require debt acceptance. Captured output: regular tests `/home/developer/.local/share/opencode/tool-output/tool_0ab3e19b1001r3jje778giQ1rG`; complete E2E `/home/developer/.local/share/opencode/tool-output/tool_0ab414a810013LxuwxQLiil8om`. Pre-existing changes to `.opencode/agents/implementation.md` and `.opencode/agents/testing-specialist.md` remain untouched. Current phase: **Section 1 complete; GREEN review and regression gates passed, implementation committed and pushed on 2026-09-16 (record below).** Resumed RED corrections cover guard precedence/presence, singular/plural summaries, 13 invalid structures, legacy non-validation and meaningful compile-time assertions. Review evidence: `.opencode/scratchpad/section1-red-review-round2.md`; mandatory-read evidence complete. `npm run test`: 546 passed, 20 expected RED failures (5 dispatch, 2 summaries, 13 validation); no baseline regressions. `npm run test:e2e:mocked`: 52 passed, 1 existing todo. Build, lint, British-English check, Prettier and spec-inclusive `npx tsc --noEmit --incremental false` passed. User reaffirmed regular plus mocked E2E as the regression-checker substitute. Pre-Green measurement: interface 452 LOC, Gemini 398, Mistral 409, routing 148. Contract co-location is retained if documentation and missing behaviour keep the projected total within 500; otherwise use the planned schema extraction.
- **Deviations from plan:** the provider placeholder throw is a **declared, planned deviation** from "providers untouched": it is the minimal compile-coupling fix, replaced in Sections 3–4.
- **Checkpoint contents:** Initial schemas and inferred types, extended `LlmPayload`, optional `conversation` handler signature and presence guard exist. Provider placeholder guards and tests exist. Conversation dispatch, boundary validation and complete summary behaviour are not implemented. Sections 2–4, final regression hardening and canonical documentation remain unstarted.
- **Review and handoff status:** The initial testing handoff incorrectly claimed success despite five failing tests and omitted mandatory `Files read` evidence. Review rejected the dispatch assertions (promise assertions on synchronous calls and inverted expected behaviour), incomplete validation/type coverage and implementation deviations. Two subsequent correction handoffs returned `Task cancelled`; no accepted correction handoff exists. The current worktree nevertheless contains a partial dispatch-test correction: synchronous conversation-result assertion, an exposed subclass method, legacy dispatch, image/messages precedence and absent-handler cases. These changes are preserved but not review-approved.
- **Latest checkpoint validation (2026-09-16):** `npm run build && npm run lint` passed. `npm run test -- --silent` failed: 538 passed, 4 failed across 54 files (53 passed, 1 failed). Failures are conversation dispatch, message-count summary, missing boundary parse (`safeParse` spy) and empty-message rejection. All failures are in the new base-service tests; the 530 baseline tests remain passing. The reviewer previously reported mocked E2E matching the baseline (52 passed, 1 todo); E2E was not rerun for the partial dispatch-test correction. This checkpoint is not a completed or green Section 1.
- **Outstanding corrections before Green:** Complete mandatory-read evidence; finish guard-order coverage (including text/messages collisions); add plural summaries and invalid parts/roles/kinds/missing image data cases; assert direct `ZodError` propagation, no mapping/retry/provider contact and validation before summary; replace weak positive-only type checks with meaningful type-contract assertions; avoid requiring `safeParse` specifically when the contract requires schema parsing. Restore spies reliably and resubmit for review.
- **Resumed GREEN implementation (2026-09-16):** Base boundary validation, conversation dispatch and counted summaries implemented; all 20 RED failures now pass. Provider duplicate placeholders removed: each provider has one `_sendInternal` guard using `isMultiPartPromptPayload`, with legacy builder parameter types narrowed. Schema extraction fallback taken because complete multiline public JSDoc projected the interface beyond 500 lines: `multi-part-prompt.schema.ts` 106 lines, interface 436, Gemini 400, Mistral 406. Schemas and inferred types remain re-exported through the interface. Implementation handoff reports focused tests 189 passed; full regular tests 566 passed across 54 files; mocked E2E 52 passed and 1 existing todo across 8 files; build, lint and spec-inclusive type-check passed. Orchestrator verified changed paths and clean whitespace diff.
- **GREEN review and acceptance (2026-09-16):** Review round 1 returned one Improvement (the retained assessor branch must be documented in code to satisfy the documented-exception condition); resolved by adding a two-line British-English comment above the `'messages'` branch and a one-line JSDoc amendment on `describePayloadSummary` (comment/JSDoc only, no logic, signature or behavioural change). Re-review verdict: **PASS — Section 1 accepted, zero findings** (`.opencode/scratchpad/section1-green-review.md`, round 2 appended). Regression Gate passed: `npm run test` 566 passed (baseline 530 + 36 new, zero regressions), `npm run test:e2e:mocked` 52 passed + 1 pre-existing todo, `npm run build`/`npm run lint`/`npx tsc --noEmit --incremental false`/`npx prettier --check` clean, `npm run lint:british` verified.
- **Section 1 resolution of the assessor deviation (recorded decision):** the checkpoint conversation-summary branch in `src/v1/assessor/assessor.service.ts` is retained as a documented compile-coupling exception. Removing it requires prompt-layer `buildMessage()` signature narrowing (prompt layer is out of scope for this plan) or unsafe casts; the branch has zero V1 behavioural impact because the prompt layer never produces multi-part payloads. It is now documented in code per the GREEN review requirement, and Sections 3–4 explicitly replace it with nothing further (no V1 multi-part functionality was added).
- **Final checkpoint validation (2026-09-16):** orchestrator re-ran `npm run test`: 54 files, 566 tests, all passing. Mocked E2E unchanged from the review evidence (52 passed, 1 todo). Section 1 commit and push completed: `1f93f9c` — `feat(llm): validate and dispatch multi-part payloads at the base send boundary` — branch `feature/multi-part-prompt-support`. Push to `origin/feature/multi-part-prompt-support` succeeded (`bf7234d..1f93f9c`); pre-commit hooks passed. The user's two pre-existing agent-configuration edits remain uncommitted. All Section 1 exit criteria are met.

---

## Section 2 — Routing dispatch for multi-part payloads

### Objective

- Extend `RoutingLLMService.send()` to recognise the multi-part variant and route by image-part presence.

### Constraints

- SPEC decision 11: any image part (in any message) → image provider/model/effort; otherwise text. Caller `model`/`reasoningEffort` overwritten authoritatively via spread; caller's payload never mutated.
- Routing detection must not disturb the existing `'images' in payload` first branch; the multi-part branch is additive.
- **Boundary validation (SPEC decision 12):** `RoutingLLMService.send()` — the main `ILlmService` entry — validates the multi-part variant against `MultiPartPromptPayloadSchema` **before** its image-presence inspection, so a structurally invalid payload raises `ZodError` at the routing entry rather than a `TypeError` from part inspection. The provider-side base `send()` parse (Section 1) remains for the provider/direct-instantiation path; both entry points share the same schema, so on the main path the provider-side parse observes an already-validated payload (idempotent, and defence-in-depth for callers bypassing routing).

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/llm/routing-llm.service.spec.ts`
- `@docs/testing/README.md`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/llm/routing-llm.service.ts`
- `@src/llm/llm.service.interface.ts`
- `@docs/modules/llm.md`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/llm/routing-llm.service.ts`
- `@docs/modules/llm.md`

### Shared helper plan

- No new helpers; extend the existing private routing fields/flow. If routing of multi-part payloads warrants a dedicated private predicate (e.g. `containsImagePart(payload)`), decision is `keep local` (owning path: `routing-llm.service.ts`) — it is variant-specific presentation logic.

### Acceptance criteria

- Text-only conversation → text provider with `textModel`/`textEffort`.
- Conversation with an image part anywhere → image provider with `imageModel`/`imageEffort`.
- Caller-supplied `model`/`reasoningEffort` overwritten; original payload object unmutated.
- A structurally invalid multi-part payload raises `ZodError` at the routing entry before part inspection; no provider contact.
- Legacy text/image routing behaviour unchanged, including that legacy variants are never schema-validated (regression).

### Required test cases (Red first)

Backend service tests (unit — `routing-llm.service.spec.ts`):

1. Multi-part text-only conversation routes to the text provider with text model/effort.
2. Multi-part conversation with one image part routes to the image provider with image model/effort.
3. Image part in an assistant message still routes to the image provider.
4. Caller `model`/`reasoningEffort` are overwritten in the dispatched payload; caller's object is not mutated.
5. Boundary validation: a structurally invalid multi-part payload (e.g. `messages` not an array, empty `messages`) raises `ZodError` at `RoutingLLMService.send()` **before** any part inspection runs and without the provider being contacted (regression: legacy variants are not parsed at the routing entry).
6. Regression: existing `StringPromptPayload` and `ImagePromptPayload` dispatch unchanged (spy-verified).

### Section checks

- `npm run test -- src/llm/routing-llm.service.spec.ts`
- `npm run lint`
- Mandatory-read evidence gate passed for all delegated handoffs in this section.

### Optional `@remarks` JSDoc follow-through

- Add a `@remarks` note on `RoutingLLMService.send()` documenting the image-presence routing rule for multi-part payloads and replacing stale "SPEC product decision #4/#12" citations with current-spec references (see Documentation section).

### Implementation notes / deviations / follow-up

- **Implementation notes (Section 2, 2026-09-16):** RED tests added to `src/llm/routing-llm.service.spec.ts` (27 new tests: 1 text-only routing, 4 image-position variants, 15 invalid-structure boundary cases, 7 legacy regressions); RED review clean with zero findings. GREEN implemented in `src/llm/routing-llm.service.ts` (148 → 177 LOC, below the 500-line threshold; no extraction): multi-part detection after the legacy image/text discriminators, `MultiPartPromptPayloadSchema.parse` before any image inspection (legacy variants never validated), private `containsImagePart()` predicate (helper decision `keep local`, as planned), unchanged non-mutating spread with authoritative model/effort overwrite, JSDoc + `@throws {ZodError}`. GREEN review round 1 returned one Nitpick (dead `mock.calls.length > 0` guard in the spec); resolved by removing the guard so the immutability assertion runs unguarded; round 2 verdict **PASS — Section 2 accepted, zero findings** (`.opencode/scratchpad/section2-green-review.md`). Regression Gate: `npm run test` 593/593 across 54 files (566 baseline + 27 new, zero regressions), `npm run test:e2e:mocked` 52 passed + 1 pre-existing todo, build/lint/spec-inclusive tsc/prettier clean, `npm run lint:british` verified. One upstream sub-agent timeout occurred during the RED handoff and was recovered by resuming the same task; no work was lost.
- **Deviations from plan:** none.
- **Follow-up implications for later sections:** provider sections receive resolved payloads with authoritative `model`/`reasoningEffort`; routed multi-part payloads still fail fast at each provider's Section 1 placeholder until Sections 3–4 land.
- **Commit record (Section 2 complete):** commit `6b2eb85` — "feat(llm): route multi-part conversations by image-part presence" — on branch `feature/multi-part-prompt-support`, pushed successfully (`75168ef..6b2eb85`); pre-commit hooks passed. The user's pre-existing agent-configuration edits remain uncommitted.

---

## Section 3 — Gemini multi-part mapping

### Objective

- Map multi-part conversations to Gemini-native `GenerateContentParameters` with role-tagged turns.

### Constraints

- SPEC decisions 8, 10 (Gemini clause), 4, and 12: leading system → `systemInstruction` with `parts` text joined by `'\n\n'`; mid-conversation system → user turn at position; user → `'user'`; assistant → `'model'`; all parts of one message in the same turn in `parts` order; image parts as `inlineData`; no rewriting of provider rejections; existing text/image-payload mapping (including silent drop of data-less images) unchanged.
- **Leading-system ownership split (recorded decision):** the multi-part mapping helper returns `{ contents, systemInstruction }` — it consumes the leading system message (joining its text parts with `'\n\n'`) into `systemInstruction` and **excludes** it from `contents`; `buildModelParams` consumes that computed `systemInstruction` for multi-part payloads instead of reading `payload.system`. The join is computed exactly once. To make this work, `_sendInternal` invokes the multi-part mapping helper **first** (replacing the Section 1 early guard) and passes `{ contents, systemInstruction }` into `buildModelParams`, which keeps its existing per-family model/thinking logic; existing text/image paths are unaffected.
- **Structural widening:** `buildContents()` (or the multi-part mapping helper) returns role-tagged turn shapes (`Content`-shaped objects) rather than a flat `(string | Part)[]`; the widened shape reaches `generateContent`'s `contents` parameter and is pinned by the widened red test below.
- **Direct-call model fallback (recorded decision):** a multi-part payload sent directly (bypassing `RoutingLLMService`) without an explicit `model` falls back to the existing text-model default path (`gemini-2.5-flash-lite`). This is intentional: routing is the authoritative model supplier on the main path; the fallback is documented in `docs/modules/llm.md` rather than "corrected".
- `buildModelParams` extends to multi-part payloads (model/temperature/thinking config semantics consistent with existing per-family behaviour; prompt-cache key still not forwarded to Gemini).
- **Log labelling (debug + error paths):** both the `logPayload` debug path and the error-path `payloadType` labelling (`isImagePromptPayload(payload) ? 'image' : 'text'`) must label multi-part payloads as `'conversation'` — neither path may mislabel a mixed-content multi-part payload as `'text'`. This replaces the Section 1 placeholder in `_sendInternal`.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/llm/gemini.service.spec.ts`
- `@docs/testing/README.md`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/llm/gemini.service.ts`
- `@src/llm/llm.service.interface.ts`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/llm/gemini.service.ts`
- `@docs/modules/llm.md`

### Shared helper plan

- Helper entry 2 (Gemini clause): mapping kept local to `GeminiService`. Re-measure LOC at Green start; if the file projects past 500 lines, extract to `src/llm/gemini.multi-part.mapper.ts` and record the decision in implementation notes. Verify request shapes against `@google/genai` exports (`Part`, `Content`, `GenerateContentConfig`); do not hand-roll parallel types where the SDK exports exactly-shaped ones.

### Acceptance criteria

- First system message → single `systemInstruction` string built from its text parts (`'\n\n'` join, order preserved); no `system` role appears in `contents`.
- Mid-conversation system messages → `'user'` turns at position; user → `'user'`; assistant → `'model'`.
- Text parts become text content; image parts become `inlineData` Part objects; all parts of a message stay in one turn in `parts` order.
- Multi-part payloads dispatch through `_sendInternal` without misconfigured `model`/config parameters; `promptCacheKey` is ignored (not forwarded).
- Response parsing and error classification unchanged (regression).

### Required test cases (Red first)

Backend service tests (unit — `gemini.service.spec.ts`):

1. Leading system message maps to `systemInstruction`; multiple text parts joined with `'\n\n'` in order; absent leading system → no `systemInstruction`.
2. Mid-conversation system message becomes a `'user'` turn at its position.
3. Assistant messages become `'model'` turns.
4. Mixed-content user message: text + image parts in one turn, `parts` order preserved, images as `inlineData` with `mimeType`/base64 `data`.
5. Text-only conversation produces text-only turns (no image parts in request).
6. Model/temperature/thinking config consistent with existing behaviour for the resolved model family; `promptCacheKey` not forwarded.
7. `logPayload`/dispatch labelling describes the multi-part payload accurately (no "Unknown payload type" fall-through).
8. Error-path `payloadType` labelling labels a multi-part payload as `'conversation'` (not `'text'`).
9. Widened request shape: the `contents` reaching the mocked SDK are role-tagged turn objects (not a flat `(string | Part)[]`), containing no leading-system turn.
10. Regression: existing text and image payload request shapes unchanged (including silent drop of data-less images).

### Section checks

- `npm run test -- src/llm/gemini.service.spec.ts`
- `npm run lint`
- Mandatory-read evidence gate passed for all delegated handoffs in this section.
- Shared-helper/extraction decision recorded below.

### Optional `@remarks` JSDoc follow-through

- Document on the mapping helper why mid-conversation system messages convert to user turns (Gemini `contents` role constraint), referencing `docs/modules/llm.md`.

### Implementation notes / deviations / follow-up

- **Implementation notes:** filled during delivery (including LOC measurement result).
- **Deviations from plan:** note any departures.
- **Follow-up implications for later sections:** none beyond Section 5.

---

## Section 4 — Mistral multi-part mapping

### Objective

- Map multi-part conversations to Mistral-native `ChatCompletionRequest` messages with uniform chunk-array content.

### Constraints

- SPEC decisions 9, 10 (Mistral clause), 4, 6, and 12: native roles at caller order; every multi-part message yields a content chunk array (no string special case); text parts as `text` chunks; image parts as `image_url` chunks built from `data:<mimeType>;base64,<data>`; the image-payload injected instruction chunk is NOT applied; `promptCacheKey` forwarded; EU pin unchanged; existing `StringPromptPayload`/`ImagePromptPayload` behaviour (including silent drop) unchanged.
- **Log labelling (error path only):** Mistral has no debug-path payload-type label today; the error-path `payloadType` labelling (`isImagePromptPayload(payload) ? 'image' : 'text'` in error logging) must label multi-part payloads as `'conversation'` — no mixed-content multi-part payload may be logged as `'text'`. The Section 1 early guard in `_sendInternal` is replaced in this section. No new Mistral debug-path label is introduced.

### Delegation mandatory reads (when sub-agents are used)

Testing Specialist mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.spec.ts`
- `@docs/testing/README.md`

Implementation mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`
- `@src/llm/llm.service.interface.ts`

Code Reviewer mandatory docs:

- `@SPEC.md`
- `@src/llm/mistral.service.ts`
- `@docs/modules/llm.md`

### Shared helper plan

- Helper entry 2 (Mistral clause): mapping kept local to `MistralService`. Re-measure LOC at Green start; if the file projects past 500 lines, extract to `src/llm/mistral.multi-part.mapper.ts` and record the decision. Verify shapes against `@mistralai/mistralai` `ChatCompletionRequest`/chunk types. If both providers are found to need an identical part-to-chunk pre-step, record it in Global helper notes before extracting anything.

### Acceptance criteria

- Messages map in caller order with native roles (`system`/`user`/`assistant`).
- Each multi-part message's content is a chunk array with `parts` order preserved; image chunks carry the constructed data URI.
- `model`, `temperature`, `reasoningEffort` (mapped per existing rules), `safePrompt: false`, `responseFormat`, and `promptCacheKey` forwarding behave as today's `buildRequest`; EU pin unaffected.
- System-role messages with text chunk arrays are accepted by the SDK request shape (verified against SDK types).
- Response text extraction and error classification unchanged (regression).

### Required test cases (Red first)

Backend service tests (unit — `mistral.service.spec.ts`):

1. Multi-part conversation maps to native-role messages in caller order.
2. Text-only message yields a single-text-chunk array (no string content, no injected instruction chunk).
3. Mixed-content message yields text and `image_url` chunks in `parts` order with correct data URI.
4. `promptCacheKey` forwarded to `buildRequest`; `reasoningEffort` mapped per existing rules; EU server pin unaffected.
5. Multi-part payload error-path labelling is accurate (`'conversation'`, no `'image'`/`'text'` mislabel, no Section 1 placeholder leak); no new debug-path label is introduced.
6. Regression: existing text and image payload request shapes unchanged (including silent drop of data-less images and the injected chunk on the image path).

### Section checks

- `npm run test -- src/llm/mistral.service.spec.ts`
- `npm run lint`
- Mandatory-read evidence gate passed for all delegated handoffs in this section.
- Shared-helper/extraction decision recorded below.

### Optional `@remarks` JSDoc follow-through

- Document on the mapping helper that multi-part messages are uniformly chunk-array shaped and that the image-path instruction injection is intentionally not applied (SPEC decision 10).

### Implementation notes / deviations / follow-up

- **Implementation notes:** filled during delivery (including LOC measurement result).
- **Deviations from plan:** note any departures.
- **Follow-up implications for later sections:** none beyond Section 5.

---

## Regression and contract hardening

### Objective

- Prove the additive contract does not disturb any existing behaviour, and that the whole LLM suite plus build/lint/e2e pass.

### Constraints

- Prefer focused test runs before broader validation.
- Regression-baseline requirement (per `AGENTS.md` §5): compare follow-up runs against the regression baseline recorded in Section 1 using the `regression-checker` skill before declaring the feature complete; no regressions may remain unexplained.

### Acceptance criteria

- All unit suites pass: `npm run test`.
- Mocked E2E passes: `npm run test:e2e:mocked`.
- `npm run build` and `npm run lint` clean.
- Full-LOC re-measurement confirms no file exceeds 500 lines, or extractions were applied and recorded.

### Required test cases/checks

1. Run `src/llm` suites (all provider/routing/base/registry/type specs).
2. Run the full `npm run test` suite.
3. Run `npm run test:e2e:mocked` (V1 flow unaffected).
4. Run `npm run build && npm run lint`.
5. Run the `regression-checker` skill comparison against the Section 1 baseline and confirm no regressions.
6. Full-LOC re-measurement confirms no file exceeds 500 lines, or extractions were applied and recorded.
7. Verify mandatory-read evidence (`Files read`) is complete for every delegated regression handoff.

### Section checks

- Run the commands listed above and ensure green results.

### Implementation notes / deviations / follow-up

- **Implementation notes:** summarise what was done during the regression phase.
- **Deviations from plan:** note any additional work discovered or done.

---

## Documentation and rollout notes

### Objective

- Update canonical documentation to match the implemented multi-part contract.

### Constraints

- Only modify documents relevant to the touched areas.

### Acceptance criteria

- `docs/modules/llm.md` documents: the `MultiPartPromptPayload` contract, image-presence routing, and the per-provider mapping table (leading system → `systemInstruction`/native system message; mid-conversation system → Gemini user turn; assistant → `model` on Gemini; assistant-first as an expected provider-rejection mode; `'\n\n'`-joined leading-system text parts; Mistral chunk-array uniformity; no injected instruction chunk on the multi-part path; `promptCacheKey` deferral).
- Stale "SPEC product decision #4 / #12" JSDoc citations in `src/llm/routing-llm.service.ts` are re-pointed or neutralised and reconciled against the current spec.
- Shared-helper entries in `docs/modules/llm.md` reconciled against the actual implementation (statuses updated from `Not implemented`).
- Any deviations or caveats are documented.

### Required checks

1. Verify docs mention the transport/payload strategy and provider mapping table.
2. Confirm `docs/llm/error-handling.md` needs **no change** (per SPEC: no new failure modes expected); record any discovered limitation in that doc or in implementation notes instead.
3. Verify JSDoc on new public types is complete and British English.
4. Confirm notes/deviations fields are filled during implementation.
5. Verify mandatory-read evidence (`Files read`) is complete for delegated docs/review handoffs.
6. Reconcile planned shared-helper entries in canonical docs.

### Optional `@remarks` JSDoc review

- Confirm all planned `@remarks` from Sections 1–4 exist in the code. If no additional `@remarks` are needed from the documentation pass, record `None`.

### Implementation notes / deviations / follow-up

- filled during delivery.

---

## Suggested implementation order

1. Section 1 — contract types, guards, base-class dispatch (establish regression baseline first, via the `regression-checker` skill).
2. Section 2 — routing dispatch.
3. Section 3 — Gemini mapping (runs first among the provider sections).
4. Section 4 — Mistral mapping (may start in parallel with Section 3 **only after** the Global shared-helper gate is satisfied: Section 3's Green step has recorded whether an identical part-to-chunk pre-step exists and extraction is refused/confirmed. If both mappings proceed in parallel instead, section-level `@remarks`/docs work confirms shape-locality before any extraction).
5. Regression and contract hardening (includes regression-checker comparison).
6. Documentation and rollout notes.
