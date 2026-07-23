import {
  GoogleGenAI,
  type GenerateContentConfig,
  type Part,
} from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  classifyLlmError,
  type LlmErrorMapperProbes,
  normaliseStatusCode,
} from './llm-error-mapper.js';
import {
  ImagePromptPayload,
  LLMService,
  LlmPayload,
  StringPromptPayload,
} from './llm.service.interface.js';
import { LlmResponse, LlmResponseSchema } from './types.js';
import { type LlmError } from '../common/errors/index.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { ConfigService } from '../config/config.service.js';

type GeminiRequest = { model: string; config: GenerateContentConfig };

// ---------------------------------------------------------------------------
// Gemini-specific probe configuration for the shared classifyLlmError helper
// ---------------------------------------------------------------------------

/**
 * Per-provider probe configuration for Gemini, supplied to the shared
 * {@link classifyLlmError} cascade.
 *
 * - `extractStatusCode` probes `error.status`, `error.statusCode`, `error.code`,
 *   `error.response.status`, `error.error.status`, and `error.error.code` with
 *   string-to-number coercion — replicating the exact current behaviour.
 * - `hasStringStatus` checks `error.status`, `error.code`, `error.error.status`,
 *   and `error.error.code` for case-insensitive string matches (e.g.
 *   `RESOURCE_EXHAUSTED`, `RATE_LIMIT_EXCEEDED`, `'429'`).
 * - No `isHttpClientError` — Gemini has no HTTPClientError concept.
 */
const GEMINI_PROBES: LlmErrorMapperProbes = {
  providerName: 'gemini',

  extractStatusCode: (error: unknown): number | undefined => {
    if (typeof error !== 'object' || error === null) return undefined;
    const error_ = error as Record<string, unknown>;

    // Direct numeric or string-coercible properties
    const directStatus = normaliseStatusCode(error_.status);
    if (directStatus !== undefined) return directStatus;
    const directStatusCode = normaliseStatusCode(error_.statusCode);
    if (directStatusCode !== undefined) return directStatusCode;
    const directCode = normaliseStatusCode(error_.code);
    if (directCode !== undefined) return directCode;

    // Nested response.status
    if (typeof error_.response === 'object' && error_.response !== null) {
      const response = error_.response as Record<string, unknown>;
      const responseStatus = normaliseStatusCode(response.status);
      if (responseStatus !== undefined) return responseStatus;
    }

    // Nested error.status / error.code
    if (typeof error_.error === 'object' && error_.error !== null) {
      const nestedError = error_.error as Record<string, unknown>;
      const nestedStatus = normaliseStatusCode(nestedError.status);
      if (nestedStatus !== undefined) return nestedStatus;
      const nestedCode = normaliseStatusCode(nestedError.code);
      if (nestedCode !== undefined) return nestedCode;
    }

    return undefined;
  },

  hasStringStatus: (error: unknown, value: string): boolean => {
    if (typeof error !== 'object' || error === null) return false;
    const error_ = error as Record<string, unknown>;
    const lowerValue = value.toLowerCase();

    const check = (v: unknown): boolean =>
      typeof v === 'string' && v.toLowerCase() === lowerValue;

    if (check(error_.status)) return true;
    if (check(error_.code)) return true;

    if (typeof error_.error === 'object' && error_.error !== null) {
      const nestedError = error_.error as Record<string, unknown>;
      if (check(nestedError.status)) return true;
      if (check(nestedError.code)) return true;
    }

    return false;
  },

  networkPattern:
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network/i,
};

/**
 * A service for interacting with the Google Gemini LLM via the maintained
 * `@google/genai` SDK. It implements the LLMService interface and handles the
 * specifics of sending requests and validating responses from the Gemini API.
 */
@Injectable()
export class GeminiService extends LLMService {
  private readonly client: GoogleGenAI;
  private readonly geminiLogger = new Logger(GeminiService.name);

  protected readonly providerName = 'gemini';

  constructor(
    configService: ConfigService,
    private readonly jsonParserUtility: JsonParserUtility,
  ) {
    super(configService);
    const apiKey = this.configService.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment');
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  protected async _sendInternal(payload: LlmPayload): Promise<LlmResponse> {
    const modelParameters: GeminiRequest = this.buildModelParams(payload);
    const contents = this.buildContents(payload);

    this.geminiLogger.debug(
      `Sending to Gemini with model: ${modelParameters.model}, temperature: ${
        modelParameters.config.temperature ?? 0
      }`,
    );
    this.logPayload(payload, contents);

    try {
      return await this.generateAndParseResponse(
        payload,
        modelParameters,
        contents,
      );
    } catch (error) {
      const error_ = error as {
        status?: number;
        statusCode?: number;
        response?: { status?: number };
      };
      const statusCode =
        error_?.status ?? error_?.statusCode ?? error_?.response?.status;
      const payloadType = this.isImagePromptPayload(payload) ? 'image' : 'text';
      this.geminiLogger.error(
        {
          model: modelParameters.model,
          payloadType,
          statusCode,
        },
        'Error communicating with or validating response from Gemini API',
      );
      if (error instanceof ZodError) {
        this.geminiLogger.debug(
          `Zod validation failed: ${JSON.stringify(error.issues)}`,
        );
        throw error;
      }

      // Let the original error bubble up - the base class will handle
      // retry logic and error wrapping appropriately
      throw error;
    }
  }

  /**
   * Maps a raw error from the Gemini SDK to the appropriate `LlmError` subclass.
   * @param error - The raw error caught from `_sendInternal`.
   * @returns An `LlmError` instance, or `undefined` if the error is
   *   unclassifiable.
   * @remarks Classification priority (highest to lowest):
   * 1. ResourceExhaustedError — string status `RESOURCE_EXHAUSTED` or 429 with
   *    resource-exhausted / quota-exhausted message.
   * 2. RateLimitError — string status `RATE_LIMIT_EXCEEDED` / `429`, numeric
   *    429, or rate-limit / too-many-requests message.
   * 3. AuthenticationError — 401 or 403.
   * 4. ContentFilteredError — 400 with safety / blocked / filter message.
   * 5. ContextLengthExceededError — 400 with context-length message.
   * 6. InvalidRequestError — generic 400 or any other unrecognised 4xx.
   * 7. ProviderServerError — any 5xx.
   * 8. NetworkError — errors with a network-failure message and no
   *    extractable HTTP status (both `Error` instances and plain objects).
   * 9. `undefined` — none of the above match.
   */
  protected mapError(error: unknown): LlmError | undefined {
    return classifyLlmError(GEMINI_PROBES, error);
  }

  // The private helpers `isResourceExhausted`, `isRateLimit`, `extractMessage`,
  // `buildError`, `extractStatusCode`, `normaliseStatusCode`, and
  // `hasStringStatus` have been extracted into the shared `classifyLlmError`
  // helper in `llm-error-mapper.ts`. See `GEMINI_PROBES` above for the
  // Gemini-specific probe configuration.

  private isImagePromptPayload(
    payload: LlmPayload,
  ): payload is ImagePromptPayload {
    return 'images' in payload;
  }

  private isStringPromptPayload(
    payload: LlmPayload,
  ): payload is StringPromptPayload {
    return 'user' in payload;
  }

  private buildModelParams(payload: LlmPayload): GeminiRequest {
    // Use payload.model if present; otherwise fall back to the current
    // hardcoded selection based on payload type.
    const modelName =
      payload.model ??
      (this.isImagePromptPayload(payload)
        ? 'gemini-2.5-flash'
        : 'gemini-2.5-flash-lite');

    const systemInstruction = payload.system;
    const temperature =
      typeof payload.temperature === 'number' ? payload.temperature : 0;

    // Map abstract reasoning-effort level to Gemini's thinkingBudget.
    // See `mapThinkingBudget` for the mapping and v1-limitation note.
    const thinkingBudget = this.mapThinkingBudget(payload.reasoningEffort);

    // Only attach `thinkingConfig` when a non-zero thinking budget is
    // requested. Some Gemini models (e.g. the `gemini-flash-latest` stable
    // alias) reject the `thinkingConfig` field outright with a 400
    // INVALID_ARGUMENT, so omitting it for the default/disabled case keeps
    // those models working. Models that support thinking (the 2.5 series)
    // continue to receive the budget as before.
    const config: GenerateContentConfig = {
      systemInstruction,
      temperature,
      ...(thinkingBudget > 0 && { thinkingConfig: { thinkingBudget } }),
    };
    return { model: modelName, config };
  }

  /**
   * Maps an abstract reasoning-effort level to a Gemini thinking budget.
   *
   * Note: `'off'` and `'low'` both map to 0, making them indistinguishable at
   * the request level. This is a known v1 limitation — Gemini has no native
   * low-effort equivalent, so `'low'` deliberately preserves the existing
   * default (0).
   * @param effort - The abstract reasoning-effort level (or undefined).
   * @returns The Gemini thinking budget in tokens.
   */
  private mapThinkingBudget(effort: string | undefined): number {
    switch (effort) {
      case 'high':
        return 1024;
      case 'max':
        return 8192;
      default:
        return 0;
    }
  }

  private buildContents(payload: LlmPayload): (string | Part)[] {
    if (this.isImagePromptPayload(payload)) {
      const { images } = payload;
      const imageParts = this.mapImageParts(images);
      return imageParts;
    }
    if (this.isStringPromptPayload(payload)) {
      return [payload.user];
    }
    throw new Error('Unsupported payload type');
  }

  private mapImageParts(
    images: Array<{ mimeType: string; data?: string }>,
  ): Part[] {
    return images.flatMap((img) => {
      if (
        typeof img === 'object' &&
        'data' in img &&
        typeof img.data === 'string' &&
        typeof img.mimeType === 'string'
      ) {
        return [
          {
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            },
          },
        ];
      }
      return [];
    }) as Part[];
  }

  private logPayload(payload: LlmPayload, contents: (string | Part)[]): void {
    if (this.isStringPromptPayload(payload)) {
      this.geminiLogger.debug({ contents }, 'String payload being sent');
    } else if (this.isImagePromptPayload(payload)) {
      this.geminiLogger.debug(
        `Image payload being sent with ${contents.length} content items`,
      );
    } else {
      this.geminiLogger.debug(
        `Unknown payload type being sent with ${contents.length} content items`,
      );
    }
  }

  /**
   * Builds the Gemini request and parses the response into a validated
   * LlmResponse.
   * @param {LlmPayload} payload The payload to send.
   * @param {GeminiRequest} modelParameters The pre-built model parameters
   *   (model name and generation config).
   * @param {(string | Part)[]} contents The pre-built content parts to send.
   * @returns {Promise<LlmResponse>} A validated assessment response.
   * @remarks
   * - The response text is read via the new SDK's `result.text` getter (the
   *   concatenated text), falling back to an empty string when absent.
   * - `thinkingConfig.thinkingBudget = 0` disables additional thinking for the
   *   Gemini 2.5 models used here.
   */
  private async generateAndParseResponse(
    payload: LlmPayload,
    modelParameters: GeminiRequest,
    contents: (string | Part)[],
  ): Promise<LlmResponse> {
    const { model, config } = modelParameters;
    const result = await this.client.models.generateContent({
      model,
      contents,
      config,
    });
    const responseText = result.text ?? '';

    // Pass the raw value as a structured field so pino serialises it lazily
    // only when the debug level is enabled (avoids an unconditional, potentially
    // large string concatenation on the hot path).
    this.geminiLogger.debug({ responseText }, 'Raw response from Gemini');

    const parsedJson: unknown = this.jsonParserUtility.parse(responseText);
    this.geminiLogger.debug({ parsedJson }, 'Parsed JSON response');

    const dataToValidate: unknown = Array.isArray(parsedJson)
      ? (parsedJson as unknown[])[0]
      : parsedJson;

    return LlmResponseSchema.parse(dataToValidate);
  }
}
