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
import { JsonParserUtility } from '../common/json-parser.utility.js';
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
        this.isErrorObject(error) ? error.stack : undefined,
      );
      if (error instanceof ZodError) {
        this.logger.error('Zod validation failed', error.issues);
        throw error;
      }

      // Let the original error bubble up - the base class will handle
      // retry logic and error wrapping appropriately
      throw error;
    }
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
      return ['', ...imageParts];
    }
    if (this.isStringPromptPayload(payload)) {
      return [payload.user];
    }
    throw new Error('Unsupported payload type');
  }

  private mapImageParts(
    images: Array<{ mimeType: string; data?: string }>,
  ): Part[] {
    return images
      .map((img) => {
        if (
          typeof img === 'object' &&
          'data' in img &&
          typeof img.data === 'string' &&
          typeof img.mimeType === 'string'
        ) {
          return {
            inlineData: {
              mimeType: img.mimeType,
              data: img.data,
            },
          };
        }
      })
      .filter(Boolean) as Part[];
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

    this.geminiLogger.debug(`Raw response from Gemini: \n\n${responseText}`);

    const parsedJson: unknown = this.jsonParserUtility.parse(responseText);
    this.geminiLogger.debug({ parsedJson }, 'Parsed JSON response');

    const dataToValidate: unknown = Array.isArray(parsedJson)
      ? (parsedJson as unknown[])[0]
      : parsedJson;

    return LlmResponseSchema.parse(dataToValidate);
  }
}
