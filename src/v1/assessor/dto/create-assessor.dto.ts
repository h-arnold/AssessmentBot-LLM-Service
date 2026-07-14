import { z } from 'zod';

/**
 * Defines the possible types of assessment tasks.
 */
export enum TaskType {
  TEXT = 'TEXT',
  TABLE = 'TABLE',
  IMAGE = 'IMAGE',
}

const nonEmptyString = z.string().min(1);
const bufferType = z.instanceof(Buffer);

/**
 * Zod schema for validating the CreateAssessorDto.
 * Enforces strict type checking and validation rules for assessment creation requests.
 */
export const assessorDtoSchema = z
  .discriminatedUnion('taskType', [
    z
      // For text tasks, we need to allow template and student submissions to be empty strings.
      // This is because while we'd always expect the reference task to have content, we wouldn't necessarily
      // expect the template or student content to be populated.
      .object({
        taskType: z.literal(TaskType.TEXT),
        /**
         * The reference text for TEXT taskType.
         * @example "The quick brown fox jumps over the lazy dog."
         */
        reference: z.string().min(1),
        /**
         * The template text for TEXT taskType.
         * @example "Write a sentence about a fox."
         */
        template: z.string(),
        /**
         * The student's response text for TEXT taskType.
         * @example "A fox is a mammal."
         */
        studentResponse: z.string(),
      })
      .strict(),
    z
      // Note that while the 'Text' type input needs to accept zero length strings as the inputs could easily be blank in the case of template or student submissions,
      // the Table task type will always have a markdown skeleton as an absolute minimum so we'd always expect a minimum of one character.
      .object({
        taskType: z.literal(TaskType.TABLE),
        /**
         * The reference table data for TABLE taskType.
         * @example "Header1,Header2\nRow1Col1,Row1Col2"
         */
        reference: z.string().min(1),
        /**
         * The template for TABLE taskType.
         * @example "Create a table with two columns and two rows."
         */
        template: z.string().min(1),
        /**
         * The student's response table data for TABLE taskType.
         * @example "ColA,ColB\nData1,Data2"
         */
        studentResponse: z.string().min(1),
      })
      .strict(),
    z
      .object({
        taskType: z.literal(TaskType.IMAGE),
        /**
         * The reference image data for IMAGE taskType. Can be a base64 string or Buffer.
         * @example "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
         */
        reference: z.union([nonEmptyString, bufferType]),
        /**
         * The template for IMAGE taskType. Can be a base64 string or Buffer.
         * @example "Draw a red square."
         */
        template: z.union([nonEmptyString, bufferType]),
        /**
         * The student's response image data for IMAGE taskType. Can be a base64 string or Buffer.
         * @example "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
         */
        studentResponse: z.union([nonEmptyString, bufferType]),
        systemPromptFile: z.string().optional(),
      })
      .strict(),
  ])
  .superRefine((data, context) => {
    if (data.taskType !== TaskType.IMAGE) {
      return;
    }

    const allStrings =
      typeof data.reference === 'string' &&
      typeof data.template === 'string' &&
      typeof data.studentResponse === 'string';
    const allBuffers =
      data.reference instanceof Buffer &&
      data.template instanceof Buffer &&
      data.studentResponse instanceof Buffer;

    if (!allStrings && !allBuffers) {
      context.addIssue({
        code: 'custom',
        message:
          'For IMAGE taskType, reference, template, and studentResponse must all be of the same type (either all strings or all Buffers).',
      });
    }
  });

/**
 * Represents the Data Transfer Object (DTO) for creating an assessment.
 * This type is inferred from `assessorDtoSchema`.
 */
export type CreateAssessorDto = z.infer<typeof assessorDtoSchema>;
