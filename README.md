# Assessment Bot - LLM Service

![CI - Unit & E2E Tests](https://github.com/h-arnold/AssessmentBot-LLM-Service/actions/workflows/ci.yml/badge.svg)
![CodeQL](https://github.com/h-arnold/AssessmentBot-LLM-Service/actions/workflows/codeql.yml/badge.svg)
![SonarQube](https://github.com/h-arnold/AssessmentBot-LLM-Service/actions/workflows/sonarqube.yml/badge.svg)

## Introduction

This repository contains the stateless NestJS backend for Assessment Bot. It receives assessment tasks, sends them to a Large Language Model (LLM), and returns structured grades.

The frontend manages the user interface and primary business logic: **[h-arnold/AssessmentBot](https://github.com/h-arnold/AssessmentBot)**.

See the **[documentation hub](./docs/README.md)** for architecture, development, deployment, and API details.

## ✨ Features

- **Stateless Design**: No user data or session information is stored on the server, ensuring privacy and scalability.
- **Modular Architecture**: Built with NestJS, following SOLID principles for a clean, maintainable, and scalable codebase.
- **LLM Integration**: Abstracted service layer for interacting with LLMs, using Mistral Small by default with Google Gemini also supported.
- **Robust Validation**: All inputs are strictly validated using Zod for enhanced security and type safety.
- **Comprehensive Testing**: Adheres to Test-Driven Development (TDD) with a full suite of unit, integration, and E2E tests.
- **Containerised**: Ships with Docker and Docker Compose configurations for easy development and production deployment.

## 🔒 Student data safeguarding

Student privacy is central to the intended deployment: **the institution’s Google Workspace is the only retention location**. Workspace is the system of record; this backend processes submissions transiently; and the LLM provider must not retain them. The repository cannot enforce this arrangement automatically.

**Use Mistral by default.** Its verified Zero Data Retention (ZDR) option is a key safeguarding benefit over Gemini.

> **Production gate:** Enable ZDR at the first opportunity. Do not process real student submissions until it is approved and active in the Mistral Admin panel. If ZDR is pending or inactive, use test data only.

Before making the claim that student data is **only saved in the institution’s Google Workspace**, verify:

1. **Storage:** The frontend saves student work in institution-controlled Workspace.
2. **Backend:** The service does not retain submissions, and `LOG_LLM_CONTENT=false` prevents their content entering application logs.
3. **Provider:** Mistral ZDR and the separate training/improvement opt-out are active for supported API calls.
4. **Operations:** The institution has checked its logs, backups, and access controls.

The [provider API-key and privacy guide](./docs/auth/provider-api-keys.md) explains these steps and Gemini Paid Services’ limitations.

## 🚀 Quick Start

Run the backend locally with Docker Compose (recommended) or Node.js directly.

### Prerequisites

- **Node.js**: Version 24.x (24.15.0 or later)
- **Docker**: Docker Engine and Docker Compose
- **Git**

### 1. Prepare the project

1. **Clone the repository**:

   ```bash
   git clone https://github.com/h-arnold/AssessmentBot-LLM-Service.git
   cd AssessmentBot-LLM-Service
   ```

2. **Create the environment file**:

   ```bash
   cp .env.example .env
   ```

3. **Add your keys.** The default Mistral Small models require `MISTRAL_API_KEY` and at least one `API_KEYS`. Add `GEMINI_API_KEY` only when configuring a Gemini model. See the [provider API-key guide](./docs/auth/provider-api-keys.md) before using real student data.

### 2. Start with Docker Compose

Docker Compose starts the application with a Caddy reverse proxy and Fail2ban.

1. **Start the services**:

   ```bash
   docker-compose up -d
   ```

The API will be available at `http://localhost:80`. For more details, see the [Docker Deployment Guide](./docs/deployment/docker.md).

### 3. Start with Node.js

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Start the development server**:

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
- **Testing**: [Vitest](https://vitest.dev/) & [Supertest](https://github.com/ladjs/supertest)
- **LLM**: [Mistral AI](https://mistral.ai/) by default; [Google Gemini](https://ai.google.dev/) is also supported.

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
