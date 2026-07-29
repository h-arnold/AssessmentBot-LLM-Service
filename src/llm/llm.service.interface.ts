import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import { LlmResponse } from './types.js';
import { LlmError, LlmServiceError } from '../common/errors/index.js';
import { isErrorObject } from '../common/utils/type-guards.js';
import { ConfigService } from '../config/config.service.js';

/**
 * Abstract reasoning-effort level. Each provider maps these to its native parameter.
 * - 'off':  No reasoning — fastest, deterministic.
 * - 'low':  Minimal reasoning.
 * - 'high': Significant reasoning.
 * - 'max':  Maximum reasoning (may be expensive/slow).
 */
export type ReasoningEffort = 'off' | 'low' | 'high' | 'max';

/**
 * Shared contract for any service capable of sending prompts to an LLM.
 * Implemented by both the abstract {@link LLMService} provider base class
 * and the {@link RoutingLLMService} dispatcher.
 */
export interface ILlmService {
  send(payload: LlmPayload): Promise<LlmResponse>;
}

/** String token for injecting the LLM service dispatcher. */
export const LLM_SERVICE_TOKEN = 'LLM_SERVICE';

/**
 * Represents the payload for a simple text-based prompt.
 */
export type StringPromptPayload = {
  /** The system instruction or context for the LLM. */
  system: string;
  /** The user-provided prompt or question. */
  user: string;
  /** Optional temperature for sampling (default: 0). */
  temperature?: number;
  /** Optional model override; provider falls back to its own default if absent. */
  model?: string;
  /** Optional reasoning-effort level; provider maps to its native parameter. */
  reasoningEffort?: ReasoningEffort;
};

/**
 * Represents the payload for a multimodal prompt including images.
 */
export type ImagePromptPayload = {
  /** The system instruction or context for the LLM. */
  system: string;
  /** Array of images with their metadata. */
  images: Array<{ mimeType: string; data?: string }>;
  /** Optional temperature for sampling (default: 0). */
  temperature?: number;
  /** Optional model override; provider falls back to its own default if absent. */
  model?: string;
  /** Optional reasoning-effort level; provider maps to its native parameter. */
  reasoningEffort?: ReasoningEffort;
};

/**
 * A union type representing any possible payload structure for the LLM service.
 */
export type LlmPayload = ImagePromptPayload | StringPromptPayload;

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

        if (!classifiedError.retryable || attempt === maxRetries) {
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
   * Template-method dispatcher that routes an {@link LlmPayload} to the
   * appropriate handler based on whether it is an image or a text payload.
   *
   * Throws `'Unsupported payload type'` when the payload matches neither type
   * (that is, when it is malformed).
   * @param payload - The payload to dispatch.
   * @param handlers - An object with `image` and `text` handler functions.
   * @param handlers.image - Handler invoked for {@link ImagePromptPayload}
   *   payloads. Receives the narrowed image payload.
   * @param handlers.text - Handler invoked for {@link StringPromptPayload}
   *   payloads. Receives the narrowed text payload.
   * @returns The result of the matched handler.
   */
  protected mapPayload<T>(
    payload: LlmPayload,
    handlers: {
      image: (payload: ImagePromptPayload) => T;
      text: (payload: StringPromptPayload) => T;
    },
  ): T {
    if (this.isImagePromptPayload(payload)) {
      return handlers.image(payload);
    }
    if (this.isStringPromptPayload(payload)) {
      return handlers.text(payload);
    }
    throw new Error('Unsupported payload type');
  }

  private describePayload(payload: LlmPayload): string {
    if ('images' in payload) {
      const imageCount = payload.images.length;
      return `image prompt with ${imageCount} image${imageCount === 1 ? '' : 's'}`;
    }
    const userLength = payload.user.length;
    return `text prompt with ${userLength} character${userLength === 1 ? '' : 's'}`;
  }
}
