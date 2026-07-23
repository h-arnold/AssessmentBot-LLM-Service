import { Mistral } from '@mistralai/mistralai';
import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  classifyLlmError,
  normaliseStatusCode,
  type LlmErrorMapperProbes,
} from './llm-error-mapper.js';
import {
  ImagePromptPayload,
  LLMService,
  LlmPayload,
  ReasoningEffort,
  StringPromptPayload,
} from './llm.service.interface.js';
import { LlmResponse, LlmResponseSchema } from './types.js';
import { LlmError } from '../common/errors/index.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { ConfigService } from '../config/config.service.js';

// ---------------------------------------------------------------------------
// SDK type helpers (accessed via the Mistral class's property types so we
// do not rely on internal SDK subpath imports).
// ---------------------------------------------------------------------------

/** The request shape accepted by `Mistral.chat.complete()`. */
type MistralCompleteRequest = Parameters<Mistral['chat']['complete']>[0];

/** The response shape returned by `Mistral.chat.complete()`. */
type MistralCompleteResponse = Awaited<ReturnType<Mistral['chat']['complete']>>;

// ---------------------------------------------------------------------------
// Module-level helpers for the Mistral probe configuration
// ---------------------------------------------------------------------------

/**
 * Per-provider probe configuration for Mistral, supplied to the shared
 * {@link classifyLlmError} cascade.
 *
 * - `extractStatusCode` probes `MistralError.statusCode` first (numeric),
 *   then falls back to `status`, `code`, and `response.status` for parity
 *   with non-`MistralError` inputs.
 * - `hasStringStatus` returns `false` — Mistral errors do not use string
 *   status conventions.
 * - `isHttpClientError` matches transport-layer subclass names:
 *   `ConnectionError`, `RequestTimeoutError`, `RequestAbortedError`,
 *   `UnexpectedClientError`. It deliberately **excludes**
 *   `InvalidRequestError` to avoid a name collision with our own
 *   `InvalidRequestError` {@link LlmError} subclass — see the SPEC
 *   "InvalidRequestError name-collision" subsection for details.
 */
const MISTRAL_PROBES: LlmErrorMapperProbes = {
  providerName: 'mistral',

  extractStatusCode: (error: unknown): number | undefined => {
    if (typeof error !== 'object' || error === null) return undefined;
    const error_ = error as Record<string, unknown>;

    // Primary: MistralError.statusCode (numeric on the SDK error class)
    const statusCode = normaliseStatusCode(error_.statusCode);
    if (statusCode !== undefined) return statusCode;

    // Fallback: status, code, response.status
    const status = normaliseStatusCode(error_.status);
    if (status !== undefined) return status;
    const code = normaliseStatusCode(error_.code);
    if (code !== undefined) return code;
    if (typeof error_.response === 'object' && error_.response !== null) {
      const response = error_.response as Record<string, unknown>;
      const responseStatus = normaliseStatusCode(response.status);
      if (responseStatus !== undefined) return responseStatus;
    }

    return undefined;
  },

  hasStringStatus: (): boolean => false,

  networkPattern:
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network/i,

  isHttpClientError: (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) return false;
    const name = (error as Record<string, unknown>).name;
    // Deliberately excluding 'InvalidRequestError' to avoid name collision
    // with our LlmError subclass (see SPEC § "InvalidRequestError
    // name-collision").
    return (
      typeof name === 'string' &&
      [
        'ConnectionError',
        'RequestTimeoutError',
        'RequestAbortedError',
        'UnexpectedClientError',
      ].includes(name)
    );
  },
};

// ---------------------------------------------------------------------------
// MistralService
// ---------------------------------------------------------------------------

/**
 * Service that interacts with the Mistral LLM via the `@mistralai/mistralai` package.
 * Extends {@link LLMService} and handles the specifics of sending requests and
 * validating responses from the Mistral API.
 *
 * ### Reasoning-effort mapping (abstract level → Mistral native):
 * `mistral-small-latest` only accepts the `none` and `high` reasoning-effort
 * values, so the abstract levels are collapsed accordingly:
 * - `'off'` → `'none'` (reasoning disabled)
 * - `'low'` → `'none'`
 * - `'high'` → `'high'`
 * - `'max'` → `'high'`.
 */
@Injectable()
export class MistralService extends LLMService {
  private readonly client: Mistral;
  private readonly mistralLogger = new Logger(MistralService.name);

  protected readonly providerName = 'mistral';

  constructor(
    configService: ConfigService,
    private readonly jsonParserUtility: JsonParserUtility,
  ) {
    super(configService);
    const apiKey = this.configService.get('MISTRAL_API_KEY');
    if (!apiKey) {
      throw new Error('MISTRAL_API_KEY is not set in environment');
    }
    this.client = new Mistral({ apiKey });
  }

  /**
   * Sends a payload to the Mistral API and returns a validated LLM response.
   *
   * Builds the request object (model, messages, temperature, reasoning effort,
   * safePrompt, responseFormat), calls the Mistral SDK, extracts the response
   * text, repairs/parses JSON via {@link JsonParserUtility}, and validates
   * with {@link LlmResponseSchema}.
   * @param payload - The payload to send (text or image).
   * @returns A validated {@link LlmResponse}.
   */
  protected async _sendInternal(payload: LlmPayload): Promise<LlmResponse> {
    const model = payload.model ?? 'mistral-small-latest';
    const messages = this.buildMessages(payload);
    const request = this.buildRequest(model, messages, payload);

    this.mistralLogger.debug(
      `Sending to Mistral with model: ${model}, temperature: ${
        payload.temperature ?? 0
      }`,
    );

    // First try: hand the request to the Mistral SDK.
    let result: MistralCompleteResponse;
    try {
      result = await this.client.chat.complete(
        request as unknown as MistralCompleteRequest,
      );
    } catch (error) {
      this.logProviderError(error, model, payload);
      throw error;
    }

    // Processing after the SDK call.
    const responseText = this.extractResponseText(result);
    this.mistralLogger.debug({ responseText }, 'Raw response from Mistral');

    const parsedJson: unknown = this.jsonParserUtility.parse(responseText);
    this.mistralLogger.debug({ parsedJson }, 'Parsed JSON response');

    const dataToValidate: unknown = Array.isArray(parsedJson)
      ? (parsedJson as unknown[])[0]
      : parsedJson;

    // Second try: validate the parsed payload.
    try {
      return LlmResponseSchema.parse(dataToValidate);
    } catch (error) {
      this.logger.debug(
        `Zod validation failed: ${JSON.stringify((error as ZodError).issues)}`,
      );
      throw error;
    }
  }

  /**
   * Logs provider-level error details to the base-class logger.
   * @param error - The error thrown by the Mistral SDK.
   * @param model - The model name used in the request.
   * @param payload - The original payload for context.
   */
  private logProviderError(
    error: unknown,
    model: string,
    payload: LlmPayload,
  ): void {
    const error_ = error as { statusCode?: number; status?: number };
    const statusCode = error_.statusCode ?? error_.status;
    const payloadType = this.isImagePromptPayload(payload) ? 'image' : 'text';
    this.logger.error(
      { model, payloadType, statusCode },
      'Error communicating with or validating response from Mistral API',
    );
  }

  /**
   * Maps a raw error from the Mistral SDK to the appropriate `LlmError`
   * subclass by delegating to the shared {@link classifyLlmError} helper
   * with the Mistral-specific probe configuration.
   * @param error - The raw error caught from `_sendInternal`.
   * @returns An `LlmError` instance, or `undefined` if the error is
   *   unclassifiable.
   */
  protected mapError(error: unknown): LlmError | undefined {
    return classifyLlmError(MISTRAL_PROBES, error);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Builds the messages array for the Mistral API request.
   *
   * For text payloads, the user message content is a plain string.
   * For image payloads, each image becomes an `ImageURLChunk` with a
   * `data:` URI.
   * @param payload - The LLM payload.
   * @returns An array of system and user messages.
   */
  private buildMessages(
    payload: LlmPayload,
  ): Array<{ role: string; content: unknown }> {
    const userContent = this.isImagePromptPayload(payload)
      ? payload.images.map((img) => ({
          type: 'image_url' as const,
          imageUrl: `data:${img.mimeType};base64,${img.data}`,
        }))
      : payload.user;

    return [
      { role: 'system', content: payload.system },
      { role: 'user', content: userContent },
    ];
  }

  /**
   * Builds the complete request object for the Mistral SDK
   * `chat.complete()` call.
   * @param model - The model name.
   * @param messages - The messages array.
   * @param payload - The original LLM payload (for temperature and reasoning
   *   effort).
   * @returns A plain object compatible with the Mistral SDK's request shape.
   */
  private buildRequest(
    model: string,
    messages: Array<{ role: string; content: unknown }>,
    payload: LlmPayload,
  ): Record<string, unknown> {
    const request: Record<string, unknown> = {
      model,
      messages,
      temperature: payload.temperature ?? 0,
      safePrompt: false,
      responseFormat: { type: 'json_object' },
    };

    if (
      payload.reasoningEffort !== undefined &&
      payload.reasoningEffort !== 'off'
    ) {
      request.reasoningEffort = this.mapReasoningEffort(
        payload.reasoningEffort,
      );
    }

    return request;
  }

  /**
   * Extracts the response text from a Mistral SDK chat completion result.
   *
   * Handles both `string` and `Array<ContentChunk>` content types, falling
   * back to an empty string when no usable content is present.
   * @param result - The raw chat completion response from the SDK.
   * @returns The extracted text string.
   */
  private extractResponseText(result: MistralCompleteResponse): string {
    const rawContent = result.choices?.[0]?.message?.content;
    if (typeof rawContent === 'string') {
      return rawContent;
    }
    if (Array.isArray(rawContent)) {
      // Safely concatenate text chunks from the ContentChunk array
      return rawContent
        .filter(
          (chunk) =>
            typeof chunk === 'object' &&
            chunk != null &&
            'type' in chunk &&
            (chunk as Record<string, unknown>).type === 'text' &&
            typeof (chunk as Record<string, unknown>).text === 'string',
        )
        .map((chunk) => (chunk as Record<string, unknown>).text as string)
        .join('');
    }
    return '';
  }

  /**
   * Maps an abstract {@link ReasoningEffort} level to the Mistral SDK's
   * native reasoning-effort string value.
   * @param effort - The abstract reasoning-effort level.
   * @returns The Mistral-native value. `mistral-small-latest` only accepts
   *   `none` and `high`, so both `'off'` and `'low'` map to `'none'`, and
   *   `'high'` and `'max'` map to `'high'`.
   */
  private mapReasoningEffort(effort: ReasoningEffort): string | undefined {
    switch (effort) {
      case 'off':
      case 'low':
        // `mistral-small-latest` only accepts the `none` and `high` reasoning
        // effort values. `low` (the text/table default) is collapsed to `none`,
        // which the provider treats as reasoning disabled.
        return 'none';
      case 'high':
      case 'max':
        // `max` maps to the highest effort the model supports (`high`).
        return 'high';
    }
  }

  /**
   * Type guard that checks whether a payload is an {@link ImagePromptPayload}.
   * @param payload - The payload to check.
   * @returns `true` if the payload contains images.
   */
  private isImagePromptPayload(
    payload: LlmPayload,
  ): payload is ImagePromptPayload {
    return 'images' in payload;
  }

  /**
   * Type guard that checks whether a payload is a {@link StringPromptPayload}.
   * @param payload - The payload to check.
   * @returns `true` if the payload contains a `user` string.
   */
  private isStringPromptPayload(
    payload: LlmPayload,
  ): payload is StringPromptPayload {
    return 'user' in payload;
  }
}
