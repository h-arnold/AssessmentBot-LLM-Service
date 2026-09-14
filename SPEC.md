# Prompt Cache Key Specification

## Status

- Draft v1.2 — 2026-09-14. Revision: removed task type from the hash input; confirmed multimodal coverage; added shared-helper ownership and golden-value test expectations following review; added Mistral EU-only endpoint pinning (fixed policy, `server: 'eu'`).
- Initial draft covering the addition of a provider-agnostic, payload-derived prompt cache key to improve Mistral prefix-cache hit rates.

## Purpose

This document defines the intended behaviour for supplying a `promptCacheKey` on LLM payloads so that providers supporting prompt caching (currently Mistral) can reuse cached prompt prefixes across repeated requests for the same task.

The feature will be used to:

- Reduce input token cost when Assessment Bot sends batches of student submissions (e.g. 30 at a time) for the same reference task.
- Increase the observed Mistral cache-hit ratio (currently approximately 50%) by giving the API a stable routing hint that groups requests sharing a prompt prefix.

This feature is **not** intended to:

- Guarantee cache hits — `prompt_cache_key` is a best-effort hint; a hit occurs only when the API finds a compatible cached prefix.
- Change prompt content, message ordering, or any assessment behaviour.
- Add cache-hit observability (e.g. logging `cached_tokens`) — explicitly deferred.
- Implement Gemini context caching — Gemini has no equivalent single-field mechanism and is out of scope.

## Agreed product decisions

1. The cache key is **derived from the payload**, not from the HTTP request or any controller-level context. This keeps it provider-agnostic.
2. The key is an **optional field** (`promptCacheKey?: string`) on `LlmPayload`. Consumers that do not support caching simply ignore it.
3. The key is passed **only to provider services that support it**. `MistralService` forwards it as the Mistral-native `promptCacheKey` request field; `GeminiService` ignores it.
4. The key value is a **SHA-256 hash of the reference task content** (`sha256(referenceTask)`, hex-encoded, 64 characters). Hashing satisfies Mistral's guidance against embedding user content or sensitive data in the key, and 64 characters is well within acceptable key length. The task type is deliberately **not** included in the hash input: different task types will have different reference task content anyway, so including it would be over-engineering.
5. The key covers **all payload variants** — text, table, and multimodal (image). For image tasks, the reference task is the data-URI form held by the prompt, which hashes deterministically like any other string.
6. **No logging** of cached-token counts (`usage.prompt_tokens_details.cached_tokens`). The existing response-validation and logging behaviour is unchanged.
7. The key derivation happens **inside the prompt layer** so the payload carries it; `AssessorService` and `RoutingLLMService` need no changes (the router already spreads the payload, preserving unknown fields).
8. **Mistral requests are pinned to the EU production server.** The SDK client is constructed with `server: 'eu'` (resolving to `https://api.eu.mistral.ai`). This is fixed policy, not configuration: no environment variable is introduced for it. All Mistral API traffic (chat completions included) therefore stays on EU-hosted infrastructure.

## Existing system constraints

### Backend or API constraints already in place

- `LlmPayload` is the union `StringPromptPayload | ImagePromptPayload` in `src/llm/llm.service.interface.ts`.
- `RoutingLLMService.send()` builds a **new** payload via object spread before dispatching; any new optional field must survive this spread (it does).
- `MistralService.buildRequest()` constructs the `ChatCompletionRequest`; the installed SDK (`@mistralai/mistralai` ≥ 2.7) already declares `promptCacheKey?: string | null` (mapped to `prompt_cache_key`).
- `GeminiService._sendInternal()` calls `models.generateContent()` with no cache-key parameter; nothing is added there.
- The base `LLMService.send()` retry loop reuses the same payload object across retry attempts, so a single derived key applies consistently to retries.

### Current data-shape constraints

- `PromptInputSchema` (`src/prompt/prompt.base.ts`) carries `referenceTask`, `studentTask`, `emptyTask` as strings; the reference task may be large text, and for IMAGE tasks it is a base64 data URI.
- Prompt message order for TEXT/TABLE is: system prompt, then user message rendered as **Reference Task → Template Task → Student Task** (`src/prompt/templates/text.user.prompt.md`). This ordering is what makes prefix caching effective and **must not change**.
- IMAGE payloads carry only `system` + `images`; they have no user text message.

### Consumer architecture constraints

- The service is backend-only; Assessment Bot (the upstream caller) is unaffected. No API contract change: the cache key is server-derived and never accepted from clients (security-first: a client-supplied key could enable cache poisoning or cross-tenant leakage).

## Domain and contract recommendations

### Why this approach is preferable

- **Payload-derived** keeps derivation close to the prompt content the key represents and survives routing.
- **Hash-based** avoids leaking reference-task content into provider-side metadata and gives a fixed-length, stable key.
- **Optional field** means zero impact on providers without cache support and no schema breakage.

### Recommended data shapes

#### `StringPromptPayload` (extended)

```ts
{
  system: string;
  user: string;
  temperature?: number;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  /** Optional provider-agnostic prompt cache key (SHA-256 hex of the reference task). */
  promptCacheKey?: string;
}
```

#### `ImagePromptPayload` (extended)

```ts
{
  system: string;
  images: Array<{ mimeType: string; data?: string }>;
  temperature?: number;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  /** Optional provider-agnostic prompt cache key, same derivation as text payloads. */
  promptCacheKey?: string;
}
```

### Naming recommendation

Prefer:

- `promptCacheKey` — matches the Mistral SDK field name and reads as an abstract concept.

Avoid:

- `cacheKey`, `cache_key`, `prompt_cache_key` — reserved for provider-native spellings.

### Validation recommendation

#### Backend

- The derived key must be a 64-character lowercase hexadecimal string (SHA-256 output).
- The field is optional and never validated from client input (it is not part of `CreateAssessorDto`).

## Feature architecture

### Placement

- Key derivation lives in the prompt layer: `Prompt.buildMessage()` sets `promptCacheKey` on the returned `LlmPayload` (both text/table default path and `ImagePrompt.buildMessage()`).
- The derivation is a single shared helper — `buildPromptCacheKey(referenceTask: string): string` — owned by `src/prompt/prompt.base.ts` (exported at module level) and consumed by both `Prompt.buildMessage()` and `ImagePrompt.buildMessage()`. Decision: **new** helper, prompt-layer ownership, called from the two payload-building sites; no duplicate local implementations.
- Forwarding lives in `MistralService.buildRequest()`.
- EU endpoint pinning lives in `MistralService.getClient()` — the single site where the SDK client is constructed.
- No changes to controllers, DTOs, `AssessorService`, or `RoutingLLMService`.

### Out of scope for this surface

- Cache-hit metrics, dashboards, or structured logging of `cached_tokens`.
- Gemini context caching (explicit or implicit).
- Any change to prompt template content or ordering.

## Core behavioural model

### Derivation rules

- For every successfully built payload: `promptCacheKey = sha256(referenceTask)` hex-encoded, where `referenceTask` is the raw reference content string (for IMAGE, the data-URI form held by the prompt — this ensures multimodal payloads are covered by the same rule as text payloads). The hash is lowercase hexadecimal.
- The derivation rule is part of the documented contract, not an implementation detail: it is a single-input SHA-256 over `referenceTask` with no separator, prefix, or other inputs. Changing the rule changes every effective cache key and therefore requires a deliberate contract revision.

### Forwarding rules

- `MistralService`: when the payload carries `promptCacheKey`, set it on the Mistral request; when absent, omit the field entirely (do not send `null`).
- `GeminiService`: ignores the field; no code change required beyond the shared payload type.
- All providers receive the key via the existing `LlmPayload` contract; providers without support must not fail when it is present.

## Main workflow specification

### Batch assessment (typical: 30 submissions, same task)

1. Assessment Bot sends request N with reference task R, template T, student response S(n).
2. Prompt layer derives `promptCacheKey = sha256(referenceTask)` — identical for all 30 requests.
3. `MistralService` includes the key; Mistral's prefix cache serves the shared `system + R + T` prefix for cache-warm requests.
4. Expected billable outcome: full input price only for the varying student-task tokens (plus the first/warm-up request).

### Behavioural guarantees

- Identical inputs produce identical keys (deterministic).
- Multimodal (image) payloads carry the key using the same derivation rule as text/table payloads.
- Absence of the key never causes an error in any provider.

## Error, loading, and empty-state rules

- No new failure modes: key derivation operates on already-validated payload fields. If derivation were to throw (e.g. crypto failure), the error propagates loudly and the request fails — no silent fallback.

## Backend changes required to support agreed behaviour

1. Contract change: add optional `promptCacheKey?: string` to both `StringPromptPayload` and `ImagePromptPayload` in `src/llm/llm.service.interface.ts`.
2. Prompt-layer change: `Prompt.buildMessage()` (default text/table path) and `ImagePrompt.buildMessage()` populate `promptCacheKey` on the returned payload.
3. Provider change: `MistralService.buildRequest()` forwards `promptCacheKey` when present; `GeminiService` unchanged.
4. Endpoint pinning: `MistralService.getClient()` constructs the SDK client with `server: 'eu'` in addition to `apiKey`, routing all Mistral traffic to `https://api.eu.mistral.ai`. The change is local to the client-construction site; no configuration, DTO, or contract surface changes.

## Planning handoff notes

- The payload type change (contract) must land before or alongside the prompt-layer population so TypeScript stays green at each commit.
- `RoutingLLMService` must remain untouched; its spread behaviour already preserves the new field. A unit test should pin this expectation.
- The system prompt templates and `text.user.prompt.md` ordering must not be modified in this feature.

## Testing expectations

- Unit tests for key derivation: determinism, hex format, length, identical for image data-URI references and plain text references of the same content.
- Golden-value test: one fixed `referenceTask` input must produce the exact expected SHA-256 hex value, pinning the derivation rule (single input, no separators) against accidental change. The expected value is generated via `crypto.createHash('sha256')` during test authoring and committed as a frozen constant; on mismatch, the derivation is what changed — never the constant.
- Unit tests for `Prompt.buildMessage()` / `ImagePrompt.buildMessage()` populating the field.
- Unit tests for `MistralService.buildRequest()` forwarding (present → set; absent → omitted, not `null`).
- Unit test for `RoutingLLMService.send()` preserving `promptCacheKey` through the payload spread.
- Unit test that `GeminiService` is unaffected (its `_sendInternal` ignores the field; existing tests suffice, plus one asserting no throw when the field is present).
- Unit test that `MistralService` constructs its SDK client with `server: 'eu'` (verified via constructor spy/module mock), and that the pinning applies on the shared lazy-construction path.
- E2E mocked tests continue to pass unchanged (the key is additive).

## Documentation and rollout notes

- Update `docs/modules/llm.md` (canonical LLM module doc) with the new optional payload field, derivation rule, provider support matrix (Mistral: forwarded; Gemini: ignored), and the EU-only endpoint pinning (client constructed with `server: 'eu'`; base URL `https://api.eu.mistral.ai`).
- Note in docs that cache hits are best-effort and observable via Mistral's `usage.prompt_tokens_details.cached_tokens` (external observation; not logged by this service).
- No migration, no environment variables, no API version bump.

## V1 scope recommendation

### Include in v1

- Optional `promptCacheKey` field on both payload variants.
- Derivation in the prompt layer for all three task types.
- Forwarding in `MistralService`.
- EU-only endpoint pinning in `MistralService.getClient()` (`server: 'eu'`).

### Defer from v1

- Cached-token logging/metrics.
- Gemini context caching.
- Any client-supplied cache-key affordance.

## Open questions

None at time of drafting — the payload-derived, hash-based, Mistral-only design was confirmed by the product owner.
