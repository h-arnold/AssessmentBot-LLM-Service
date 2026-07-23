import { Module } from '@nestjs/common';

import { GeminiService } from './gemini.service.js';
import { LLM_SERVICE_TOKEN } from './llm.service.interface.js';
import { CommonModule } from '../common/common.module.js';
import { ConfigModule } from '../config/config.module.js';

/**
 * The `LlmModule` is a NestJS module responsible for configuring and providing
 * services related to Large Language Models (LLMs). It imports necessary modules
 * and defines providers and exports for dependency injection.
 * @module LlmModule
 *
 * **imports:**
 * - `ConfigModule`: Handles application configuration.
 * - `CommonModule`: Provides shared functionality across the application.
 *
 * **providers:**
 * - `GeminiService`: A service implementation for LLM-related operations.
 * - `{ provide: LLM_SERVICE_TOKEN, useClass: GeminiService }`: Maps the string token
 *   `LLM_SERVICE_TOKEN` to `GeminiService`. This is temporary — it will be replaced
 *   by the routing dispatcher in a later change.
 *
 * **exports:**
 * - `LLM_SERVICE_TOKEN`: Makes the string token available for other modules.
 */
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [
    GeminiService,
    {
      provide: LLM_SERVICE_TOKEN,
      useClass: GeminiService,
    },
  ],
  exports: [LLM_SERVICE_TOKEN],
})
export class LlmModule {}
