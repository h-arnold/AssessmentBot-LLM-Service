# Production Setup

This guide covers a typical production environment configuration for the Assessment Bot LLM Service application.

## Server Requirements

- **OS**: A modern Linux distribution
- **CPU**: 2+ cores
- **RAM**: 2GB+
- **Storage**: 20GB+ SSD
- **Software**: Docker (verify with `docker --version`)

## Server Setup

This section provides an example setup on a Linux server.

### 1. Install Docker and Configure the Host

Meet the [Server Requirements](#server-requirements), install Docker using the [official Docker installation guide](https://docs.docker.com/engine/install/), and allow ports 22 and 3000 through your host firewall. Confirm the install with `docker --version`.

### 2. Deploy Application

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/h-arnold/AssessmentBot-LLM-Service.git /opt/assessmentbot
    cd /opt/assessmentbot
    ```

2.  **Configure the environment:**
    Create a `.env` file by copying the example and customising it with your production settings.

    ```bash
    cp .env.example .env
    # Edit .env with production values, especially API_KEYS and MISTRAL_API_KEY.
    # Add GEMINI_API_KEY only when selecting a Gemini model.
    ```

    Set `NODE_ENV=production` in `.env`. The example ships `NODE_ENV=development` and the container passes the file with `--env-file`, so its value overrides the schema default; see [Environment Configuration](../configuration/environment.md).

    Generate secure API keys using the provided generator, e.g. `npm run generate:api-key`.
    This produces a key in the strict format (`abt_` prefix + 32 base64url characters) required by the application.

### 3. Start the Application

Run the published production image as a single container, using the `.env` file you created:

```bash
docker run -d --name assessmentbot --restart unless-stopped -p 3000:3000 --env-file .env ghcr.io/h-arnold/assessmentbot-llm-service:latest
```

Verify the container is running:

```bash
docker ps
```

### 4. Verify the Deployment

Check that the application is accessible and running correctly; [Monitoring & Observability](monitoring.md) describes the health endpoint. The [API reference](../api/API_Documentation.md) defines the assessment request body used below.

```bash
# Test health endpoint (should return HTTP 200)
curl http://<server-ip>:3000/health

# Submit an assessment; request.json must contain a valid payload (see the API reference)
curl -X POST -H "Authorization: Bearer your_api_key" \
     -H "Content-Type: application/json" \
     -d @request.json \
     http://<server-ip>:3000/v1/assessor
```

The service serves plain HTTP on port 3000. TLS termination is the operator's responsibility; if you need HTTPS, run a reverse proxy of your choice.

## Post-Installation

### Run as a System Service (Optional)

The container uses the `unless-stopped` restart policy. To manage it with the host, create an `assessmentbot.service` unit whose start command is `docker start assessmentbot` and whose stop command is `docker stop assessmentbot`. See the [`systemd` service documentation](https://www.freedesktop.org/software/systemd/man/systemd.service.html) for the unit format and `systemctl` commands.

### Log Management

Configure log rotation for container logs to prevent excessive disk use; see your distribution's [`logrotate` documentation](https://linux.die.net/man/8/logrotate).

### Security Hardening

Store API keys securely and rotate them periodically. For host hardening, follow your distribution's guidance on SSH key authentication and disabling password login.

### Updating the Application

To update the application to the latest image, pull it and recreate the container:

```bash
cd /opt/assessmentbot

docker pull ghcr.io/h-arnold/assessmentbot-llm-service:latest
docker rm -f assessmentbot
docker run -d --name assessmentbot --restart unless-stopped -p 3000:3000 --env-file .env ghcr.io/h-arnold/assessmentbot-llm-service:latest

# Clean up old, unused images
docker image prune -f
```
