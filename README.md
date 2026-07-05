# Assessment Bot - LLM Service

![CI - Unit & E2E Tests](https://github.com/h-arnold/Assessment Bot LLM Service/actions/workflows/ci.yml/badge.svg)
![CodeQL](https://github.com/h-arnold/Assessment Bot LLM Service/actions/workflows/codeql.yml/badge.svg)
![SonarQube](https://github.com/h-arnold/Assessment Bot LLM Service/actions/workflows/sonarqube.yml/badge.svg)

## Introduction

Welcome to the backend for the Assessment Bot project. This repository contains a stateless, NestJS-based API responsible for receiving assessment tasks, interacting with a Large Language Model (LLM) for evaluation, and returning a structured grade.

This service is the backend component of a larger system. The primary business logic and user interface are managed by the frontend, available at: **[h-arnold/AssessmentBot](https://github.com/h-arnold/AssessmentBot)**.

This README provides a quick start guide and a high-level overview. For detailed information on architecture, development, and API usage, please refer to our comprehensive **[documentation](./docs/README.md)**.

## ✨ Features

- **Stateless Design**: No user data or session information is stored on the server, ensuring privacy and scalability.
- **Modular Architecture**: Built with NestJS, following SOLID principles for a clean, maintainable, and scalable codebase.
- **LLM Integration**: Abstracted service layer for interacting with LLMs (currently Google's Gemini) to perform assessments.
- **Robust Validation**: All inputs are strictly validated using Zod for enhanced security and type safety.
- **Comprehensive Testing**: Adheres to Test-Driven Development (TDD) with a full suite of unit, integration, and E2E tests.
- **Containerised**: Ships with Docker and Docker Compose configurations for easy development and production deployment.

## 🚀 Quick Start

You can get the backend running locally using either Docker Compose (recommended for a full environment) or Node.js directly.

### Prerequisites

- **Node.js**: Version 22.x
- **Docker**: Docker Engine and Docker Compose
- **Git**

### 1. Using Docker Compose (Recommended)

This method starts the application along with a Caddy reverse proxy and Fail2ban for security.

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/h-arnold/Assessment Bot LLM Service.git
    cd Assessment Bot LLM Service
    ```

2.  **Set up environment variables**:
    Copy the example environment file. You must provide a `GEMINI_API_KEY` and at least one `API_KEYS` for the application to be functional.

    ```bash
    cp .env.example .env
    ```

    Now, open `.env` in your editor and add your keys.

3.  **Start the services**:
    ```bash
    docker-compose up -d
    ```

The API will be available at `http://localhost:80`. For more details, see the [Docker Deployment Guide](./docs/deployment/docker.md).

## 🤖 Codex Delegation

Use the delegation runner to dispatch focused sub-agent tasks while keeping outputs concise, with periodic progress snapshots when logging is enabled.
See the [Codex delegation guide](./docs/development/codex-delegation.md) for defaults, flags, and workflow guidance.

```bash
npm run dev:delegate -- --role implementation --task "Implement the new endpoint" --instructions "Follow existing NestJS patterns."
```

Common flags:

- `--role` (implementation, testing, review, documentation)
- `--task` (required)
- `--instructions` (optional)
- `--model`, `--reasoning`, `--working-dir` (model and workspace selection)
- `--sandbox`, `--approval`, `--network`, `--web-search` (permissions)
- `--structured`, `--schema-file` (structured output)
- `--verbose`, `--log-file`, `--max-items`, `--timeout-minutes` (event output and log controls)

### 2. Using Node.js

1.  **Clone and install**:

    ```bash
    git clone https://github.com/h-arnold/Assessment Bot LLM Service.git
    cd Assessment Bot LLM Service
    npm install
    ```

2.  **Set up environment variables**:

    ```bash
    cp .env.example .env
    # Open .env and add your GEMINI_API_KEY and API_KEYS
    ```

3.  **Start the development server**:
    ```bash
    npm run start:dev
    ```
    The API will be available at `http://localhost:3000`.

## 🛠️ Tech Stack

- **Framework**: [NestJS](https://nestjs.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Runtime**: [Node.js](https://nodejs.org/)
- **Containerisation**: [Docker](https://www.docker.com/)
- **Authentication**: [Passport.js](http://www.passportjs.org/) (`passport-http-bearer`)
- **Validation**: [Zod](https://zod.dev/)
- **Testing**: [Jest](https://jestjs.io/) & [Supertest](https://github.com/ladjs/supertest)
- **LLM**: [Google Gemini](https://ai.google.dev/)

## 🔌 API Overview

The backend exposes a simple REST API. The primary endpoint is used to submit tasks for assessment.

- **Endpoint**: `POST /v1/assessor`
- **Authentication**: `Bearer` token (API Key)
- **Body**: A JSON payload containing the task type, reference solution, template, and the student's response.

For a complete reference including request/response schemas, error codes, and rate limiting, please see the **[API Documentation](./docs/api/API_Documentation.md)**.

## 🏗️ Architecture

The application is built using a modular, layered architecture that separates concerns between controllers, services, and integration points.

For a detailed breakdown, please see the **[Architecture Overview](./docs/architecture/overview.md)**.

## 📚 Documentation

This project includes comprehensive documentation covering development, architecture, and usage. Please start with the main **[Documentation Hub](./docs/README.md)**.

## 🤝 Contributing

Contributions are welcome! Please read our **[Contributing Guide](./CONTRIBUTING.md)** and follow the **[Development Workflow](./docs/development/workflow.md)**.
