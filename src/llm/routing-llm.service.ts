import { Injectable } from '@nestjs/common';

import { GeminiService } from './gemini.service.js';
import {
  ILlmService,
  LlmPayload,
  ReasoningEffort,
} from './llm.service.interface.js';
import { MistralService } from './mistral.service.js';
import {
  resolveProvider,
  SUPPORTED_MODELS,
  validateModelName,
} from './model-registry.js';
import { type LlmResponse } from './types.js';
import { ConfigService } from '../config/config.service.js';

/**
 * Dispatches LLM requests to the appropriate provider service based on task
 * type and server-side model configuration.
 *
 * This service implements {@link ILlmService} directly (it does **not** extend
 * {@link LLMService}) because it is a dispatcher, not a provider.
 * It delegates to {@link GeminiService} or {@link MistralService} based on the
 * model name resolved from server configuration for each task type.
 *
 * ### Model-name validation
 * The constructor validates both `DEFAULT_TEXT_TABLE_MODEL` and
 * `DEFAULT_IMAGE_MODEL` against the model registry. If any model name is
 * unrecognised, a single aggregated `Error` is thrown listing every
 * unrecognised name and the set of supported prefixes. This provides fail-fast
 * startup feedback for misconfigured environments.
 *
 * The constructor does **not** read or check `GEMINI_API_KEY` or
 * `MISTRAL_API_KEY` — both are already enforced as required and non-empty by
 * the Zod environment schema (see SPEC product decision #4). Provider services
 * retain their existing defensive own-key checks for direct-instantiation
 * paths.
 *
 * ### Runtime configuration
 * Model name and reasoning-effort values are read from `ConfigService` at
 * `send()` time, so runtime configuration changes take effect without a
 * restart. If the configured model name becomes unsupported at runtime (e.g.,
 * an operator edits the environment), `resolveProvider()` throws at `send()`
 * time and the error propagates to the caller unhandled by the router
 * (documented behaviour; see SPEC resolved open question #8).
 */
@Injectable()
export class RoutingLLMService implements ILlmService {
  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly mistralService: MistralService,
  ) {
    this.validateModelConfig();
  }

  /**
   * Validates both configured model names against the model registry.
   *
   * Both `DEFAULT_TEXT_TABLE_MODEL` and `DEFAULT_IMAGE_MODEL` are validated.
   * Errors from both validations are collected into a single aggregated
   * `Error` so a misconfigured environment reports every problem in one
   * start-up failure.
   */
  private validateModelConfig(): void {
    const textModel = this.configService.get('DEFAULT_TEXT_TABLE_MODEL');
    const imageModel = this.configService.get('DEFAULT_IMAGE_MODEL');

    const badNames: string[] = [];

    try {
      validateModelName(textModel);
    } catch {
      badNames.push(textModel);
    }

    try {
      validateModelName(imageModel);
    } catch {
      badNames.push(imageModel);
    }

    if (badNames.length > 0) {
      const supportedPrefixes = SUPPORTED_MODELS.map(
        (entry) => entry.prefix,
      ).join(', ');
      throw new Error(
        `Unsupported model name(s): ${badNames.join(', ')}. Supported model prefixes: ${supportedPrefixes}`,
      );
    }
  }

  /**
   * Sends a payload to the appropriate LLM provider based on task type and
   * server-side configuration.
   *
   * ### Routing decision flow:
   * 1. Determine task type (`'images' in payload` → IMAGE, otherwise TEXT_TABLE).
   * 2. Look up the model name and reasoning effort from `ConfigService` at
   *    send time (so runtime config changes take effect).
   * 3. Resolve the provider via the model registry (`resolveProvider`).
   * 4. **Authoritatively** set `payload.model` and `payload.reasoningEffort`
   *    from the server config (overwriting any caller-supplied values — see
   *    SPEC product decision #12).
   * 5. Delegate to the resolved provider's `send()` method.
   *
   * No retry logic is implemented here — each provider handles its own retries
   * via the base `LLMService` class.
   * @param payload - The payload to send (text/table or image).
   * @returns A validated {@link LlmResponse}.
   */
  async send(payload: LlmPayload): Promise<LlmResponse> {
    const isImage = 'images' in payload;

    const modelName = isImage
      ? this.configService.get('DEFAULT_IMAGE_MODEL')
      : this.configService.get('DEFAULT_TEXT_TABLE_MODEL');

    const effort: ReasoningEffort = isImage
      ? this.configService.get('IMAGE_REASONING_EFFORT')
      : this.configService.get('TEXT_REASONING_EFFORT');

    // Authoritatively overwrite payload fields — server config always wins
    // (SPEC product decision #12).
    payload.model = modelName;
    payload.reasoningEffort = effort;

    const providerId = resolveProvider(modelName);

    if (providerId === 'gemini') {
      return this.geminiService.send(payload);
    }
    return this.mistralService.send(payload);
  }
}
