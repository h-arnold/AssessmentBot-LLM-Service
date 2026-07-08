# Debugging Guide

This document provides comprehensive guidance on debugging techniques and tools available for the Assessment Bot LLM Service project.

## Debugging Setup

### VS Code Debugging Configuration

The project includes VS Code tasks for efficient debugging:

#### Starting Debug Mode

```bash
# Start application in debug mode with watch
npm run start:debug

# Alternative: Node.js inspect mode
npm run debug
```

#### VS Code Debug Configuration

Add to your `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug NestJS App",
      "type": "node",
      "request": "attach",
      "port": 9229,
      "restart": true,
      "stopOnEntry": false,
      "localRoot": "${workspaceFolder}",
      "remoteRoot": "${workspaceFolder}",
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    },
    {
      "name": "Debug Vitest Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/vitest",
      "args": ["run", "--reporter=verbose", "--testTimeout=60000"],
      "env": {
        "NODE_ENV": "test"
      },
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Debugging with Breakpoints

1. **Set Breakpoints**: Click in the gutter next to line numbers in VS Code
2. **Start Debug Mode**: `npm run start:debug`
3. **Attach Debugger**: Use VS Code's "Debug NestJS App" configuration
4. **Trigger Code Path**: Make requests to trigger your breakpoints

## Application Logging

### Log Levels and Configuration

The application uses `nestjs-pino` for structured logging:

```typescript
// Default log levels (from .env)
LOG_LEVEL = debug; // development
LOG_LEVEL = info; // production
```

Available levels: `fatal`, `error`, `warn`, `info`, `debug`, `trace`

### Accessing Logs

#### Development Logs

```bash
# Pretty printed console output (automatic in development)
npm run start:dev
```

#### Production-style JSON Logs

```bash
# Set LOG_FILE environment variable for JSON output
LOG_FILE=./app.log npm run start:dev
```

### Adding Debug Logging

```typescript
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class YourService {
  private readonly logger = new Logger(YourService.name);

  someMethod(someInput: string): void {
    this.logger.debug('Starting operation...');
    try {
      if (!someInput) throw new Error('Input is empty');
      this.logger.log('Operation successful');
    } catch (error) {
      this.logger.error('Operation failed', error.stack);
    }
  }
}
```

## Common Debugging Scenarios

### 1. API Request/Response Issues

#### Enable Request Logging

The application automatically logs HTTP requests. Check for:

```bash
# Example log output
[INFO] GET /v1/assessor/text - Response: 200 - 45ms
```

#### Debug Request Processing

```typescript
@Controller('example')
export class ExampleController {
  private readonly logger = new Logger(ExampleController.name);

  @Post()
  async handleRequest(@Body() body: any): Promise<any> {
    this.logger.debug('Received request body:', body);

    try {
      const result = await this.processRequest(body);
      this.logger.debug('Processing successful:', result);
      return result;
    } catch (error) {
      this.logger.error('Processing failed:', error.stack);
      throw error;
    }
  }
}
```

### 2. Database/LLM Integration Issues

#### LLM Service Debugging

```typescript
// GeminiService includes detailed logging
this.logger.debug('Sending to Gemini with model:', model);
this.logger.debug('Raw response from Gemini:', response);
```

Check logs for:

- Request payloads sent to LLM
- Raw responses received
- Parsing errors or validation failures

#### Rate Limiting Issues

Monitor throttling logs:

```bash
# Check for rate limiting responses
[WARN] Rate limit exceeded for IP: 127.0.0.1
```

### 3. Configuration Issues

#### Environment Variable Debugging

```typescript
// In ConfigService, add logging
this.logger.debug('Loaded environment variables:', {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  // Don't log sensitive variables like API keys
});
```

#### Configuration Validation Errors

```bash
# Zod validation errors will appear on startup
[ERROR] Environment validation failed: [
  {
    "code": "invalid_type",
    "expected": "string",
    "received": "undefined",
    "path": ["GEMINI_API_KEY"],
    "message": "Required"
  }
]
```

### 4. Authentication and Security Issues

#### API Key Authentication Debug

```bash
# Enable debug logging to see authentication attempts
LOG_LEVEL=debug npm run start:dev
```

Check for:

```bash
[DEBUG] Authentication attempt with key: key123***
[DEBUG] API key validation result: success
```

## Testing and Debugging

### Debugging Unit Tests

```bash
# Run tests in debug mode
npm run test:debug

# Run specific test file
npm test -- --testNamePattern="specific test"

# Run with verbose output
npm test -- --verbose
```

### Debugging E2E Tests

```bash
# Run E2E tests with detailed output
npm run test:e2e:mocked -- --verbose

# Run specific mocked E2E test
npx vitest run --project e2e test/specific.e2e-spec.ts

# Run live E2E test (real Gemini API calls)
npm run test:e2e:live -- --verbose
```

### Test Data Debugging

E2E tests use test data from `test/data/`:

```bash
# Check test image files
ls test/data/images/

# Verify test configurations
cat test/data/test-requests.json
```

## Performance Debugging

### Monitoring Request Performance

```typescript
// Add timing logs
const startTime = Date.now();
const result = await this.expensiveOperation();
const duration = Date.now() - startTime;
this.logger.debug(`Operation completed in ${duration}ms`);
```

### Memory and Resource Monitoring

```bash
# Monitor Node.js process
node --inspect-brk ./node_modules/.bin/nest start
# Open chrome://inspect in Chrome
```

## Error Handling and Debugging

### HTTP Exception Debugging

```typescript
import { HttpException, HttpStatus } from '@nestjs/common';

// Custom exceptions with debugging info
throw new HttpException(
  {
    message: 'Detailed error description',
    error: 'CUSTOM_ERROR_CODE',
    timestamp: new Date().toISOString(),
    path: '/api/endpoint',
  },
  HttpStatus.BAD_REQUEST,
);
```

### Global Exception Filter

The application includes a global exception filter that logs all errors:

```bash
# Check application logs for detailed error information
[ERROR] HttpException: Validation failed
  path: '/v1/assessor/text'
  method: 'POST'
  statusCode: 400
```

## Debugging Production Issues

### Structured Logging Analysis

```bash
# Parse JSON logs for analysis
cat app.log | jq '.level == "error"'

# Filter by specific error types
cat app.log | jq 'select(.msg | contains("Validation"))'
```

### Health Check Debugging

```bash
# Check application health
curl http://localhost:3000/status

# Expected response
{
  "status": "ok",
  "info": {},
  "error": {},
  "details": {}
}
```

## Debug Environment Variables

Useful environment variables for debugging:

```bash
# Enable detailed logging
LOG_LEVEL=debug

# Enable E2E test mode
E2E_TESTING=true

# Custom log file location
LOG_FILE=./debug.log

# Node.js debugging
NODE_OPTIONS="--inspect=0.0.0.0:9229"
```

## Troubleshooting Checklist

When debugging issues, check:

1. **Environment Configuration**
   - [ ] Required environment variables are set
   - [ ] API keys are valid and not expired
   - [ ] Port is available and not in use

2. **Dependencies**
   - [ ] `npm install` completed successfully
   - [ ] Node.js version matches requirements (22.x)
   - [ ] No conflicting global packages

3. **Code Quality**
   - [ ] TypeScript compilation passes (`npm run build`)
   - [ ] Linting passes (`npm run lint`)
   - [ ] Tests pass (`npm test`)

4. **Network and Security**
   - [ ] Firewall allows traffic on the configured port
   - [ ] CORS is properly configured for your client
   - [ ] Rate limiting is not blocking requests

5. **External Services**
   - [ ] Gemini API is accessible
   - [ ] API quotas are not exceeded
   - [ ] Network connectivity to external services

## Getting Help

If debugging doesn't resolve your issue:

1. **Check the logs** with `LOG_LEVEL=debug`
2. **Search existing issues** in the GitHub repository
3. **Create a minimal reproduction** case
4. **Include relevant logs** and error messages
5. **Provide environment details** (Node.js version, OS, etc.)
