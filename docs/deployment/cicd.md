# CI/CD Pipeline

This guide covers the continuous integration and deployment pipeline for the Assessment Bot LLM Service project using GitHub Actions.

## Overview

The CI/CD pipeline is designed to:

- **Ensure code quality** through automated testing and linting
- **Maintain security** with vulnerability scanning and code analysis
- **Automate deployments** with containerised releases
- **Provide feedback** on code changes through comprehensive checks

## Pipeline Architecture

The CI/CD system consists of multiple GitHub Actions workflows:

1. **Continuous Integration (CI)** - `ci.yml`
2. **Docker Image Release** - `docker-release.yml`
3. **Security Scanning** - `codeql.yml`, `sonarqube.yml`
4. **Dependency Management** - `dependabot.yml`

## Continuous Integration (CI)

### Workflow Overview

The CI pipeline (`/.github/workflows/ci.yml`) runs on every pull request and includes:

- **Code linting** with ESLint
- **Dockerfile linting** with Hadolint
- **Unit testing** with Vitest
- **End-to-end testing** for API functionality
- **Test reporting** with JUnit reports

### Trigger Conditions

# CI/CD Pipeline

This guide covers the continuous integration and deployment pipeline for the Assessment Bot LLM Service project using GitHub Actions.

## Overview

The CI/CD pipeline is designed to:

- **Ensure code quality** through automated testing and linting.
- **Maintain security** with vulnerability scanning and code analysis.
- **Automate deployments** with containerised releases.
- **Provide feedback** on code changes through comprehensive checks.

## Pipeline Architecture

The CI/CD system consists of multiple GitHub Actions workflows:

1.  **Continuous Integration (CI)** - `ci.yml`
2.  **Docker Image Release** - `docker-release.yml`
3.  **Security Scanning** - `codeql.yml`, `sonarqube.yml`
4.  **Dependency Management** - `dependabot.yml`

## Continuous Integration (CI)

The CI pipeline (`/.github/workflows/ci.yml`) runs on every pull request and includes code linting, Dockerfile linting, unit testing, and end-to-end testing.

### Trigger Conditions

# CI/CD Pipeline

This guide covers the continuous integration and deployment pipeline for the Assessment Bot LLM Service project using GitHub Actions.

## Overview

The CI/CD pipeline is designed to:

- **Ensure code quality** through automated testing, linting, and style checks.
- **Maintain security** with vulnerability scanning and static code analysis.
- **Automate deployments** by publishing containerised releases to the GitHub Container Registry.
- **Provide fast feedback** on code changes through a series of comprehensive, automated checks.

## Pipeline Architecture

The CI/CD system consists of multiple GitHub Actions workflows that work together:

1.  **Continuous Integration (CI)** (`ci.yml`): Runs tests, lints, and quality checks on every pull request.
2.  **Docker Image Release** (`docker-release.yml`): Builds and publishes the production Docker image upon a new release.
3.  **Security Scanning** (`codeql.yml`, `sonarqube.yml`): Performs static analysis to find security vulnerabilities and code quality issues.
4.  **Dependency Management** (`dependabot.yml`): Automatically creates pull requests to keep dependencies up-to-date.

## Continuous Integration (CI) Workflow

The main CI pipeline is defined in `/.github/workflows/ci.yml`.

### Trigger Conditions

The CI workflow is triggered on every pull request targeting any branch, ensuring all proposed changes are validated.

```yaml
on:
  pull_request:
    branches: ['**']
```

### Pipeline Stages

#### Stage 1: Code Quality (`lint`)

**Purpose**: Ensures all submitted code adheres to project standards for quality and consistency.

**Steps**:

1.  **Checkout & Setup**: Checks out the code and sets up the Node.js 22 environment.
2.  **Install Dependencies**: Runs `npm ci` for fast, reliable package installation.
3.  **Run Linters**: Executes ESLint for TypeScript checks, Hadolint for Dockerfile best practices, and a script to enforce British English spelling.

#### Stage 2: Unit Testing (`unit-test`)

**Purpose**: Validates that individual components and functions work correctly in isolation.

**Steps**:

1.  **Setup**: Prepares the environment and installs dependencies.
2.  **Execute Tests**: Runs the full unit test suite with `npm test -- --coverage`.
3.  **Publish Report**: Uploads the test results in JUnit XML format for integration with GitHub's UI.

#### Stage 3: End-to-End Testing (`e2e-test`)

**Purpose**: Validates complete API functionality in a realistic environment. The default E2E run is mocked; the live suite can be run separately when Gemini integration needs verification.

**Steps**:

1.  **Setup**: Prepares the environment and installs dependencies.
2.  **Execute Tests**: Runs the mocked E2E test suite using `npm run test:e2e`.
3.  **Publish Report**: Uploads test results in JUnit format.

### Secrets Management

The CI pipeline requires the following secrets to be configured in the repository at **Settings → Secrets and variables → Actions**:

- **`GEMINI_API_KEY`**: A valid API key for the Gemini LLM, required only for live E2E tests (`npm run test:e2e:live`) and any integration tests that hit the live API.
- **`SONAR_TOKEN`**: A token for authenticating with SonarCloud for code analysis.

### Test Reporting

The pipeline generates two types of reports:

- **JUnit Reports**: For displaying detailed test results directly in GitHub pull requests.
- **Coverage Reports**: Generated by Vitest's `@vitest/coverage-v8` provider to track how much of the codebase is covered by tests.

## Docker Release Workflow

The release workflow (`/.github/workflows/docker-release.yml`) automates the process of building and publishing the production Docker image.

### Trigger Conditions

This workflow runs automatically whenever a new **release is published** on GitHub.

```yaml
on:
  release:
    types: [published]
```

### Release Process

1.  **Build & Push**: A multi-architecture Docker image is built from `Docker/Dockerfile.prod`.
2.  **Tagging**: The image is tagged with both the specific version (e.g., `v1.2.3`) and `latest`.
3.  **Publish**: The tagged image is pushed to the GitHub Container Registry (`ghcr.io/h-arnold/assessmentbot-backend`).

## Security Workflows

- **CodeQL Analysis** (`codeql.yml`): Performs static application security testing (SAST) to automatically find vulnerabilities in the codebase.
- **SonarQube Integration** (`sonarqube.yml`): Analyzes code for quality issues, security hotspots, and code smells, providing a dashboard for code health.

## Local Development and Pre-commit Hooks

To catch issues before they are pushed, the project uses **Husky** to manage pre-commit hooks.
The `.husky/pre-commit` script runs `lint-staged`, which automatically formats and lints staged files, ensuring they meet project standards.

You can also run all CI checks locally:

```bash
# Run all linting checks
npm run lint

# Run unit tests with coverage
npm run test:cov

# Run mocked E2E tests
npm run test:e2e

# Run live E2E tests (real Gemini API calls)
npm run test:e2e:live
```

### Pipeline Stages

1.  **Code Quality (`lint`)**: Ensures code quality and consistency by running `npm run lint` and linting Dockerfiles with Hadolint.
2.  **Unit Testing (`unit-test`)**: Validates individual component functionality by running `npm test`. It requires a `GEMINI_API_KEY` secret only when tests hit the live Gemini API.
3.  **End-to-End Testing (`e2e-test`)**: Validates complete API functionality by running `npm run test:e2e` (mocked). The live E2E suite uses `npm run test:e2e:live` and requires `GEMINI_API_KEY`.

### Secrets Management

The CI pipeline requires the following GitHub repository secrets:

- **`GEMINI_API_KEY`**: A valid API key for live LLM integration testing.
- **`SONAR_TOKEN`**: Required for SonarQube/SonarCloud static analysis. This token should be generated from your SonarCloud account.

To set up secrets, navigate to **Settings → Secrets and variables → Actions** in your repository.

### Test Reporting

The pipeline generates JUnit XML reports for integration with GitHub's test reporting features and code coverage reports via Vitest and `@vitest/coverage-v8`.

## Docker Release Pipeline

The release pipeline (`/.github/workflows/docker-release.yml`) automates building and publishing the production Docker image to the GitHub Container Registry.

### Trigger Conditions

This pipeline triggers when a new GitHub release is published.

```yaml
on:
  release:
    types: [published]
```

### Release Process

When triggered, the pipeline builds a multi-architecture Docker image from `Docker/Dockerfile.prod` and pushes it to the GitHub Container Registry. It creates two tags: a version-specific tag (e.g., `v1.2.3`) and a `latest` tag.

The image is published to `ghcr.io/h-arnold/assessmentbot-backend`.

## Security Scanning

- **CodeQL Analysis**: The `codeql.yml` workflow performs static application security testing (SAST) to identify vulnerabilities in the codebase.
- **SonarQube Integration**: The `sonarqube.yml` workflow analyses code quality and security, tracking metrics like code coverage, code smells, and security hotspots. **Note**: This workflow requires the `SONAR_TOKEN` to be configured in the repository's secrets.

## Dependency Management

The `dependabot.yml` configuration file enables Dependabot to automatically create pull requests for dependency updates, helping to keep the project's dependencies secure and up-to-date.

## Local Development Integration

To ensure code quality locally before pushing, the project uses pre-commit hooks managed by Husky.

**Husky configuration** (`.husky/pre-commit`):

```bash
#!/usr/bin/env sh
npx lint-staged
```

This runs `lint-staged`, which in turn runs ESLint, Prettier, and a British English spelling check on staged files.

You can also run the CI checks manually:

```bash
# Run all linting checks
npm run lint

# Run unit tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e
```

## Troubleshooting

- **Linting errors**: Run `npm run lint:fix` and `npm run format` to fix common issues.
- **Test failures**: Run tests locally with `npm test` or `npm run test:e2e`. To debug a specific test, use `npm test -- --testNamePattern="failing test"`.
- **Missing secrets**: Ensure `GEMINI_API_KEY` is configured in the repository's Actions secrets.

The CI pipeline triggers on:

- Any pull request to any branch
- Changes to source code, tests, or configuration files

### Pipeline Stages

#### Stage 1: Code Quality (`lint`)

**Purpose**: Ensure code quality and consistency

**Steps**:

1. **Checkout code**: Downloads repository content
2. **Set up Node.js 22**: Installs required Node.js version
3. **Install dependencies**: Runs `npm install`
4. **ESLint**: Checks TypeScript code quality and style
5. **Hadolint**: Lints both development and production Dockerfiles

**Commands executed**:

```bash
npm install
npm run lint
hadolint ./Docker/Dockerfile
hadolint ./Docker/Dockerfile.prod
```

**Quality gates**:

- ESLint must pass with zero errors
- All Dockerfiles must follow best practices
- British English compliance must be verified

#### Stage 2: Unit Testing (`unit-test`)

**Purpose**: Validate individual component functionality

**Dependencies**: Requires `lint` stage to complete successfully

**Environment**:

- `NODE_ENV=test`
- `GEMINI_API_KEY` from GitHub Secrets

**Steps**:

1. **Code checkout** and **Node.js setup**
2. **Dependency installation**
3. **Unit test execution** with coverage reporting
4. **Test report publishing** in JUnit format

**Commands executed**:

```bash
npm install
npm test -- --verbose --coverage
```

**Outputs**:

- Test coverage reports
- JUnit XML reports for GitHub integration
- Pass/fail status for each test suite

#### Stage 3: End-to-End Testing (`e2e-test`)

**Purpose**: Validate complete API functionality

**Dependencies**: Requires `lint` stage to complete successfully

**Environment**:

- Dedicated test environment variables
- Real Gemini API integration (using test key)

**Steps**:

1. **Environment setup** with test configuration
2. **E2E test execution** against built application
3. **Test result reporting**

**Commands executed**:

```bash
npm install
npm run test:e2e -- --verbose
```

**Test coverage**:

- API endpoint functionality
- Authentication workflows
- Error handling scenarios
- Integration with external services

### Secrets Management

Required GitHub repository secrets:

- **`GEMINI_API_KEY`**: Valid API key for LLM integration testing

**Setting up secrets**:

1. Navigate to repository Settings → Secrets and variables → Actions
2. Add repository secrets with appropriate values
3. Ensure secrets are available to CI workflows

### Test Reporting

The pipeline generates comprehensive test reports:

#### JUnit Reports

- **Format**: XML files compatible with GitHub's test reporting
- **Location**: `./junit/vitest-junit.xml`
- **Integration**: Automatic GitHub PR status checks

#### Coverage Reports

- **Generator**: Vitest with `@vitest/coverage-v8`
- **Metrics**: Line, branch, function, and statement coverage
- **Thresholds**: Configurable minimum coverage requirements

## Docker Release Pipeline

### Workflow Overview

The release pipeline (`/.github/workflows/docker-release.yml`) automates Docker image building and publishing.

### Trigger Conditions

```yaml
on:
  release:
    types: [published]
```

Triggers when:

- A new GitHub release is published
- Release can be pre-release or full release

### Release Process

#### Stage 1: Build Preparation

**Steps**:

1. **Code checkout**: Gets release tag source code
2. **Docker Buildx setup**: Enables advanced Docker build features
3. **Registry authentication**: Logs into GitHub Container Registry

#### Stage 2: Image Building and Publishing

**Process**:

1. **Version extraction**: Extracts version from release tag
2. **Multi-architecture build**: Builds for multiple platforms
3. **Image tagging**: Creates both version-specific and `latest` tags
4. **Registry push**: Publishes to GitHub Container Registry

**Image tags created**:

- `ghcr.io/h-arnold/assessmentbot-backend:vX.Y.Z` (version tag)
- `ghcr.io/h-arnold/assessmentbot-backend:latest` (latest tag)

**Docker build configuration**:

```yaml
context: .
file: ./Docker/Dockerfile.prod
push: true
tags: |
  ghcr.io/${{ github.repository }}:${{ env.RELEASE_VERSION }}
  ghcr.io/${{ github.repository }}:latest
```

### Registry Configuration

**GitHub Container Registry (GHCR)**:

- **URL**: `ghcr.io`
- **Authentication**: GitHub token with package write permissions
- **Visibility**: Public (no authentication required for pulling)
- **Retention**: Configurable image retention policies

## Security Scanning

### CodeQL Analysis

**Workflow**: `/.github/workflows/codeql.yml`

**Purpose**: Static application security testing (SAST)

**Features**:

- **Vulnerability detection**: Identifies security issues in code
- **Language support**: TypeScript/JavaScript analysis
- **Integration**: Results appear in GitHub Security tab
- **Scheduling**: Runs on push and pull requests

### SonarQube Integration

**Workflow**: `/.github/workflows/sonarqube.yml`

**Purpose**: Code quality and security analysis

**Metrics analyzed**:

- **Code coverage**: Test coverage percentages
- **Code smells**: Maintainability issues
- **Security hotspots**: Potential security vulnerabilities
- **Duplicated code**: Code duplication analysis

**Configuration**: `sonar-project.properties`

```properties
sonar.projectKey=assessmentbot-backend
sonar.organization=your-org
sonar.sources=src
sonar.tests=src,test
sonar.test.inclusions=**/*.spec.ts,**/*.e2e-spec.ts
```

## Dependency Management

### Dependabot Configuration

**File**: `/.github/dependabot.yml`

**Purpose**: Automated dependency updates

**Configuration**:

```yaml
version: 2
updates:
  - package-ecosystem: 'npm'
    directory: '/'
    schedule:
      interval: 'weekly'
    open-pull-requests-limit: 10
```

**Features**:

- **Weekly updates**: Checks for dependency updates weekly
- **Security updates**: Immediate updates for security vulnerabilities
- **PR management**: Creates pull requests for updates
- **Compatibility checks**: Runs CI pipeline on dependency updates

## Pipeline Configuration

### GitHub Actions Setup

#### Repository Configuration

1. **Enable Actions**: Ensure GitHub Actions are enabled for the repository
2. **Configure secrets**: Add required secrets for external service integration
3. **Set permissions**: Configure workflow permissions for container registry access

#### Workflow Permissions

Required permissions for workflows:

```yaml
permissions:
  contents: read # Read repository content
  packages: write # Push to container registry
  security-events: write # Write security scan results
  actions: read # Read action results
```

### Environment Variables

#### CI Environment

Standard environment variables used across workflows:

```bash
NODE_ENV=test                    # Test environment
GITHUB_TOKEN=${{ secrets.GITHUB_TOKEN }}  # Automatic GitHub token
GEMINI_API_KEY=${{ secrets.GEMINI_API_KEY }}  # LLM API key
```

#### Build Environment

Build-specific variables:

```bash
DOCKER_BUILDKIT=1               # Enable BuildKit
COMPOSE_DOCKER_CLI_BUILD=1      # Enable BuildKit in Compose
```

## Status Checks and Branch Protection

### Required Status Checks

Configure branch protection rules for `master` branch:

1. **Require status checks**: All CI jobs must pass
2. **Require branches to be up to date**: Force rebasing before merge
3. **Required checks**:
   - `lint`
   - `unit-test`
   - `e2e-test`
   - `CodeQL`

### Branch Protection Configuration

```yaml
# Example branch protection rules
required_status_checks:
  strict: true
  contexts:
    - 'lint'
    - 'unit-test'
    - 'e2e-test'
    - 'CodeQL'

restrictions:
  users: []
  teams: []

required_pull_request_reviews:
  required_approving_review_count: 1
  dismiss_stale_reviews: true
```

## Monitoring and Notifications

### Build Notifications

Configure notifications for build status:

1. **Email notifications**: On build failures
2. **Slack/Teams integration**: Real-time build status
3. **GitHub mobile app**: Push notifications for build status

### Metrics and Analytics

Track CI/CD performance:

- **Build duration**: Monitor pipeline execution time
- **Success rate**: Track build success percentage
- **Test coverage trends**: Monitor coverage over time
- **Dependency update frequency**: Track update velocity

## Local Development Integration

### Pre-commit Hooks

Align local development with CI pipeline:

**Husky configuration** (`.husky/pre-commit`):

```bash
#!/usr/bin/env sh
npx lint-staged
```

**Lint-staged configuration** (`package.json`):

```json
{
  "lint-staged": {
    "*.ts": "eslint --fix",
    "*.{js,ts,json,md}": "prettier --write",
    "*.{ts,js}": "./scripts/check-british-english.sh"
  }
}
```

### Local CI Simulation

Run CI checks locally before pushing:

```bash
# Run all linting checks
npm run lint

# Run unit tests with coverage
npm run test:cov

# Run E2E tests
npm run test:e2e

# Build Docker image locally
docker build -f Docker/Dockerfile.prod -t assessmentbot-backend:local .

# Lint Dockerfiles
hadolint Docker/Dockerfile
hadolint Docker/Dockerfile.prod
```

## Troubleshooting

### Common CI Issues

#### Build Failures

**Linting errors**:

```bash
# Fix locally
npm run lint:fix
npm run format
```

**Test failures**:

```bash
# Run tests locally
npm test
npm run test:e2e

# Debug specific test
npm test -- --testNamePattern="failing test"
```

#### Docker Build Issues

**Multi-platform build failures**:

```bash
# Test locally with BuildKit
DOCKER_BUILDKIT=1 docker build -f Docker/Dockerfile.prod .
```

**Registry authentication**:

- Verify GitHub token permissions
- Check package write permissions
- Ensure container registry is accessible

#### Environment Issues

**Missing secrets**:

1. Verify secrets are configured in repository settings
2. Check secret names match workflow references
3. Ensure secrets are available to workflow branches

**API quota exceeded**:

- Monitor Gemini API usage
- Consider using test API keys with higher quotas
- Implement retry logic in tests

### Performance Optimisation

#### Build Speed

**Optimise dependency installation**:

```yaml
# Use npm ci for faster, reliable installs
- name: Install dependencies
  run: npm ci
```

**Cache dependencies**:

```yaml
- name: Cache Node.js modules
  uses: actions/cache@v3
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

#### Parallel Execution

**Matrix builds** for multiple environments:

```yaml
strategy:
  matrix:
    node-version: [20, 22]
    os: [ubuntu-latest, windows-latest]
```

## Best Practices

### CI/CD Security

1. **Principle of least privilege**: Grant minimum required permissions
2. **Secret rotation**: Regularly rotate API keys and tokens
3. **Dependency scanning**: Use Dependabot and security advisories
4. **Container scanning**: Scan Docker images for vulnerabilities

### Pipeline Maintenance

1. **Regular updates**: Keep action versions up to date
2. **Performance monitoring**: Track build times and success rates
3. **Documentation**: Maintain up-to-date pipeline documentation
4. **Testing**: Test pipeline changes in feature branches

### Integration Quality

1. **Fast feedback**: Keep CI pipeline under 10 minutes
2. **Reliable tests**: Ensure tests are deterministic and stable
3. **Clear reporting**: Provide detailed test and build reports
4. **Meaningful checks**: Only require checks that add value

## Next Steps

After setting up CI/CD:

1. **Configure monitoring**: See [Monitoring & Observability Guide](monitoring.md)
2. **Set up production deployment**: See [Production Setup Guide](production.md)
3. **Review security**: Regularly audit pipeline security and permissions
