# Assessor Module (v1)

The Assessor Module (`src/v1/assessor/`) is the core assessment functionality of the Assessment Bot LLM Service, responsible for processing assessment requests and generating evaluations using Large Language Models. `AssessorModule` imports `ConfigModule`, `LlmModule` and `PromptModule`; authentication and throttling are applied at app level.

## Key Components

### AssessorController

**Location:** `src/v1/assessor/assessor.controller.ts`

- **Route:** `POST /v1/assessor`
- **Authentication:** Protected by `ApiKeyGuard` requiring valid API key
- **Rate Limiting:** Uses `authenticatedThrottler`, which allows a higher limit than the global unauthenticated default (see [Rate Limiting](../api/rate-limiting.md))
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
  reference: string,
  template: string,
  studentResponse: string,
  // IMAGE tasks only:
  systemPromptFile?: string
}
```

For `IMAGE` tasks, each image field must be a non-empty base64 Data URI string decoding to no more than 1 MiB. `Buffer` input is not accepted.

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
- `400 Bad Request` — Validation failed, including an image above 1 MiB decoded
- `401 Unauthorised` — Missing or invalid API key
- `413 Payload Too Large` — Request body exceeds the aggregate JSON cap (see [Config Module](config.md) for the limit)
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — LLM service error

## Related Documentation

- [LLM Module](llm.md)
- [Prompt Module](prompt.md)
- [Authentication Module](auth.md)
- [API Reference](../api/API_Documentation.md)
- [Configuration Guide](../configuration/environment.md)
