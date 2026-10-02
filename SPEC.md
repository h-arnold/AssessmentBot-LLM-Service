# Multi-part image prompting specification

## Status

Reviewed specification. User decisions confirmed on 2 October 2026.

## Purpose

Introduce a reusable multi-part assessment prompt base class and migrate image assessment to labelled text/image parts using the existing LLM conversation transport.

## Agreed decisions

1. Image assessment uses one leading system message and one user message containing three label/image pairs.
2. Preserve reference → template → student ordering. Each label immediately precedes its corresponding image.
3. Keep all existing output examples in the system prompt, not pre-supplied conversation turns. Revising example content or the existing four-step/three-part inconsistency is outside scope.
4. Retain existing multipart validation, including non-empty standard padded base64 and a maximum decoded size of 1 MiB (1,048,576 bytes) per image. This stricter construction-time validation is intentional; typical Google Slides images are approximately 100 kB.
5. Preserve the current reference-derived cache-key rule and existing public HTTP request/response shapes.

## Existing constraints

- `PromptFactory.create()` returns `Prompt`; `AssessorService` calls `buildMessage()` and forwards its payload unchanged.
- `Prompt` validates `referenceTask`, `studentTask`, and `emptyTask` as strings and owns rendering and content-gated logging.
- The factory converts Buffer inputs to data URIs, detecting their MIME types. `ImagePrompt` receives strings only. HTTP image validation remains upstream.
- The optional IMAGE DTO `systemPromptFile` field is currently ignored by the factory. Preserve that existing behaviour; fixing or removing the field is outside this migration. Factory TEXT/TABLE branches and method signatures remain intact.
- The LLM layer already supports branded `MultiPartPromptPayload`, image-presence routing, and ordered provider mapping for Gemini and Mistral.
- `buildMultiPartPromptPayload()` in `src/prompt/prompt.base.ts` is the sole production multipart schema-validation boundary. Consumers must not re-parse.
- British English, native ESM `.js` imports, NestJS Logger, existing logging privacy gates, and public JSDoc remain mandatory.

## Contracts

### Prompt abstraction

Add `MultiPartPrompt` in `src/prompt/multi-part.prompt.base.ts`, extending `Prompt` so existing factory/service typing remains valid. It retains input validation and the existing optional system prompt and runtime configuration conventions.

Its public `buildMessage(): Promise<MultiPartPromptPayload>` owns assembly, server-side cache-key derivation and the single call to `buildMultiPartPromptPayload()`. A protected abstract `buildUserParts(): Promise<LlmContentPart[]>` hook supplies ordered parts; the base does not parse images or invent task-specific content. No configurable history, new prompt-options object, alternate schema, or client-supplied cache key is introduced.

If a system prompt is supplied (including an empty string), include it verbatim as one text part of the leading system message. If undefined, omit the system message. Always include one user message; empty or invalid user parts fail existing multipart validation. Do not silently fall back to legacy transport.

### Image payload

`ImagePrompt` extends `MultiPartPrompt`. For factory-created image prompts, the existing system template is supplied and the payload has exactly two messages:

```ts
{
  messages: [
    { role: 'system', parts: [{ kind: 'text', text: systemPrompt }] },
    { role: 'user', parts: [
      { kind: 'text', text: 'Reference Task — benchmark for a perfect score.' },
      { kind: 'image', mimeType: referenceMimeType, data: referenceBase64 },
      { kind: 'text', text: 'Template — the unfilled task.' },
      { kind: 'image', mimeType: templateMimeType, data: templateBase64 },
      { kind: 'text', text: 'Student Submission — assess this image.' },
      { kind: 'image', mimeType: studentMimeType, data: studentBase64 },
    ] },
  ],
  promptCacheKey: sha256(referenceTask),
}
```

The illustrative `sha256` denotes the existing `buildPromptCacheKey()` rule: lowercase hexadecimal SHA-256 of the raw reference data URI held by the prompt (after factory Buffer conversion). MIME types and base64 data retain their original values; do not re-encode, drop, truncate, or substitute images. Do not add legacy `images`, `system`, or `user` payload fields or caller model/reasoning/sampling overrides.

Labels are intentionally short identification affordances; they need not duplicate the system template's explanatory wording.

### Validation and errors

- Preserve current malformed-data-URI handling: `BadRequestException` with the existing invalid-data-URI message.
- Once data URIs are extracted, malformed/empty base64, invalid multipart structure, and images over 1 MiB fail as raw `ZodError` from the existing builder. No new error wrapping, retry, or HTTP error mapping is introduced.
- Exactly 1 MiB is accepted; 1 MiB plus one byte is rejected. There is no new aggregate image limit or magic-byte validation at this boundary.
- Preserve existing upstream upload/data-URI validation and Buffer MIME-detection errors.

### Contract change inventory

- Internal image output changes from legacy `ImagePromptPayload` to `MultiPartPromptPayload` and becomes structurally validated at payload construction (each `buildMessage()` call).
- No DTO, Zod schema, persistence, HTTP endpoint, response schema, routing or provider contract changes are required.
- The legacy image payload type remains accepted by the LLM layer unchanged, with regression coverage retained even though ImagePrompt no longer produces it. Text/table prompts remain legacy string payloads.
- Raw construction `ZodError` follows the existing exception filter to HTTP 500 (sanitised in production). With the default 1 MiB upload setting, `ImageValidationPipe.ensureBufferWithinSize()` rejects oversized individual decoded images first with `BadRequestException` (HTTP 400), separately from the aggregate JSON body limit. If operators configure a larger upload limit, images above 1 MiB that previously reached a provider now fail construction; this intentional stricter limit does not change the filter's mapping.

## Behaviour and state rules

Each build derives parts afresh from the validated instance inputs, then assembles and validates the payload once. No mutable conversation history or accumulated turns are retained. Repeated builds return equivalent ordered content and cache keys without appending parts.

Keep the scoring rubric, JSON output structure and all examples unchanged. Update only the image-description/identification wording in the system template to describe three labelled images rather than “2 - 3” ambiguously positioned images; preserve output description headings and assessment semantics. No assistant messages are added.

Image presence continues to select the configured image model and image reasoning effort. Both providers receive the six user parts in order via their existing conversation mappings. Mistral's legacy image instruction is not injected for conversation payloads; the prompt's own labels and system instructions supply image identification instead.

## Scope boundaries and assumptions

- Assume this migration applies to every existing IMAGE assessment, without an opt-in flag or new API version.
- Out of scope: conversation-turn examples, example/rubric corrections, migration of text/table prompts, new HTTP conversation surface, generic arbitrary-conversation input APIs, provider changes, caching redesign, new dependencies and image-processing utilities.
- There are no unresolved questions or authorised deliberate deferrals. Excluded features are non-goals, not postponed implementation decisions.

## Testing expectations

- Base-class tests cover ordered assembly, optional/empty system content, input validation, single builder parse, invalid/empty parts, cache-key derivation and repeat builds.
- Image tests cover exact labels, MIME/data pairing and order with distinct valid base64 inputs, malformed URI errors, invalid base64, and per-image size boundaries.
- Factory tests cover string and distinct Buffer inputs with the real system template; text/table regressions remain green.
- Assessment-flow integration verifies a validated conversation reaches the LLM unchanged, logs a conversation summary, and construction failure prevents send. Existing service tests with explicitly mocked legacy image payloads keep their legacy summary assertions.
- Mocked HTTP/provider E2E tests exercise IMAGE on both providers and retain response compatibility: add Gemini IMAGE coverage and strengthen existing Mistral coverage. Update `test/utils/llm-mock.mjs` to recognise Gemini conversation `inlineData` image parts, rather than selecting the text response merely because no data URI appears in the request. Assert image-specific response content, not only score-field presence. Existing legacy payload/provider tests remain green. Live score-quality comparisons are not a deterministic acceptance gate.

## Documentation and rollout

Update `docs/prompts/README.md`, `docs/modules/prompt.md` and affected sections of `docs/modules/llm.md` to describe the new producer, server-derived cache key and stricter validation. Align directly affected hierarchy/flow references in `docs/design/ClassStructure.md`, `docs/architecture/data-flow.md`, `docs/architecture/patterns.md` and `docs/architecture/modules.md`. Remove stale file-path/image-loading claims only in the touched image documentation. Document the planned abstraction before implementation with status `Not implemented`, then reconcile during delivery.

Roll out through existing IMAGE dispatch; no data migration or configuration change. This establishes transport correctness, not proof of improved assessment quality.

Reconcile stale cache-key derivation remarks in `src/llm/multi-part-prompt.schema.ts` as JSDoc-only changes; do not alter its schema behaviour.
