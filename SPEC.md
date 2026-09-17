# Multi-Part Prompt Support Specification

## Status

- Draft v1.1 — 2026-09-16. Revision following planning review: resolved malformed-part contradictions (image parts now require `data: string`; no runtime data validation), forbade image parts in system messages, pinned leading-system text-part joining, Mistral mapping details, guard ordering, and logging coverage; deferred `promptCacheKey` derivation to the V2 workstream; added reconciliation of stale in-code SPEC citations.
- Initial draft covering a new multi-part conversation payload in the LLM service layer, with Gemini and Mistral provider mapping.
- Supersedes the completed Prompt Cache Key Specification (that feature is delivered; its contract decisions are preserved below as existing constraints and in git history).

## Purpose

This document defines the intended behaviour for a multi-part prompt payload that lets callers send a full conversation — an ordered sequence of messages with `system`, `user`, and `assistant` roles — where each message may contain text parts and image parts.

The feature will be used to:

- Enable conversation-style LLM requests (multi-turn dialogues) through `ILlmService.send()`.
- Serve as the transport-layer precursor for a planned multi-part prompt base class used by the future V2 assessor endpoint.

This feature is **not** intended to:

- Introduce a new HTTP endpoint or change any existing V1 API contract. Multi-part payloads are constructed server-side; no REST surface accepts them yet.
- Change the prompt layer (`PromptFactory`, `PromptBase`, or existing prompt subclasses). Existing prompts continue to produce `StringPromptPayload` / `ImagePromptPayload`.
- Implement the multi-part prompt base class itself — that is a later workstream.
- Alter retry, error-classification, response-validation, or model-selection behaviour beyond the dispatch changes described here.

## Agreed product decisions

1. **Additive payload type.** A new `MultiPartPromptPayload` type is added to the `LlmPayload` union in `src/llm/llm.service.interface.ts`. The existing `StringPromptPayload` and `ImagePromptPayload` types, and **all behaviour that consumes them — including the existing silent drop of data-less images in both providers' mapping — are unchanged**. Existing `LlmPayload` consumers keep working without modification.
2. **Message shape.** A `MultiPartPromptPayload` carries a `messages` array. Each message has a `role` of `'system' | 'user' | 'assistant'` and a `parts` array. Each part is either a text part (`{ kind: 'text', text: string }`) or an image part (`{ kind: 'image', mimeType: string, data: string }`). Image `data` is **required** base64 — a brand-new contract with no back-compat burden, so no "image with no usable data" validation rule exists. Text `text` is a (possibly empty) string; no non-empty constraint is imposed.
   **Additional structural rules enforced by the schema (decision 12):** at least one message (`messages` `.min(1)`) and at least one part per message (`parts` `.min(1)`) — rules that plain TypeScript could not express and that were accordingly dropped in v1.1; they return here because the schema can carry them. No format refinement is imposed on `mimeType`, `data` (beyond being a string), or `text` (beyond being a string) — provider-unsupported values fail loudly at the provider, per decision 4.
3. **Roles allowed anywhere; system carries text only.** `system`, `user`, and `assistant` messages are permitted at any position. System messages may carry **text parts only**; image parts are restricted to `user` and `assistant` messages. This restriction is **expressed in the type contract itself** via a role-discriminated message union (see recommended data shapes) — system-role messages are typed to text-only parts, so the compiler enforces the rule for TypeScript callers. This keeps the leading-system mapping well-defined (Gemini's `systemInstruction` is text-oriented) and avoids undefined provider edge cases.
4. **Image parts pass through as-is.** Image parts in user/assistant messages are passed through untransformed: `mimeType` plus required base64 `data`. The payload layer performs no conversion or capability filtering; provider-side rejection of any part (e.g. unsupported modalities) is **not** caught or rewritten — it surfaces through the existing error-classification cascade (`classifyLlmError`) as the provider error it is. Fail fast and loudly; no defensive handling.
5. **Discriminator and guard ordering.** `mapPayload` retains its current check order — `isImagePromptPayload` (`'images' in payload`) first, then `isStringPromptPayload` (`'user' in payload`), then a **new third branch** checking `'messages' in payload` (presence only; no `Array.isArray` refinement) — keeping the existing final `'Unsupported payload type'` throw as the last resort for malformed payloads. Existing guards keep their current behaviour; no check is reordered.
6. **Shared options.** `MultiPartPromptPayload` supports the same optional fields as the existing payload types: `temperature?`, `model?`, `reasoningEffort?`, and `promptCacheKey?`, with identical field semantics and the identical forwarding matrix (`promptCacheKey` forwarded to Mistral only, ignored by Gemini).
7. **`promptCacheKey` derivation is deferred.** This workstream defines **no** derivation rule for multi-part payloads (no prompt layer or reference-task input yet exists for conversations). v1 callers may omit the field; derivation for conversation payloads belongs to the future multi-part prompt base class / V2 workstream and is recorded there.
8. **Provider mapping — system messages (Gemini).** The first message, when its role is `system`, maps to the native `systemInstruction` field; its text parts are concatenated **in `parts` order, joined with a single `'\n\n'` separator**. Any **mid-conversation** `system` message maps to a user turn (Gemini role `'user'`) at its position, since Gemini's `contents` roles are limited to `'user'` / `'model'`. `user` messages map to role `'user'`; `assistant` messages map to role `'model'`. A conversation whose first message has another role (e.g. assistant-first) maps positionally as above and, if the provider rejects it, that rejection surfaces per decision 4 (an expected, documented rejection mode — see documentation notes).
9. **Provider mapping — system messages (Mistral).** Messages map natively — `system` stays `system`, `user` stays `user`, `assistant` stays `assistant` — in the caller's order. No folding, merging, or reordering.
10. **Provider mapping — parts.** Every message's parts are mapped into a **single-element-safe uniform content-chunk representation** in `parts` order at the message's position:
    - **Gemini**: each message becomes one `Content` turn with role `'user'`/`'model'` (or `systemInstruction` content per decision 8); text parts become text strings in the turn, image parts become `inlineData` Parts (`{ mimeType, data }`). All parts of one message land in the same turn.
    - **Mistral**: **no implied special case for text-only messages** — every multi-part message produces a content **chunk array**, where text parts are `text` chunks and image parts are `image_url` chunks built from the data URI `data:<mimeType>;base64,<data>` (transport-layer construction, as today). The existing injected instruction chunk ("Assess these images per your system instructions…") is **not** applied to the multi-part path — the caller's message content is used verbatim; that injection remains exclusive to `ImagePromptPayload`.
11. **Routing.** `RoutingLLMService.send()` routes a multi-part payload by whether it contains **any** image part (in any message): any image part → image provider + image model + image reasoning-effort configuration; otherwise → text provider + text model + text reasoning-effort configuration. Caller-supplied `model` / `reasoningEffort` are overwritten authoritatively, exactly as for the existing variants.
12. **Schema-first for the new variant; plain types for legacy.** The multi-part payload contract is defined as Zod schemas with TypeScript types **derived** via `z.infer` (the schemas are the source of truth — see recommended data shapes). **Reasoning-effort revision (2026-09-17, approved in `PR_REVIEW.md`):** `ReasoningEffortSchema` in `src/llm/multi-part-prompt.schema.ts` is the single source of truth for the shared `ReasoningEffort` type, derived there via `z.infer` and imported/re-exported through `llm.service.interface.ts` to retain public import compatibility. This supersedes the mirrored union and its bridge-equality test requirement; existing tests may continue to pin the identical `'off' | 'low' | 'high' | 'max'` public contract. Schema placement and validation boundaries remain unchanged in this remediation. Legacy `StringPromptPayload` / `ImagePromptPayload` remain plain TypeScript types and gain no runtime validation. Validation is a **single schema, validated at every `ILlmService.send()` entry point**:
    - `RoutingLLMService.send()` (the main path) parses the multi-part variant **before** its image-presence inspection, so a structurally invalid payload raises `ZodError` instead of a routing `TypeError`;
    - the base `LLMService.send()` (provider path, incl. direct-instantiation callers) parses the multi-part variant before the retry loop and before `describePayload`, so no multi-part summary code touches an unvalidated payload.
      A failed parse raises `ZodError`, which propagates directly — the same no-`mapError()`, no-retry contract as the existing in-loop `ZodError` bypass (the bypass itself stays where it is; the parse simply sits outside the loop so it runs once per `send()`). Legacy variants are never parsed. Runtime-malformed payloads from non-TypeScript callers therefore **no longer** fall outside the contract: they fail at the first `send()` entry point with a structural `ZodError` rather than a routing or provider-side mystery.
13. **British English** in all comments, JSDoc, and documentation touching the new types.

## Existing system constraints

### Backend constraints already in place

- `LlmPayload` is the union `ImagePromptPayload | StringPromptPayload` in `src/llm/llm.service.interface.ts` (382 LOC). `LLMService` (abstract base) provides retry with exponential backoff, single-shot error classification, the `mapPayload` template-method dispatcher, and the `'images' in payload` / `'user' in payload` type guards.
- `RoutingLLMService` spreads payloads before dispatch (`{ ...payload, model, reasoningEffort }`), so shared optional fields survive; adding a new union member requires updating its dispatch logic.
- Both providers already support multi-part content natively — Gemini accepts `Part[]` arrays per turn (inline base64 via `inlineData`); Mistral accepts message content chunk arrays with `text` and `image_url` chunks. The abstraction layer simply does not expose this to callers today.
- Error handling is payload-shape-agnostic (`src/llm/llm-error-mapper.ts`, `src/common/errors/`); no error-classification changes are required.
- Prompt cache key contract (delivered): `promptCacheKey` is server-derived for existing variants, forwarded to Mistral only, ignored by Gemini. See decision 7 for the multi-part deferral.
- Mistral requests remain pinned to the EU server (`server: 'eu'`) — fixed policy, unaffected by this feature.

### Current data-shape constraints

- Existing payloads are single-turn: `StringPromptPayload` = `{ system, user }`; `ImagePromptPayload` = `{ system, images[] }` with optional `data`. Their message order and `images` shape **must not change**.
- Base64 data representation: image bytes are held as base64 strings at the transport layer; the transport layer itself constructs data URIs for Mistral `image_url` chunks today, and the prompt layer constructs data-URI strings only when building the image reference task for cache-key derivation.

### Consumer architecture constraints

- Backend-only service; no frontend. No HTTP surface changes.
- The V2 assessor endpoint does not exist yet; nothing in this workstream may create or mutate controller/DTO code.

## Recommended data shapes

Schema-first: Zod schemas are the source of truth; the public types are **derived** via `z.infer` (decision 12).

```ts
export const ReasoningEffortSchema = z.enum(['off', 'low', 'high', 'max']);
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

const TextContentPartSchema = z.object({
  kind: z.literal('text'),
  text: z.string(),
});
const ImageContentPartSchema = z.object({
  kind: z.literal('image'),
  mimeType: z.string(),
  data: z.string(), // required; no format refinement (decision 2)
});
const LlmContentPartSchema = z.discriminatedUnion('kind', [
  TextContentPartSchema,
  ImageContentPartSchema,
]);

const LlmConversationMessageSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('system'),
    parts: z.array(TextContentPartSchema).min(1),
  }),
  z.object({
    role: z.enum(['user', 'assistant']),
    parts: z.array(LlmContentPartSchema).min(1),
  }),
]);

const MultiPartPromptPayloadSchema = z.object({
  messages: z.array(LlmConversationMessageSchema).min(1),
  temperature: z.number().optional(),
  model: z.string().optional(),
  reasoningEffort: ReasoningEffortSchema.optional(), // shared source of truth
  promptCacheKey: z.string().optional(),
});

// Derived public types — these are the contract consumed by callers:
export type TextContentPart = z.infer<typeof TextContentPartSchema>;
export type ImageContentPart = z.infer<typeof ImageContentPartSchema>;
export type LlmContentPart = z.infer<typeof LlmContentPartSchema>;
export type LlmConversationMessage = z.infer<
  typeof LlmConversationMessageSchema
>;
export type MultiPartPromptPayload = z.infer<
  typeof MultiPartPromptPayloadSchema
>;
```

### Naming recommendation

Prefer:

- `messages`, `role`, `parts` — mirrored from both providers' native vocabularies.
- `kind` as the part discriminator (distinct from both providers' naming, so the payload layer stays provider-neutral).

Avoid:

- `content` (collides with Mistral's chunk-array field); `inlineData` / `image_url` (leaks provider naming into the shared contract).

## Feature architecture

### Placement

- New types, type guards, and dispatch support live in `src/llm/llm.service.interface.ts`, or a new sibling module if that file projects beyond the 500-line separation threshold (see planning handoff notes).
- Provider mapping lives in `gemini.service.ts` and `mistral.service.ts`, following each file's existing `buildContents` / `buildMessages` patterns.
- Dispatch lives in `routing-llm.service.ts`.

### Out of scope for this surface

- Prompt-layer changes (`src/prompt/**`) — untouched.
- Controller, DTO, E2E route work — none (not exposed over HTTP yet).
- New prompt template files, Mustache changes — none.
- Runtime payload validation for the **legacy** variants (`StringPromptPayload` / `ImagePromptPayload`) — none (schema-first applies to the multi-part variant only, decision 12).
- Additional part kinds (audio, video, files), tool/function roles, structured output per message — none.

## Workflow specification

### Send multi-part conversation

1. Caller constructs a `MultiPartPromptPayload` and calls `ILlmService.send()`.
2. `RoutingLLMService.send()` validates the multi-part variant against the schema **before** its image-presence inspection (decision 12), then resolves provider/model/effort accordingly, spreads a new payload, and dispatches.
3. Base `LLMService.send()` on the provider path re-validates the multi-part variant (idempotent; sole validation point for direct-instantiation callers), summarises the payload for logging (below), and runs the existing retry/classification loop unchanged.
4. Provider `_sendInternal()` maps messages and parts to its native request shape (decisions 8–10) and calls the provider API.
5. The response is parsed and validated exactly as today (`LlmResponseSchema`).

### Describe/log payloads

- Base-class summary: multi-part payloads log a summary consistent with the existing style, e.g. `conversation prompt with N message(s)`.
- Provider mapping/logging: Gemini's `logPayload` type fall-through and the providers' `'image'`/`'text'` log labelling (via `isImagePromptPayload`) must not mislabel multi-part payloads; the multi-part provider mapping work includes accurate labelling for the new variant.

## Error, loading, and empty-state rules

- No new error classes. Provider-side failures flow through the existing `LlmError` hierarchy and `classifyLlmError` cascade.
- Structurally invalid multi-part payloads (empty `messages`/`parts`, wrong shapes, unknown roles/kinds) raise `ZodError` at the **first `ILlmService.send()` entry point** they reach — `RoutingLLMService.send()` on the main path, the base `LLMService.send()` on the provider path — loud and never retried (decisions 12).
- Provider-unsupported (but schema-valid) requests fail loudly via the provider path; nothing is silently dropped or rewritten in the multi-part path (decisions 4, 12).
- The existing silent drop of data-less images remains **unchanged and exclusive to `ImagePromptPayload`**.

## Backend changes required to support agreed behaviour

1. **Contract change (schema-first)** — new Zod schemas `ReasoningEffortSchema` (single source of truth for the derived `ReasoningEffort` type, re-exported through the interface) / `TextContentPartSchema` / `ImageContentPartSchema` / `LlmContentPartSchema` / `LlmConversationMessageSchema` / `MultiPartPromptPayloadSchema`; public types derived via `z.infer`; extend the `LlmPayload` union; add the third `mapPayload` branch and the `isMultiPartPromptPayload` guard.
2. **Base-class change** — `send()` gains the single boundary parse for the multi-part variant (before the retry loop; `ZodError` bypasses mapping and retry per the existing behaviour); `describePayload` gains a multi-part summary.
3. **Routing change** — `RoutingLLMService.send()` handles the new variant with image-presence-based routing, and validates the multi-part variant against the schema **before** inspection (decision 12).
4. **Provider mapping** — `GeminiService.buildContents()`/adjacent helper and `MistralService.buildMessages()` gain multi-part conversation mapping per decisions 8–10; this includes widening Gemini's `buildContents()` return shape from a flat `(string | Part)[]` to role-tagged turn shapes; per-provider request parameters (`buildModelParams`, `buildRequest`, temperature, reasoning effort), `promptCacheKey` forwarding, and response parsing extend to the new variant; provider logging labels the variant accurately.

## Planning handoff notes

- **LOC / file separation check (mandatory):** current production LOC — `llm.service.interface.ts` 382, `gemini.service.ts` 389, `mistral.service.ts` 400, `routing-llm.service.ts` 148. Projected additions (types + guards + JSDoc ≈ 80–120 lines; per-provider mapping ≈ 60–120 lines each; routing ≈ 20–40 lines) may push `llm.service.interface.ts`, `gemini.service.ts`, and `mistral.service.ts` toward or past the 500-line threshold. The action plan must re-measure before implementation and plan explicit file separation (e.g. a `llm/multi-part-prompt.types.ts` module and/or per-provider conversation-mapping helpers) for any file projected to exceed 500 lines.
- **Structural widening flag:** Gemini's `buildContents` currently returns a flat `(string | Part)[]`; multi-turn mapping requires role-tagged turn shapes (`Content`-shaped). The action plan must size and test this signature/return-shape widening explicitly, including where `mapPayload` handler signatures change. Single validation point: provider mapping receives payloads already validated at the base `send()` boundary and must not re-parse them.
- **TDD ordering:** contract types first, then routing, then provider mapping (Gemini and Mistral may proceed in parallel); regression suites for existing payload variants must stay green throughout.
- **Shared-helper gate:** any extraction decision for the multi-part mapping helpers must be recorded in the action plan before implementation.
- Provider SDK request shapes must be verified against `@google/genai` `Part`/`Content`/`GenerateContentConfig` and `@mistralai/mistralai` `ChatCompletionRequest` types during implementation; do not hand-roll parallel type definitions where the SDK exports exactly-shaped ones.
- Stale in-code citations: `routing-llm.service.ts` JSDoc references "SPEC product decision #4" and "#12" from the superseded prompt-cache-key spec; the implementation pass must re-point or neutralise those citations against the current spec.

## Testing expectations

- Unit tests for guard ordering and the third `mapPayload` branch (base-class suite pattern: `llm.service.interface.spec.ts`).
- Unit tests for the boundary schema validation: valid multi-part payload passes; empty `messages`, empty `parts`, unknown role/kind, and missing image `data` raise `ZodError` re-thrown directly (no `mapError`, no retry, no provider SDK contact); legacy variants are **not** parsed and behave exactly as today.
- Unit tests for `RoutingLLMService` multi-part routing: any-image → image provider + image model + image effort; text-only → text provider + text model + text effort; caller `model` / `reasoningEffort` overwritten; caller's payload object not mutated; a structurally invalid multi-part payload raises `ZodError` at the routing entry **before** any part inspection or provider contact.
- Unit tests for Gemini mapping: first system message → `systemInstruction` with `'\n\n'`-joined text parts; mid-conversation system → user turn at position; assistant → `'model'` role; parts order preserved within turns; text-only and mixed-content messages; assistant-first conversation produces the documented positional mapping.
- Unit tests for Mistral mapping: native roles at caller order; every message a chunk array with parts order preserved; `image_url` data-URI chunks; no injected instruction chunk on the multi-part path; `promptCacheKey` forwarded; EU pinning unaffected.
- Unit tests for `describePayload` multi-part summary and accurate provider log labelling.
- Regression: all existing `StringPromptPayload` / `ImagePromptPayload` unit suites, `npm run test`, and `npm run test:e2e:mocked` remain green (silent-drop behaviour for `ImagePromptPayload` explicitly regression-covered).
- No live-provider E2E required; no HTTP surface exists for multi-part payloads.

## Documentation and rollout notes

- Update `docs/modules/llm.md` with the multi-part payload contract (schema-first typing with `z.infer`, validation at each `ILlmService.send()` entry point with `ZodError` propagation), image-presence routing rule, and a per-provider mapping table including: leading-system → `systemInstruction` / native system message; mid-conversation system → Gemini user turn; assistant → `model` role on Gemini; assistant-first conversations as an expected provider-rejection mode; `'\n\n'`-joined leading-system text parts; Mistral chunk-array uniformity.
- Reconcile the stale "SPEC product decision #4 / #12" citations in `routing-llm.service.ts` JSDoc during implementation and confirm in docs.
- No change expected in `docs/llm/error-handling.md` (no new failure modes); record any discovered limitation instead.
- Rollout: no migration; additive contract; no V1 behaviour change.
- The superseded prompt-cache-key `ACTION_PLAN.md` at repo root is delivered and recorded in git history; this feature's action plan replaces it at the same path.

## V1 scope recommendation

### Include in v1

- The `MultiPartPromptPayload` contract and union membership.
- Zod schemas for the multi-part contract with `z.infer`-derived public types.
- Guard/dispatch support in the base `LLMService` class.
- Schema validation of the multi-part variant at each `ILlmService.send()` entry point (routing entry before its inspection; provider base entry before `describePayload`/retry), with `ZodError` propagating directly.
- `RoutingLLMService` image-presence routing for the new variant.
- Gemini and Mistral request mapping with unit tests.
- `describePayload` and provider log-labelling support.

### Defer from v1

- The multi-part prompt base class and `PromptFactory` support (future V2 workstream).
- `promptCacheKey` derivation for conversation payloads (owned by the multi-part prompt base class workstream).
- Any HTTP endpoint, DTO, or client-facing validation for multi-part payloads.
- Zod schemas and validation for the legacy payload variants (schema-first is scoped to the multi-part variant only, decision 12) — revisit if/when the legacy prompts are migrated.
- Image parts in system messages (explicitly forbidden in v1 — re-evaluate with the V2 workstream).
- Additional part kinds (audio, video, files), tool/function roles, structured output per message.
