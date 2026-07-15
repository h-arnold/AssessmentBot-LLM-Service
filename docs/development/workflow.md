# Development Workflow

Local development setup and daily workflows for the Assessment Bot LLM Service.

## Prerequisites

- **Node.js 22** (as specified in `package.json` engines)
- **npm** (included with Node.js)
- **Git**

## Local Setup

```bash
git clone https://github.com/h-arnold/AssessmentBot-LLM-Service.git
cd AssessmentBot-LLM-Service
npm install
cp .env.example .env         # Configure GEMINI_API_KEY, API_KEYS, etc.
cp .test.env.example .test.env  # Only needed for live E2E tests
```

## Development Server

```bash
npm run start:dev      # Hot-reload on file changes (recommended)
npm run start:debug    # Hot-reload + Node.js inspect mode (port 9229)
```

The server starts on `http://localhost:3000` (configurable via `PORT`). Health check: `http://localhost:3000/health`.

## Test Commands

```bash
npm test                  # Unit + integration tests (Vitest)
npm run test:cov          # With coverage report
npm run test:e2e          # Mocked E2E tests (default)
npm run test:e2e:live     # Live E2E (requires GEMINI_API_KEY)
npm run test:debug        # Debug mode for unit tests
```

## Lint Commands

```bash
npm run lint              # ESLint check
npm run lint:fix          # Auto-fix lint issues
npm run format            # Prettier formatting
npm run lint:british      # British English compliance
```

## Quality Assurance Strategy

Quality is enforced through a multi-layered approach:

1. **Testing Pyramid**: Unit tests (isolated logic via Vitest) → Integration tests (module wiring via `TestingModule`) → E2E tests (full HTTP request-response via Supertest).
2. **Automated Enforcement**: Pre-commit hooks (Husky + lint-staged) run ESLint, Prettier, and British English checks on staged files. The CI pipeline enforces the same checks plus TypeScript compilation and coverage thresholds on every pull request.
3. **Security Scanning**: `npm audit` and GitHub Dependabot monitor dependency vulnerabilities. `eslint-plugin-security` catches unsafe patterns during static analysis.
4. **API Documentation**: `@nestjs/swagger` generates an interactive OpenAPI spec from controllers and DTOs, keeping API docs synchronised with the implementation.
