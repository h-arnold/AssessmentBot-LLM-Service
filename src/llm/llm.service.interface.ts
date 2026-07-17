import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import { LlmResponse } from './types.js';
import { ResourceExhaustedError } from '../common/errors/index.js';
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
 * Defines the base class for a generic LLM service with built-in retry logic for rate limiting.
 * This class provides exponential backoff retry functionality for 429 (rate limit) errors,
 * while allowing different LLM providers to be used interchangeably by implementing _sendInternal.
 */
@Injectable()
export abstract class LLMService {
  protected readonly logger = new Logger(LLMService.name);

  constructor(protected readonly configService: ConfigService) {}

  /**
   * Sends a payload to the LLM provider to generate an assessment.
   *
   * This method includes automatic retry logic with exponential backoff for
   * 429 rate limit errors. Resource exhausted errors (quota exceeded) are not
   * retried and bubble up immediately.
   * @param {LlmPayload} payload The content to be sent to the LLM. This can be
   *   a simple string or a complex object for multimodal inputs (e.g., text and
   *   images). The payload may include an optional `temperature` parameter
   *   (default: 0).
   * @returns {Promise<LlmResponse>} A Promise that resolves to a validated
   *   LlmResponse object.
   * @throws {ResourceExhaustedError} If the API quota has been exceeded.
   */
  async send(payload: LlmPayload): Promise<LlmResponse> {
    const maxRetries = this.configService.get('LLM_MAX_RETRIES');
    const baseBackoffMs = this.configService.get('LLM_BACKOFF_BASE_MS');
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
        await this.handleSendError(
          error,
          payloadSummary,
          attempt,
          maxRetries,
          baseBackoffMs,
        );
      }
    }

    // This should never be reached due to the logic above, but TypeScript requires it
    throw new Error('Unexpected end of retry loop');
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

  private async handleSendError(
    error: unknown,
    payloadSummary: string,
    attempt: number,
    maxRetries: number,
    baseBackoffMs: number,
  ): Promise<void> {
    if (this.isResourceExhaustedError(error)) {
      this.logger.error(
        `LLM resource exhausted for request (${payloadSummary}).`,
        this.getErrorStack(error),
      );
      throw new ResourceExhaustedError(
        'API quota exhausted. Please try again later or upgrade your plan.',
        'unknown',
        { originalError: this.isErrorObject(error) ? error : undefined },
      );
    }

    const isRateLimitError = this.isRateLimitError(error);
    if (!isRateLimitError || attempt === maxRetries) {
      this.throwTerminalSendError(
        error,
        payloadSummary,
        attempt,
        isRateLimitError,
      );
    }

    await this.waitBeforeRetry(error, attempt, maxRetries, baseBackoffMs);
  }

  private throwTerminalSendError(
    error: unknown,
    payloadSummary: string,
    attempt: number,
    isRateLimitError: boolean,
  ): never {
    this.logger.error(
      `LLM request failed after ${attempt + 1} attempt(s) (${payloadSummary}).`,
      this.getErrorStack(error),
    );

    if (isRateLimitError || error instanceof ZodError) {
      throw error;
    }

    throw new Error(this.buildUnexpectedErrorMessage(error));
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

  private buildUnexpectedErrorMessage(error: unknown): string {
    const messagePrefix =
      'Failed to get a valid and structured response from the LLM.';

    if (this.isErrorObject(error)) {
      return `${messagePrefix}\nOriginal error: ${error.message}\nStack: ${error.stack || 'N/A'}`;
    }

    return `${messagePrefix}\nOriginal error: ${String(error)}\nStack: N/A`;
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
   * Checks if an error is a resource exhausted error (HTTP 429 with specific
   * patterns).
   *
   * Resource exhausted errors indicate API quota limits have been reached and
   * should not be retried.
   * @param {unknown} error The error to check.
   * @returns {boolean} True if the error is a resource exhausted error.
   */
  private isResourceExhaustedError(error: unknown): boolean {
    // Check for gRPC-style string status indicating resource exhaustion
    // (e.g. error.status === 'RESOURCE_EXHAUSTED') regardless of numeric code.
    if (this.matchesStringStatus(error, (s) => s === 'resource_exhausted')) {
      return true;
    }

    // Use the utility function to extract status code from various error formats
    const statusCode = this.extractErrorStatusCode(error);

    // Must be a 429 error to be resource exhausted
    if (statusCode !== 429) {
      return false;
    }

    // Check for resource exhausted patterns in error messages
    if (this.isErrorObject(error)) {
      const message = error.message.toLowerCase();
      const patterns = [
        'resource_exhausted',
        'resource exhausted',
        'quota exceeded',
        'quota exhausted',
        'quota has been exhausted',
      ];
      return patterns.some((pattern) => message.includes(pattern));
    }

    return false;
  }

  /**
   * Checks whether a string status/code property on the error (or its nested
   * `.error` object) satisfies a given predicate. This handles gRPC-style
   * string status codes such as `'RESOURCE_EXHAUSTED'` or `'RATE_LIMIT_EXCEEDED'`.
   * @param error - The error to inspect.
   * @param predicate - A function that receives a lower-case string value
   *   and returns true when it matches the desired status.
   * @returns True if any recognised status field matches the predicate.
   */
  private matchesStringStatus(
    error: unknown,
    predicate: (lower: string) => boolean,
  ): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }

    const error_ = error as Record<string, unknown>;

    const check = (value: unknown): boolean =>
      typeof value === 'string' && predicate(value.toLowerCase());

    if (check(error_.status) || check(error_.code)) {
      return true;
    }

    // Check nested error object (API error response body pattern)
    if (error_.error && typeof error_.error === 'object') {
      const inner = error_.error as Record<string, unknown>;
      if (check(inner.status) || check(inner.code)) {
        return true;
      }
    }

    return false;
  }

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
   * Determines whether an error represents a retryable rate limit condition.
   * Checks for HTTP 429 status codes and message patterns like
   * 'rate limit' or 'too many requests'. Resource exhausted errors (non-retryable)
   * are explicitly excluded.
   * @param error - The error to check.
   * @returns True if the error indicates a retryable rate limit.
   */
  private isRateLimitError(error: unknown): boolean {
    // First check if it's a resource exhausted error - those shouldn't be retried
    if (this.isResourceExhaustedError(error)) {
      return false;
    }

    // Check for gRPC-style string status indicating rate limiting
    // (e.g. error.status === 'RATE_LIMIT_EXCEEDED')
    if (
      this.matchesStringStatus(
        error,
        (s) => s === 'rate_limit_exceeded' || s === '429',
      )
    ) {
      return true;
    }

    // Use the utility function to extract status code from various error formats
    const statusCode = this.extractErrorStatusCode(error);
    if (statusCode === 429) {
      return true;
    }

    // Check for error messages that might indicate retryable rate limiting
    if (this.isErrorObject(error)) {
      const message = error.message.toLowerCase();
      return (
        message.includes('rate limit') || message.includes('too many requests')
      );
    }

    return false;
  }

  /**
   * Utility function to extract HTTP status code from various error formats.
   *
   * This is designed to work with different LLM SDK error structures.
   * Recognises numeric `status`, `statusCode`, `code`, `response.status`,
   * `error.status`, and `error.code`, as well as string values that parse
   * to a number (e.g. `'429'`).
   * @param {unknown} error The error to extract status code from.
   * @returns {number | undefined} The HTTP status code if found, undefined
   *   otherwise.
   */
  private extractErrorStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const error_ = error as Record<string, unknown>;

    // Coerce a value to a number (handles '429' strings too)
    const toNumber = (value: unknown): number | undefined => {
      if (typeof value === 'number' && !Number.isNaN(value)) return value;
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
      }
      return undefined;
    };

    // Check direct properties in priority order
    const directStatus: number | undefined =
      toNumber(error_.status) ??
      toNumber(error_.statusCode) ??
      toNumber(error_.code);
    if (directStatus !== undefined) return directStatus;

    // Check response.status (nested in response object)
    if (
      'response' in error_ &&
      error_.response &&
      typeof error_.response === 'object'
    ) {
      const responseStatus = toNumber(
        (error_.response as Record<string, unknown>).status,
      );
      if (responseStatus !== undefined) return responseStatus;
    }

    // Check nested error object (API error response body pattern,
    // e.g. { error: { code: 429, status: 'RESOURCE_EXHAUSTED' } })
    if ('error' in error_ && error_.error && typeof error_.error === 'object') {
      const inner = error_.error as Record<string, unknown>;
      const innerStatus: number | undefined =
        toNumber(inner.status) ?? toNumber(inner.code);
      if (innerStatus !== undefined) return innerStatus;
    }

    return undefined;
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
