# Development Workflow

This document outlines the local development practices and procedures for the Assessment Bot LLM Service project.

## Prerequisites

Before starting development, ensure you have the following installed:

- **Node.js 22** (as specified in package.json engines)
- **npm** (comes with Node.js)
- **Git** for version control
- **Docker** (optional, for containerised development)
- **VS Code** (recommended, with dev container support)

## Local Development Setup

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/h-arnold/Assessment Bot LLM Service.git
cd Assessment Bot LLM Service
npm install
```

### 2. Environment Configuration

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

2. Configure your environment variables in `.env`:

   ```bash
   # Required for LLM functionality
   GEMINI_API_KEY=your_actual_gemini_api_key

   # Development settings
   NODE_ENV=development
   PORT=3000
   LOG_LEVEL=debug

   # Authentication (generate secure API keys)
   API_KEYS=your_dev_key_1,your_dev_key_2
   ```

3. For testing, also copy the test environment:
   ```bash
   cp .test.env.example .test.env
   # Add your GEMINI_API_KEY to .test.env only if you plan to run live E2E tests
   ```

### 3. Verify Setup

```bash
# Install dependencies and prepare git hooks
npm install

# Verify the application builds
npm run build

# Run tests to ensure everything works
npm test

# Run linting checks
npm run lint
```

## Development Server

### Starting the Development Server

```bash
# Start with hot reload (recommended for development)
npm run start:dev

# Alternative: Start in debug mode
npm run start:debug
```

The development server will:

- Start on port 3000 (configurable via PORT env var)
- Watch for file changes and automatically restart
- Use `pino-pretty` for readable console logging
- Enable debug-level logging by default

### Accessing the Application

- **API Base URL**: `http://localhost:3000`
- **Health Check**: `http://localhost:3000/status`

## Development Workflow

### Feature Development Process

1. **Create a Feature Branch**

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Implement Changes**
   - Follow the modular NestJS architecture
   - Write tests alongside your code (TDD approach)
   - Ensure British English compliance
   - Adhere to the coding standards

3. **Test Your Changes**

   ```bash
   # Run unit tests
   npm test

   # Run E2E tests
   npm run test:e2e

   # Run live E2E tests (real Gemini API calls)
   npm run test:e2e:live

   # Run with coverage
   npm run test:cov
   ```

4. **Lint and Format**

   ```bash
   # Fix linting issues
   npm run lint:fix

   # Format code
   npm run format

   # Check British English compliance
   npm run lint:british
   ```

5. **Commit and Push**
   ```bash
   git add .
   git commit -m "feat: implement new feature"
   git push origin feature/your-feature-name
   ```

### Pre-commit Hooks

The project uses Husky to run quality checks before commits:

- **ESLint**: Automatically fixes linting issues
- **Prettier**: Formats code according to project standards
- **British English Check**: Ensures proper spelling conventions
- **Type Checking**: Validates TypeScript types

## Common Development Tasks

### Adding New Endpoints

1. **Create or modify a controller**:

   ```typescript
   @Controller('v1/assessor')
   export class AssessorController {
     @Post()
     async create(@Body() dto: CreateAssessorDto): Promise<LlmResponse> {
       // Implementation
     }
   }
   ```

2. **Create DTOs with Zod validation**:

   ```typescript
   export const createAssessorDtoSchema = z.object({
     taskType: z.nativeEnum(TaskType),
     reference: z.string().min(1),
     // ... other fields
   });

   export type CreateAssessorDto = z.infer<typeof createAssessorDtoSchema>;
   ```

3. **Add tests**:
   ```typescript
   describe('AssessorController (e2e)', () => {
     it('should create assessment', async () => {
       // Test implementation
     });
   });
   ```

### Creating New Modules

Use the NestJS CLI for consistency:

```bash
# Generate a new module
npx nest generate module v1/assessor

# Generate a controller
npx nest generate controller v1/assessor

# Generate a service
npx nest generate service v1/assessor
```

### Writing Tests

- **Unit Tests**: Co-locate with source files (`.spec.ts`)
- **Integration Tests**: Test module interactions
- **E2E Tests**: Place in `test/` directory (`.e2e-spec.ts`)

Test structure example:

```typescript
describe('AssessorService', () => {
  let service: AssessorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssessorService, ...mockProviders],
    }).compile();

    service = module.get<AssessorService>(AssessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

### Environment-specific Development

#### Dev Container (Recommended)

If using VS Code with Docker:

1. Open the project in VS Code
2. When prompted, choose "Reopen in Container"
3. The dev container will automatically:
   - Install dependencies
   - Build the project
   - Set up the development environment

#### Local Development

For local development without containers:

- Ensure Node.js 22 is installed
- Use the provided VS Code tasks for common operations
- Install recommended VS Code extensions for optimal DX

## Hot Reload and Live Development

The development server (`npm run start:dev`) provides:

- **Automatic Restart**: Watches TypeScript files for changes
- **Incremental Compilation**: Fast rebuilds on save
- **Preserved State**: Maintains environment and configuration
- **Detailed Logging**: Debug-level logs for development

### Debugging During Development

- Use `npm run start:debug` for debug mode
- Set breakpoints in VS Code
- Inspect variables and step through code
- Monitor logs for application flow

## Project Structure Conventions

When adding new features, follow these conventions:

```
src/
├── common/           # Shared utilities, pipes, guards
├── config/           # Configuration management
├── [feature]/        # Feature modules (e.g., auth, llm)
│   ├── *.module.ts   # Module definition
│   ├── *.service.ts  # Business logic
│   ├── *.controller.ts # HTTP handlers
│   ├── *.spec.ts     # Unit tests
│   └── dto/          # Data transfer objects
└── v1/               # API version namespace
```

## Quality Assurance

All code must pass:

- **TypeScript compilation** (`npm run build`)
- **Unit tests** (`npm test`)
- **E2E tests** (`npm run test:e2e`, mocked by default)
- **Linting** (`npm run lint`)
- **British English compliance** (`npm run lint:british`)

The CI pipeline enforces these standards on all pull requests.

## Overall QA Strategy

To uphold the guiding principles and ensure a high-quality, secure, and maintainable codebase, the project will adopt a comprehensive linting and Quality Assurance (QA) strategy.

### Automated Linting & Formatting

A consistent code style is enforced automatically to allow developers to focus on business logic.

- **ESLint**: Used to identify and report on problematic patterns in the TypeScript code. The configuration includes plugins for security (`eslint-plugin-security`), Jest best practices, and import ordering to support the **Security** and **Modularity** principles.
- **Prettier**: An opinionated code formatter integrated with ESLint to ensure a uniform code style across the entire project.
- **Husky & lint-staged**: Git hooks are used to automatically run the linter on staged files before they can be committed, catching issues early.

### Quality Assurance

QA is a multi-layered approach that builds confidence in the application's stability and security.

1. **Testing Pyramid**: The TDD principle is expanded with a structured testing approach:
   - **Unit Tests (Jest)**: The foundation. Individual classes and functions are tested in isolation, with external dependencies mocked.
   - **Integration Tests (NestJS `TestingModule`)**: The middle layer. Tests the interaction _between_ internal modules (e.g., Controller -> Service) to ensure they are wired correctly, without making external network calls.
   - **E2E Tests (Jest & Supertest)**: The top of the pyramid. The entire application is spun up to test the full request-response cycle via real HTTP requests, validating everything from authentication to the final response shape.

2. **Code Coverage Enforcement**: Jest's `--coverage` flag will be used within a CI/CD pipeline to enforce a minimum test coverage threshold. This ensures the TDD principle is consistently applied.

3. **Automated Security Scanning**:
   - **Dependency Scanning**: Tools like `npm audit` and GitHub's Dependabot will be used to automatically scan for vulnerabilities in third-party packages and facilitate updates.
   - **Static Application Security Testing (SAST)**: The `eslint-plugin-security` provides a baseline. Further analysis can be performed by tools like SonarQube/SonarCloud to detect more complex security vulnerabilities and track code quality over time.

4. **API Schema & Documentation**: To support the **Documentation** principle and provide clarity for API consumers, the project will use `@nestjs/swagger`. This package automatically generates an interactive OpenAPI (Swagger) specification directly from the code (Controllers and DTOs), ensuring the documentation is always in sync with the implementation.
