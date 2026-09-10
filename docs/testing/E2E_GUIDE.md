# E2E Testing Guide

This document provides instructions for setting up and running the End-to-End (E2E) tests for the Assessment Bot LLM Service.

## Running E2E Tests

E2E tests are split into mocked (default) and live suites. Use the following commands:

```bash
# Default mocked suite (no live provider calls)
npm run test:e2e

# Explicit mocked run
npm run test:e2e:mocked

# Live suites (real provider API calls)
npm run test:e2e:live
```

The mocked run builds the application and executes all `*.e2e-spec.ts` tests in the `test/` directory **excluding** `*-live.e2e-spec.ts`. The live run targets both `assessor-live.e2e-spec.ts` and `mistral-live.e2e-spec.ts`.

### Mocked vs Live Configuration

- **Mocked config**: The `e2e` Vitest workspace project sets `process.env.E2E_MOCK_LLM=true` via `vitest.e2e.setup.ts` and excludes `*-live.e2e-spec.ts` from its test include patterns.
- **Live config**: The `e2e-live` Vitest workspace project runs `assessor-live.e2e-spec.ts` and `mistral-live.e2e-spec.ts`.

## Test Environment

E2E tests are managed by utilities in `test/utils/` to ensure each test file runs against a fresh, isolated application instance.

### Environment Configuration

The test setup uses a specific strategy for managing environment variables to ensure reliability and security:

1.  **Hardcoded Test Configuration**: Most configuration variables (`PORT`, `API_KEYS`, `THROTTLER_TTL`, etc.) are hardcoded within the `startApp` function in `test/utils/app-lifecycle.ts`. This guarantees that all tests run with the exact same configuration, simplifying setup and preventing flaky tests.

2.  **Live API keys (`GEMINI_API_KEY` and `MISTRAL_API_KEY`)**: Provider API keys are sensitive secrets and are handled differently:
    - **Default**: Dummy keys (`dummy-key-for-testing`) are injected for both providers. This allows mocked E2E tests to run without any special setup.
    - **Live Tests**: Provide a valid key for each provider used by the live suite: `assessor-live.e2e-spec.ts` uses Gemini and `mistral-live.e2e-spec.ts` uses Mistral. Create a file named `.test.env` in the project's root directory and add the following as needed:

      ```
      GEMINI_API_KEY=your_real_api_key_here
      MISTRAL_API_KEY=your_real_api_key_here
      ```

    The `startApp` function automatically detects this file and uses the key if it exists. This is the **only** recommended use for the `.test.env` file.

3.  **API Rate Limiting Configuration**: To prevent hitting upstream provider rate limits, the test environment includes enhanced retry and backoff settings:
    - `LLM_BACKOFF_BASE_MS`: Set to `2000` (2 seconds) in test environment, doubled from the production default of 1 second
    - `LLM_MAX_RETRIES`: Set to `5` in test environment, increased from the production default of 3
    - Tests include strategic delays between API calls to stay within rate limits:
      - Most tests that call an upstream provider include a 2-second delay before making requests
      - The throttler test uses sequential requests with 600ms delays instead of parallel requests
      - Live API tests include 2-second delays between each test case

    These settings are automatically applied when tests run and help ensure consistent test execution without rate limit errors.

### LLM Mocking (Mocked E2E)

When `E2E_MOCK_LLM=true`, the test runner applies an ESM preload shim to avoid live provider calls:

- `startApp` injects `--import=<file://.../llm-mock.mjs>` via `NODE_OPTIONS`.
- The shim (`test/utils/llm-mock.mjs`) imports both provider SDKs and patches `GoogleGenAI.prototype.models` and `Mistral.prototype.chat` so Gemini `generateContent` and Mistral `complete` calls are intercepted.
- It detects image requests and returns deterministic, schema-valid fixtures for text/table and image tasks. The fixtures use provider-specific response shapes and varied scores.

This keeps the full HTTP request/response flow intact while making provider responses stable and offline. Use the live suites when you need to validate real provider behaviour or quotas.

### Overriding Environment Variables

For specific scenarios, such as testing throttler limits, you can override the default environment variables by passing an `envOverrides` object to the `startApp` function.

**Example:**

```typescript
describe('Throttler E2E Test', () => {
  let app: AppInstance;

  beforeAll(async () => {
    const envOverrides = {
      AUTHENTICATED_THROTTLER_LIMIT: '5', // Override default
      THROTTLER_TTL: '10',
    };
    app = await startApp('/tmp/throttler-test.log', envOverrides);
  });

  afterAll(() => {
    stopApp(app.appProcess);
  });

  it('should block requests after reaching the limit', async () => {
    // ... test logic
  });
});
```

## How to Add a New E2E Test

1.  Create a new file in the `test/` directory with the suffix `.e2e-spec.ts` (e.g., `my-feature.e2e-spec.ts`).
2.  Import `startApp` and `stopApp` from `./utils/app-lifecycle.ts`.
3.  Use `beforeAll` to call `startApp`. Pass an `envOverrides` object if needed.
4.  Use `afterAll` to call `stopApp` to terminate the application process.
5.  Write your tests using `supertest` to make requests to the `appUrl` provided by the `startApp` result.
6.  **Important**: If your test makes calls to an upstream LLM provider, import and use the `delay()` helper function to add a 2-second delay before API calls to avoid rate limiting:

```typescript
import { startApp, stopApp, delay } from './utils/app-lifecycle';

it('should assess a submission', async () => {
  await delay(2000); // Add delay before API call

  const response = await request(app.appUrl)
    .post('/v1/assessor')
    .set('Authorization', `Bearer ${app.apiKey}`)
    .send(payload);

  expect(response.status).toBe(201);
});
```

## Troubleshooting

### Rate Limiting Errors (503 Service Unavailable)

If you encounter 503 errors or "Resource Exhausted" messages when running E2E tests:

1.  **Check API Key Tier**: Provider free tiers may have stricter rate limits. If tests consistently fail with rate limit errors, you may need to:
    - Use a paid API key with higher limits
    - Increase the delays between API calls in your tests
    - Run tests individually rather than the full suite

2.  **Verify Delay Configuration**: Ensure tests that call an upstream provider include appropriate delays:
    - Standard tests: 2-second delay before API calls using `await delay(2000)`
    - Throttler tests: 600ms delays between sequential requests
    - Live API tests: 2-second delays between test cases

3.  **Check Retry Settings**: The test environment automatically configures enhanced retry settings:
    - `LLM_BACKOFF_BASE_MS=2000` (2 seconds)
    - `LLM_MAX_RETRIES=5`

    These are set in `test/utils/app-lifecycle.ts` and the CI workflow (`.github/workflows/ci.yml`).

4.  **Run Tests Individually**: If the full suite fails due to rate limits, run individual test files:

    ```bash
    npm run test:e2e:mocked -- test/auth.e2e-spec.ts
    npm run test:e2e:live -- test/assessor-live.e2e-spec.ts
    ```

5.  **Monitor API Usage**: Check the configured provider's quota and usage dashboard to ensure you haven't exceeded limits.
