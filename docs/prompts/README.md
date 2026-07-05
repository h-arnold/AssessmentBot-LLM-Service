# Prompt System

This document outlines the architecture and development process for the prompt generation system used in the Assessment Bot LLM Service.

## Architecture

The system uses a combination of the **Factory** and **Template Method** design patterns to generate task-specific prompts for the LLM.

### Core Components

1.  **`Prompt` (Abstract Base Class)**: Located in `src/prompt/prompt.base.ts`, this class provides foundational functionality for all prompts, including input validation via the `PromptInputSchema` (Zod), and a common `buildMessage()` interface.

    ```typescript
    // src/prompt/prompt.base.ts
    export abstract class Prompt {
      // ...
      public async buildMessage(): Promise<LlmPayload>;
      // ...
    }
    ```

2.  **Concrete `Prompt` Implementations**:
    - **`TextPrompt` & `TablePrompt`**: Simple implementations for text and table-based tasks. They use the base class's `buildMessage()` method, which renders a Mustache template.
    - **`ImagePrompt`**: A specialised implementation for multimodal tasks. It overrides `buildMessage()` to handle image processing, supporting both file paths and Base64 data URIs. It includes security checks to prevent path traversal and validate MIME types.

3.  **`PromptFactory`**: A NestJS injectable service (`src/prompt/prompt.factory.ts`) that instantiates the correct prompt class based on the `TaskType` from the `CreateAssessorDto`. It is responsible for loading the necessary template files from the filesystem.

## How It Works

The prompt generation process integrates into the assessment workflow as follows:

1.  The `AssessorService` receives a `CreateAssessorDto`.
2.  It calls `PromptFactory.create(dto)`.
3.  The factory identifies the `taskType` and determines the correct prompt class and template files.
4.  It loads the system prompt markdown file from `src/prompt/templates/`.
5.  It instantiates the corresponding prompt class (e.g., `new TextPrompt(...)`).
6.  The `AssessorService` then calls `prompt.buildMessage()` on the instance.
7.  This method builds the final `LlmPayload`, rendering the user prompt template with task data for text/table tasks, or processing images for image tasks.
8.  The resulting payload is sent to the `LlmService`.

```typescript
// Example from AssessorService
async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
  const prompt = await this.promptFactory.create(dto);
  const message = await prompt.buildMessage();
  return this.llmService.send(message);
}
```

## Template System

The system uses Markdown files with Mustache for templating.

- **Location**: All templates are stored in `src/prompt/templates/`.
- **System Prompts** (`*.system.prompt.md`): Define the LLM's role, the assessment criteria, and the required JSON output structure.
- **User Prompts** (`*.user.prompt.md`): Structure the data (reference, student, and empty tasks) for the LLM. These are not used by `ImagePrompt`, as images are sent directly.

### Template Variables

User templates can use the following Mustache variables. The triple braces `{{{...}}}` are important to prevent HTML escaping.

- `{{{referenceTask}}}`: The model/reference solution.
- `{{{studentTask}}}`: The student's submission.
- `{{{emptyTask}}}`: The original task template.

```markdown
<!-- src/prompt/templates/text.user.prompt.md -->

## Reference Task

### This task would score 5 across all criteria

{{{referenceTask}}}

## Student Task

### This is the task you are assessing

{{{studentTask}}}
```

## Extending the System (Adding a New Prompt Type)

Follow these steps to add support for a new task type (e.g., `EXAM_QUESTION`):

1.  **Update DTO**: In `src/v1/assessor/dto/create-assessor.dto.ts`:
    - Add the new type to the `TaskType` enum.
    - Add a new schema to the `z.discriminatedUnion`.

    ```typescript
    // src/v1/assessor/dto/create-assessor.dto.ts
    export enum TaskType {
      TEXT = 'TEXT',
      TABLE = 'TABLE',
      IMAGE = 'IMAGE',
      EXAM_QUESTION = 'EXAM_QUESTION', // New task type
    }

    export const createAssessorDtoSchema = z.discriminatedUnion('taskType', [
      // ... existing schemas
      z.object({
        taskType: z.literal(TaskType.EXAM_QUESTION),
        // ... other properties
      }),
    ]);
    ```

2.  **Create Prompt Class**: Create `src/prompt/exam-question.prompt.ts` with a class that extends `Prompt`.

    ```typescript
    // src/prompt/exam-question.prompt.ts
    import { Prompt } from './prompt.base';

    export class ExamQuestionPrompt extends Prompt {
      // ... custom logic for exam questions if needed
    }
    ```

3.  **Add Templates**: Create `exam-question.system.prompt.md` and `exam-question.user.prompt.md` in `src/prompt/templates/`.

4.  **Update Factory**: In `src/prompt/prompt.factory.ts`, add cases for the new type.

    ```typescript
    // src/prompt/prompt.factory.ts
    private getPromptFiles(taskType: TaskType) {
      switch (taskType) {
        // ...
        case TaskType.EXAM_QUESTION:
          return {
            systemPromptFile: 'exam-question.system.prompt.md',
            userTemplateFile: 'exam-question.user.prompt.md',
          };
      }
    }

    private instantiatePrompt(dto: CreateAssessorDto, /*...*/) {
      switch (dto.taskType) {
        // ...
        case TaskType.EXAM_QUESTION:
          return new ExamQuestionPrompt(/*...*/);
      }
    }
    ```

5.  **Add Tests**: Create comprehensive unit, integration, and E2E tests.

    ```typescript
    // test/assessor.e2e-spec.ts
    it('/v1/assess (POST) should handle exam question tasks', () => {
      return request(app.getHttpServer())
        .post('/v1/assess')
        .send({
          taskType: 'EXAM_QUESTION',
          // ...
        })
        .expect(201);
    });
    ```

## Testing

The prompt system is tested at multiple levels. Developers should refer to existing tests as the primary source of documentation on how to test new features.

- **Unit Tests**: Co-located with the source code (e.g., `image.prompt.spec.ts`).
- **Integration Tests**: The prompt factory is tested in `prompt.factory.spec.ts`.
- **End-to-End Tests**: The full assessment flow is tested in `test/assessor.e2e-spec.ts`.
