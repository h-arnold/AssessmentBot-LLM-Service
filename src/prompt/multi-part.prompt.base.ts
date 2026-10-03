import {
  buildMultiPartPromptPayload,
  buildPromptCacheKey,
  Prompt,
} from './prompt.base.js';
import {
  type LlmContentPart,
  type LlmConversationMessage,
  type MultiPartPromptPayload,
} from '../llm/llm.service.interface.js';

/**
 * Abstract base class for multi-part assessment prompts.
 *
 * Extends {@link Prompt}, inheriting its input validation and its
 * optional system prompt and runtime configuration conventions so
 * existing factory and service typing remains valid. Subclasses
 * supply ordered user content through the {@link buildUserParts}
 * hook; the base owns conversation assembly, server-side cache-key
 * derivation and the single payload-validation boundary.
 *
 * The class is stateless across builds: every `buildMessage()` call
 * derives parts afresh from the validated instance inputs and
 * retains no conversation history or accumulated turns.
 * @abstract
 */
export abstract class MultiPartPrompt extends Prompt {
  /**
   * Builds the ordered user message parts for the assessment.
   *
   * Implementations supply task-specific content (for example the
   * reference/template/student label and image pairs) in the exact
   * order it must reach the provider. The base never parses images
   * or invents task-specific content; empty or invalid parts fail
   * the multipart schema at build time.
   * @returns {Promise<LlmContentPart[]>} The ordered user content
   *   parts.
   */
  protected abstract buildUserParts(): Promise<LlmContentPart[]>;

  /**
   * Builds the final multi-part payload to be sent to the LLM
   * service.
   *
   * Assembles an optional leading system message: supplied system
   * content is included verbatim as a single text part, including
   * an explicitly empty string, and the message is omitted when no
   * system prompt is defined. Exactly one user message follows,
   * built from the hook. The cache key is derived server-side from
   * the reference task, and the assembled conversation is validated
   * exactly once through {@link buildMultiPartPromptPayload}, the
   * sole production multipart-validation boundary. No history,
   * legacy payload fields or provider options are added. Hook
   * failures propagate unchanged, with no fallback payload.
   * @returns {Promise<MultiPartPromptPayload>} A Promise that
   *   resolves to the branded multi-part payload.
   * @throws {ZodError} If the assembled conversation fails
   *   multipart schema validation.
   */
  public async buildMessage(): Promise<MultiPartPromptPayload> {
    this.logger.debug(`Building message for ${this.constructor.name}`);

    const messages: LlmConversationMessage[] = [];
    if (this.systemPrompt !== undefined) {
      messages.push({
        role: 'system',
        parts: [{ kind: 'text', text: this.systemPrompt }],
      });
    }

    const userParts = await this.buildUserParts();
    messages.push({ role: 'user', parts: userParts });

    const messageCount = messages.length;
    const partCount = userParts.length;
    this.logger.debug(
      `Assembled multi-part prompt with ${messageCount} message${messageCount === 1 ? '' : 's'} and ${partCount} user part${partCount === 1 ? '' : 's'}.`,
    );

    return buildMultiPartPromptPayload({
      messages,
      promptCacheKey: buildPromptCacheKey(this.referenceTask),
    });
  }
}
