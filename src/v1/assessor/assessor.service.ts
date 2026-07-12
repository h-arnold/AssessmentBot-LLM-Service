import { Injectable, Logger } from '@nestjs/common';

import { CreateAssessorDto } from './dto/create-assessor.dto.js';
import { LLMService, LlmPayload } from '../../llm/llm.service.interface.js';
import { LlmResponse } from '../../llm/types.js';
import { PromptFactory } from '../../prompt/prompt.factory.js';

/**
 * Service responsible for orchestrating the assessment creation process.
 *
 * This service acts as the primary business logic layer for assessment operations.
 * It coordinates between the prompt generation system and the LLM service to
 * create comprehensive assessments based on provided criteria and student responses.
 */
@Injectable()
export class AssessorService {
  private readonly logger = new Logger(AssessorService.name);
  /**
   * Constructs an instance of AssessorService.
   * @param {LLMService} llmService - The service responsible for interacting
   *   with the LLM.
   * @param {PromptFactory} promptFactory - The factory responsible for
   *   generating prompts for the LLM.
   */
  constructor(
    private readonly llmService: LLMService,
    private readonly promptFactory: PromptFactory,
  ) {}

  /**
   * Creates an assessment based on the provided data transfer object (DTO).
   *
   * This method generates a prompt using the `promptFactory`, builds a message,
   * and sends it to the LLM service for processing.
   * @param {CreateAssessorDto} dto - The data transfer object containing the
   *   details required to create an assessment.
   * @returns {Promise<LlmResponse>} A promise that resolves to an LlmResponse
   *   containing the result of the assessment.
   */
  async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
    this.logger.log(`Creating assessment for task type: ${dto.taskType}.`);
    try {
      const prompt = await this.promptFactory.create(dto);
      this.logger.debug(
        `Prompt created for task type: ${dto.taskType}. Building payload.`,
      );

      const message = await prompt.buildMessage();
      this.logger.debug(
        `LLM payload built for task type: ${dto.taskType} (${this.describePayloadSummary(message)}).`,
      );

      const response: LlmResponse = await this.llmService.send(message);
      this.logger.log(`Assessment completed for task type: ${dto.taskType}.`);
      return response;
    } catch (error) {
      this.logger.error(
        `Assessment failed for task type: ${dto.taskType}.`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * Describes an LLM payload for debug logging — determines whether it is an
   * image or text payload and returns a human-readable summary string.
   * @param {LlmPayload} message The LLM payload to describe.
   * @returns {string} A human-readable summary string.
   */
  private describePayloadSummary(message: LlmPayload): string {
    return 'images' in message
      ? `image payload with ${message.images.length} images`
      : `text payload with ${message.user.length} characters`;
  }
}
