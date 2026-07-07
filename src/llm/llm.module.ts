import { Module } from '@nestjs/common';

import { GeminiService } from './gemini.service.js';
import { LLMService } from './llm.service.interface.js';
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
 * - `{ provide: LLMService, useClass: GeminiService }`: Maps the `LLMService` token
 *   to the `GeminiService` implementation for dependency injection.
 *
 * **exports:**
 * - `LLMService`: Makes the `LLMService` available for other modules.
 */
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [
    GeminiService,
    {
      provide: LLMService,
      useClass: GeminiService,
    },
  ],
  exports: [LLMService],
})
export class LlmModule {}
