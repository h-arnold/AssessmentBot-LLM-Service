# Agent Instructions

This document provides guidance for interacting with the Assessment Bot backend codebase.

**IMPORTANT: This project uses British English. Ensure all code, comments, documentation, and commit messages use British English spellings (e.g., 'authorise', 'colour', 'centre').**
**IMPORTANT: Do not disable or override any quality gate (including linter rules) without explicit authorisation.**

## Core Principles

Adhere to these principles in all contributions:

- **Security First**: Prioritise security. Validate all inputs with Zod, sanitise outputs, and manage secrets via environment variables. Type safety is strictly enforced.
- **Statelessness**: The application is stateless. Do not store session information or user data on the server.
- **Modularity & OOP**: Follow SOLID principles and NestJS module conventions. Keep components focused and reusable. Avoid God Objects.
- **Test-Driven Development (TDD)**: Write comprehensive tests for all new features and bug fixes. Use the existing testing structure.
- **Documentation**: Maintain clear JSDoc comments for functions, classes, and modules. Keep the Swagger documentation up-to-date.

## Tech Stack & Key Libraries

- **Runtime**: Node.js in a Docker container (`node:24-alpine`).
- **Language**: TypeScript.
- **Framework**: NestJS.
- **Authentication**: Passport.js (specifically `passport-http-bearer` for API keys).
- **Validation**: Zod for all data validation (DTOs, environment variables).
- **Testing**: Vitest for unit, integration, and E2E tests. Use `supertest` for E2E.
- **LLM Integration**: Use the abstract `LlmService` for interactions and `jsonrepair` for robust response parsing. A centralised error-handling library lives at `src/common/errors/` — see `docs/llm/error-handling.md` for adding new providers or error types.
- **ESM Compliance**: The codebase uses native ESM (`"type": \"module\"`, `module` / `moduleResolution`: `NodeNext`, `target`: `ES2024`). Relative imports carry explicit `.js` extensions and JSON imports use the `with { type: 'json' }` attribute. This approach leverages modern JavaScript features while ensuring stability with current dependencies.
- **File Path Resolution**: For obtaining current directory paths, use the `getCurrentDirname()` utility from `src/common/file-utilities.ts` instead of `import.meta.url`. This utility handles both ESM runtime environments and Vitest test environments gracefully.

## Development Workflow

1. **Code Implementation**:
   - Follow the existing modular structure within the `src/` directory.
   - Use NestJS CLI commands (`nest g ...`) for generating new modules, controllers, and services where appropriate.
   - Adhere to the project's ESLint and Prettier configurations.

**Testing**:

- **Unit/Integration Tests**: Co-locate test files with source code (e.g., `assessor.service.spec.ts` next to `assessor.service.ts`). Use NestJS's `TestingModule` for integration tests.
- **E2E Tests**: Place end-to-end tests in the root `test/` directory (e.g., `assessor.e2e-spec.ts`).
- Run tests using the project's npm scripts.

**Linting & Committing**:

- Before committing, ensure all code passes linting checks.
- Husky hooks are configured to run `lint-staged` automatically on commit. Ensure your changes can pass these checks.

## Codebase Structure Overview

- `src/`: Main application source code.
  - `src/v1/assessor`: Version 1 of the core assessment logic.
  - `src/auth`: Authentication strategies and guards.
  - `src/common`: Shared utilities, filters, and pipes.
  - `src/config`: Environment variable management via a custom ConfigModule and ConfigService. All configuration is validated with Zod schemas. Do not use @nestjs/config directly outside the config module.
  - `src/llm`: Abstractions for interacting with Large Language Models.
  - `src/prompt`: Logic for generating prompts for the LLM.
- `test/`: End-to-end tests.

## Logging

The project uses `nestjs-pino` for logging. To ensure consistency and maintainability, follow these guidelines:

1.  **Centralised Configuration**: The logger is configured centrally in `app.module.ts` using `LoggerModule.forRootAsync` and initialised in `main.ts` with `app.useLogger(app.get(Logger))`. No further configuration is needed elsewhere.

2.  **Standard Injection**: In any class (service, controller, pipe, etc.), use the standard NestJS `Logger` from `@nestjs/common`. Do **not** use `PinoLogger` or `@InjectPinoLogger` from `nestjs-pino` directly.

3.  **Instantiation**: The recommended way to get a logger instance is to instantiate it directly within the class, providing the class name as the context. This is the most straightforward approach and aligns with NestJS documentation.

    ```typescript
    // In my.service.ts
    import { Injectable, Logger } from '@nestjs/common';

    @Injectable()
    export class MyService {
      private readonly logger = new Logger(MyService.name);

      doSomething() {
        this.logger.log('Doing something...');
      }
    }
    ```

By following this pattern, the application remains decoupled from the specific logging library, and all log messages will be correctly processed by `pino` as configured globally.

## Agents and delegation

Agent configuration files are defined in `.opencode/agents/`. Use the `task` tool to delegate focused work to sub-agents. Prefer short, well-scoped tasks and provide clear acceptance criteria.

Refer to `docs/` for detailed guidance on code style, testing, environment configuration, and prompt templates:

- Code style: `docs/development/code-style.md`
- Testing: `docs/testing/README.md`, `docs/testing/PRACTICAL_GUIDE.md`, `docs/testing/E2E_GUIDE.md`, `docs/testing/PROD_TESTS_GUIDE.md`
- Environment configuration: `docs/configuration/environment.md`
- Prompt system: `docs/prompts/README.md`

Available sub-agent types (see `.opencode/agents/` for full instructions):

| Sub-agent            | Use for                                       |
| -------------------- | --------------------------------------------- |
| `implementation`     | Feature work, bug fixes, refactors            |
| `testing-specialist` | Test creation, debugging, coverage assessment |
| `code-reviewer`      | Risk assessment and code review               |
| `docs`               | Keeping documentation accurate and current    |
| `de-sloppification`  | Removing AI-slop, duplication, complexity     |
| `kif`                | Menial exploration and simple tasks           |

## Standard Workflow

For any non-trivial code change, follow this sequence:

### 1. Define the task

Define the task that needs to be required. Identify the files, components, methods etc. that are involved. Consider and outline the changes in logic that will need to take place and outline any constraints (e.g. "stick to existing patterns", "avoid new dependencies", "ensure backwards compatibility"), important context the agent needs to be aware of and acceptance criteria.

### 2. Create failing tests

Pass the detailed and defined task to the testing-specialist agent to create failing tests that capture the acceptance criteria. Once the tests are created, review them to ensure they accurately reflect the requirements and edge cases. If there are any discrepancies or missing scenarios, provide clarifications and have them update the tests accordingly.

### 3. Implementation

Pass the detailed and defined task to the implementation agent, along with the failing tests created in the previous step. The implementation agent should focus on writing the minimum amount of code necessary to make the tests pass, adhering to the project's coding standards and principles outlined in this document. Once the implementation is complete, review the changes to ensure they meet the defined requirements and do not introduce any new issues. If everything looks good, proceed to the testing phase.

### 4. Testing

Pass the summary of the implemented changes to the testing-specialist agent so that it can run tests and identify gaps in coverage. Validate that all tests pass and that the code meets the acceptance criteria. If any tests fail or if there are coverage gaps, provide feedback to the implementation agent for necessary fixes. Repeat this process until all tests pass and coverage is satisfactory.

### 5. Review

Pass details of the changes to the code-reviewer agent for a thorough code review. The code-reviewer should focus on identifying any security vulnerabilities, code quality issues, adherence to coding standards, and potential improvements. Review the feedback and address any critical or high-priority issues. Once all concerns have been addressed, proceed to the documentation phase.

### 6. Documentation

Pass details of the changes to the docs agent to ensure that all relevant documentation is updated accordingly. This includes updating JSDoc comments, Swagger documentation, and any relevant guides or READMEs. Review the documentation updates to ensure they are clear, accurate, and helpful for future developers. Once the documentation is complete, finalise the changes.

## Common commands

- Build: `npm run build`
- Dev server: `npm run start:dev`
- Run tests: `npm run test` and `npm run test:e2e`
- Debug server: `npm run debug`

## Ignore patterns

- `node_modules/**`
- `dist/**`
- `coverage/**`
- `*.log`
- `.env`
- `.test.env`
- `.env.local`
