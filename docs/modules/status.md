# Status Module

The Status Module (`src/status/`) provides health check and system status endpoints for the Assessment Bot LLM Service application.

## Module Structure

```typescript
@Module({
  imports: [ConfigModule],
  controllers: [StatusController],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
```

## API Endpoints

| Endpoint          | Method | Auth | Status | Response Shape                               |
| ----------------- | ------ | ---- | ------ | -------------------------------------------- |
| `GET /`           | GET    | None | `200`  | `'Hello World!'`                             |
| `GET /health`     | GET    | None | `200`  | `{ status, version, timestamp, systemInfo }` |
| `GET /test-error` | GET    | None | `400`  | `{ statusCode, message, timestamp, path }`   |

### GET /health

Returns a comprehensive health check with system information:

```typescript
{
  "status": "ok",
  "version": "0.0.1",
  "timestamp": "2025-01-08T08:00:00.000Z",
  "systemInfo": {
    "platform": "linux",
    "arch": "x64",
    "release": "5.4.0-74-generic",
    "uptime": 3600,
    "hostname": "assessment-bot-server",
    "totalMemory": 8589934592,
    "freeMemory": 4294967296,
    "cpus": 4
  }
}
```

### GET /test-error

Throws an intentional `400 Bad Request` for testing the error handling pipeline:

```typescript
{
  "statusCode": 400,
  "message": "This is a test error",
  "timestamp": "2025-01-08T08:00:00.000Z",
  "path": "/test-error"
}
```

## Dependencies

- **@nestjs/common** — Core NestJS functionality and HTTP handling
- **@nestjs/throttler** — Rate limiting for protected endpoints (inherited)
- **ConfigModule** — Application configuration access
- **Node.js os module** — System information collection

## Related Documentation

- [App Module](app.md) — Main application module that includes StatusModule
- [API Reference](../api/API_Documentation.md) — Complete API endpoint documentation
- [Monitoring Guide](../deployment/monitoring.md) — Production monitoring setup
