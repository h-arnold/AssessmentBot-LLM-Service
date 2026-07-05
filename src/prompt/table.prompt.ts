import { Logger } from '@nestjs/common';

import { Prompt } from './prompt.base';

/**
 * Prompt implementation for assessing table-based tasks.
 *
 * This class handles the creation of prompts for table assessment tasks,
 * using specific templates optimised for evaluating tabular data submissions.
 * It inherits all common prompt functionality from the base Prompt class.
 */
export class TablePrompt extends Prompt {
  /**
   * Initialises the TablePrompt instance with table-specific configuration.
   * @param {unknown} inputs - Raw input data to be validated containing table
   *   information.
   * @param {Logger} logger - Logger instance for recording table prompt
   *   operations.
   * @param {string} [userTemplateName] - Optional name of the user template
   *   file (defaults to table template).
   * @param {string} [systemPrompt] - Optional system prompt string providing
   *   context for table assessment.
   */
  constructor(
    inputs: unknown,
    logger: Logger,
    userTemplateName?: string,
    systemPrompt?: string,
  ) {
    super(
      inputs,
      logger,
      userTemplateName ?? 'table.user.prompt.md',
      systemPrompt,
    );
  }
}
