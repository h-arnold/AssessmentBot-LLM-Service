import { Logger, Module } from '@nestjs/common';

import { PromptFactory } from './prompt.factory.js';

/**
 * Module responsible for prompt generation and management.
 *
 * This module provides the infrastructure for creating and managing prompts
 * that are sent to Large Language Models. It includes factory patterns for
 * generating different types of prompts based on task requirements.
 * @module PromptModule
 *
 * **providers:**
 * - `PromptFactory`: Factory for creating task-specific prompt instances
 * - `Logger`: Logging functionality for prompt operations
 *
 * **exports:**
 * - `PromptFactory`: Makes the factory available to other modules
 */
@Module({
  providers: [PromptFactory, Logger],
  exports: [PromptFactory],
})
export class PromptModule {}
