# Development Workflow

Local development setup and daily workflows for the Assessment Bot LLM Service.

## Prerequisites

- **Node.js**: the version required by `engines.node` in `package.json`
- **npm** (included with Node.js)
- **Git**

## Local Setup

```bash
git clone https://github.com/h-arnold/AssessmentBot-LLM-Service.git
cd AssessmentBot-LLM-Service
npm install
cp .env.example .env         # Configure MISTRAL_API_KEY, API_KEYS, etc.
cp .test.env.example .test.env  # Optional override for any E2E run
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
npm run test:e2e:live     # Live E2E (requires keys for the configured providers)
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
2. **Automated Enforcement**: Pre-commit hooks (Husky + lint-staged) run ESLint, Prettier, and British English checks on staged files. CI runs ESLint, unit tests with coverage reporting, and mocked E2E tests on every pull request.
3. **Security Scanning**: Dependabot monitors dependency updates; CodeQL and SonarQube run static analysis in separate workflows. `eslint-plugin-security` catches unsafe patterns during ESLint.

Before pushing, run the full check set from [AGENTS.md §9](../../AGENTS.md).
