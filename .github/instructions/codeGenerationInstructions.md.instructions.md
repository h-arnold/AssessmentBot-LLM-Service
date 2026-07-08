# Gemini Code-Assist Instructions

This document provides guidance for interacting with the Assessment Bot backend codebase.

**IMPORTANT: This project uses British English. Ensure all code, comments, documentation, and commit messages use British English spellings (e.g., 'authorise', 'colour', 'centre').**

## 1. Core Principles

Adhere to these principles in all contributions:

- **Security First**: Prioritise security. Validate all inputs with Zod, sanitise outputs, and manage secrets via environment variables. Type safety is strictly enforced.
- **Statelessness**: The application is stateless. Do not store session information or user data on the server.
- **Modularity & OOP**: Follow SOLID principles and NestJS module conventions. Keep components focused and reusable. Avoid God Objects.
- **Test-Driven Development (TDD)**: Write comprehensive tests for all new features and bug fixes. Use the existing testing structure.
- **Documentation**: Maintain clear JSDoc comments for functions, classes, and modules. Keep the Swagger documentation up-to-date.

## 2. Tech Stack & Key Libraries

- **Runtime**: Node.js in a Docker container (`node:24-alpine`).
- **Language**: TypeScript.
- **Framework**: NestJS.
- **Authentication**: Passport.js (specifically `passport-http-bearer` for API keys).
- **Validation**: Zod for all data validation (DTOs, environment variables).
- **Testing**: Vitest for unit, integration, and E2E tests. Use `supertest` for E2E.
- **LLM Integration**: Use the abstract `LlmService` for interactions and `json-repair` for robust response parsing.
- **ESM Compliance**: The codebase uses native ESM (`"type": \"module\"`, `module` / `moduleResolution`: `NodeNext`, `target`: `ES2024`). Relative imports carry explicit `.js` extensions and JSON imports use the `with { type: 'json' }` attribute. This approach leverages modern JavaScript features while ensuring stability with current dependencies.
- **File Path Resolution**: For obtaining current directory paths, use the `getCurrentDirname()` utility from `src/common/file-utilities.ts` instead of `import.meta.url`. This utility handles both ESM runtime environments and Vitest test environments gracefully.

## 3. Development Workflow

1. **Code Implementation**:
   - Follow the existing modular structure within the `src/` directory.
   - Use NestJS CLI commands (`nest g ...`) for generating new modules, controllers, and services where appropriate.
   - Adhere to the project's ESLint and Prettier configurations.

2. **Testing**:
   - **Unit/Integration Tests**: Co-locate test files with source code (e.g., `assessor.service.spec.ts` next to `assessor.service.ts`). Use NestJS's `TestingModule` for integration tests.
   - **E2E Tests**: Place end-to-end tests in the root `test/` directory (e.g., `assessor.e2e-spec.ts`).
   - Run tests using the project's npm scripts.

3. **Linting & Committing**:
   - Before committing, ensure all code passes linting checks.
   - Husky hooks are configured to run `lint-staged` automatically on commit. Ensure your changes can pass these checks.

## 4. Codebase Structure Overview

- `src/`: Main application source code.
  - `src/v1/assessor`: Version 1 of the core assessment logic.
  - `src/auth`: Authentication strategies and guards.
  - `src/common`: Shared utilities, filters, and pipes.
  - `src/config`: Environment variable management via a custom ConfigModule and ConfigService. All configuration is validated with Zod schemas. Do not use @nestjs/config directly outside the config module.
  - `src/llm`: Abstractions for interacting with Large Language Models.
  - `src/prompt`: Logic for generating prompts for the LLM.
- `test/`: End-to-end tests.

## 5. Agent Workflow

To ensure a methodical and traceable development process, the agent _must_ adhere to the following workflow:

### 5.1. TDD Workflow: A Hybrid Approach

While the project's `TODO.md` files may be structured with distinct "Red Phase" (all tests fail) and "Green Phase" (all tests pass) sections for organisational clarity, the agent will employ a hybrid TDD workflow:

1. **Micro-Cycles (Red-Green-Refactor per Task)**: For each individual task or a small, logical group of tasks on the TODO list, the agent will follow a tight Red-Green-Refactor loop. This involves:
   - **Red**: Writing a small number of failing tests that define the specific requirement.
   - **Green**: Writing the simplest possible production code to make those specific tests pass.
   - **Refactor**: Improving the implementation and test code while keeping the tests green.

2. **Macro-Verification (End-of-Stage Check)**: After completing all the micro-cycles for a given stage or major feature, the agent will run the _entire_ test suite. This ensures that changes made in later micro-cycles have not inadvertently broken functionality that was implemented and tested in earlier cycles.

### 5.2. Working with TODOs

When provided, work sequentially through the `TODO.md` file.

Complete each step in order. **IMPORTANT**: You must complete each step in the TODO list _fully_ before moving on to the next. If you are unable to do so, stop and ask the user for clarification or assistance.

Once you have _fully_ completed a step, check off the step in the `TODO.md` file and update it. It is critical you do this to enable everyone to track the progress of the project accurately.

Where you encounter an issue that will may impact future steps (i.e. anything more substantial than syntax or linting errors), you must document this in the TODO file, in the space provided for you. Ensure you provide detailed commentary on the issue, including your reasoning and the solutions used to inform future work.

## 6. Logging

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
