import {
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentConfig,
  type Part,
} from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  classifyLlmError,
  GEMINI_STATUS_PATHS,
  type LlmErrorMapperProbes,
  NETWORK_ERROR_PATTERN,
  probeStatusCode,
} from './llm-error-mapper.js';
import { LLMService, LlmPayload } from './llm.service.interface.js';
import { LlmResponse, LlmResponseSchema } from './types.js';
import { type LlmError } from '../common/errors/index.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { isErrorObject } from '../common/utils/type-guards.js';
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

  extractStatusCode: (error: unknown): number | undefined =>
    probeStatusCode(error, GEMINI_STATUS_PATHS),

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

  networkPattern: NETWORK_ERROR_PATTERN,
};

/**
 * A service for interacting with the Google Gemini LLM via the maintained
 * `@google/genai` SDK. It implements the LLMService interface and handles the
 * specifics of sending requests and validating responses from the Gemini API.
 */
@Injectable()
export class GeminiService extends LLMService {
  private client?: GoogleGenAI;

  protected readonly providerName = 'gemini';

  private readonly logLlmContent: boolean;

  constructor(
    configService: ConfigService,
    private readonly jsonParserUtility: JsonParserUtility,
  ) {
    super(configService);
    this.logLlmContent = this.configService.get('LOG_LLM_CONTENT');
  }

  /**
   * Lazily constructs (and caches) the Gemini SDK client.
   *
   * The client is built on first use rather than in the constructor because
   * `GEMINI_API_KEY` is only conditionally required: the DI container eagerly
   * constructs every provider service regardless of routing, and a deployment
   * whose configured models all route to another provider may legitimately
   * omit this key. The Zod environment schema enforces the key at startup
   * whenever a configured model routes to Gemini, so this throw is a
   * defensive backstop for direct-instantiation paths.
   * @returns The cached or newly constructed Gemini SDK client.
   * @throws {Error} When `GEMINI_API_KEY` is absent or empty.
   */
  private getClient(): GoogleGenAI {
    if (this.client) {
      return this.client;
    }
    const apiKey = this.configService.get('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set in environment');
    }
    this.client = new GoogleGenAI({ apiKey });
    return this.client;
  }

  protected async _sendInternal(payload: LlmPayload): Promise<LlmResponse> {
    const modelParameters: GeminiRequest = this.buildModelParams(payload);
    const contents = this.buildContents(payload);

    this.logger.debug(
      `Sending to Gemini with model: ${modelParameters.model}, temperature: ${
        modelParameters.config.temperature ?? 0
      }`,
    );
    if (this.logLlmContent) {
      this.logPayload(payload, contents);
    }

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
        body?: unknown;
      };
      const statusCode =
        error_?.status ?? error_?.statusCode ?? error_?.response?.status;
      const payloadType = this.isImagePromptPayload(payload) ? 'image' : 'text';
      const errorMessage = isErrorObject(error) ? error.message : String(error);
      const errorBody =
        typeof error_?.body === 'string' ? error_.body : undefined;
      const stack = isErrorObject(error) ? error.stack : undefined;
      this.logger.error(
        {
          model: modelParameters.model,
          payloadType,
          statusCode,
          errorMessage,
          errorBody,
          stack,
        },
        'Error communicating with or validating response from Gemini API',
      );
      if (error instanceof ZodError) {
        this.logger.debug(
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

    // Map the abstract reasoning-effort level to the model family's native
    // thinking parameter. See `buildThinkingConfig` for the per-family rules.
    const config: GenerateContentConfig = {
      systemInstruction,
      temperature,
      ...this.buildThinkingConfig(modelName, payload.reasoningEffort),
    };
    return { model: modelName, config };
  }

  /**
   * Builds the family-appropriate `thinkingConfig` fragment for a request, per
   * https://ai.google.dev/gemini-api/docs/thinking:
   *
   * - **Gemini 2.5 series** — `thinkingLevel` is not supported; the legacy
   *   `thinkingBudget` is used instead (0 disables thinking). See
   *   {@link mapThinkingBudget}.
   * - **Gemini 2.0 series** — no thinking support at all, so `thinkingConfig`
   *   is omitted entirely (the field is rejected with a 400 INVALID_ARGUMENT).
   * - **Gemini 3 series and rolling aliases** (e.g. `gemini-flash-latest`) —
   *   `thinkingLevel` is the recommended control. Crucially, omitting it makes
   *   the model default to *medium* thinking (extra latency and cost), so a
   *   level is always sent. See {@link mapThinkingLevel}.
   * @param modelName - The resolved Gemini model name.
   * @param effort - The abstract reasoning-effort level (or undefined).
   * @returns An object spread fragment containing `thinkingConfig`, or an
   *   empty object when the model family does not support thinking.
   */
  private buildThinkingConfig(
    modelName: string,
    effort: string | undefined,
  ): Pick<GenerateContentConfig, 'thinkingConfig'> {
    if (modelName.startsWith('gemini-2.0')) {
      return {};
    }
    if (modelName.startsWith('gemini-2.5')) {
      return {
        thinkingConfig: { thinkingBudget: this.mapThinkingBudget(effort) },
      };
    }
    return {
      thinkingConfig: { thinkingLevel: this.mapThinkingLevel(effort) },
    };
  }

  /**
   * Maps an abstract reasoning-effort level to a Gemini 2.5-series thinking
   * budget (in tokens). 0 disables thinking on the 2.5 Flash models.
   *
   * Note: `'off'` and `'low'` both map to 0, making them indistinguishable at
   * the request level. This is a known v1 limitation — Gemini 2.5 has no
   * native low-effort equivalent, so `'low'` deliberately preserves the
   * existing default (0).
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

  /**
   * Maps an abstract reasoning-effort level to a Gemini 3-series
   * `thinkingLevel`.
   *
   * Gemini 3 models cannot fully disable thinking; `'minimal'` is documented
   * as matching the "no thinking" setting for most queries, so both `'off'`
   * and the absent default map to it. The level is always sent because
   * omitting it defaults the model to `'medium'` thinking.
   * @param effort - The abstract reasoning-effort level (or undefined).
   * @returns The Gemini thinking level.
   */
  private mapThinkingLevel(effort: string | undefined): ThinkingLevel {
    switch (effort) {
      case 'low':
        return ThinkingLevel.LOW;
      case 'high':
        return ThinkingLevel.MEDIUM;
      case 'max':
        return ThinkingLevel.HIGH;
      default:
        return ThinkingLevel.MINIMAL;
    }
  }

  private buildContents(payload: LlmPayload): (string | Part)[] {
    return this.mapPayload<(string | Part)[]>(payload, {
      image: (p) => this.mapImageParts(p.images),
      text: (p) => [p.user],
    });
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
      this.logger.debug({ contents }, 'String payload being sent');
    } else if (this.isImagePromptPayload(payload)) {
      this.logger.debug(
        `Image payload being sent with ${contents.length} content items`,
      );
    } else {
      this.logger.debug(
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
   * - Thinking configuration (budget / level) is handled by
   *   {@link buildThinkingConfig} based on the model family and effort level.
   */
  private async generateAndParseResponse(
    payload: LlmPayload,
    modelParameters: GeminiRequest,
    contents: (string | Part)[],
  ): Promise<LlmResponse> {
    const { model, config } = modelParameters;
    const result = await this.getClient().models.generateContent({
      model,
      contents,
      config,
    });
    const responseText = result.text ?? '';

    // Gate raw content logging behind LOG_LLM_CONTENT to prevent persisting
    // student-derived PII in default deployments.
    if (this.logLlmContent) {
      this.logger.debug({ responseText }, 'Raw response from Gemini');
    }

    const parsedJson: unknown = this.jsonParserUtility.parse(responseText);
    if (this.logLlmContent) {
      this.logger.debug({ parsedJson }, 'Parsed JSON response');
    }

    const dataToValidate: unknown = Array.isArray(parsedJson)
      ? (parsedJson as unknown[])[0]
      : parsedJson;

    return LlmResponseSchema.parse(dataToValidate);
  }
}
