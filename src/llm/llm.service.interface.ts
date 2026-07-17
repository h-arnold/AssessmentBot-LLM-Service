import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import { LlmResponse } from './types.js';
import { LlmError, LlmServiceError } from '../common/errors/index.js';
import { ConfigService } from '../config/config.service.js';

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
export abstract class LLMService {
  protected readonly logger = new Logger(LLMService.name);

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
   * - For all other errors, `mapError()` is called. If it returns an `LlmError`
   *   with `retryable === true`, the method retries with exponential backoff up
   *   to `LLM_MAX_RETRIES` attempts; non-retryable errors are thrown immediately.
   * - If `mapError()` returns `undefined` or throws, the base class wraps the
   *   **original** `_sendInternal` error in an `LlmServiceError` (retryable=false,
   *   HTTP 500) and throws it without retrying.
   * - The `originalError` property on the resulting `LlmError` stores only `Error`
   *   instances (per product decision #12). Non-`Error` originals produce
   *   `originalError: undefined` with the message `"LLM service error: Unknown error"`.
   * @param {LlmPayload} payload The content to be sent to the LLM.
   * @returns {Promise<LlmResponse>} A Promise that resolves to a validated
   *   LlmResponse object.
   * @throws {LlmError} Various `LlmError` subclasses depending on the error
   *   condition.
   * @throws {ZodError} If payload validation fails.
   */
  async send(payload: LlmPayload): Promise<LlmResponse> {
    const maxRetries = Number(this.configService.get('LLM_MAX_RETRIES'));
    const baseBackoffMs = Number(this.configService.get('LLM_BACKOFF_BASE_MS'));
    const payloadSummary = this.describePayload(payload);

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

        await this.handleAttemptError(
          error,
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
    const message = this.isErrorObject(error)
      ? `LLM service error: ${error.message}`
      : 'LLM service error: Unknown error';
    const originalError = this.isErrorObject(error) ? error : undefined;
    return new LlmServiceError(message, this.providerName, { originalError });
  }

  /**
   * Handles a non-ZodError caught from {@link sendAttempt}. Delegates to
   * {@link mapError} and either throws the mapped error or, for retryable
   * errors with remaining retries, waits before the next attempt.
   * @param error - The error caught from `sendAttempt`.
   * @param attempt - The current attempt number (0-indexed).
   * @param maxRetries - The maximum number of retries.
   * @param baseBackoffMs - The base backoff delay in milliseconds.
   */
  private async handleAttemptError(
    error: unknown,
    attempt: number,
    maxRetries: number,
    baseBackoffMs: number,
  ): Promise<void> {
    let llmError: LlmError | undefined;
    try {
      llmError = this.mapError(error);
    } catch (mappingError) {
      this.logger.error(
        `mapError() failed for provider ${this.providerName}`,
        this.isErrorObject(mappingError) ? mappingError.stack : undefined,
      );
      llmError = undefined;
    }

    const errorToThrow: LlmError =
      llmError === undefined ? this.wrapUnclassified(error) : llmError;

    if (!errorToThrow.retryable || attempt === maxRetries) {
      throw errorToThrow;
    }

    await this.waitBeforeRetry(
      errorToThrow,
      attempt,
      maxRetries,
      baseBackoffMs,
    );
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
      `Rate limit encountered on attempt ${attempt + 1}/${maxRetries + 1}. ` +
        `Retrying in ${delay}ms. Error: ${this.isErrorObject(error) ? error.message : 'Unknown error'}`,
    );

    await this.sleep(delay);
  }

  private getErrorStack(error: unknown): string | undefined {
    return this.isErrorObject(error) ? error.stack : undefined;
  }

  /**
   * Internal method that subclasses must implement to handle the actual LLM
   * API call.
   *
   * This method should not include retry logic, as that is handled by the base
   * class.
   * @param {LlmPayload} payload The LlmPayload to be sent to the specific LLM
   *   provider.
   * @returns {Promise<LlmResponse>} A Promise that resolves to a validated
   *   LlmResponse object.
   */
  protected abstract _sendInternal(payload: LlmPayload): Promise<LlmResponse>;

  /**
   * Checks if a value is an Error object.
   * @param {unknown} error The value to check.
   * @returns {error is Error} True if the value is an Error object.
   */
  protected isErrorObject(error: unknown): error is Error {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as Record<string, unknown>).message === 'string'
    );
  }

  /**
   * Utility method to sleep for a specified duration.
   * @param {number} ms - The number of milliseconds to sleep.
   * @returns {Promise<void>} A promise that resolves after the specified delay.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
