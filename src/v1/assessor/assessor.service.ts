import { Inject, Injectable, Logger } from '@nestjs/common';

import { CreateAssessorDto } from './dto/create-assessor.dto.js';
import type { ILlmService } from '../../llm/llm.service.interface.js';
import {
  getPayloadTypeName,
  LLM_SERVICE_TOKEN,
  LlmPayload,
} from '../../llm/llm.service.interface.js';
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
   * @param llmService - The service responsible for interacting
   *   with the LLM.
   * @param promptFactory - The factory responsible for
   *   generating prompts for the LLM.
   */
  constructor(
    @Inject(LLM_SERVICE_TOKEN) private readonly llmService: ILlmService,
    private readonly promptFactory: PromptFactory,
  ) {}

  /**
   * Creates an assessment based on the provided data transfer object (DTO).
   *
   * This method generates a prompt using the `promptFactory`, builds a message,
   * and sends it to the LLM service for processing.
   * @param dto - The data transfer object containing the
   *   details required to create an assessment.
   * @returns A promise that resolves to an LlmResponse
   *   containing the result of the assessment.
   */
  async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
    this.logger.log(`Creating assessment for task type: ${dto.taskType}.`);
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
  }

  /**
   * Describes an LLM payload for debug logging — determines whether it is an
   * image, text, or conversation payload and returns a human-readable summary
   * string.
   * @param message The LLM payload to describe.
   * @returns A human-readable summary string.
   */
  private describePayloadSummary(message: LlmPayload): string {
    switch (getPayloadTypeName(message)) {
      case 'image': {
        if (!('images' in message) || !Array.isArray(message.images)) break;
        const count = message.images.length;
        return `image prompt with ${count} image${count === 1 ? '' : 's'}`;
      }
      case 'text': {
        if (!('user' in message) || typeof message.user !== 'string') break;
        const length = message.user.length;
        return `text prompt with ${length} character${length === 1 ? '' : 's'}`;
      }
      case 'conversation': {
        if (!('messages' in message) || !Array.isArray(message.messages)) break;
        const count = message.messages.length;
        return `conversation prompt with ${count} message${count === 1 ? '' : 's'}`;
      }
    }
    throw new Error('Unsupported payload type');
  }
}
