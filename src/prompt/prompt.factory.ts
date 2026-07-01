import { Injectable, Logger } from '@nestjs/common';

import { ImagePrompt } from './image.prompt';
import { Prompt } from './prompt.base';
import { TablePrompt } from './table.prompt';
import { TextPrompt } from './text.prompt';
import { readMarkdown } from '../common/file-utilities';
import {
  CreateAssessorDto,
  TaskType,
} from '../v1/assessor/dto/create-assessor.dto';

/**
 * Factory service for creating task-specific prompt instances.
 *
 * This factory implements the Factory pattern to create appropriate prompt
 * objects based on the type of assessment task (TEXT, TABLE, or IMAGE).
 * It handles the loading of prompt templates from markdown files and
 * instantiates the correct prompt subclass with the necessary configuration.
 */
@Injectable()
export class PromptFactory {
  private readonly logger = new Logger(PromptFactory.name);

  /**
   * Creates an appropriate prompt instance based on the provided assessment data.
   *
   * This method orchestrates the creation of task-specific prompts by:
   * 1. Extracting input data from the DTO
   * 2. Determining the correct prompt template files
   * 3. Loading system prompts from markdown files
   * 4. Instantiating the appropriate prompt subclass
   *
   * @param dto - Data transfer object containing task type and assessment data
   * @returns A promise resolving to a task-specific prompt instance
   * @throws Error if the task type is unsupported
   */
  public async create(dto: CreateAssessorDto): Promise<Prompt> {
    this.logger.log(`Creating prompt for task type: ${dto.taskType}.`);
    const inputs = {
      referenceTask: dto.reference,
      studentTask: dto.studentResponse,
      emptyTask: dto.template,
    };

    // Determine and load prompt files
    const { systemPromptFile, userTemplateFile } = this.getPromptFiles(
      dto.taskType,
    );
    this.logger.debug(
      `Selected prompt templates for task type ${dto.taskType}: ` +
        `system=${systemPromptFile ?? 'none'}, user=${userTemplateFile ?? 'none'}.`,
    );
    const systemPrompt = await this.loadSystemPrompt(systemPromptFile);

    // Instantiate the appropriate Prompt subclass
    const prompt = this.instantiatePrompt(
      dto,
      inputs,
      userTemplateFile,
      systemPrompt,
    );
    this.logger.debug(
      `Instantiated prompt ${prompt.constructor.name} for task type: ${dto.taskType}.`,
    );
    return prompt;
  }

  /**
   * Determines the appropriate prompt template files based on task type.
   *
   * Different task types require different prompt templates for optimal
   * LLM performance. This method maps task types to their corresponding
   * system and user prompt template files.
   *
   * @param taskType - The type of assessment task
   * @returns Object containing the names of system and user prompt template files
   * @throws Error if the task type is not supported
   */
  private getPromptFiles(taskType: TaskType): {
    systemPromptFile?: string;
    userTemplateFile?: string;
  } {
    switch (taskType) {
      case TaskType.TEXT:
        return {
          systemPromptFile: 'text.system.prompt.md',
          userTemplateFile: 'text.user.prompt.md',
        };
      case TaskType.TABLE:
        return {
          systemPromptFile: 'table.system.prompt.md',
          userTemplateFile: 'table.user.prompt.md',
        };
      case TaskType.IMAGE:
        return {
          systemPromptFile: 'image.system.prompt.md',
          userTemplateFile: undefined,
        };
      default:
        throw new Error(`Unsupported task type: ${String(taskType)}`);
    }
  }

  /**
   * Loads system prompt content from a markdown template file.
   *
   * System prompts provide the LLM with context and instructions for
   * how to approach the assessment task. This method safely loads
   * the content from markdown files in the templates directory.
   *
   * @param systemPromptFile - Name of the system prompt markdown file
   * @returns Promise resolving to the prompt content, or undefined if no file specified
   */
  private async loadSystemPrompt(
    systemPromptFile?: string,
  ): Promise<string | undefined> {
    if (systemPromptFile) {
      try {
        const prompt = await readMarkdown(systemPromptFile);
        this.logger.debug(
          `Loaded system prompt template: ${systemPromptFile}.`,
        );
        return prompt;
      } catch (error) {
        this.logger.error(
          `Failed to load system prompt template: ${systemPromptFile}.`,
          error instanceof Error ? error.stack : undefined,
        );
        throw error;
      }
    }
    return undefined;
  }

  /**
   * Instantiates the appropriate prompt subclass based on task type.
   *
   * This method creates the specific prompt implementation (TextPrompt,
   * TablePrompt, or ImagePrompt) with the appropriate configuration
   * for the given task type and input data.
   *
   * @param dto - The assessment data transfer object
   * @param inputs - Validated prompt input data
   * @param userTemplateFile - Name of the user template file (if applicable)
   * @param systemPrompt - System prompt content (if applicable)
   * @returns Configured prompt instance ready for message generation
   * @throws Error if the task type is not supported
   */
  private instantiatePrompt(
    dto: CreateAssessorDto,
    inputs: unknown,
    userTemplateFile?: string,
    systemPrompt?: string,
  ): Prompt {
    switch (dto.taskType) {
      case TaskType.TEXT:
        return new TextPrompt(
          inputs,
          this.logger,
          userTemplateFile,
          systemPrompt,
        );
      case TaskType.TABLE:
        return new TablePrompt(
          inputs,
          this.logger,
          userTemplateFile,
          systemPrompt,
        );
      case TaskType.IMAGE: {
        const imageInputs = {
          referenceTask: Buffer.isBuffer(dto.reference)
            ? dto.reference.toString()
            : dto.reference,
          studentTask: Buffer.isBuffer(dto.studentResponse)
            ? dto.studentResponse.toString()
            : dto.studentResponse,
          emptyTask: Buffer.isBuffer(dto.template)
            ? dto.template.toString()
            : dto.template,
        };
        return new ImagePrompt(
          imageInputs,
          this.logger,
          dto.images,
          systemPrompt,
        );
      }
      default:
        throw new Error('Unsupported task type');
    }
  }
}
