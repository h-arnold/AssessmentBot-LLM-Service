# Code Style Guide

This document outlines project-specific coding standards that supplement the automated ESLint/Prettier enforcement.

## Language and Spelling

**All code, comments, documentation, and commit messages must use British English spellings.** Enforced by a pre-commit hook and `npm run lint:british`.

```typescript
// British English — correct
export class UserAuthorisationService { ... }

// American English — incorrect
export class UserAuthorizationService { ... }
```

## TypeScript Standards

- **Explicit return types on all functions/methods** (enforced by `@typescript-eslint/explicit-function-return-type`).
- **No `any` types.** Use explicit types or `unknown` with type guards (enforced by `@typescript-eslint/no-explicit-any`).
- **All input validation uses Zod schemas.** DTOs are derived via `z.infer<typeof schema>`.

## File Naming Conventions

```
src/v1/assessor/
├── assessor.controller.ts       # HTTP endpoints
├── assessor.service.ts          # Business logic
├── assessor.module.ts           # Module definition
├── assessor.service.spec.ts     # Tests (co-located)
└── dto/
    └── create-assessor.dto.ts   # Zod schema + type
```

Place E2E tests in the root `test/` directory with `.e2e-spec.ts` suffix.

## Import Ordering

ESLint enforces this order (via `eslint-plugin-import-x`):

1. Node.js built-in modules (`fs`, `path`)
2. External dependencies (`@nestjs/common`, `zod`)
3. Internal project modules (`src/auth/...`, `src/llm/...`)
4. Relative imports (`./assessor.service`, `./dto/...`)

## NestJS Conventions

- Use constructor injection with `private readonly` for dependencies.
- Controllers use `@Controller('v1/...')` with route-scoped guards.
- Services are `@Injectable()` and registered in their module's `providers` array.
- Logging uses `Logger` from `@nestjs/common` — never `console.*` or `PinoLogger` directly.

## Enforcement

All standards are enforced automatically through:

- **Pre-commit hooks** (Husky + lint-staged)
- **CI/CD pipeline** checks
- **ESLint and Prettier** integrated configuration
- **TypeScript compiler** strict mode
- **British English checker** script (`npm run lint:british`)

```bash
npm run lint       # Full ESLint check
npm run format     # Prettier formatting
npm run build      # TypeScript compilation
```
