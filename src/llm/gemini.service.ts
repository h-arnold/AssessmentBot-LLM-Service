import {
  GoogleGenAI,
  type GenerateContentConfig,
  type Part,
} from '@google/genai';
import { Injectable, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import {
  ImagePromptPayload,
  LLMService,
  LlmPayload,
  StringPromptPayload,
} from './llm.service.interface.js';
import { LlmResponse, LlmResponseSchema } from './types.js';
import {
  AuthenticationError,
  ContentFilteredError,
  ContextLengthExceededError,
  InvalidRequestError,
  LlmError,
  NetworkError,
  ProviderServerError,
  RateLimitError,
  ResourceExhaustedError,
} from '../common/errors/index.js';
import { JsonParserUtility } from '../common/json-parser.utility.js';
import { isErrorObject } from '../common/utils/type-guards.js';
import { ConfigService } from '../config/config.service.js';

type GeminiRequest = { model: string; config: GenerateContentConfig };

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

  private static readonly CONTENT_FILTERED_PATTERN = /safety|blocked|filter/i;
  private static readonly CONTEXT_LENGTH_PATTERN = /context[ _]?length/i;
  private static readonly NETWORK_PATTERN =
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network/i;
  private static readonly RESOURCE_EXHAUSTED_PATTERN =
    /resource[ _]?exhausted|quota (exceeded|exhausted|has been exhausted)/i;
  private static readonly RATE_LIMIT_PATTERN =
    /rate[ _]?limit|too many requests/i;

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
    // Non-object and falsy inputs (null, undefined, string, number) → undefined
    if (!error || typeof error !== 'object') {
      return undefined;
    }

    const statusCode = this.extractStatusCode(error);
    const message = this.extractMessage(error);

    // 1. ResourceExhaustedError
    if (this.isResourceExhausted(error, statusCode, message)) {
      return this.buildError(ResourceExhaustedError, message, error);
    }

    // 2. RateLimitError — static client-facing message per the 4xx message
    //    policy; raw upstream text is retained server-side in `originalError`.
    if (this.isRateLimit(error, statusCode, message)) {
      return this.buildError(
        RateLimitError,
        'The LLM provider rate limit was exceeded',
        error,
      );
    }

    // 3. AuthenticationError
    if (statusCode === 401 || statusCode === 403) {
      return this.buildError(
        AuthenticationError,
        'Authentication with the LLM provider failed',
        error,
      );
    }

    // 4. ContentFilteredError
    if (
      statusCode === 400 &&
      GeminiService.CONTENT_FILTERED_PATTERN.test(message)
    ) {
      return this.buildError(
        ContentFilteredError,
        'Request blocked by provider safety filters',
        error,
      );
    }

    // 5. ContextLengthExceededError
    if (
      statusCode === 400 &&
      GeminiService.CONTEXT_LENGTH_PATTERN.test(message)
    ) {
      return this.buildError(
        ContextLengthExceededError,
        'Input exceeds the model context window',
        error,
      );
    }

    // 6. InvalidRequestError (generic 400 or any other unrecognised 4xx)
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      return this.buildError(
        InvalidRequestError,
        'The request was rejected by the provider as invalid',
        error,
      );
    }

    // 7. ProviderServerError
    if (statusCode !== undefined && statusCode >= 500) {
      return this.buildError(ProviderServerError, message, error);
    }

    // 8. NetworkError — only when no extractable HTTP status. Matches both
    //    `Error` instances and plain objects whose message matches a network
    //    pattern (per the documented classification rules).
    if (GeminiService.NETWORK_PATTERN.test(message)) {
      return this.buildError(NetworkError, message, error);
    }

    // 9. Undefined (unclassifiable)
    return undefined;
  }

  /**
   * Checks whether the error matches a `ResourceExhaustedError` pattern.
   * @param error - The raw error from `_sendInternal`.
   * @param statusCode - The extracted numeric status code, if any.
   * @param message - The error message string.
   * @returns `true` if the error matches the resource-exhausted classification.
   */
  private isResourceExhausted(
    error: unknown,
    statusCode: number | undefined,
    message: string,
  ): boolean {
    return (
      this.hasStringStatus(error, 'resource_exhausted') ||
      (statusCode === 429 &&
        GeminiService.RESOURCE_EXHAUSTED_PATTERN.test(message))
    );
  }

  /**
   * Checks whether the error matches a `RateLimitError` pattern.
   * @param error - The raw error from `_sendInternal`.
   * @param statusCode - The extracted numeric status code, if any.
   * @param message - The error message string.
   * @returns `true` if the error matches the rate-limit classification.
   */
  private isRateLimit(
    error: unknown,
    statusCode: number | undefined,
    message: string,
  ): boolean {
    return (
      this.hasStringStatus(error, 'rate_limit_exceeded') ||
      this.hasStringStatus(error, '429') ||
      statusCode === 429 ||
      GeminiService.RATE_LIMIT_PATTERN.test(message)
    );
  }

  /**
   * Constructs an `LlmError` instance with `this.providerName`.
   * @param ErrorClass - The LlmError subclass constructor.
   * @param message - The error message.
   * @param error - The original error (narrowed to `Error` for `originalError`
   *   when applicable).
   * @returns A new `LlmError` instance of the given class.
   */
  /**
   * Extracts a usable message string from a raw error.
   *
   * Reads `error.message` for `Error` instances and for plain objects that carry
   * a string `message` property (some SDKs emit plain-object error shapes
   * rather than `Error` subclasses). Falls back to `'Unknown error'` when no
   * message is available.
   * @param error - The raw error from `_sendInternal`.
   * @returns The extracted message string.
   */
  private extractMessage(error: unknown): string {
    if (isErrorObject(error)) {
      return error.message;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as Record<string, unknown>).message === 'string'
    ) {
      return (error as Record<string, unknown>).message as string;
    }
    return 'Unknown error';
  }

  private buildError<T extends LlmError>(
    ErrorClass: new (
      message: string,
      providerName: string,
      options?: { originalError?: Error; cause?: Error },
    ) => T,
    message: string,
    error: unknown,
  ): T {
    const originalError = isErrorObject(error) ? error : undefined;
    return new ErrorClass(message, this.providerName, { originalError });
  }

  /**
   * Extracts a numeric HTTP status code from various Gemini SDK error shapes.
   * @param error - The error object to inspect.
   * @returns The numeric status code, or `undefined` if none found.
   * @remarks Recognised shapes: `error.status`, `error.statusCode`,
   *   `error.code` (direct numeric or string-coercible),
   *   `error.response.status`, `error.error.status`, `error.error.code`.
   *   String values like `'429'` are coerced to numbers.
   */
  private extractStatusCode(error: unknown): number | undefined {
    if (typeof error !== 'object' || error === null) return undefined;
    const error_ = error as Record<string, unknown>;

    // Direct numeric or string-coercible properties
    const directStatus = this.normaliseStatusCode(error_.status);
    if (directStatus !== undefined) return directStatus;
    const directStatusCode = this.normaliseStatusCode(error_.statusCode);
    if (directStatusCode !== undefined) return directStatusCode;
    const directCode = this.normaliseStatusCode(error_.code);
    if (directCode !== undefined) return directCode;

    // Nested response.status
    if (typeof error_.response === 'object' && error_.response !== null) {
      const response = error_.response as Record<string, unknown>;
      const responseStatus = this.normaliseStatusCode(response.status);
      if (responseStatus !== undefined) return responseStatus;
    }

    // Nested error.status / error.code
    if (typeof error_.error === 'object' && error_.error !== null) {
      const nestedError = error_.error as Record<string, unknown>;
      const nestedStatus = this.normaliseStatusCode(nestedError.status);
      if (nestedStatus !== undefined) return nestedStatus;
      const nestedCode = this.normaliseStatusCode(nestedError.code);
      if (nestedCode !== undefined) return nestedCode;
    }

    return undefined;
  }

  /**
   * Coerces a raw value to a numeric status code if possible.
   * @param value - The raw value (number or string-coercible).
   * @returns The numeric status code, or `undefined` if the value is neither a
   *   number nor a string-coercible number.
   */
  private normaliseStatusCode(value: unknown): number | undefined {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
    return undefined;
  }

  /**
   * Checks whether an error object has a specific string status or code value
   * (case-insensitive) at the top level or nested under `error`.
   * @param error - The error object to inspect.
   * @param value - The value to search for (case-insensitive).
   * @returns `true` if any of `error.status`, `error.code`,
   *   `error.error.status`, or `error.error.code` match `value`
   *   case-insensitively.
   */
  private hasStringStatus(error: unknown, value: string): boolean {
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
  }

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
    const modelName = this.isImagePromptPayload(payload)
      ? 'gemini-2.5-flash'
      : 'gemini-2.5-flash-lite';

    const systemInstruction = payload.system;
    const temperature =
      typeof payload.temperature === 'number' ? payload.temperature : 0;

    const config: GenerateContentConfig = {
      systemInstruction,
      temperature,
      thinkingConfig: { thinkingBudget: 0 },
    };
    return { model: modelName, config };
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
