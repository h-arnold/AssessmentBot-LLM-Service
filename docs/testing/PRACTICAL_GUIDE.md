# Unit test patterns and fixtures

Unit and integration tests are co-located with source (`src/**/*.spec.ts`). Keep fixtures under `test/` and load them through the shared helpers in [`test/utils/e2e-helpers.ts`](../../test/utils/e2e-helpers.ts).

## Testing a service

Use `Test.createTestingModule` with a mock for each dependency. The [`ApiKeyService` spec](../../src/auth/api-key.service.spec.ts) shows the pattern: it builds valid `abt_`-prefixed keys and supplies a mock `ConfigService`. The snippet below is illustrative; use the spec as the source of truth.

```typescript
providers: [
  ApiKeyService,
  {
    provide: ConfigService,
    useValue: { get: vi.fn().mockReturnValue(['abt_abcdefghijklmnopqrstuvwxyzABCDEF']) },
  },
],
```

## Testing Zod validation

Test [`ZodValidationPipe`](../../src/common/zod-validation.pipe.ts) through [its spec](../../src/common/zod-validation.pipe.spec.ts).

## Testing DTO schemas

Validation is defined by Zod schemas. Test them directly with `safeParse`.

```typescript
import { assessorDtoSchema, TaskType } from './create-assessor.dto';

const validPayload = {
  taskType: TaskType.TEXT,
  reference: 'Sample reference text',
  template: 'Sample template text',
  studentResponse: 'Sample student response',
};
expect(assessorDtoSchema.safeParse(validPayload).success).toBe(true);
```

## Fixtures

JSON fixtures live in `test/data/` and images in `test/ImageTasks/`. Load them with paths derived from `getCurrentDirname()` and `node:`-prefixed imports:

```typescript
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getCurrentDirname } from 'src/common/file-utilities';

const dataDirectory = path.join(getCurrentDirname(), 'test', 'data');
const tableData = JSON.parse(
  await fs.readFile(path.join(dataDirectory, 'tableTask.json'), 'utf8'),
);
```

For images, import [`loadFileAsDataURI`](../../test/utils/e2e-helpers.ts) from the shared helpers. It infers the MIME type from the file extension and returns a base64 data URI; see [`assessor-live.e2e-spec.ts`](../../test/assessor-live.e2e-spec.ts) for a complete example.

Build payloads inline or reuse the fixtures in `test/data/`.

## Mocking the LLM service

Unit tests inject the LLM through [`LLM_SERVICE_TOKEN`](../../src/llm/llm.service.interface.ts). Provide a schema-valid response with `completeness`, `accuracy` and `spag` objects, each holding a numeric `score` and a `reasoning` string ([`src/llm/types.ts`](../../src/llm/types.ts)).

```typescript
const mockLlmService = {
  send: vi.fn().mockResolvedValue(JSON.stringify({
    completeness: { score: 4, reasoning: 'Covers the key points.' },
    accuracy: { score: 5, reasoning: 'Factually correct.' },
    spag: { score: 3, reasoning: 'Several spelling errors.' },
  })),
};

providers: [{ provide: LLM_SERVICE_TOKEN, useValue: mockLlmService }],
```

## Mocking configuration

Provide only the values the component reads. Use valid keys (`abt_` prefix) and a supported `LOG_LEVEL` such as `debug`.

```typescript
const mockConfigService = {
  get: vi.fn(
    (key: string) =>
      ({
        API_KEYS: 'abt_abcdefghijklmnopqrstuvwxyzABCDEF',
        LOG_LEVEL: 'debug',
      })[key],
  ),
};
```
