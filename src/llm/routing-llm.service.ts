import { Injectable } from '@nestjs/common';

import { GeminiService } from './gemini.service.js';
import {
  ILlmService,
  LlmPayload,
  ReasoningEffort,
} from './llm.service.interface.js';
import { MistralService } from './mistral.service.js';
import {
  formatUnsupportedModelMessage,
  resolveProvider,
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
 * ### Configuration lifecycle
 * Configuration is validated at construction time and frozen for the lifetime
 * of the service. Providers, model names, and reasoning-effort values are
 * resolved once in the constructor. Runtime environment changes (such as editing
 * environment variables) have **no effect** after startup — the application
 * must be restarted to pick up new values.
 *
 * The constructor resolves providers from the model registry; the resolved
 * provider, model name, and reasoning-effort value for each task type are
 * stored as private readonly fields. This eliminates all per-request registry
 * scans and removes the unreachable runtime-throw path that previously existed
 * when `resolveProvider` was called on every `send()`.
 */
@Injectable()
export class RoutingLLMService implements ILlmService {
  private readonly textProvider: ILlmService;
  private readonly imageProvider: ILlmService;
  private readonly textModel: string;
  private readonly imageModel: string;
  private readonly textEffort: ReasoningEffort;
  private readonly imageEffort: ReasoningEffort;

  constructor(
    private readonly configService: ConfigService,
    private readonly geminiService: GeminiService,
    private readonly mistralService: MistralService,
  ) {
    const textModel: string = this.configService.get(
      'DEFAULT_TEXT_TABLE_MODEL',
    );
    const imageModel: string = this.configService.get('DEFAULT_IMAGE_MODEL');
    const textEffort = this.configService.get(
      'TEXT_REASONING_EFFORT',
    ) as ReasoningEffort;
    const imageEffort = this.configService.get(
      'IMAGE_REASONING_EFFORT',
    ) as ReasoningEffort;

    // Resolve each model name to its provider exactly once, collecting any
    // unrecognised names for a single aggregated fail-fast startup error.
    const badNames: string[] = [];
    const textProviderId = this.tryResolve(textModel, badNames);
    const imageProviderId = this.tryResolve(imageModel, badNames);

    if (badNames.length > 0) {
      throw new Error(formatUnsupportedModelMessage(badNames));
    }

    // Cache all task-specific configuration for the lifetime of the service.
    this.textProvider =
      textProviderId === 'gemini' ? geminiService : mistralService;
    this.imageProvider =
      imageProviderId === 'gemini' ? geminiService : mistralService;
    this.textModel = textModel;
    this.imageModel = imageModel;
    this.textEffort = textEffort;
    this.imageEffort = imageEffort;
  }

  /**
   * Resolves a model name to its provider, pushing the name onto `badNames`
   * (and returning `undefined`) when it matches no registered prefix.
   * @param modelName - The configured model name to resolve.
   * @param badNames - Accumulator for unrecognised model names.
   * @returns The resolved provider id, or `undefined` when unresolved.
   */
  private tryResolve(
    modelName: string,
    badNames: string[],
  ): ReturnType<typeof resolveProvider> | undefined {
    try {
      return resolveProvider(modelName);
    } catch {
      badNames.push(modelName);
      return undefined;
    }
  }

  /**
   * Sends a payload to the appropriate LLM provider based on task type and
   * server-side configuration resolved at construction time.
   *
   * ### Routing decision flow:
   * 1. Determine task type (`'images' in payload` → IMAGE, otherwise TEXT_TABLE).
   * 2. Pick the pre-resolved provider, model name, and reasoning-effort value
   *    cached from construction.
   * 3. Build a **new** payload object via spread (never mutates the caller's
   *    payload) and **authoritatively** set `model` and `reasoningEffort`
   *    from the server config (overwriting any caller-supplied values — see
   *    SPEC product decision #12).
   * 4. Delegate to the pre-resolved provider's `send()` method.
   *
   * No retry logic is implemented here — each provider handles its own retries
   * via the base `LLMService` class.
   * @param payload - The payload to send (text/table or image).
   * @returns A validated {@link LlmResponse}.
   */
  async send(payload: LlmPayload): Promise<LlmResponse> {
    const isImage = 'images' in payload;

    const provider = isImage ? this.imageProvider : this.textProvider;
    const model = isImage ? this.imageModel : this.textModel;
    const effort = isImage ? this.imageEffort : this.textEffort;

    // Build a new payload — never mutate the caller's object.
    const resolvedPayload = { ...payload, model, reasoningEffort: effort };

    return provider.send(resolvedPayload);
  }
}
