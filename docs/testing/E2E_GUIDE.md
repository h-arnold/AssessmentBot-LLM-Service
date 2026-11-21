# E2E environment and harness

Mocked E2E is the default and intercepts provider calls; `test:e2e:live` calls the real APIs. Run mocked suites with `npm run test:e2e` and live suites with `npm run test:e2e:live`.

## Running E2E tests

The `test:e2e` script builds the application, then the mocked Vitest project runs every `test/**/*.e2e-spec.ts` file. Live specs (`*-live.e2e-spec.ts`) are excluded through the project's `exclude` pattern. The live project runs the `*-live.e2e-spec.ts` files listed in [`vitest.config.ts`](../../vitest.config.ts).

The `e2e` Vitest project sets `process.env.E2E_MOCK_LLM=true` in `vitest.e2e.setup.ts`; the `e2e-live` project does not.

## Test environment

[`startApp`](../../test/utils/app-lifecycle.ts) spawns a freshly built application on a fixed port (`3001`) and returns an `AppInstance` with its URL and generated keys. It requires the built entrypoint `dist/src/testing-main.js`, so build before running E2E tests.

### Environment configuration

`startApp` merges environment variables in this order: `process.env`, then test defaults, then `.test.env`, then the `environmentOverrides` argument. Most defaults are set in `test/utils/app-lifecycle.ts`.

Live keys (`GEMINI_API_KEY`, `MISTRAL_API_KEY`) are the exception. Put the keys you need in `.test.env` at the project root:

```dotenv
GEMINI_API_KEY=...
MISTRAL_API_KEY=...
```

`assessor-live.e2e-spec.ts` uses Gemini; `mistral-live.e2e-spec.ts` uses Mistral. Mocked runs use dummy keys and need no setup.

### API rate limiting in tests

To avoid upstream rate limits, [`app-lifecycle.ts`](../../test/utils/app-lifecycle.ts) sets the backoff and retry defaults `LLM_BACKOFF_BASE_MS=2000` and `LLM_MAX_RETRIES=5`. Per-call delays are literals in individual specs, such as the `await delay(2000)` before provider calls in [`assessor.e2e-spec.ts`](../../test/assessor.e2e-spec.ts). [rate-limiting configuration](../api/rate-limiting.md) owns the throttler defaults.

### LLM mock shim (mocked E2E)

When `E2E_MOCK_LLM=true`, `startApp` injects `--import=<shim>` through `NODE_OPTIONS`. The shim (`test/utils/llm-mock.mjs`) imports both provider SDKs and patches `GoogleGenAI.prototype.models` and `Mistral.prototype.chat`, so `generateContent` and `complete` calls are intercepted. It detects image requests and returns deterministic, schema-valid fixtures with provider-specific shapes and varied scores. The HTTP request/response flow stays intact; use the live suites to validate real provider behaviour or quotas.

### Overriding environment variables

Pass an `environmentOverrides` object to `startApp` for scenarios such as throttler limits. Use a repo-relative log path derived from `getCurrentDirname()`:

```typescript
import path from 'node:path';

import { startApp } from './utils/app-lifecycle.js';
import { getCurrentDirname } from 'src/common/file-utilities';

const logFilePath = path.join(
  getCurrentDirname(),
  'logs',
  'throttler-test.log',
);
const app = await startApp(logFilePath, {
  AUTHENTICATED_THROTTLER_LIMIT: '5',
  THROTTLER_TTL: '10',
});
```

## Adding an E2E test

1. Create a file in `test/` with the `.e2e-spec.ts` suffix.
2. Import `startApp`, `stopApp` and `delay` from [`./utils/app-lifecycle.js`](../../test/utils/app-lifecycle.ts).
3. Call `startApp` in `beforeAll` and `stopApp(app.appProcess)` in `afterAll`. The harness expects the built app on a fixed port; see `startApp` above.
4. Make requests with `supertest` against `app.appUrl`, setting `Authorization: Bearer <app.apiKey>`.
5. If the test calls a provider, `await delay(2000)` before the request to stay within rate limits (see [API rate limiting in tests](#api-rate-limiting-in-tests)).

## Troubleshooting

### 503 or "Resource Exhausted" responses

These mean an upstream rate limit or quota was hit. Check the configured provider's quota, increase the delays in your test, or run the file on its own:

```bash
npm run test:e2e -- test/auth.e2e-spec.ts
npm run test:e2e:live -- test/assessor-live.e2e-spec.ts
```

The test-specific retry and delay settings are described in [API rate limiting in tests](#api-rate-limiting-in-tests).
