# Practical Testing Guide

This document provides practical examples and patterns for writing effective unit tests and managing test data in the Assessment Bot LLM Service project.

## 1. Unit & Integration Testing

Unit tests are co-located with source files (`*.spec.ts`) and focus on testing components in isolation.

### Basic Service Test Structure

When testing a service, use the `Test.createTestingModule` to provide mock implementations for its dependencies. This allows you to test the service's logic in isolation.

```typescript
// Example from src/auth/api-key.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from 'src/config'; // Adjusted import
import { ApiKeyService } from './api-key.service';
import { UnauthorizedException } from '@nestjs/common';

describe('ApiKeyService', () => {
  let service: ApiKeyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn().mockReturnValue(['valid-key-1', 'valid-key-2']),
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  it('should accept a valid API key and return user context', () => {
    const result = service.validate('valid-key-1');
    expect(result).toEqual({ apiKey: 'valid-key-1' });
  });

  it('should throw UnauthorizedException for an invalid API key', () => {
    expect(() => service.validate('invalid-key')).toThrow(
      UnauthorizedException,
    );
  });
});
```

### Testing Zod Validation Pipes

To test a `ZodValidationPipe`, create an instance with a test schema and verify that it correctly validates and transforms payloads.

```typescript
// Example from src/common/zod-validation.pipe.spec.ts
import { ZodValidationPipe } from './zod-validation.pipe';
import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    name: z.string(),
  });

  let pipe: ZodValidationPipe;

  beforeEach(() => {
    // ConfigService is optional; omit for unit tests that don't need
    // production-aware error masking
    pipe = new ZodValidationPipe(schema);
  });

  it('should return data on valid payload', () => {
    const validData = { name: 'test' };
    expect(pipe.transform(validData, {} as any)).toEqual(validData);
  });

  it('should throw BadRequestException on invalid data', () => {
    const invalidData = { name: 123 };
    expect(() => pipe.transform(invalidData, {} as any)).toThrow(
      BadRequestException,
    );
  });
});
```

### Testing DTOs

DTO validation is handled by Zod schemas. Tests should verify that the schema correctly accepts valid data and rejects invalid data.

```typescript
// Example from src/v1/assessor/dto/create-assessor.dto.spec.ts
import { createAssessorDtoSchema, TaskType } from './create-assessor.dto';

describe('CreateAssessorDto Schema', () => {
  it('should accept a valid TEXT task payload', () => {
    const validPayload = {
      taskType: TaskType.TEXT,
      reference: 'Sample reference text',
      template: 'Sample template text',
      studentResponse: 'Sample student response',
    };
    const result = createAssessorDtoSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it('should reject a payload with missing required fields', () => {
    const invalidPayload = {
      taskType: TaskType.TEXT,
      // Missing other required fields
    };
    const result = createAssessorDtoSchema.safeParse(invalidPayload);
    expect(result.success).toBe(false);
  });
});
```

## 2. Test Data Management

### Static Test Data

Static test data (JSON, images) is stored in the `test/` directory. This data should be version-controlled and immutable.

- **JSON Fixtures**: `test/data/`
- **Image Fixtures**: `test/ImageTasks/`

**Loading JSON Data:**

```typescript
// Example from an E2E test
import * as fs from 'fs/promises';
import * as path from 'path';

let tableData: TaskData;

beforeAll(async () => {
  const tableTaskPath = path.join(__dirname, '..', 'data', 'tableTask.json');
  tableData = JSON.parse(await fs.readFile(tableTaskPath, 'utf-8'));
});
```

**Loading Image Data:**

```typescript
// Helper for loading images as data URIs
const loadFileAsDataURI = async (filePath: string): Promise<string> => {
  const fileBuffer = await fs.readFile(filePath);
  const mimeType = 'image/png'; // Or determine dynamically
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
};

let referenceDataUri: string;

beforeAll(async () => {
  const imagePath = path.join(
    __dirname,
    '..',
    'ImageTasks',
    'referenceTask.png',
  );
  referenceDataUri = await loadFileAsDataURI(imagePath);
});
```

### Dynamic Data Generation

For more complex scenarios, use factory functions to generate test data dynamically. This is useful for creating variations and testing edge cases.

```typescript
// Example of a test data factory
export class TestDataFactory {
  static createValidTextTask(): CreateAssessorDto {
    return {
      taskType: TaskType.TEXT,
      reference: 'Expected answer about photosynthesis',
      template: 'Explain the process of photosynthesis',
      studentResponse: 'Plants use sunlight to make food',
    };
  }

  static createInvalidTask(): Partial<CreateAssessorDto> {
    return {
      taskType: 'INVALID_TYPE' as TaskType,
      // Missing required fields
    };
  }
}
```

## 3. Mocking Strategies

Mocking is crucial for isolating components during tests.

### Mocking Services

Use `vi.fn()` to create mock functions for service methods. This allows you to control their behaviour and assert how they are called.

```typescript
// Mocking the LlmService for the AssessorService tests
const mockLlmService = {
  send: vi.fn().mockResolvedValue(
    JSON.stringify({
      completeness: 85,
      accuracy: 90,
      feedback: 'A well-structured response.',
    }),
  ),
};

// In the Test.createTestingModule providers array:
{
  provide: LlmService,
  useValue: mockLlmService,
},
```

### Mocking Configuration

Mock `ConfigService` to provide consistent configuration values for tests, isolating them from environment-specific settings.

```typescript
// Mocking ConfigService
const mockConfigService = {
  get: vi.fn((key: string) => {
    const config = {
      API_KEYS: 'test-key-1,test-key-2',
      LOG_LEVEL: 'silent',
    };
    return config[key];
  }),
};

// In the Test.createTestingModule providers array:
{
  provide: ConfigService,
  useValue: mockConfigService,
},
```
