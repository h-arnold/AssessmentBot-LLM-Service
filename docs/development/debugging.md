# Debugging Guide

How to debug the Assessment Bot LLM Service during development.

## Starting in Debug Mode

```bash
npm run start:debug      # Watch mode with Node.js inspect (port 9229)
npm run debug            # Node.js inspect without file watching
```

Attach a debugger (e.g. VS Code's "attach to node" configuration on port 9229) to set breakpoints and step through code.

## Log Level Configuration

Set the `LOG_LEVEL` environment variable in `.env`:

```bash
LOG_LEVEL=debug    # Development — verbose logging with pino-pretty
LOG_LEVEL=info     # Production — structured JSON logs
```

Available levels (from most to least verbose): `verbose`, `debug`, `info`, `warn`, `error`, `fatal`. See [Environment Variables](../configuration/environment.md).

> **Note:** Raw LLM prompt and response content (which may contain student-derived data) is gated behind the `LOG_LLM_CONTENT` env var. Even at `debug` or `verbose` level, this content appears only when `LOG_LLM_CONTENT=true` is also set.

## Viewing Logs

- **Development**: `npm run start:dev` outputs pretty-printed logs via `pino-pretty` automatically.
- **E2E file output**: Set `LOG_FILE=./app.log` to write JSON logs to a file during E2E runs (no stdout output). Parse with `jq`:
  ```bash
  cat app.log | jq 'select(.level == "error")'
  ```

All HTTP requests are automatically logged by the global `nestjs-pino` middleware.

## Debugging Environment Variables

```bash
LOG_LEVEL=debug                            # Enable verbose logging
LOG_LLM_CONTENT=true                       # Gate for raw LLM content
NODE_OPTIONS="--inspect=0.0.0.0:9229"      # Enable Node.js inspector
```

The `LOG_LLM_CONTENT` gate is described in [Log Level Configuration](#log-level-configuration).

## Debugging E2E Tests

```bash
npm run test:e2e                     # Run mocked E2E tests (default, no external calls)
npm run test:e2e -- --verbose        # Verbose output
npm run test:debug                   # Unit tests in debug mode
npx vitest run --project e2e test/specific.e2e-spec.ts  # Single test file
npm run test:e2e:live -- --verbose   # Live E2E tests (requires real provider API keys)
```

`npm run test:e2e` sets `E2E_MOCK_LLM` for you in [vitest.e2e.setup.ts](../../vitest.e2e.setup.ts).

## Health Check

The application exposes a health check endpoint for quick status verification:

```bash
curl http://localhost:3000/health

# Expected response:
# { "status": "ok", "version": "<package.json version>", "timestamp": "...", "systemInfo": { ... } }
```
