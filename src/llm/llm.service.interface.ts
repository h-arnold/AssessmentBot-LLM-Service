import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  MultiPartPromptPayloadSchema,
  type MultiPartPromptPayload,
  type ReasoningEffort,
} from './multi-part-prompt.schema.js';
import { LlmResponse } from './types.js';
import type { LlmError } from '../common/errors/llm-error.base.js';
import { LlmServiceError } from '../common/errors/llm-service.error.js';
import { isErrorObject } from '../common/utils/type-guards.js';
import { ConfigService } from '../config/config.service.js';

export {
  ReasoningEffortSchema,
  type ReasoningEffort,
  TextContentPartSchema,
  ImageContentPartSchema,
  LlmContentPartSchema,
  LlmConversationMessageSchema,
  MultiPartPromptPayloadSchema,
  type TextContentPart,
  type ImageContentPart,
  type LlmContentPart,
  type LlmConversationMessage,
  type MultiPartPromptPayload,
} from './multi-part-prompt.schema.js';

/**
 * A union type representing any possible payload structure for the LLM service.
 */
export type LlmPayload =
  ImagePromptPayload | StringPromptPayload | MultiPartPromptPayload;

/**
 * Shared contract for any service capable of sending prompts to an LLM.
 * Implemented by both the abstract {@link LLMService} provider base class
 * and the {@link RoutingLLMService} dispatcher.
 */
export interface ILlmService {
  send(payload: LlmPayload): Promise<LlmResponse>;
}

/**
String token for injecting the LLM service dispatcher.
 */
export const LLM_SERVICE_TOKEN = 'LLM_SERVICE';

/**
 * Represents the payload for a simple text-based prompt.
 */
export type StringPromptPayload = {
  /**
  The system instruction or context for the LLM.
   */
  system: string;
  /**
  The user-provided prompt or question.
   */
  user: string;
  /**
  Optional temperature for sampling (default: 0).
   */
  temperature?: number;
  /**
  Optional model override; provider falls back to its own default if absent.
   */
  model?: string;
  /**
  Optional reasoning-effort level; provider maps to its native parameter.
   */
  reasoningEffort?: ReasoningEffort;
  /**
  Optional provider-agnostic prompt cache key, derived from the payload as the
  lowercase-hex SHA-256 of the reference task. Forwarded only to providers that
  support prompt caching; providers without support ignore it.
  @remarks Server-derived in the prompt layer and never accepted from clients.
  Changing the single-input derivation rule changes every effective cache key,
  so it is a documented contract revision rather than an implementation detail.
   */
  promptCacheKey?: string;
};

/**
 * Represents the payload for a multimodal prompt including images.
 */
export type ImagePromptPayload = {
  /**
  The system instruction or context for the LLM.
   */
  system: string;
  /**
  Array of images with their metadata.
   */
  images: Array<{ mimeType: string; data?: string }>;
  /**
  Optional temperature for sampling (default: 0).
   */
  temperature?: number;
  /**
  Optional model override; provider falls back to its own default if absent.
   */
  model?: string;
  /**
  Optional reasoning-effort level; provider maps to its native parameter.
   */
  reasoningEffort?: ReasoningEffort;
  /**
  Optional provider-agnostic prompt cache key, derived from the payload as the
  lowercase-hex SHA-256 of the reference task. Forwarded only to providers that
  support prompt caching; providers without support ignore it. For image
  payloads the reference task is the data-URI form held by the prompt.
  @remarks Server-derived in the prompt layer and never accepted from clients.
  Changing the single-input derivation rule changes every effective cache key,
  so it is a documented contract revision rather than an implementation detail.
   */
  promptCacheKey?: string;
};

/**
 * Defines the base class for a generic LLM service with built-in retry logic
 * for retryable errors. This class provides exponential backoff retry
 * functionality for errors that carry `retryable === true`, while allowing
 * different LLM providers to be used interchangeably by implementing
 * `_sendInternal` and `mapError`.
 */
@Injectable()
export abstract class LLMService implements ILlmService {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly configService: ConfigService) {}

  /**
   * Human-readable provider identifier used for logging and embedded in every
   * `LlmError` instance created by this service.
   *
   * Example values: `'gemini'`, `'openai'`, `'anthropic'`.
   */
  protected abstract readonly providerName: string;

  /**
   * Maps an error caught from `_sendInternal` (other than `ZodError`) to the
   * appropriate `LlmError` subclass, or returns `undefined` if no known
   * pattern matches.
   *
   * If the method throws, the base class catches the mapping error (for
   * logging) and wraps the **original** `_sendInternal` error in a
   * `LlmServiceError`.
   * @param error - The raw error caught from `_sendInternal`.
   * @returns An `LlmError` instance, or `undefined` if the error is
   *   unclassifiable.
   */
  protected abstract mapError(error: unknown): LlmError | undefined;

  /**
   * Sends a payload to the LLM provider to generate an assessment.
   *
   * This method includes automatic retry logic with exponential backoff for
   * errors where the mapped `LlmError` instance has `retryable === true`.
   * Non-retryable errors are thrown immediately without retry.
   * `ZodError` bypasses `mapError()` and is re-thrown directly.
   * Multi-part payloads are parsed once before summary and retry; legacy
   * image/text discriminators take precedence and remain unvalidated.
   *
   * ### Error flow:
   * - `ZodError` is re-thrown without calling `mapError()` and without retry.
   * - For all other errors, the error is classified exactly once via
   *   `classifyError()` and the resulting `LlmError` is reused across retry
   *   iterations. If it has `retryable === true`, the method retries with
   *   exponential backoff up to `LLM_MAX_RETRIES` attempts; non-retryable
   *   errors are thrown immediately.
   * - If classification returns `undefined` or throws, the base class wraps the
   *   **original** `_sendInternal` error in an `LlmServiceError` (retryable=false,
   *   HTTP 500) and throws it without retrying.
   * - The `originalError` property on the resulting `LlmError` stores only `Error`
   *   instances (per product decision #12). Non-`Error` originals produce
   *   `originalError: undefined` with the message `"LLM service error: Unknown error"`.
   * @param payload The content to be sent to the LLM.
   * @returns A Promise that resolves to a validated
   *   LlmResponse object.
   * @throws {LlmError} Various `LlmError` subclasses depending on the error
   *   condition.
   * @throws {ZodError} If payload validation fails.
   */
  async send(payload: LlmPayload): Promise<LlmResponse> {
    if (
      !this.isImagePromptPayload(payload) &&
      !this.isStringPromptPayload(payload) &&
      this.isMultiPartPromptPayload(payload)
    ) {
      MultiPartPromptPayloadSchema.parse(payload);
    }
    const maxRetries = Number(this.configService.get('LLM_MAX_RETRIES'));
    const baseBackoffMs = Number(this.configService.get('LLM_BACKOFF_BASE_MS'));
    const payloadSummary = this.describePayload(payload);

    let classifiedError: LlmError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.sendAttempt(
          payload,
          payloadSummary,
          attempt,
          maxRetries,
        );
      } catch (error) {
        if (error instanceof ZodError) {
          // Validation failure — not an LLM provider error. Re-throw directly,
          // no mapError() call, no retry.
          throw error;
        }

        // Classify the error only once and reuse the result across retry
        // iterations. This assumes the error raised by `_sendInternal` is
        // idempotent across attempts (the same underlying failure recurs), so
        // re-classifying on every retry would be redundant. If a later
        // attempt raised a genuinely different error this caching would
        // preserve the first classification — acceptable here because retries
        // target the same transient failure.
        if (classifiedError === undefined) {
          classifiedError = this.classifyError(error);
        }

        if (attempt === maxRetries || !classifiedError.retryable) {
          throw classifiedError;
        }

        await this.waitBeforeRetry(
          classifiedError,
          attempt,
          maxRetries,
          baseBackoffMs,
        );
      }
    }

    throw new Error('Unexpected end of retry loop');
  }

  /**
   * Wraps an unclassified error (when `mapError()` returned `undefined` or
   * threw) in a generic `LlmServiceError` with `retryable = false`.
   * @param error - The original `_sendInternal` error.
   * @returns A new `LlmServiceError` instance.
   */
  private wrapUnclassified(error: unknown): LlmServiceError {
    const message = isErrorObject(error)
      ? `LLM service error: ${error.message}`
      : 'LLM service error: Unknown error';
    const originalError = isErrorObject(error) ? error : undefined;
    return new LlmServiceError(message, this.providerName, {
      originalError,
      cause: originalError,
    });
  }

  /**
   * Classifies a raw error from {@link _sendInternal} into an {@link LlmError}
   * by delegating to {@link mapError}, falling back to {@link wrapUnclassified}
   * when mapping returns `undefined` or throws.
   *
   * This is called at most once per `send()` invocation; subsequent retries
   * reuse the cached result via a variable local to `send()`.
   * @param error - The raw error caught from `_sendInternal`.
   * @returns An `LlmError` instance.
   */
  private classifyError(error: unknown): LlmError {
    let llmError: LlmError | undefined;
    try {
      llmError = this.mapError(error);
    } catch (mappingError) {
      this.logger.error(
        `mapError() failed for provider ${this.providerName}`,
        isErrorObject(mappingError) ? mappingError.stack : undefined,
      );
      llmError = undefined;
    }

    return llmError === undefined ? this.wrapUnclassified(error) : llmError;
  }

  private async sendAttempt(
    payload: LlmPayload,
    payloadSummary: string,
    attempt: number,
    maxRetries: number,
  ): Promise<LlmResponse> {
    this.logger.log(
      `Dispatching LLM request (${payloadSummary}). Attempt ${attempt + 1} of ${maxRetries + 1}.`,
    );
    const startTime = Date.now();
    const response = await this._sendInternal(payload);
    const elapsedMs = Date.now() - startTime;
    this.logger.log(
      `LLM response received in ${elapsedMs}ms (${payloadSummary}).`,
    );
    return response;
  }

  private async waitBeforeRetry(
    error: unknown,
    attempt: number,
    maxRetries: number,
    baseBackoffMs: number,
  ): Promise<void> {
    const delay = baseBackoffMs * Math.pow(2, attempt) + randomInt(0, 100);

    this.logger.warn(
      `Retryable error (${error instanceof Error ? error.constructor.name : 'UnknownError'}) ` +
        `on attempt ${attempt + 1}/${maxRetries + 1}. ` +
        `Retrying in ${delay}ms.`,
    );

    await this.sleep(delay);
  }

  /**
   * Internal method that subclasses must implement to handle the actual LLM
   * API call.
   *
   * This method should not include retry logic, as that is handled by the base
   * class.
   * @param payload The LlmPayload to be sent to the specific LLM
   *   provider.
   * @returns A Promise that resolves to a validated
   *   LlmResponse object.
   */
  protected abstract _sendInternal(payload: LlmPayload): Promise<LlmResponse>;

  /**
   * Utility method to sleep for a specified duration.
   * @param {number} ms - The number of milliseconds to sleep.
   * @returns {Promise<void>} A promise that resolves after the specified delay.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Type guard that checks whether a payload is an {@link ImagePromptPayload}.
   * @param payload - The payload to check.
   * @returns `true` if the payload contains images.
   */
  protected isImagePromptPayload(
    payload: LlmPayload,
  ): payload is ImagePromptPayload {
    return 'images' in payload;
  }

  /**
   * Type guard that checks whether a payload is a {@link StringPromptPayload}.
   * @param payload - The payload to check.
   * @returns `true` if the payload contains a `user` string.
   */
  protected isStringPromptPayload(
    payload: LlmPayload,
  ): payload is StringPromptPayload {
    return 'user' in payload;
  }

  /**
   * Presence-only guard for the multi-part discriminator, not validation.
   * Apply after the legacy image and text guards when selecting a variant.
   * @param payload - The payload to check.
   * @returns `true` if a `messages` property exists, regardless of its value.
   */
  protected isMultiPartPromptPayload(
    payload: LlmPayload,
  ): payload is MultiPartPromptPayload {
    return 'messages' in payload;
  }

  /**
   * Derives a non-throwing payload-type label for logging and diagnostics.
   * Uses image → text → conversation precedence without dispatching handlers.
   * @param payload - The payload to classify.
   * @returns `'image'`, `'text'`, `'conversation'`, or `'unknown'`.
   */
  protected payloadTypeName(
    payload: unknown,
  ): 'image' | 'text' | 'conversation' | 'unknown' {
    if (typeof payload !== 'object' || payload === null) {
      return 'unknown';
    }
    if ('images' in payload) {
      return 'image';
    }
    if ('user' in payload) {
      return 'text';
    }
    if ('messages' in payload) {
      return 'conversation';
    }
    return 'unknown';
  }

  /**
   * Template-method dispatcher that routes an {@link LlmPayload} to the
   * appropriate handler based on whether it is an image, text, or
   * conversation payload.
   *
   * Throws `'Unsupported payload type'` when the payload matches none
   * of the known types (that is, when it is malformed).
   * @param payload - The payload to dispatch.
   * @param handlers - An object with `image`, `text`, and optional
   *   `conversation` handler functions.
   * @param handlers.image - Handler invoked for {@link ImagePromptPayload}
   *   payloads. Receives the narrowed image payload.
   * @param handlers.text - Handler invoked for {@link StringPromptPayload}
   *   payloads. Receives the narrowed text payload.
   * @param handlers.conversation - Optional handler invoked for
   *   {@link MultiPartPromptPayload} payloads. Receives the narrowed
   *   conversation payload. When absent, the multi-part variant falls
   *   through to the existing final throw.
   * @returns The result of the matched handler.
   */
  protected mapPayload<T>(
    payload: LlmPayload,
    handlers: {
      image: (payload: ImagePromptPayload) => T;
      text: (payload: StringPromptPayload) => T;
      conversation?: (payload: MultiPartPromptPayload) => T;
    },
  ): T {
    if (this.isImagePromptPayload(payload)) {
      return handlers.image(payload);
    }
    if (this.isStringPromptPayload(payload)) {
      return handlers.text(payload);
    }
    if (this.isMultiPartPromptPayload(payload) && handlers.conversation) {
      return handlers.conversation(payload);
    }
    throw new Error('Unsupported payload type');
  }

  private describePayload(payload: LlmPayload): string {
    if (this.isImagePromptPayload(payload)) {
      const imageCount = payload.images.length;
      return `image prompt with ${imageCount} image${imageCount === 1 ? '' : 's'}`;
    }
    if (this.isStringPromptPayload(payload)) {
      const userLength = payload.user.length;
      return `text prompt with ${userLength} character${userLength === 1 ? '' : 's'}`;
    }
    if (this.isMultiPartPromptPayload(payload)) {
      const messageCount = payload.messages.length;
      return `conversation prompt with ${messageCount} message${messageCount === 1 ? '' : 's'}`;
    }
    throw new Error('Unsupported payload type');
  }
}
