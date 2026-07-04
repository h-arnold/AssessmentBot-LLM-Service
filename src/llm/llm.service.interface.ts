import { randomInt } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import { ResourceExhaustedError } from './resource-exhausted.error';
import { LlmResponse } from './types';
import { ConfigService } from '../config/config.service';

/**
 * Represents the payload for a simple text-based prompt.
 */
export type StringPromptPayload = {
  /** The system instruction or context for the LLM. */
  system: string;
  /** The user-provided prompt or question. */
  user: string;
  /** Optional temperature for sampling (default: 0) */
  temperature?: number;
};

/**
 * Represents the payload for a multimodal prompt including images.
 */
export type ImagePromptPayload = {
  /** The system instruction or context for the LLM. */
  system: string;
  /** Array of images with their metadata. */
  images: Array<{ mimeType: string; data?: string; uri?: string }>;
  /** Optional messages array. */
  messages?: Array<{ content: string }>;
  /** Optional temperature for sampling (default: 0) */
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
   * This method includes automatic retry logic with exponential backoff for 429 rate limit errors.
   * Resource exhausted errors (quota exceeded) are not retried and bubble up immediately.
   *
   * @param payload The content to be sent to the LLM. This can be a simple string
   * or a complex object for multimodal inputs (e.g., text and images).
   * The payload may include an optional `temperature` parameter (default: 0).
   * @returns A Promise that resolves to a validated LlmResponse object.
   * @throws ResourceExhaustedError if the API quota has been exceeded.
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
        { originalError: error },
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
   * Internal method that subclasses must implement to handle the actual LLM API call.
   * This method should not include retry logic, as that is handled by the base class.
   *
   * @param payload The LlmPayload to be sent to the specific LLM provider.
   * @returns A Promise that resolves to a validated LlmResponse object.
   */
  protected abstract _sendInternal(payload: LlmPayload): Promise<LlmResponse>;

  /**
   * Checks if an error is a resource exhausted error (HTTP 429 with specific patterns).
   * Resource exhausted errors indicate API quota limits have been reached and should
   * not be retried.
   * @param error The error to check.
   * @returns True if the error is a resource exhausted error.
   */
  private isResourceExhaustedError(error: unknown): boolean {
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
   * Checks if an error is a rate limit error (HTTP 429) that should be retried.
   * This method excludes resource exhausted errors which should not be retried.
   * @param error The error to check.
   * @returns True if the error is a retryable rate limit error.
   */
  protected isErrorObject(error: unknown): error is Error {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as Record<string, unknown>).message === 'string'
    );
  }

  private isRateLimitError(error: unknown): boolean {
    // First check if it's a resource exhausted error - those shouldn't be retried
    if (this.isResourceExhaustedError(error)) {
      return false;
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
   * This is designed to work with different LLM SDK error structures.
   * @param error The error to extract status code from.
   * @returns The HTTP status code if found, undefined otherwise.
   */
  private extractErrorStatusCode(error: unknown): number | undefined {
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    // Check for status property directly
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }

    // Check for statusCode property (alternative naming)
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      return error.statusCode;
    }

    // Check for response.status (nested in response object)
    if (
      'response' in error &&
      error.response &&
      typeof error.response === 'object' &&
      'status' in error.response &&
      typeof (error.response as Record<string, unknown>).status === 'number'
    ) {
      return (error.response as Record<string, unknown>).status as number;
    }

    return undefined;
  }

  /**
   * Utility method to sleep for a specified duration.
   * @param ms The number of milliseconds to sleep.
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
