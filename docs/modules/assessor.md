# Assessor Module (v1)

The Assessor Module (`src/v1/assessor/`) is the core assessment functionality of the Assessment Bot LLM Service, responsible for processing assessment requests and generating evaluations using Large Language Models.

## Key Components

### AssessorController

**Location:** `src/v1/assessor/assessor.controller.ts`

- **Route:** `POST /v1/assessor`
- **Authentication:** Protected by `ApiKeyGuard` requiring valid API key
- **Rate Limiting:** Uses authenticated throttler configuration for stricter limits
- **Input Validation:** Multi-layer validation including Zod schema and specialised image validation

### AssessorService

**Location:** `src/v1/assessor/assessor.service.ts`

Coordinates between `PromptFactory` and `LLMService`: generates prompts based on task type and input data, then manages LLM communication and response handling.

## API Endpoint

### POST /v1/assessor

Creates a new assessment by processing the provided task data.

**Authentication:** Bearer token (API key) required

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
  completeness: { score: number, reasoning: string },  // 0-5
  accuracy:     { score: number, reasoning: string },  // 0-5
  spag:         { score: number, reasoning: string },  // 0-5
}
```

**Status Codes:**

- `201 Created` — Assessment successfully created
- `400 Bad Request` — Validation failed
- `401 Unauthorised` — Missing or invalid API key
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — LLM service error

## Dependencies

- **ConfigModule** — Environment configuration and validation
- **LlmModule** — Large Language Model integration services
- **PromptModule** — Prompt generation and template management
- **AuthModule** — API key authentication (via guards)
- **ThrottlerModule** — Rate limiting functionality

## Related Documentation

- [LLM Module](llm.md)
- [Prompt Module](prompt.md)
- [Authentication Module](auth.md)
- [API Reference](../api/API_Documentation.md)
- [Configuration Guide](../configuration/environment.md)
