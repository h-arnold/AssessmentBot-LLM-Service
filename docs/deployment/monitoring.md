# Monitoring & Observability

This guide covers the built-in monitoring, logging, and observability features of the Assessment Bot LLM Service application.

## Overview

The application includes several features out-of-the-box to help with monitoring its status and behaviour in a production environment. For more advanced monitoring, these features can be integrated with external monitoring tools.

## Health Monitoring

### Application Health Endpoint

The application provides a health check endpoint at `/health`. A `GET` request to this endpoint will return a JSON response with the application's status. A `200 OK` status code indicates that the service is healthy.

```bash
# Check application health
curl http://localhost:3000/health

# Expected response
# { "status": "ok", "version": "...", "timestamp": "...", "systemInfo": { ... } }
```

### Docker Health Checks

The production Docker container (`Docker/Dockerfile.prod`) includes a built-in `HEALTHCHECK` instruction. It uses the `scripts/health-check.js` script to periodically check the `/health` endpoint. This allows Docker to automatically detect and report if the application container becomes unhealthy.

You can check the health status of a running container via the `docker ps` command or by inspecting the container.

```bash
# View container health status in the list of running containers
docker ps

# Inspect the health check history of a specific container
docker inspect --format='''{{.State.Health.Status}}''' assessmentbot-app
```

## Structured Logging

The application uses `nestjs-pino` for structured JSON logging. This provides consistent, machine-readable log output that is well-suited for log aggregation and analysis tools.

- In **development** (`NODE_ENV=development`), logs are pretty-printed to the console.
- In **production** (`NODE_ENV=production`), logs are output as single-line JSON objects to `stdout`.

The log level can be configured with the `LOG_LEVEL` environment variable (e.g., `info`, `warn`, `error`).

## Security Monitoring

The `docker-compose.yml` setup includes a `fail2ban` service. It is configured to monitor the Caddy reverse proxy's access logs for suspicious activity, such as repeated failed requests, and automatically ban offending IP addresses.

You can monitor Fail2ban's activity by checking its logs or using the `fail2ban-client`.

```bash
# Check the status of the Caddy jail, including banned IPs
docker-compose exec fail2ban fail2ban-client status caddy-auth

# View a history of bans and unbans
docker-compose logs fail2ban | grep "Ban\|Unban"
```
