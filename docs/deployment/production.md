# Production Setup

This guide covers a typical production environment configuration for the Assessment Bot LLM Service application.

## Server Requirements

- **OS**: A modern Linux distribution (e.g., Ubuntu 20.04+)
- **CPU**: 2+ cores
- **RAM**: 2GB+
- **Storage**: 20GB+ SSD
- **Software**: Docker (v20.10+) and Docker Compose (v2.0+)

## Server Setup

This section provides an example setup on a Linux server.

### 1. Install Dependencies

Install Docker and Docker Compose on your server.

```bash
# Example for Ubuntu:
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
sudo usermod -aG docker $USER

sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Configure Firewall

Allow traffic on standard web and SSH ports.

```bash
# Example for UFW on Ubuntu:
sudo ufw enable
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
```

### 3. Deploy Application

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/h-arnold/AssessmentBot-LLM-Service.git /opt/assessmentbot
    cd /opt/assessmentbot
    ```

2.  **Configure the environment:**
    Create a `.env` file by copying the example and customising it with your production settings.

    ```bash
    cp .env.example .env
    # Edit .env with production values, especially API_KEYS and GEMINI_API_KEY
    ```

    Generate secure API keys using the provided generator, e.g. `npm run generate:api-key`.
    This produces a key in the strict format (`abt_` prefix + 32 base64url characters) required by the application.

3.  **Configure the domain:**
    Update the `Caddyfile` with your domain name.
    ```caddy
    your-domain.com {
        reverse_proxy app:3000
        log {
            output file /var/log/caddy/access.log
            format single_field common_log
        }
    }
    ```
    Ensure your domain's DNS records point to the server's IP address.

### 4. Start the Application

Use Docker Compose to build and start all services.

```bash
# Start all services in detached mode
docker-compose up -d --build

# Verify all containers are running
docker-compose ps
```

### 5. Verify the Deployment

Check that the application is accessible and running correctly.

```bash
# Test health endpoint (should return HTTP 200)
curl -I https://your-domain.com/status

# Test an API endpoint with a valid key
curl -H "Authorization: Bearer your_api_key" \
     -H "Content-Type: application/json" \
     -d '''{"taskType":"TEXT","reference":"test","template":"test","studentResponse":"test"}''' \
     https://your-domain.com/v1/assessor
```

## Post-Installation

### Run as a System Service (Optional)

To ensure the application starts automatically on server boot, you can create a `systemd` service file.

1.  Create `/etc/systemd/system/assessmentbot.service`:

    ```ini
    [Unit]
    Description=AssessmentBot Backend
    Requires=docker.service
    After=docker.service

    [Service]
    Type=oneshot
    RemainAfterExit=yes
    WorkingDirectory=/opt/assessmentbot
    ExecStart=/usr/local/bin/docker-compose up -d
    ExecStop=/usr/local/bin/docker-compose down
    TimeoutStartSec=0

    [Install]
    WantedBy=multi-user.target
    ```

2.  Enable and start the service:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable --now assessmentbot.service
    ```

### Log Management

It is recommended to set up log rotation for the container logs to prevent them from consuming excessive disk space. You can use tools like `logrotate`.

### Security Hardening

- **Host Security**: Secure your host server by using SSH key authentication, disabling password-based SSH login, and keeping the system updated.
- **Container Resources**: To prevent a single container from consuming all server resources, you can define resource limits in the `docker-compose.yml` file.
- **API Keys**: Store API keys securely, rotate them periodically, and use different keys for different clients or environments.

### Updating the Application

To update the application to the latest version:

```bash
cd /opt/assessmentbot

# Pull the latest code and Docker images
git pull
docker-compose pull

# Restart the services with the new images
docker-compose up -d --build

# Clean up old, unused images
docker image prune -f
```
