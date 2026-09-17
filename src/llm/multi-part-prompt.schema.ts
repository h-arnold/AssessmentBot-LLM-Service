import { z } from 'zod';

/**
 * Validates the existing provider-neutral reasoning-effort levels. Single
 * source of truth: the shared {@linkcode ReasoningEffort} type is derived
 * from this schema and re-exported through the service interface.
 */
export const ReasoningEffortSchema = z.enum(['off', 'low', 'high', 'max']);

/**
 * Schema-derived reasoning-effort level. Each provider maps these to its
 * native parameter.
 * - 'off':  No reasoning — fastest, deterministic.
 * - 'low':  Minimal reasoning.
 * - 'high': Significant reasoning.
 * - 'max':  Maximum reasoning (may be expensive/slow).
 */
export type ReasoningEffort = z.infer<typeof ReasoningEffortSchema>;

/**
 * Validates a text part; empty text is permitted.
 */
export const TextContentPartSchema = z.object({
  kind: z.literal('text'),
  text: z.string(),
});

/**
 * Requires string MIME type and base64 data without format refinements.
 */
export const ImageContentPartSchema = z.object({
  kind: z.literal('image'),
  mimeType: z.string(),
  data: z.string(),
});

/**
 * Discriminates provider-neutral text and image parts by kind.
 */
export const LlmContentPartSchema = z.discriminatedUnion('kind', [
  TextContentPartSchema,
  ImageContentPartSchema,
]);

/**
 * Requires at least one part per message; system roles accept text only.
 */
export const LlmConversationMessageSchema = z.discriminatedUnion('role', [
  z.object({
    role: z.literal('system'),
    parts: z.array(TextContentPartSchema).min(1),
  }),
  z.object({
    role: z.enum(['user', 'assistant']),
    parts: z.array(LlmContentPartSchema).min(1),
  }),
]);

/**
 * Validates a non-empty conversation and optional shared provider settings.
 * Roles and parts retain caller order; string fields have no format refinements.
 */
export const MultiPartPromptPayloadSchema = z.object({
  /**
   * Ordered messages, each containing at least one part.
   */
  messages: z.array(LlmConversationMessageSchema).min(1),
  /**
   * Optional sampling temperature, interpreted by the provider.
   */
  temperature: z.number().optional(),
  /**
   * Optional model override, subject to authoritative routing configuration.
   */
  model: z.string().optional(),
  /**
   * Optional provider-neutral reasoning-effort level.
   */
  reasoningEffort: ReasoningEffortSchema.optional(),
  /**
   * Optional cache hint: forwarded to Mistral, ignored by Gemini once mapped.
   * Derivation is deferred to the V2 prompt layer.
   */
  promptCacheKey: z.string().optional(),
});

/**
 * Schema-derived text part; its text may be empty.
 */
export type TextContentPart = z.infer<typeof TextContentPartSchema>;

/**
 * Schema-derived image part with required MIME type and base64 data strings.
 */
export type ImageContentPart = z.infer<typeof ImageContentPartSchema>;

/**
 * Schema-derived union of supported conversation content parts.
 */
export type LlmContentPart = z.infer<typeof LlmContentPartSchema>;

/**
 * Schema-derived message; system messages contain only text parts.
 */
export type LlmConversationMessage = z.infer<
  typeof LlmConversationMessageSchema
>;

/**
 * Schema-first conversation payload with shared provider options.
 * @remarks Derived via `z.infer`; validated at each `ILlmService.send()` entry
 * point — the routing entry before its image-presence inspection, and the base
 * provider entry before summary and retry. Legacy payloads are not validated.
 * Cache-key derivation belongs to the future V2 prompt layer; provider
 * integration is documented in `docs/modules/llm.md`.
 */
export type MultiPartPromptPayload = z.infer<
  typeof MultiPartPromptPayloadSchema
>;
