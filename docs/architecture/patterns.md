# Design Patterns

This document catalogues the design patterns used in the codebase with representative code snippets.

## Creational Patterns

### Factory Pattern

**Implementation**: `PromptFactory` (`src/prompt/prompt.factory.ts`)

```typescript
async create(dto: CreateAssessorDto): Promise<Prompt> {
  switch (dto.taskType) {
    case TaskType.TEXT:
      return new TextPrompt(inputs, this.logger, userTemplateFile, systemPrompt);
    case TaskType.TABLE:
      return new TablePrompt(inputs, this.logger, userTemplateFile, systemPrompt);
    case TaskType.IMAGE:
      return new ImagePrompt(inputs, this.logger, systemPrompt);
  }
}
```

Used in `AssessorService`:

```typescript
const prompt = await this.promptFactory.create(dto);
const message = await prompt.buildMessage();
```

### Provider Pattern (Dependency Injection)

**Implementation**: NestJS DI container

```typescript
@Module({
  providers: [GeminiService, { provide: LLMService, useClass: GeminiService }],
  exports: [LLMService],
})
export class LlmModule {}
```

## Structural Patterns

### Strategy Pattern

**Implementation**: `LLMService` (`src/llm/llm.service.interface.ts`)

```typescript
@Injectable()
export abstract class LLMService {
  async send(payload: LlmPayload): Promise<LlmResponse> {
    return await this._sendInternal(payload);
  }
  protected abstract _sendInternal(payload: LlmPayload): Promise<LlmResponse>;
}

@Injectable()
export class GeminiService extends LLMService {
  protected async _sendInternal(payload: LlmPayload): Promise<LlmResponse> {
    // Gemini-specific implementation
  }
}
```

### Template Method Pattern

**Implementation**: `Prompt` base class (`src/prompt/prompt.base.ts`)

```typescript
export abstract class Prompt {
  constructor(
    inputs: unknown,
    logger: Logger,
    userTemplateName?: string,
    systemPrompt?: string,
  ) {
    const parsed = PromptInputSchema.parse(inputs); // 1. Validate
    this.setInputs(parsed); // 2. Set inputs
    this.setConfiguration(userTemplateName, systemPrompt); // 3. Configure
    this.logInputLengths(parsed); // 4. Log
  }

  public async buildMessage(): Promise<LlmPayload> {
    /* default implementation */
  }
}

export class ImagePrompt extends Prompt {
  public async buildMessage(): Promise<LlmPayload> {
    /* image-specific override */
  }
}
```

### Adapter Pattern

**Implementation**: `ConfigModule` (`src/config/config.module.ts`)

```typescript
@Module({
  imports: [NestConfigModule.forRoot({ envFilePath: '.env' })],
  providers: [ConfigService],
  exports: [ConfigService], // Exposes only our adapter, hides NestJS ConfigModule
})
export class ConfigModule {}

// ConfigService validates env vars with Zod on construction
export class ConfigService {
  private config: Config;
  constructor() {
    this.config = configSchema.parse(process.env);
  }
}
```

## Behavioural Patterns

### Guard Pattern

**Implementation**: Authentication (`src/auth/`)

```typescript
@Injectable()
export class ApiKeyGuard extends AuthGuard('bearer') {}

@Controller('v1/assessor')
@UseGuards(ApiKeyGuard)
export class AssessorController {}
```

### Pipe Pattern

**Implementation**: `ZodValidationPipe` (`src/common/zod-validation.pipe.ts`)

```typescript
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema?: ZodTypeAny) {}

  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (!this.schema) return value;
    return this.schema.parse(value);
  }
}

// Usage
@Body(new ZodValidationPipe(createAssessorDtoSchema))
createAssessorDto: CreateAssessorDto,
```

### Observer Pattern

**Implementation**: Logging via `nestjs-pino`

```typescript
export class AssessorService {
  private readonly logger = new Logger(AssessorService.name);

  async createAssessment(dto: CreateAssessorDto): Promise<LlmResponse> {
    this.logger.log('Creating assessment');
    // ...
  }
}
```

## Pattern Interactions

### Factory + Strategy + Template Method

The prompt system combines all three:

```typescript
const prompt = await promptFactory.create(dto); // Factory selects strategy
prompt.buildMessage(); // Template Method with strategy-specific steps
```

`PromptFactory` creates the appropriate prompt type (TextPrompt, ImagePrompt, TablePrompt), each of which implements the `Prompt` abstract class (Template Method) and serves as a concrete strategy.

### Guard + Strategy + Provider

```typescript
@Controller()
@UseGuards(ApiKeyGuard) // Guard uses ApiKeyStrategy
export class AssessorController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService, // Provider injection
  ) {}
}
```

---

_For architectural context, see [Architecture Overview](overview.md) and [Module Responsibilities](modules.md)._
