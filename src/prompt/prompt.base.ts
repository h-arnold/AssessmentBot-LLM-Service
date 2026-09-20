import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import Mustache from 'mustache';
import { z } from 'zod';

import { readMarkdown } from '../common/file-utilities.js';
import { ConfigService } from '../config/config.service.js';
import {
  LlmPayload,
  MultiPartPromptPayload,
  MultiPartPromptPayloadSchema,
} from '../llm/llm.service.interface.js';

/**
 * Zod schema for validating basic inputs required for any prompt.
 *
 * This schema ensures that all prompt types receive the essential
 * data needed for assessment: a reference task, student task, and
 * empty task template.
 */
export const PromptInputSchema = z.object({
  /**
  The reference or model solution for the task.
   */
  referenceTask: z.string(),
  /**
  The student's submitted response to the task.
   */
  studentTask: z.string(),
  /**
  The original task prompt or template given to the student.
   */
  emptyTask: z.string(),
});

/**
 * Type representing validated prompt input data.
 */
export type PromptInput = z.infer<typeof PromptInputSchema>;

/**
 * Validates input and constructs a multi-part prompt payload.
 * @param input - The raw conversation payload to validate.
 * @returns The parsed multi-part prompt payload.
 * @throws {ZodError} If the input fails schema validation.
 */
export function buildMultiPartPromptPayload(
  input: unknown,
): MultiPartPromptPayload {
  return MultiPartPromptPayloadSchema.parse(input);
}

/**
 * Derives the provider-agnostic prompt cache key for a reference task.
 *
 * The key is the lowercase hexadecimal SHA-256 digest of the raw
 * `referenceTask` string, giving a fixed-length 64-character routing hint that
 * avoids leaking reference content into provider metadata. The same string
 * always produces the same key, whether the reference is plain text or an
 * image data URI.
 * @param {string} referenceTask - The raw reference task content to hash.
 * @returns {string} The 64-character lowercase hexadecimal SHA-256 digest.
 * @remarks
 * The single-input `sha256(referenceTask)` rule is a documented contract (see
 * `SPEC.md`): no separator, prefix, or task-type input is added. Mistral prefix
 * caching is prefix-content-based, so this key is a best-effort routing hint
 * that groups requests sharing the same reference prefix. Sharing keys across
 * task types is therefore intentional — the task type is deliberately excluded
 * because differing task types have differing reference content anyway.
 */
export function buildPromptCacheKey(referenceTask: string): string {
  return createHash('sha256').update(referenceTask).digest('hex');
}

/**
 * Abstract base class for all prompt implementations.
 *
 * This class provides common functionality for prompt generation including:
 * - Input validation using Zod schemas
 * - Template loading and rendering with Mustache
 * - Common properties and lifecycle management.
 *
 * Subclasses must implement the `buildMessage` method to create
 * task-specific LLM payloads appropriate for their assessment type.
 * @abstract
 */
export abstract class Prompt {
  protected referenceTask!: string;
  protected studentTask!: string;
  protected emptyTask!: string;
  protected readonly logger: Logger;
  private readonly logLlmContent: boolean;
  protected userTemplateName?: string;
  protected systemPromptFile?: string;
  protected systemPrompt?: string;

  /**
   * Initialises the Prompt instance with validated input data.
   *
   * This constructor validates the provided inputs against the schema,
   * stores the validated data as instance properties, and configures
   * the prompt with template and system prompt information.
   * @param {unknown} inputs - Raw input data to be validated against
   *   PromptInputSchema.
   * @param {Logger} logger - Logger instance for recording prompt operations.
   * @param {string} [userTemplateName] - Optional name of the markdown
   *   template for user message parts.
   * @param {string} [systemPrompt] - Optional system prompt string for LLM
   *   context.
   * @param {ConfigService} [configService] - Runtime configuration used to
   *   gate raw prompt-content logging.
   * @throws {Error} If input validation fails.
   */
  constructor(
    inputs: unknown,
    logger: Logger,
    userTemplateName?: string,
    systemPrompt?: string,
    configService?: ConfigService,
  ) {
    this.logger = logger;
    this.logLlmContent = configService?.get('LOG_LLM_CONTENT') ?? false;
    if (this.logLlmContent) {
      this.logger.verbose({ inputs }, 'Prompt constructor received inputs');
    }
    const parsed: PromptInput = PromptInputSchema.parse(inputs);
    this.referenceTask = parsed.referenceTask;
    this.studentTask = parsed.studentTask;
    this.emptyTask = parsed.emptyTask;
    this.userTemplateName = userTemplateName;
    this.systemPrompt = systemPrompt;

    this.logInputLengths(parsed);
  }

  /**
   * Logs the length of each input element at info level.
   * @param {PromptInput} inputs The validated PromptInput object.
   */
  private logInputLengths(inputs: PromptInput): void {
    const lengths = [
      `referenceTask: ${inputs.referenceTask.length}`,
      `studentTask: ${inputs.studentTask.length}`,
      `emptyTask: ${inputs.emptyTask.length}`,
    ].join(', ');
    this.logger.log(`Prompt input lengths - ${lengths}`);
  }

  /**
   * Renders a template string using mustache with the provided data.
   * @param {string} template The template string to render.
   * @param {Record<string, string>} data A record of key-value pairs to
   *   substitute in the template.
   * @returns {string} The rendered string.
   */
  protected render(template: string, data: Record<string, string>): string {
    this.logger.debug(
      `Rendering template. Data keys: ${Object.keys(data).join(', ')}`,
    );
    this.logger.debug(
      `Render called. this.constructor: ${this.constructor.name}`,
    );
    this.logger.debug(
      `Render called. this keys: ${Object.keys(this).join(', ')}`,
    );
    const renderedContent = Mustache.render(template, data);
    if (this.logLlmContent) {
      this.logger.debug(`Template rendered. Output:\n${renderedContent}`);
    }
    return renderedContent;
  }

  /**
   * Builds the final payload to be sent to the LLM service.
   *
   * This is the default implementation for text and table prompts.
   * Subclasses can override if needed (e.g., ImagePrompt).
   * @returns {Promise<LlmPayload>} A Promise that resolves to the LlmPayload.
   */
  public async buildMessage(): Promise<LlmPayload> {
    this.logger.debug(`Building message for ${this.constructor.name}`);
    let userMessage = '';
    if (this.userTemplateName) {
      const userTemplate = await readMarkdown(this.userTemplateName);
      userMessage = this.render(userTemplate, {
        referenceTask: this.referenceTask,
        studentTask: this.studentTask,
        emptyTask: this.emptyTask,
      });
      this.logger.debug(`Rendered user message length: ${userMessage.length}`);
    }
    return {
      system: this.systemPrompt ?? '',
      user: userMessage,
      promptCacheKey: buildPromptCacheKey(this.referenceTask),
    };
  }
}
