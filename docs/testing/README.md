# Testing commands and architecture

Assessment Bot LLM Service uses Vitest with three projects: unit, mocked E2E and live E2E. Mocked E2E is the default and never calls a live provider; only `test:e2e:live` does.

Follow test-driven development and use British English in every test.

## Commands

| Command                 | Suite                                              |
| ----------------------- | -------------------------------------------------- |
| `npm run test:e2e`      | Mocked E2E. An ESM shim intercepts provider calls. |
| `npm run test:e2e:live` | Live E2E. Calls the real provider APIs.            |

The remaining commands (unit, watch, coverage and debug) are listed in [`package.json`](../../package.json).

## Suite layout

[`vitest.config.ts`](../../vitest.config.ts) defines three projects:

- **Unit and integration**: `src/**/*.spec.ts` and `test/**/*.unit-spec.ts`. Tests are co-located with source. See [Unit test patterns and fixtures](./PRACTICAL_GUIDE.md).
- **E2E**: `test/**/*.e2e-spec.ts`. Live specs (`*-live.e2e-spec.ts`) are removed by the project's `exclude` pattern. See [E2E environment and harness](./E2E_GUIDE.md).
- **Live E2E**: the two `*-live.e2e-spec.ts` files under `test/`.

## Test environment and secrets

Mocked runs need no provider keys. Live keys come from `.test.env`, which overrides the defaults that [`startApp`](../../test/utils/app-lifecycle.ts) sets; see [E2E environment and harness](./E2E_GUIDE.md) for the live-key setup.

Rate-limit settings for E2E tests and the mock shim are described in [E2E environment and harness](./E2E_GUIDE.md). Fixture locations and loading are described in [Unit test patterns and fixtures](./PRACTICAL_GUIDE.md).
