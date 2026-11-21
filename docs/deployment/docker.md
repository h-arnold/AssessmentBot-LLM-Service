# Docker Deployment

This guide covers the containerised deployment of the Assessment Bot LLM Service using Docker.

## Overview

The Assessment Bot LLM Service supports two Docker deployment scenarios:

- **Development**: Local development with hot-reloading and debugging capabilities, using `Docker/Dockerfile`.
- **Production**: Optimised, secure containers for production environments, using `Docker/Dockerfile.prod`.

The production image uses a multi-stage build to create a minimal, secure runtime image that runs as a non-root user and includes a health check.

## Local Development with Docker

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/h-arnold/AssessmentBot-LLM-Service.git
    cd AssessmentBot-LLM-Service
    ```

2.  **Set up environment variables**:

    ```bash
    cp .env.example .env
    # Edit .env with your configuration. The default models require MISTRAL_API_KEY;
    # add GEMINI_API_KEY when selecting a Gemini model.
    ```

3.  **Build and run the development container**:

    ```bash
    docker build -f Docker/Dockerfile -t assessmentbot-llm-service:dev .
    docker run --name assessmentbot -p 3000:3000 --env-file .env assessmentbot-llm-service:dev
    ```

4.  **Access the application**:
    - API: `http://localhost:3000`
    - Health check: `http://localhost:3000/health`

## Running the Production Image

Run the published production image as a single container, passing your configuration with an environment file. Set `NODE_ENV=production` in that file: the example ships `NODE_ENV=development` and `--env-file` passes the value through, overriding the schema default; see [Environment Configuration](../configuration/environment.md).

```bash
docker run -d --name assessmentbot --restart unless-stopped -p 3000:3000 --env-file .env ghcr.io/h-arnold/assessmentbot-llm-service:latest
```

The application listens on port 3000 inside the container. See [Production Setup](production.md) for the full deployment procedure and [Container Registry](#container-registry) for how the image is published.

## Configuration

### Environment Variables

The container reads its configuration from the `.env` file passed with `--env-file`, both for local development and for the published production image. Create `.env` from `.env.example` as shown above, and see [Environment Configuration](../configuration/environment.md) for the variable reference. For the production image, the file must set `NODE_ENV=production`, as described in [Running the Production Image](#running-the-production-image).

## Health Monitoring

The production image includes a Docker `HEALTHCHECK` that probes `/health`. See [Monitoring & Observability](monitoring.md) for the endpoint, the health-check script and how to inspect container health status.

## Container Registry

Production images are automatically published on new releases to the GitHub Container Registry (`ghcr.io/h-arnold/assessmentbot-llm-service`) and to Google Artifact Registry at `<GAR_LOCATION>-docker.pkg.dev/<PROJECT_ID>/<GAR_REPOSITORY>/backend`.

- **Tags**: Version tags (e.g., `v1.0.0`) and `latest`

You can pull the GHCR image with `docker pull`.

```bash
# Pull latest image
docker pull ghcr.io/h-arnold/assessmentbot-llm-service:latest
```

## Troubleshooting

If the container won't start, check its logs with `docker logs assessmentbot`. To run diagnostic commands inside the container, use `docker exec -it assessmentbot sh`.
