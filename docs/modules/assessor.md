# Assessor Module (v1)

The Assessor Module (`src/v1/assessor/`) is the core assessment functionality of the Assessment Bot LLM Service application, responsible for processing assessment requests and generating comprehensive evaluations using Large Language Models.

## Overview

The Assessor Module serves as the primary business logic layer that:

- Processes assessment requests for different task types (TEXT, TABLE, IMAGE)
- Coordinates between prompt generation and LLM services
- Validates input data comprehensively using Zod schemas
- Returns structured assessment results with scoring and reasoning
- Provides rate-limited, authenticated API access to assessment functionality

## Module Structure

```typescript
@Module({
  imports: [ConfigModule, LlmModule, PromptModule],
  controllers: [AssessorController],
  providers: [AssessorService],
})
export class AssessorModule {}
```

## Key Components

### 1. AssessorController

**Location:** `src/v1/assessor/assessor.controller.ts`

The controller handles HTTP requests for assessment operations:

- **Route:** `POST /v1/assessor`
- **Authentication:** Protected by `ApiKeyGuard` requiring valid API key
- **Rate Limiting:** Uses authenticated throttler configuration for stricter limits
- **Input Validation:** Multi-layer validation including Zod schema and specialised image validation

#### Request Processing Flow

1. **Authentication Check:** Validates API key via `ApiKeyGuard`
2. **Schema Validation:** Validates request body against `createAssessorDtoSchema`
3. **Image Validation:** For IMAGE tasks, performs additional validation on image data
4. **Business Logic:** Delegates to `AssessorService` for assessment processing

### 2. AssessorService

**Location:** `src/v1/assessor/assessor.service.ts`

The service orchestrates the assessment creation process:

```typescript
async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
  const prompt = await this.promptFactory.create(dto);
  const message = await prompt.buildMessage();
  return this.llmService.send(message);
}
```

**Key Responsibilities:**

- Coordinates between `PromptFactory` and `LLMService`
- Generates appropriate prompts based on task type and input data
- Manages LLM communication and response handling

### 3. Data Transfer Objects (DTOs)

**Location:** `src/v1/assessor/dto/create-assessor.dto.ts`

The module uses discriminated unions to handle different task types:

#### Task Types

1. **TEXT Tasks**
   - `reference`: Reference text content
   - `template`: Template or instructions
   - `studentResponse`: Student's text response

2. **TABLE Tasks**
   - `reference`: Reference table data (CSV format)
   - `template`: Table task instructions
   - `studentResponse`: Student's table response (CSV format)

3. **IMAGE Tasks**
   - `reference`: Reference image (base64 string or Buffer)
   - `template`: Template image (base64 string or Buffer)
   - `studentResponse`: Student's image response (base64 string or Buffer)
   - `images`: Optional array of additional image objects with path and MIME type
   - `systemPromptFile`: Optional custom system prompt file

#### Validation Rules

- **Type Safety:** Uses Zod discriminated unions for type-safe validation
- **Consistency:** For IMAGE tasks, all fields must be same type (all strings or all Buffers)
- **Required Fields:** All core fields must be non-empty strings or valid Buffers
- **Image Validation:** Additional validation for image format, size, and MIME type compliance

## API Endpoints

### POST /v1/assessor

Creates a new assessment by processing the provided task data.

**Authentication:** Bearer token (API key) required

**Rate Limiting:** Uses authenticated throttler limits (stricter than global defaults)

**Request Body:**

```typescript
{
  taskType: 'TEXT' | 'TABLE' | 'IMAGE',
  reference: string | Buffer,
  template: string | Buffer,
  studentResponse: string | Buffer,
  // IMAGE tasks only:
  images?: Array<{path: string, mimeType: string}>,
  systemPromptFile?: string
}
```

**Response:**

```typescript
{
  completeness: {
    score: number,    // 0-5
    reasoning: string
  },
  accuracy: {
    score: number,    // 0-5
    reasoning: string
  },
  spag: {
    score: number,    // 0-5
    reasoning: string
  }
}
```

**Status Codes:**

- `201 Created` - Assessment successfully created
- `400 Bad Request` - Validation failed
- `401 Unauthorised` - Missing or invalid API key
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - LLM service error

## Assessment Criteria

All assessments evaluate three core criteria:

1. **Completeness** - How thoroughly the student addressed the task requirements
2. **Accuracy** - Factual correctness and validity of the response
3. **SPAG** - Spelling, Punctuation, and Grammar quality

Each criterion receives:

- **Score:** Integer from 0-5 (5 being highest quality)
- **Reasoning:** Detailed explanation justifying the score

## Input Validation

The module implements comprehensive multi-layer validation:

### 1. Schema Validation (Zod)

- Validates request structure and data types
- Ensures required fields are present and non-empty
- Enforces task-type specific field requirements

### 2. Image Validation (IMAGE tasks only)

- **File Size:** Validates against `MAX_IMAGE_UPLOAD_SIZE_MB` configuration
- **MIME Types:** Ensures images match `ALLOWED_IMAGE_MIME_TYPES`
- **Format Validation:** Verifies image format integrity
- **Consistency:** Ensures all image fields use same data type

### 3. Business Logic Validation

- Custom validation rules via `superRefine` in Zod schema
- Contextual validation based on task type requirements

## Dependencies

The Assessor Module depends on:

- **ConfigModule** - Environment configuration and validation
- **LlmModule** - Large Language Model integration services
- **PromptModule** - Prompt generation and template management
- **AuthModule** - API key authentication (via guards)
- **ThrottlerModule** - Rate limiting functionality

## Configuration Requirements

Required environment variables:

- `API_KEYS` - Comma-separated list of valid API keys
- `MAX_IMAGE_UPLOAD_SIZE_MB` - Maximum image upload size limit
- `ALLOWED_IMAGE_MIME_TYPES` - Comma-separated list of allowed image MIME types
- `AUTHENTICATED_THROTTLER_LIMIT` - Rate limit for authenticated requests
- `THROTTLER_TTL` - Rate limiting time window

## Error Handling

The module provides comprehensive error handling:

- **Validation Errors:** Clear messages indicating specific validation failures
- **Authentication Errors:** Standardised unauthorised responses
- **LLM Errors:** Graceful handling of LLM service failures with appropriate HTTP status codes
- **Rate Limiting:** Clear indication when request limits are exceeded

## Usage Examples

### TEXT Assessment

```typescript
const textAssessment = {
  taskType: 'TEXT',
  reference:
    'The Industrial Revolution began in Britain in the late 18th century.',
  template: 'Explain when and where the Industrial Revolution began.',
  studentResponse: 'The Industrial Revolution started in England around 1750.',
};
```

### TABLE Assessment

```typescript
const tableAssessment = {
  taskType: 'TABLE',
  reference: 'Name,Age,City\nJohn,25,London\nJane,30,Paris',
  template:
    'Create a table with personal information including name, age, and city.',
  studentResponse: 'Person,Years,Location\nBob,28,Berlin\nAlice,32,Madrid',
};
```

### IMAGE Assessment

```typescript
const imageAssessment = {
  taskType: 'IMAGE',
  reference: 'data:image/png;base64,iVBORw0KGgoAAAA...',
  template: 'data:image/png;base64,iVBORw0KGgoAAAA...',
  studentResponse: 'data:image/png;base64,iVBORw0KGgoAAAA...',
};
```

## Related Documentation

- [LLM Module](llm.md) - Large Language Model integration
- [Prompt Module](prompt.md) - Prompt generation and management
- [Authentication Module](auth.md) - API key authentication
- [API Reference](../api/API_Documentation.md) - Complete API documentation
- [Configuration Guide](../configuration/environment.md) - Environment setup
