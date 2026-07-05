# Status Module

The Status Module (`src/status/`) provides health checks and system status functionality for the Assessment Bot LLM Service application, offering essential monitoring and diagnostic capabilities for operational oversight.

## Overview

The Status Module serves as the monitoring and diagnostics foundation that:

- Provides health check endpoints for application monitoring
- Offers connectivity testing and basic application status verification
- Delivers comprehensive system information for operational insights
- Provides error testing capabilities for exception handling validation
- Supports both development and production monitoring requirements

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

## Key Components

### 1. StatusController

**Location:** `src/status/status.controller.ts`

The controller provides HTTP endpoints for status monitoring and diagnostics:

**Endpoints:**

- `GET /` - Basic connectivity test
- `GET /health` - Comprehensive health check information
- `GET /test-error` - Error handling testing endpoint

### 2. StatusService

**Location:** `src/status/status.service.ts`

The service implements business logic for status operations and system information gathering:

**Key Responsibilities:**

- Collecting system metrics and application information
- Providing standardised health check responses
- Generating diagnostic data for monitoring systems

## API Endpoints

### GET /

**Purpose:** Basic connectivity and availability test

**Authentication:** None required

**Response:**

```typescript
'Hello World!';
```

**Use Cases:**

- Load balancer health checks
- Basic connectivity verification
- Service availability monitoring
- Quick status verification

### GET /health

**Purpose:** Comprehensive application and system health information

**Authentication:** None required

**Response:**

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

**Health Check Information:**

#### Application Data

- **`status`**: Overall application status (`"ok"`)
- **`version`**: Application version from `package.json`
- **`timestamp`**: ISO timestamp of health check execution

#### System Information

- **`platform`**: Operating system platform (e.g., `"linux"`, `"darwin"`, `"win32"`)
- **`arch`**: System architecture (e.g., `"x64"`, `"arm64"`)
- **`release`**: Operating system release version
- **`uptime`**: System uptime in seconds
- **`hostname`**: System hostname identifier
- **`totalMemory`**: Total system memory in bytes
- **`freeMemory`**: Available system memory in bytes
- **`cpus`**: Number of CPU cores available

**Use Cases:**

- Detailed application monitoring
- System resource monitoring
- Performance baseline establishment
- Operational dashboard integration

### GET /test-error

**Purpose:** Error handling and exception filter testing

**Authentication:** None required

**Response:**

```typescript
{
  "statusCode": 400,
  "message": "This is a test error",
  "timestamp": "2025-01-08T08:00:00.000Z",
  "path": "/test-error"
}
```

**Features:**

- **Intentional Error:** Always throws HTTP 400 Bad Request
- **Exception Filter Testing:** Validates error handling pipeline
- **Consistent Error Format:** Uses standard HTTP exception response format
- **Development Tool:** Assists in error handling verification

**Use Cases:**

- Exception filter testing
- Error handling pipeline validation
- Monitoring system alert testing
- Development debugging

## System Information Collection

The Status Module provides comprehensive system metrics:

### Memory Information

```typescript
const memoryInfo = {
  totalMemory: os.totalmem(), // Total system memory in bytes
  freeMemory: os.freemem(), // Available memory in bytes
  usedMemory: os.totalmem() - os.freemem(), // Calculated used memory
};
```

### CPU Information

```typescript
const cpuInfo = {
  cpus: os.cpus().length, // Number of CPU cores
  architecture: os.arch(), // System architecture
  platform: os.platform(), // Operating system platform
};
```

### System Status

```typescript
const systemStatus = {
  uptime: os.uptime(), // System uptime in seconds
  hostname: os.hostname(), // System hostname
  release: os.release(), // OS release version
};
```

## Error Handling

The module demonstrates comprehensive error handling patterns:

### HTTP Exception Format

All errors follow the standardised format:

```typescript
{
  "statusCode": number,          // HTTP status code
  "message": string,             // Error description
  "timestamp": string,           // ISO timestamp
  "path": string                 // Request path that caused error
}
```

### Test Error Generation

The `test-error` endpoint provides controlled error generation:

```typescript
@Get('test-error')
testError(): void {
  throw new HttpException('This is a test error', 400);
}
```

## Monitoring Integration

The Status Module is designed for integration with monitoring systems:

### Health Check Monitoring

- **Endpoint:** `GET /health`
- **Expected Response:** `200 OK` with JSON health data
- **Monitoring Frequency:** Can be called frequently (every 30-60 seconds)
- **Alerting:** Monitor for non-200 responses or missing fields

### Basic Availability Monitoring

- **Endpoint:** `GET /`
- **Expected Response:** `200 OK` with "Hello World!" text
- **Monitoring Frequency:** High frequency checks (every 10-30 seconds)
- **Use Case:** Load balancer health checks

## Testing

The module includes comprehensive test coverage:

### Unit Tests

- **Controller Testing:** Tests all endpoint responses and error handling
- **Service Testing:** Tests business logic and data collection
- **Error Testing:** Validates exception throwing and handling
- **Authentication Testing:** Tests protected endpoint functionality

### Integration Testing

- **End-to-End Health Checks:** Full request/response cycle testing
- **Authentication Flow:** Complete API key authentication testing
- **Error Pipeline:** Exception filter and error response testing
- **System Information:** Real system data collection testing

## Performance Considerations

### Resource Usage

- **Lightweight Operations:** All endpoints perform minimal processing
- **System Calls:** Health endpoint makes system calls for metrics
- **Memory Efficient:** No data caching or storage requirements
- **CPU Minimal:** Simple data collection and serialisation only

### Scalability

- **Stateless Design:** No session or state management
- **High Frequency Safe:** Designed for frequent monitoring calls
- **Resource Monitoring:** Provides data for capacity planning
- **Horizontal Scale Ready:** No dependencies on local state

## Security Features

### Information Disclosure

- **System Information:** Health endpoint provides system metrics
- **No Sensitive Data:** No credentials or secrets exposed
- **Version Information:** Application version available for tracking
- **Operational Data Only:** System metrics only, no business data

## Configuration

### Dependencies

- **ConfigModule:** Required for configuration access
- **AuthModule:** Provides API key authentication (for protected endpoints)
- **Express:** Required for request/response handling

### Environment Variables

- **Standard Configuration:** Uses standard application configuration
- **No Module-Specific Config:** No additional environment variables required
- **Shared Resources:** Leverages existing authentication and throttling configuration

## Usage Examples

### Basic Health Check

```bash
curl http://localhost:3000/health
```

### Error Testing

```bash
curl http://localhost:3000/test-error
# Expected: 400 Bad Request with error details
```

### Monitoring Script Example

```bash
#!/bin/bash
# Basic monitoring script
HEALTH_URL="http://localhost:3000/health"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $STATUS -eq 200 ]; then
  echo "Application healthy"
else
  echo "Application unhealthy - Status: $STATUS"
fi
```

## Dependencies

The Status Module depends on:

- **@nestjs/common** - Core NestJS functionality and HTTP handling
- **@nestjs/throttler** - Rate limiting for protected endpoints (inherited)
- **ConfigModule** - Application configuration access

- **Node.js os module** - System information collection

## Related Documentation

- [App Module](app.md) - Main application module that includes StatusModule
- [API Reference](../api/API_Documentation.md) - Complete API endpoint documentation
- [Monitoring Guide](../deployment/monitoring.md) - Production monitoring setup
- [Health Check Configuration](../configuration/monitoring.md) - Monitoring configuration details
