# Prompt Module

The Prompt Module (`src/prompt/`) provides prompt generation and management services for the Assessment Bot LLM Service application, implementing a factory pattern to create task-specific prompts for LLM assessment requests.

## Overview

The Prompt Module serves as the prompt orchestration layer that:

- Implements the Factory pattern for creating task-specific prompt instances
- Manages template loading and rendering using Mustache templating engine
- Provides base prompt functionality with input validation and logging
- Supports three task types: TEXT, TABLE, and IMAGE prompts
- Handles both file-based and data URI-based image processing
- Ensures security through validated file access and path traversal protection

## Module Structure

```typescript
@Module({
  providers: [PromptFactory, Logger],
  exports: [PromptFactory],
})
export class PromptModule {}
```

## Key Components

### 1. PromptFactory

**Location:** `src/prompt/prompt.factory.ts`

The factory service orchestrates prompt creation with a systematic approach:

**Creation Process:**

1. **Input Extraction:** Extracts assessment data from the DTO
2. **Template Selection:** Determines appropriate template files based on task type
3. **System Prompt Loading:** Loads system prompts from markdown files
4. **Prompt Instantiation:** Creates the appropriate prompt subclass

```typescript
public async create(dto: CreateAssessorDto): Promise<Prompt> {
  const inputs = {
    referenceTask: dto.reference,
    studentTask: dto.studentResponse,
    emptyTask: dto.template,
  };

  const { systemPromptFile, userTemplateFile } = this.getPromptFiles(dto.taskType);
  const systemPrompt = await this.loadSystemPrompt(systemPromptFile);

  return this.instantiatePrompt(dto, inputs, userTemplateFile, systemPrompt);
}
```

**Template File Mapping:**

- **TEXT tasks:** `text.system.prompt.md` + `text.user.prompt.md`
- **TABLE tasks:** `table.system.prompt.md` + `table.user.prompt.md`
- **IMAGE tasks:** `image.system.prompt.md` + no user template (images embedded directly)

### 2. Prompt (Abstract Base Class)

**Location:** `src/prompt/prompt.base.ts`

Provides common functionality for all prompt implementations:

**Core Features:**

- **Input Validation:** Uses Zod schemas to validate prompt inputs
- **Template Rendering:** Mustache templating with substitution variables
- **Logging Integration:** Comprehensive logging of prompt operations
- **Common Properties:** Manages reference task, student task, and empty task data

```typescript
export abstract class Prompt {
  protected referenceTask!: string;
  protected studentTask!: string;
  protected emptyTask!: string;

  constructor(
    inputs: unknown,
    logger: Logger,
    userTemplateName?: string,
    systemPrompt?: string,
  ) {
    const parsed: PromptInput = PromptInputSchema.parse(inputs);
    this.referenceTask = parsed.referenceTask;
    this.studentTask = parsed.studentTask;
    this.emptyTask = parsed.emptyTask;
  }

  protected render(template: string, data: Record<string, string>): string {
    return Mustache.render(template, data);
  }
}
```

**Input Schema:**

```typescript
const PromptInputSchema = z.object({
  referenceTask: z.string(), // Reference/model solution
  studentTask: z.string(), // Student's submitted response
  emptyTask: z.string(), // Original task template
});
```

### 3. Prompt Implementations

#### TextPrompt

**Location:** `src/prompt/text.prompt.ts`

Handles text-based assessment tasks:

- **Template:** Uses `text.user.prompt.md` for user message generation
- **Use Cases:** Essays, written responses, textual analysis tasks
- **Processing:** Inherits standard text processing from base class

#### TablePrompt

**Location:** `src/prompt/table.prompt.ts`

Handles table-based assessment tasks:

- **Template:** Uses `table.user.prompt.md` for user message generation
- **Use Cases:** CSV data, spreadsheet tasks, tabular responses
- **Processing:** Inherits standard text processing from base class

#### ImagePrompt

**Location:** `src/prompt/image.prompt.ts`

Handles image-based assessment tasks with advanced multimodal capabilities:

**Features:**

- **Dual Input Support:** File-based images and data URI images
- **Security Measures:** Path traversal protection and MIME type validation
- **Base64 Conversion:** Automatic conversion for LLM compatibility
- **Secure File Access:** Restricted to authorised directories only

```typescript
public async buildMessage(): Promise<LlmPayload> {
  let images: { data: string; mimeType: string }[];

  if (this.images.length > 0) {
    images = await this.buildImagesFromFiles();
  } else {
    images = this.buildImagesFromDataUris();
  }

  return {
    system: this.systemPrompt ?? '',
    images: images,
  };
}
```

**Security Features:**

- **Path Validation:** Blocks `..` path traversal attempts
- **Directory Restriction:** Only allows access to authorised image directories
- **MIME Type Validation:** Enforces allowed image types from configuration
- **Safe File Reading:** Validates paths before filesystem access

## Template System

### Template Files

The module uses Markdown template files stored in `src/prompt/templates/`:

#### System Prompts

- **`text.system.prompt.md`** - Instructions for text assessment
- **`table.system.prompt.md`** - Instructions for table assessment
- **`image.system.prompt.md`** - Instructions for image assessment

#### User Templates

- **`text.user.prompt.md`** - User message template for text tasks
- **`table.user.prompt.md`** - User message template for table tasks

### Template Variables

Templates use Mustache syntax with these standard variables:

```mustache
## Reference Task
### This task would score 5 across all criteria
{{{referenceTask}}}

## Template Task
### This task would score 0 across all criteria
{{{emptyTask}}}

## Student Task
### This is the task you are assessing
{{{studentTask}}}
```

### Assessment Criteria

All prompts generate responses following the standardised assessment criteria:

1. **Completeness (0-5):** Extent of task completion attempt
2. **Accuracy (0-5):** Factual correctness and validity
3. **SPAG (0-5):** Spelling, Punctuation, and Grammar quality

**Expected JSON Response Format:**

```json
{
  "completeness": {
    "score": 4,
    "reasoning": "Comprehensive response with minor gaps."
  },
  "accuracy": {
    "score": 5,
    "reasoning": "All facts and details are correct."
  },
  "spag": {
    "score": 3,
    "reasoning": "Some spelling and grammar errors present."
  }
}
```

## Message Generation Flow

### Text and Table Prompts

1. **Template Loading:** Loads user template from markdown file
2. **Variable Substitution:** Renders template with assessment data
3. **Payload Creation:** Creates StringPromptPayload with system + user messages

### Image Prompts

1. **Image Processing:** Handles file-based or data URI images
2. **Security Validation:** Validates paths and MIME types
3. **Base64 Conversion:** Converts images to base64 format
4. **Payload Creation:** Creates ImagePromptPayload with system prompt + images

## Security Features

### File Access Security

- **Path Traversal Protection:** Blocks `..` sequences in file paths
- **Directory Whitelist:** Restricts access to specific authorised directories
- **MIME Type Validation:** Ensures only allowed image types are processed
- **Path Resolution Validation:** Verifies resolved paths stay within bounds

### Input Validation

- **Zod Schema Validation:** Runtime validation of all prompt inputs
- **Type Safety:** Strong typing prevents data corruption
- **Required Field Enforcement:** Ensures all necessary data is present

### Logging and Monitoring

- **Input Length Logging:** Logs size of each input for monitoring
- **Template Rendering Logs:** Tracks template processing operations
- **Security Event Logging:** Records blocked access attempts
- **Debug Information:** Comprehensive debugging information

## Configuration

### Environment Variables

- **`ALLOWED_IMAGE_MIME_TYPES`** - Comma-separated list of allowed image MIME types
  - Example: `image/png,image/jpeg,image/gif`
  - Used for image validation in ImagePrompt

### Template Directories

- **System Templates:** `src/prompt/templates/*.system.prompt.md`
- **User Templates:** `src/prompt/templates/*.user.prompt.md`
- **Image Directory:** `docs/ImplementationPlan/Stage6/ExampleData/ImageTasks`

## Usage Examples

### Text Assessment Prompt

```typescript
const dto: CreateAssessorDto = {
  taskType: TaskType.TEXT,
  reference: 'A comprehensive essay about climate change impacts...',
  template: 'Write an essay about climate change.',
  studentResponse: 'Climate change is affecting our planet...',
};

const prompt = await promptFactory.create(dto);
const message = await prompt.buildMessage();
// Returns: { system: "...", user: "..." }
```

### Table Assessment Prompt

```typescript
const dto: CreateAssessorDto = {
  taskType: TaskType.TABLE,
  reference: 'Name,Age,City\nJohn,25,London\nJane,30,Paris',
  template: 'Create a table with personal information.',
  studentResponse: 'Person,Years,Location\nBob,28,Berlin',
};

const prompt = await promptFactory.create(dto);
const message = await prompt.buildMessage();
```

### Image Assessment Prompt

```typescript
const dto: CreateAssessorDto = {
  taskType: TaskType.IMAGE,
  reference: 'data:image/png;base64,iVBORw0KGgo...',
  template: 'data:image/png;base64,iVBORw0KGgo...',
  studentResponse: 'data:image/png;base64,iVBORw0KGgo...',
  images: [{ path: 'reference.png', mimeType: 'image/png' }],
};

const prompt = await promptFactory.create(dto);
const message = await prompt.buildMessage();
// Returns: { system: "...", images: [...] }
```

## Error Handling

The module provides comprehensive error handling:

### Validation Errors

- **Zod Validation Failures:** Clear error messages for invalid inputs
- **Type Mismatches:** Runtime protection against incorrect data types
- **Required Field Missing:** Specific errors for missing required data

### Security Errors

- **Path Traversal Attempts:** `"Invalid image filename"` for `..` sequences
- **Unauthorised Paths:** `"Unauthorised file path"` for out-of-bounds access
- **Invalid MIME Types:** `"Disallowed image MIME type"` for restricted formats

### Template Errors

- **Missing Templates:** File not found errors for missing template files
- **Rendering Errors:** Mustache template syntax or variable errors
- **Template Loading:** Filesystem access errors for template files

## Testing

The module includes comprehensive test coverage:

### Unit Tests

- **Factory Creation:** Tests prompt factory instantiation and dependency injection
- **Task Type Mapping:** Tests correct prompt class selection for each task type
- **Template Loading:** Tests system prompt loading from markdown files
- **Input Validation:** Tests Zod schema validation and error handling

### Integration Tests

- **End-to-End Prompt Creation:** Tests complete factory to message generation flow
- **Template Rendering:** Tests Mustache template processing with real data
- **Image Processing:** Tests both file-based and data URI image handling
- **Security Validation:** Tests path traversal protection and access controls

## Dependencies

The Prompt Module depends on:

- **mustache** - Template rendering engine for variable substitution
- **@nestjs/common** - NestJS core functionality and logging
- **zod** - Runtime type validation and schema enforcement
- **fs/promises** - Asynchronous file system operations for template loading
- **path** - Path manipulation utilities for secure file access

## Related Documentation

- [Assessor Module](assessor.md) - Core assessment functionality that uses prompts
- [LLM Module](llm.md) - LLM services that process prompt payloads
- [Common Module](common.md) - Shared utilities including file operations
- [Configuration Guide](../configuration/environment.md) - Environment setup
- [Prompt System Documentation](../prompts/README.md) - Detailed prompt system architecture
