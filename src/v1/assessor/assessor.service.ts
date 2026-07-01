import { Injectable, Logger } from '@nestjs/common';

import { CreateAssessorDto } from './dto/create-assessor.dto';
import { LLMService } from '../../llm/llm.service.interface';
import { LlmResponse } from '../../llm/types';
import { PromptFactory } from '../../prompt/prompt.factory';

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
   *
   * @param llmService - The service responsible for interacting with the LLM (Large Language Model).
   * @param promptFactory - The factory responsible for generating prompts for the LLM.
   */
  constructor(
    private readonly llmService: LLMService,
    private readonly promptFactory: PromptFactory,
  ) {}

  /**
   * Creates an assessment based on the provided data transfer object (DTO).
   * This method generates a prompt using the `promptFactory`, builds a message,
   * and sends it to the LLM service for processing.
   *
   * @param dto - The data transfer object containing the details required to create an assessment.
   * @returns A promise that resolves to an `LlmResponse` containing the result of the assessment.
   */
  async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
    this.logger.log(`Creating assessment for task type: ${dto.taskType}.`);
    try {
      const prompt = await this.promptFactory.create(dto);
      this.logger.debug(
        `Prompt created for task type: ${dto.taskType}. Building payload.`,
      );

      const message = await prompt.buildMessage();
      const payloadSummary =
        'images' in message
          ? `image payload with ${message.images.length} images`
          : `text payload with ${message.user.length} characters`;
      this.logger.debug(
        `LLM payload built for task type: ${dto.taskType} (${payloadSummary}).`,
      );

      const response = await this.llmService.send(message);
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
}
