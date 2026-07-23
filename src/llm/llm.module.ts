import { Module } from '@nestjs/common';

import { GeminiService } from './gemini.service.js';
import { LLM_SERVICE_TOKEN } from './llm.service.interface.js';
import { MistralService } from './mistral.service.js';
import { RoutingLLMService } from './routing-llm.service.js';
import { CommonModule } from '../common/common.module.js';
import { ConfigModule } from '../config/config.module.js';

/**
 * NestJS module that configures and provides LLM-related services.
 *
 * This module implements a routing dispatcher pattern.
 * GeminiService and MistralService are concrete provider implementations
 * extending the abstract LLMService base class. RoutingLLMService is a
 * dispatcher that implements ILlmService directly by determining the task
 * type, looking up configured model and reasoning-effort, resolving the
 * correct provider, and delegating send().
 *
 * Exports `LLM_SERVICE_TOKEN` for consumers to inject the routing dispatcher.
 * @module LlmModule
 *
 * **imports:**
 * - `ConfigModule`: Handles application configuration.
 * - `CommonModule`: Provides shared functionality (e.g. `JsonParserUtility`).
 *
 * **providers:**
 * - `GeminiService`: Gemini provider implementation.
 * - `MistralService`: Mistral provider implementation.
 * - `{ provide: LLM_SERVICE_TOKEN, useClass: RoutingLLMService }`: Maps the
 *   string DI token to the routing dispatcher. `RoutingLLMService` is provided
 *   **only** through this token entry — there is no separate class-provider
 *   registration, which avoids a duplicate instance.
 *
 * **exports:**
 * - `LLM_SERVICE_TOKEN`: Makes the string token available for other modules.
 */
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [
    GeminiService,
    MistralService,
    {
      provide: LLM_SERVICE_TOKEN,
      useClass: RoutingLLMService,
    },
  ],
  exports: [LLM_SERVICE_TOKEN],
})
export class LlmModule {}
