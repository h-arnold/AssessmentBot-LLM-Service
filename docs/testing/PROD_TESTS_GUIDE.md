# Production Image Testing Guide

This document provides instructions for running tests against a production-like Docker image of the Assessment Bot LLM Service.

## Overview

Production image tests are a special category of end-to-end (E2E) tests that validate the final artifact our CI/CD pipeline produces. Unlike standard E2E tests that run against a development server, these tests build and run a production Docker container using `Docker/Dockerfile.prod`.

The primary goals of these tests are to:

- Verify that the application can start successfully in a production configuration.
- Catch potential issues related to file paths, asset availability (e.g., prompt templates), or environment variable handling within the container.
- Perform basic smoke tests against key API endpoints to ensure they are operational.

## Running Production Image Tests

To run the production image tests, use the following command:

```bash
npm run test:prod
```

This command will:

1.  Build the application (`npm run build`).
2.  Execute the test specifications (`*.prod-spec.ts`) located in the `prod-tests/` directory using the `jest-prod.config.cjs` configuration.

The test script handles the entire lifecycle:

- **Building the Docker Image**: A new Docker image is built with the tag `assessmentbot-backend:prod-test`.
- **Running the Container**: A container named `assessmentbot-backend-prod-test` is started from the image. It is configured with dummy environment variables required for the application to start.
- **Executing Tests**: The tests run against the exposed port of the container.
- **Cleanup**: After the tests complete, the container is stopped and removed. Its logs are printed to the console for inspection.

**Note**: These tests can take a significant amount of time (up to 10 minutes) as they include building a Docker image.

## Test Environment

The test environment is entirely self-contained within the test scripts in `prod-tests/`.

- **Docker**: The tests require a running Docker daemon.
- **Configuration**: All configuration, including the Docker image tag, container name, and environment variables (`API_KEYS`, `GEMINI_API_KEY`), is hardcoded within the test files (e.g., `test/prod-tests/docker-image.prod-spec.ts`). This ensures consistency and avoids reliance on external configuration.
- **Utilities**: Helper functions for running shell commands (`runCmd`) and waiting for the container's HTTP service to be ready (`waitForHttp`) are located in `prod-tests/utils/docker-utils.ts`.

## How to Add a New Production Test

1.  Create a new file in the `prod-tests/` directory with the suffix `.prod-spec.ts`.
2.  Follow the structure in `docker-image.prod-spec.ts`, using the `beforeAll` and `afterAll` hooks to manage the Docker container lifecycle.
3.  Add test cases that interact with the running container by making HTTP requests to `http://localhost:3002` (the port exposed by the container).
