# LLM Module

The LLM Module (`src/llm/`) provides Large Language Model integration services for the Assessment Bot LLM Service application, implementing an abstract service layer with Google Gemini as the concrete implementation.

## Overview

The LLM Module serves as the AI integration foundation that:

- Provides an abstract `LLMService` interface for swappable LLM providers
- Implements Google Gemini integration with automatic model selection
- Manages robust error handling with exponential backoff retry logic
- Supports both text-only and multimodal (text + images) assessment requests
- Validates LLM responses against strict Zod schemas for type safety
- Handles resource exhaustion and rate limiting scenarios gracefully

## Module Structure

```typescript
@Module({
  imports: [ConfigModule, CommonModule],
  providers: [
    GeminiService,
    {
      provide: LLMService,
      useClass: GeminiService,
    },
  ],
  exports: [LLMService],
})
export class LlmModule {}
```

## Key Components

### 1. LLMService (Abstract Base Class)

**Location:** `src/llm/llm.service.interface.ts`

The abstract service provides common functionality and retry logic:

**Key Features:**

- **Retry Logic:** Exponential backoff for rate limit errors (HTTP 429)
- **Resource Exhaustion Handling:** Immediate failure for quota exceeded errors
- **Error Classification:** Distinguishes between retryable and non-retryable errors
- **Configuration Integration:** Uses configurable retry limits and backoff timing

```typescript
async send(payload: LlmPayload): Promise<LlmResponse> {
  const maxRetries = this.configService.get('LLM_MAX_RETRIES');
  const baseBackoffMs = this.configService.get('LLM_BACKOFF_BASE_MS');

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await this._sendInternal(payload);
    } catch (error) {
      // Handle resource exhausted vs retryable errors
      if (this.isResourceExhaustedError(error)) {
        throw new ResourceExhaustedError('API quota exhausted...');
      }
      // Apply exponential backoff for rate limits
    }
  }
}
```

### 2. GeminiService (Concrete Implementation)

**Location:** `src/llm/gemini.service.ts`

Implements Google Gemini-specific functionality:

**Features:**

- **Automatic Model Selection:** Chooses optimal model based on payload type
  - `gemini-2.5-flash-lite` for text-only requests
  - `gemini-2.5-flash` for multimodal (image) requests
- **Multimodal Support:** Handles text and image inputs seamlessly
- **JSON Response Parsing:** Robust JSON extraction with repair capabilities
- **Comprehensive Logging:** Detailed request/response logging for debugging

**Model Selection Logic:**

```typescript
private buildModelParams(payload: LlmPayload): ModelParams {
  const modelName = this.isImagePromptPayload(payload)
    ? 'gemini-2.5-flash'      // Multimodal model for images
    : 'gemini-2.0-flash-lite'; // Fast model for text-only

  return {
    model: modelName,
    systemInstruction: payload.system,
    generationConfig: { temperature: payload.temperature ?? 0 },
    // Disable additional thinking budget as per Gemini guidance
    thinking: { budget: 0 },
  };
}
```

### 3. Payload Types

The module supports two primary payload types:

#### StringPromptPayload

For text-only assessment requests:

```typescript
type StringPromptPayload = {
  system: string; // System instruction/context
  user: string; // User prompt/question
  temperature?: number; // Sampling temperature (default: 0)
};
```

#### ImagePromptPayload

For multimodal assessment requests with images:

```typescript
type ImagePromptPayload = {
  system: string; // System instruction/context
  images: Array<{
    // Image data array
    mimeType: string;
    data?: string; // Base64 encoded image data
    uri?: string; // File URI for uploaded images
  }>;
  messages?: Array<{
    // Optional text messages
    content: string;
  }>;
  temperature?: number; // Sampling temperature (default: 0)
};
```

### 4. Response Validation

**Location:** `src/llm/types.ts`

The module enforces strict response validation using Zod schemas:

```typescript
const AssessmentCriterionSchema = z.object({
  score: z.number().int().min(0).max(5),
  reasoning: z.string().min(1),
});

const LlmResponseSchema = z.object({
  completeness: AssessmentCriterionSchema,
  accuracy: AssessmentCriterionSchema,
  spag: AssessmentCriterionSchema,
});
```

**Validation Features:**

- **Score Range:** Ensures scores are integers between 0-5
- **Required Reasoning:** Mandates non-empty reasoning for each criterion
- **Structure Validation:** Enforces exact response structure
- **Type Safety:** Provides TypeScript types derived from schemas

### 5. Error Handling

#### ResourceExhaustedError

**Location:** `src/llm/resource-exhausted.error.ts`

Custom error for API quota exhaustion:

```typescript
export class ResourceExhaustedError extends Error {
  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'ResourceExhaustedError';
  }
}
```

#### Error Classification

The service distinguishes between different error types:

1. **Resource Exhausted (Non-retryable):**
   - HTTP 429 with quota exhaustion patterns
   - Message patterns: "resource_exhausted", "quota exceeded"
   - Immediate failure with `ResourceExhaustedError`

2. **Rate Limit (Retryable):**
   - HTTP 429 without quota exhaustion patterns
   - Exponential backoff retry logic applied
   - Maximum retries configured via environment

3. **Validation Errors:**
   - Zod validation failures on LLM responses
   - Immediate failure with detailed error information

## Retry Logic and Resilience

### Exponential Backoff

The service implements sophisticated retry logic:

1. **Rate Limit Detection:** Identifies HTTP 429 errors
2. **Exponential Backoff:** `delay = baseBackoffMs * (2^attempt) + random(100)`
3. **Jitter Addition:** Random component prevents thundering herd
4. **Maximum Retries:** Configurable retry limit prevents infinite loops

### Resource Exhaustion Handling

- **Immediate Failure:** No retries attempted for quota errors
- **Error Preservation:** Original error attached for debugging
- **Clear Messaging:** User-friendly error messages for quota issues

## Configuration

### Environment Variables

- **`GEMINI_API_KEY`**: Google Gemini API key (required)
- **`LLM_MAX_RETRIES`**: Maximum retry attempts for rate limits (default: 3)
- **`LLM_BACKOFF_BASE_MS`**: Base backoff time in milliseconds (default: 1000)

### Model Configuration

- **Text Model:** `gemini-2.5-flash-lite` (fast, efficient for all tasks)
- **Image Model:** `gemini-2.5-flash-lite` (multimodal capabilities)
- **Temperature:** Defaults to 0 for consistent, deterministic responses

## Usage Examples

### Text-Only Assessment

```typescript
const textPayload: StringPromptPayload = {
  system: 'You are an assessment expert...',
  user: "Evaluate this student response: 'The earth is round.'",
  temperature: 0,
};

const response = await llmService.send(textPayload);
// Returns: { completeness: {...}, accuracy: {...}, spag: {...} }
```

### Multimodal Assessment with Images

```typescript
const imagePayload: ImagePromptPayload = {
  system: 'You are an assessment expert for visual tasks...',
  images: [
    {
      mimeType: 'image/png',
      data: 'base64-encoded-image-data...',
    },
  ],
  messages: [{ content: "Evaluate this student's drawing." }],
};

const response = await llmService.send(imagePayload);
```

### Error Handling

```typescript
try {
  const response = await llmService.send(payload);
  // Process successful response
} catch (error) {
  if (error instanceof ResourceExhaustedError) {
    // Handle quota exhaustion - inform user to upgrade
    console.error('API quota exceeded:', error.message);
  } else if (error instanceof ZodError) {
    // Handle validation errors - log for debugging
    console.error('Invalid LLM response structure:', error.issues);
  } else {
    // Handle other errors
    console.error('LLM service error:', error.message);
  }
}
```

## Logging and Debugging

The module provides comprehensive logging:

### Request Logging

- **Model Selection:** Logs chosen model and temperature
- **Payload Type:** Distinguishes between text and image payloads
- **Content Summary:** Logs content without exposing sensitive image data

### Response Logging

- **Raw Response:** Full LLM response text
- **Parsed JSON:** Structured parsed response
- **Validation Results:** Success/failure of schema validation

### Error Logging

- **Retry Attempts:** Logs each retry attempt with backoff delay
- **Error Classification:** Logs error type and handling decision
- **Validation Failures:** Detailed Zod error information

## Testing

The module includes comprehensive test coverage:

### Unit Tests

- **Service Instantiation:** Tests service creation and configuration
- **Payload Processing:** Tests payload type detection and processing
- **Model Selection:** Tests automatic model selection logic
- **Response Validation:** Tests Zod schema validation
- **Error Handling:** Tests retry logic and error classification

### Integration Tests

- **End-to-End Flow:** Tests complete request/response cycle
- **Error Scenarios:** Tests various error conditions and handling
- **Resource Exhaustion:** Tests quota exhaustion error handling

## Dependencies

The LLM Module depends on:

- **@google/generative-ai** - Google Gemini API client
- **ConfigModule** - Environment configuration management
- **CommonModule** - Shared utilities (JsonParserUtil)
- **zod** - Runtime type validation and schema enforcement
- **jsonrepair** - JSON response repair and parsing

## Related Documentation

- [Assessor Module](assessor.md) - Core assessment functionality that uses LLM services
- [Prompt Module](prompt.md) - Prompt generation that creates LLM payloads
- [Common Module](common.md) - Shared utilities including JSON parsing
- [Configuration Guide](../configuration/environment.md) - Environment setup
- [LLM Configuration](../configuration/llm.md) - LLM-specific configuration
