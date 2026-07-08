# Code Style Guide

This document outlines the coding standards and conventions for the Assessment Bot LLM Service project.

## Language and Spelling Standards

### British English Requirement

**All code, comments, documentation, and commit messages must use British English spellings.**

```typescript
// ✅ Correct (British English)
export class UserAuthorisationService {
  private readonly colour: string = 'blue';

  /**
   * Initialises the user authorisation system.
   * @param centre The centre point for calculations
   */
  initialise(centre: Point): void {
    // Implementation
  }
}

// ❌ Incorrect (American English)
export class UserAuthorizationService {
  private readonly color: string = 'blue';

  /**
   * Initializes the user authorization system.
   * @param center The center point for calculations
   */
  initialize(center: Point): void {
    // Implementation
  }
}
```

#### Enforcement

British English compliance is enforced automatically:

```bash
# Manual check
npm run lint:british

# Automatic check (runs on commit)
git commit -m "feat: your changes"
```

Common British vs American spellings:

- `authorise` / `authorize`
- `colour` / `color`
- `centre` / `center`
- `defence` / `defense`
- `organise` / `organize`
- `realise` / `realize`
- `analyse` / `analyze`

## TypeScript Standards

### Type Safety

**All code must be strictly typed with explicit return types.**

```typescript
// ✅ Correct - Explicit return type
async function processData(input: string): Promise<ProcessedData> {
  return await this.dataService.process(input);
}

// ❌ Incorrect - Missing return type
async function processData(input: string) {
  return await this.dataService.process(input);
}
```

### No `any` Types

```typescript
// ✅ Correct - Proper typing
interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
}

function handleResponse<T>(response: ApiResponse<T>): T {
  return response.data;
}

// ❌ Incorrect - Using any
function handleResponse(response: any): any {
  return response.data;
}
```

### Interface and Type Definitions

```typescript
// ✅ Correct - Clear type and enum definitions
export enum TaskType {
  TEXT = 'TEXT',
  TABLE = 'TABLE',
  IMAGE = 'IMAGE',
}

export type CreateAssessorDto = z.infer<typeof createAssessorDtoSchema>;

// ✅ Correct - Generic constraints
interface LlmService<T> {
  send(message: T): Promise<LlmResponse>;
}
```

## Code Organisation

### Module Structure

Follow NestJS modular architecture patterns:

```typescript
// ✅ Correct module structure
@Module({
  imports: [ConfigModule, LlmModule, PromptModule],
  controllers: [AssessorController],
  providers: [AssessorService],
})
export class AssessorModule {}
```

### File Naming Conventions

```
src/
└── v1/
    └── assessor/
        ├── assessor.controller.ts      # HTTP endpoints
        ├── assessor.service.ts         # Business logic
        ├── assessor.module.ts          # Module definition
        ├── assessor.service.spec.ts    # Service tests
        └── dto/
            └── create-assessor.dto.ts  # Input DTOs
```

### Import Organisation

ESLint enforces import ordering:

```typescript
// 1. Node.js built-in modules
import * as fs from 'fs/promises';

// 2. External dependencies
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';

// 3. Internal modules (absolute paths)
import { ApiKeyGuard } from 'src/auth/api-key.guard';
import { LlmResponse } from 'src/llm/types';

// 4. Relative imports
import { AssessorService } from './assessor.service';
import { createAssessorDtoSchema } from './dto/create-assessor.dto';
```

## NestJS Conventions

### Dependency Injection

```typescript
// ✅ Correct - Constructor injection
@Injectable()
export class AssessorService {
  constructor(
    private readonly llmService: LLMService,
    private readonly promptFactory: PromptFactory,
  ) {}
}
```

### Controller Design

```typescript
// ✅ Correct - RESTful controller
@Controller('v1/assessor')
@UseGuards(ApiKeyGuard)
export class AssessorController {
  constructor(private readonly assessorService: AssessorService) {}

  @Post()
  async create(
    @Body(new ZodValidationPipe(createAssessorDtoSchema))
    createAssessorDto: CreateAssessorDto,
  ): Promise<LlmResponse> {
    return this.assessorService.createAssessment(createAssessorDto);
  }
}
```

### Service Implementation

```typescript
// ✅ Correct - Service with proper error handling
@Injectable()
export class AssessorService {
  constructor(
    private readonly llmService: LLMService,
    private readonly promptFactory: PromptFactory,
  ) {}

  async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
    try {
      const prompt = await this.promptFactory.create(dto);
      const message = await prompt.buildMessage();
      return await this.llmService.send(message);
    } catch (error) {
      // Assuming a logger is available
      this.logger.error('Assessment creation failed', {
        error: error.message,
        stack: error.stack,
        taskType: dto.taskType,
      });
      throw new InternalServerErrorException('Failed to create assessment');
    }
  }
}
```

## Data Validation

### Zod Schema Definition

**All input validation must use Zod schemas.**

```typescript
// ✅ Correct - Comprehensive Zod schema
export const createAssessorDtoSchema = z.discriminatedUnion('taskType', [
  z.object({
    taskType: z.literal(TaskType.TEXT),
    reference: z.string().min(1),
    template: z.string(),
    studentResponse: z.string(),
  }),
  z.object({
    taskType: z.literal(TaskType.IMAGE),
    reference: z.union([z.string().min(1), z.instanceof(Buffer)]),
    template: z.union([z.string().min(1), z.instanceof(Buffer)]),
    studentResponse: z.union([z.string().min(1), z.instanceof(Buffer)]),
  }),
]);

export type CreateAssessorDto = z.infer<typeof createAssessorDtoSchema>;
```

### Custom Validation Pipes

```typescript
// ✅ Correct - Reusable validation pipe
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema<T>) {}

  transform(value: unknown, metadata: ArgumentMetadata): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Validation failed',
          errors: error.errors,
        });
      }
      throw new BadRequestException('Validation failed');
    }
  }
}
```

## Error Handling

### Exception Handling

```typescript
// ✅ Correct - Specific exceptions with context
if (createAssessorDto.taskType === 'IMAGE') {
  const imagePipe = new ImageValidationPipe(this.configService);
  try {
    await imagePipe.transform(createAssessorDto.reference);
  } catch (e) {
    throw new UnprocessableEntityException({
      message: 'Image validation failed for reference image',
      code: 'IMAGE_VALIDATION_FAILED',
    });
  }
}
```

### Logging Errors

```typescript
// ✅ Correct - Structured error logging
try {
  await this.llmService.send(message);
} catch (error) {
  this.logger.error('LLM request failed', {
    error: error.message,
    stack: error.stack,
    operation: 'sendToLlm',
  });
  throw new InternalServerErrorException('LLM request failed');
}
```

## Testing Standards

### Unit Test Structure

```typescript
// ✅ Correct - Comprehensive unit test
describe('AssessorService', () => {
  let service: AssessorService;
  let llmService: Mocked<LLMService>;
  let promptFactory: Mocked<PromptFactory>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessorService,
        { provide: LLMService, useValue: { send: vi.fn() } },
        { provide: PromptFactory, useValue: { create: vi.fn() } },
      ],
    }).compile();

    service = module.get<AssessorService>(AssessorService);
    llmService = module.get(LLMService);
    promptFactory = module.get(PromptFactory);
  });

  describe('createAssessment', () => {
    it('should call the LLM service with a generated prompt', async () => {
      // Arrange
      const dto: CreateAssessorDto = {
        taskType: 'TEXT',
        reference: 'a',
        template: 'b',
        studentResponse: 'c',
      };
      const mockPrompt = {
        buildMessage: vi.fn().mockResolvedValue('prompt'),
      };
      promptFactory.create.mockResolvedValue(mockPrompt as any);
      llmService.send.mockResolvedValue({
        accuracy: 1,
        completeness: 1,
        spag: 1,
      });

      // Act
      await service.createAssessment(dto);

      // Assert
      expect(promptFactory.create).toHaveBeenCalledWith(dto);
      expect(llmService.send).toHaveBeenCalledWith('prompt');
    });
  });
});
```

### E2E Test Standards

```typescript
// ✅ Correct - E2E test with proper setup
describe('AssessorController (e2e)', () => {
  let app: AppInstance;
  let apiKey: string;

  beforeAll(async () => {
    ({ app, apiKey } = await startApp());
  });

  afterAll(async () => {
    await stopApp(app);
  });

  describe('/v1/assessor (POST)', () => {
    it('should return 401 Unauthorized for missing API key', () => {
      return request(app.getHttpServer())
        .post('/v1/assessor')
        .send({
          taskType: 'TEXT',
          reference: 'a',
          template: 'b',
          studentResponse: 'c',
        })
        .expect(401);
    });

    it('should return 201 for a valid TEXT assessment request', () => {
      return request(app.getHttpServer())
        .post('/v1/assessor')
        .set('Authorization', `Bearer ${apiKey}`)
        .send({
          taskType: 'TEXT',
          reference: 'a',
          template: 'b',
          studentResponse: 'c',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('completeness');
          expect(res.body).toHaveProperty('accuracy');
        });
    });
  });
});
```

## Documentation Standards

### JSDoc Comments

```typescript
/**
 * Creates an assessment based on the provided data transfer object (DTO).
 * This method generates a prompt using the `promptFactory`, builds a message,
 * and sends it to the LLM service for processing.
 *
 * @param dto - The data transfer object containing the details required to create an assessment.
 * @returns A promise that resolves to an `LlmResponse` containing the result of the assessment.
 */
async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
  // Implementation
}
```

### API Documentation

```typescript
// ✅ Correct - Comprehensive Swagger documentation
@Controller('v1/assessor')
@UseGuards(ApiKeyGuard)
@Throttle(authenticatedThrottler)
export class AssessorController {
  /**
   * Creates a new assessment by processing the provided task data.
   *
   * This endpoint serves as the primary entry point for assessment requests.
   * It performs comprehensive validation including schema validation via Zod
   * and specialized image validation for IMAGE task types.
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createAssessorDtoSchema))
    createAssessorDto: CreateAssessorDto,
  ): Promise<LlmResponse> {
    // ...
  }
}
```

## Code Formatting

### ESLint Configuration

The project uses comprehensive ESLint rules:

```javascript
// Key rules enforced:
{
  '@typescript-eslint/explicit-function-return-type': 'error',
  '@typescript-eslint/no-explicit-any': 'error',
  'import/order': 'error', // Enforces import organisation
  'security/detect-eval-with-expression': 'error',
  'no-console': ['warn', { allow: ['warn', 'error', 'info', 'debug'] }],
}
```

### Prettier Configuration

```json
{
  "singleQuote": true,
  "trailingComma": "all"
}
```

### Line Length and Formatting

- **Maximum line length**: 100 characters (Prettier default)
- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Trailing commas**: Always include trailing commas

## Security Standards

### Input Sanitisation

```typescript
// ✅ Correct - Validate and sanitise all inputs
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadFile(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 1024 * 1024 }), // 1MB
        new FileTypeValidator({ fileType: /^image\/(png|jpeg)$/ }),
      ],
    }),
  )
  file: Express.Multer.File,
): Promise<UploadResponseDto> {
  return await this.fileService.processUpload(file);
}
```

### Sensitive Data Handling

```typescript
// ✅ Correct - Never log sensitive information
this.logger.debug('User authentication attempt', {
  email: user.email,
  // ❌ Never log: password, API keys, tokens
});

// ✅ Correct - Redact sensitive data in logs
this.logger.debug('API request', {
  endpoint: req.url,
  method: req.method,
  userAgent: req.headers['user-agent'],
  // API key automatically redacted by LogRedactor
});
```

## Performance Considerations

### Async/Await Best Practices

```typescript
// ✅ Correct - Parallel execution when possible
async function fetchUserData(userId: string): Promise<UserData> {
  const [user, preferences, permissions] = await Promise.all([
    this.userRepository.findById(userId),
    this.preferencesService.getForUser(userId),
    this.permissionsService.getForUser(userId),
  ]);

  return { user, preferences, permissions };
}

// ❌ Incorrect - Sequential execution (slower)
async function fetchUserData(userId: string): Promise<UserData> {
  const user = await this.userRepository.findById(userId);
  const preferences = await this.preferencesService.getForUser(userId);
  const permissions = await this.permissionsService.getForUser(userId);

  return { user, preferences, permissions };
}
```

## Enforcement

All style guidelines are automatically enforced through:

1. **Pre-commit hooks** (Husky + lint-staged)
2. **CI/CD pipeline** checks
3. **ESLint and Prettier** integration
4. **TypeScript compiler** strict mode
5. **British English checker** script

To check compliance manually:

```bash
# Run all checks
npm run lint
npm run lint:british
npm run format
npm test
npm run build
```
