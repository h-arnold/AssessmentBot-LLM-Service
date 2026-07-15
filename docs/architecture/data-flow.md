# Data Flow

Request/response flow from HTTP request to LLM response.

```mermaid
sequenceDiagram
    participant Client as API Client
    participant Guard as Auth Guard
    participant Throttle as Rate Limiter
    participant Controller as Assessor Controller
    participant Service as Assessor Service
    participant Factory as Prompt Factory
    participant Prompt as Prompt Instance
    participant LLM as LLM Service
    participant Gemini as Gemini API

    Client->>+Guard: POST /v1/assessor + API Key
    Guard->>Guard: Validate API Key
    Guard->>+Throttle: Forward Request
    Throttle->>Throttle: Check Rate Limits
    Throttle->>+Controller: Forward Request
    Controller->>Controller: Validate DTO Schema
    Controller->>Controller: Validate Images (if IMAGE task)
    Controller->>+Service: createAssessment(dto)
    Service->>+Factory: create(dto)
    Factory->>Factory: Determine Task Type
    Factory->>Factory: Load Template Files
    Factory->>+Prompt: new TextPrompt/TablePrompt/ImagePrompt
    Prompt->>Prompt: Validate Inputs
    Prompt-->>-Factory: Prompt Instance
    Factory-->>-Service: Prompt Instance
    Service->>+Prompt: buildMessage()
    Prompt->>Prompt: Load User Template
    Prompt->>Prompt: Render with Mustache
    Prompt-->>-Service: LlmPayload
    Service->>+LLM: send(payload)
    LLM->>LLM: Retry Logic & Error Handling
    LLM->>+Gemini: API Call
    Gemini-->>-LLM: Raw Response
    LLM->>LLM: Parse & Validate JSON
    LLM-->>-Service: LlmResponse
    Service-->>-Controller: LlmResponse
    Controller-->>-Throttle: HTTP Response
    Throttle-->>-Guard: HTTP Response
    Guard-->>-Client: HTTP Response
```

## Flow Steps

### 1. Request Entry

`POST /v1/assessor` — received by NestJS, processed through middleware with logging and data redaction.

### 2. Security Layer

- **Authentication**: `ApiKeyGuard` validates Bearer token from `Authorization` header; rejects with 401 if invalid.
- **Rate Limiting**: `ThrottlerGuard` enforces per-time-window limits; returns 429 if exceeded.

### 3. Controller Layer

`AssessorController` validates the request body via `ZodValidationPipe` against `createAssessorDtoSchema`, performing task-type-specific checks (e.g. image format and size for `IMAGE` tasks).

### 4. Service Layer

`AssessorService.createAssessment()` orchestrates the workflow: delegates prompt creation to `PromptFactory`, triggers message building, and sends the payload to the LLM.

### 5. Prompt Generation

`PromptFactory` instantiates the correct prompt type (Text, Table, or Image) based on task type. The prompt validates inputs, loads Markdown templates, and renders them with Mustache using assessment variables (`{{referenceTask}}`, `{{studentTask}}`, `{{emptyTask}}`).

### 6. LLM Integration

`LLMService.send()` applies exponential backoff retry on rate limits (up to `LLM_MAX_RETRIES` times), calls the Gemini API via `GeminiService`, parses the response JSON (repairing with `jsonrepair` if needed), and validates against `LlmResponseSchema`.

### 7. Response Delivery

Validated `LlmResponse` is returned as HTTP 200 JSON. Error responses use appropriate HTTP codes: 400 (validation), 401 (auth), 429 (rate limit), 500 (LLM failures), 503 (resource exhausted).

## Error Handling Flow

```mermaid
graph TD
    A[Invalid Input] --> B[ZodValidationPipe]
    B --> C[ValidationException]
    C --> D[HttpExceptionFilter]
    D --> E[400 Bad Request]

    F[LLM API Call] --> G{Error Type?}
    G -->|Rate Limit| H[Exponential Backoff Retry]
    G -->|Resource Exhausted| I[503 Service Unavailable]
    G -->|Other Error| J[500 Internal Server Error]
```

---

_For architectural context, see [Architecture Overview](overview.md) and [Module Responsibilities](modules.md)._
