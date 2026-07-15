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

Available levels (from most to least verbose): `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

## Viewing Logs

- **Development**: `npm run start:dev` outputs pretty-printed logs via `pino-pretty` automatically.
- **Production/Structured**: Set `LOG_FILE=./app.log` to write JSON logs to a file. Parse with `jq`:
  ```bash
  cat app.log | jq 'select(.level == "error")'
  ```

All HTTP requests are automatically logged by the global `nestjs-pino` middleware.

## Debugging Environment Variables

```bash
LOG_LEVEL=debug                            # Enable verbose logging
E2E_TESTING=true                           # Enable E2E test mode (mocks external calls)
NODE_OPTIONS="--inspect=0.0.0.0:9229"      # Enable Node.js inspector
```

## Debugging E2E Tests

```bash
npm run test:e2e:mocked              # Run mocked E2E tests (default, no external calls)
npm run test:e2e:mocked -- --verbose # Verbose output
npm run test:debug                   # Unit tests in debug mode
npx vitest run --project e2e test/specific.e2e-spec.ts  # Single test file
npm run test:e2e:live -- --verbose   # Live E2E tests (requires real GEMINI_API_KEY)
```

## Health Check

The application exposes a health check endpoint for quick status verification:

```bash
curl http://localhost:3000/health

# Expected response:
# { "status": "ok", "version": "0.1.0", "timestamp": "...", "systemInfo": { ... } }
```
