# GitHub Copilot Coding Agent Environment Setup

This document outlines the GitHub Copilot Coding Agent environment configuration for the Assessment Bot LLM Service repository.

## Overview

The GitHub Copilot Coding Agent environment has been configured to match the repository's development environment exactly, ensuring consistency between local development, CI/CD, and the agent's coding assistance.

## Environment Configuration

### Files Added/Modified

1. **`.test.env`** - Test environment variables file
   - Contains only the `GEMINI_API_KEY` environment variable for testing
   - Other environment variables are set up by the E2E test utils
   - Used by Vitest tests to provide the Gemini API key while other variables are handled dynamically

2. **`.husky/pre-commit`** - Git pre-commit hook
   - Runs `lint-staged` on staged files before commit
   - Ensures all code meets quality standards before being committed
   - Automatically fixes linting issues and formats code

3. **`.github/workflows/copilot-environment.yml`** - GitHub Actions workflow
   - Sets up the exact same environment as local development
   - Installs dependencies, runs linting, testing, and building
   - Validates British English compliance
   - Simulates Husky hooks for PR validation

4. **`.github/copilot/agent-config.yml`** - Copilot agent configuration
   - Defines development environment for GitHub Copilot Coding Agent
   - Specifies Node.js version, environment variables, and secrets
   - Lists available development commands and quality checks
   - Ensures agent has access to the same tools as developers

5. **`.gitignore`** - Updated to allow `.test.env` in version control
   - Modified to exclude only Husky internals (`.husky/_`) but allow hooks
   - Allows `.test.env` to be tracked for CI/CD consistency

## Development Environment Features

### Code Quality Tools

- **ESLint**: Comprehensive linting rules including British English compliance
- **Prettier**: Code formatting to maintain consistent style
- **Vitest**: Unit and integration testing with proper TypeScript support
- **Husky**: Git hooks for pre-commit validation
- **lint-staged**: Runs quality checks only on staged files

### Environment Variables

The following environment variables are configured:

#### Development/Test Environment

- `NODE_ENV`: Environment mode (development/test)
- `PORT`: Application port (default: 3000)
- `APP_NAME`: Application name
- `APP_VERSION`: Application version
- `LOG_LEVEL`: Logging verbosity

#### Security & API Configuration

- `API_KEYS`: Comma-separated list of valid API keys
- `GEMINI_API_KEY`: Google Gemini API key (from GitHub secrets)

#### Application Settings

- `MAX_IMAGE_UPLOAD_SIZE_MB`: Maximum image upload size
- `ALLOWED_IMAGE_MIME_TYPES`: Allowed image MIME types
- `THROTTLER_TTL`: Rate limiting time window
- `UNAUTHENTICATED_THROTTLER_LIMIT`: Rate limit for unauthenticated requests
- `AUTHENTICATED_THROTTLER_LIMIT`: Rate limit for authenticated requests

### Available Commands

The following npm scripts are available in the development environment:

- `npm run lint` - Run ESLint code quality checks
- `npm run lint:fix` - Run ESLint and automatically fix issues
- `npm run format` - Format code using Prettier
- `npm run test` - Run unit and integration tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:cov` - Run tests with coverage report
- `npm run test:e2e` - Run end-to-end tests
- `npm run build` - Build the application
- `npm run start:dev` - Start development server with hot reload
- `npm run debug` - Start server in debug mode

## GitHub Secrets Required

The following secrets must be configured in the GitHub repository:

- `GEMINI_API_KEY`: Google Gemini API key for LLM integration

## Quality Checks

### Pre-commit Hooks

- Automatically runs ESLint with fix on staged TypeScript files
- Formats staged files with Prettier
- Ensures code quality before commits

### CI/CD Validation

- Builds the application to ensure no compilation errors
- Runs complete test suite including E2E tests
- Validates British English spelling compliance
- Checks code formatting consistency
- Simulates local development environment

### British English Compliance

The system automatically checks for American English spellings and enforces British English:

- `color` → `colour`
- `flavor` → `flavour`
- `center` → `centre`
- `defense` → `defence`
- `authorize` → `authorise`
- `organize` → `organise`

## Usage for Copilot Coding Agent

The GitHub Copilot Coding Agent will automatically:

1. Have access to the same Node.js environment (version 22)
2. Use the same ESLint and Prettier configurations
3. Run the same quality checks as local development
4. Have access to necessary environment variables and secrets
5. Follow the same coding standards and conventions

This ensures that code suggestions and modifications from the agent will be consistent with the repository's standards and will pass all quality checks.

## Troubleshooting

### Test Failures

If tests fail due to missing environment variables:

1. Ensure `.test.env` file exists and contains the `GEMINI_API_KEY`
2. Check that `GEMINI_API_KEY` is properly set in GitHub secrets
3. Verify all dependencies are installed with `npm ci`
4. Note that other environment variables are set up automatically by the E2E test utils

### Linting Issues

If linting fails:

1. Run `npm run lint:fix` to automatically fix issues
2. Check for British English spelling compliance
3. Ensure TypeScript types are properly defined

### Husky Hook Issues

If pre-commit hooks don't run:

1. Ensure Husky is installed: `npm run prepare`
2. Check that `.husky/pre-commit` file exists and is executable
3. Verify `lint-staged` configuration in `package.json`

## Maintenance

To keep the environment up to date:

1. Regularly update Node.js version in both `agent-config.yml` and workflows
2. Keep dependency versions synchronized between local and CI environments
3. Update environment variable templates when new variables are added
4. Ensure British English compliance checks cover new terminology
