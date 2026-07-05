# Docker Deployment

This guide covers the containerised deployment of the Assessment Bot LLM Service using Docker and Docker Compose.

## Overview

The Assessment Bot LLM Service supports two Docker deployment scenarios:

- **Development**: Local development with hot-reloading and debugging capabilities, using `Docker/Dockerfile`.
- **Production**: Optimised, secure containers for production environments, using `Docker/Dockerfile.prod`.

The production image uses a multi-stage build to create a minimal, secure runtime image that runs as a non-root user and includes a health check.

## Local Development with Docker

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/h-arnold/Assessment Bot LLM Service.git
    cd Assessment Bot LLM Service
    ```

2.  **Set up environment variables**:

    ```bash
    cp .env.example .env
    # Edit .env with your configuration, especially GEMINI_API_KEY
    ```

3.  **Build and run the development container**:

    ```bash
    docker build -f Docker/Dockerfile -t assessmentbot-backend:dev .
    docker run -p 3000:3000 --env-file .env assessmentbot-backend:dev
    ```

4.  **Access the application**:
    - API: `http://localhost:3000`
    - Health check: `http://localhost:3000/status`

## Production Deployment

For production, it is recommended to use Docker Compose, which orchestrates the application, a Caddy reverse proxy, and a Fail2ban intrusion prevention service.

### Docker Compose Deployment

```bash
# Start all services in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Docker Compose Services

The `docker-compose.yml` file defines three services:

1.  **`app`**: The main application container, running the production image from `ghcr.io/h-arnold/assessmentbot-backend:latest`. It is not exposed externally.
2.  **`caddy`**: An Alpine-based Caddy container that acts as a reverse proxy, providing automatic HTTPS via Let's Encrypt. It exposes ports 80 and 443.
3.  **`fail2ban`**: A security service that monitors Caddy's access logs and blocks IPs that show malicious behaviour, such as excessive failed requests.

## Configuration

### Environment Variables

The application is configured via environment variables defined in the `.env` file. Key variables include `NODE_ENV`, `API_KEYS`, `GEMINI_API_KEY`, and `LOG_LEVEL`. Refer to `.env.example` for a full list.

### Caddy Configuration

The `Caddyfile` in the root directory configures Caddy to act as a reverse proxy for the application and enables access logging.

```
:80, :443 {
  reverse_proxy app:3000
  log {
    output file /var/log/caddy/access.log
    format single_field common_log
  }
}
```

### Fail2ban Configuration

The Fail2ban configuration is located in `fail2ban/jail.local`. It is set up to monitor the Caddy access log and ban IPs after 5 failed requests within a 10-minute window.

## Health Monitoring

The production Docker image has a built-in health check that uses the `scripts/health-check.js` script to verify the application's status.

The application also exposes a health check endpoint at `/status`.

```bash
# Check application health
curl http://localhost:3000/status

# Expected response
# { "status": "ok", ... }
```

## Container Registry

Production images are automatically published to the GitHub Container Registry upon new releases.

- **Registry**: `ghcr.io/h-arnold/assessmentbot-backend`
- **Tags**: Version tags (e.g., `v1.0.0`) and `latest`

You can pull images using `docker pull`.

```bash
# Pull latest image
docker pull ghcr.io/h-arnold/assessmentbot-backend:latest
```

## Troubleshooting

If the container won't start, check the logs using `docker-compose logs app`. If you encounter permission errors with volumes, you may need to adjust file ownership on the host. To test network connectivity between containers, you can run `docker-compose exec app sh` and use tools like `wget`.
