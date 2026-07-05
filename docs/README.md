# Assessment Bot LLM Service Documentation

Welcome to the comprehensive documentation for the Assessment Bot LLM Service project. This documentation provides detailed information about the architecture, development, deployment, and usage of the assessment system.

## Table of Contents

### 📚 Getting Started

- [Project Overview](../README.md) - Main project README with setup instructions
- [Contributing Guide](../CONTRIBUTING.md) - How to contribute to the project
- [Development Environment](copilot-environment.md) - GitHub Copilot and development setup
- [Dev Container Setup](../.devcontainer/README.md) - VS Code dev container configuration

### 🔧 Development

- [Development Workflow](development/workflow.md) - Local development practices and procedures
- [Debugging Guide](development/debugging.md) - Debugging techniques and tools
- [Code Style Guide](development/code-style.md) - Coding standards and conventions
- [Git Workflow](development/git-workflow.md) - Branching strategy and commit conventions
- [Codex Delegation](development/codex-delegation.md) - Running focused sub-agent tasks

### 🏗️ Architecture & Design

- [Architecture Overview](architecture/overview.md) - High-level system architecture, components, and design principles
- [Module Responsibilities](architecture/modules.md) - A detailed breakdown of each module's role and dependencies
- [Data Flow](architecture/data-flow.md) - A sequence diagram and analysis of the request/response lifecycle
- [Design Patterns](architecture/patterns.md) - An explanation of the key design patterns used in the codebase
- [Class Structure](design/ClassStructure.md) - Visual representation of class relationships

### 🔌 API Documentation

- [API Reference](api/API_Documentation.md) - Complete API endpoint documentation
- [Authentication](auth/API_Key_Management.md) - API key management and authentication
- [Request/Response Schemas](api/schemas.md) - Detailed data schemas
- [Error Codes](api/error-codes.md) - API error handling and codes
- [Rate Limiting](api/rate-limiting.md) - API rate limiting details

### ⚙️ Configuration

- [Environment Variables](configuration/environment.md) - Complete environment configuration guide

### 🧪 Testing

- [Testing Guide](testing/README.md) - The central hub for all testing information.
- [Practical Testing Guide](testing/PRACTICAL_GUIDE.md) - Code examples for unit tests, mocking, and data management.
- [E2E Testing Guide](testing/E2E_GUIDE.md) - Specific instructions for running and creating E2E tests.

### 🚀 Deployment

- [Docker Deployment](deployment/docker.md) - Containerised deployment guide
- [Production Setup](deployment/production.md) - Production environment configuration
- [CI/CD Pipeline](deployment/cicd.md) - Continuous integration and deployment
- [Monitoring & Observability](deployment/monitoring.md) - Application monitoring setup

### 🔒 Security

- [Security Overview](security/overview.md) - _[TODO]_ Security architecture and principles
- [Authentication & Authorisation](security/auth.md) - Security implementation details
- [Input Validation](security/validation.md) - _[TODO]_ Input sanitisation and validation
- [Security Testing](security/testing.md) - _[TODO]_ Security testing procedures

### 📝 Prompt System

- [Prompt System Documentation](prompts/README.md) - Documentation on the prompt system architecture, usage, and extension.

### 📦 Module Documentation

#### Core Modules

- [App Module](modules/app.md) - Main application module
- [Config Module](modules/config.md) - Configuration management
- [Common Module](modules/common.md) - Shared utilities and components

#### Feature Modules

- [Assessor Module (v1)](modules/assessor.md) - Core assessment functionality
- [Authentication Module](modules/auth.md) - Authentication and security
- [LLM Module](modules/llm.md) - Large Language Model integration
- [Prompt Module](modules/prompt.md) - Prompt generation and management
- [Status Module](modules/status.md) - Health checks and system status

#### Utilities & Components

- [Validation Pipes](modules/pipes.md) - Input validation and transformation
- [Exception Filters](modules/filters.md) - Error handling and filtering
- [Guards](modules/guards.md) - Route protection and authentication
- [Utilities](modules/utilities.md) - Shared utility functions

## Documentation Standards

All documentation in this project follows these standards:

- **British English**: All documentation uses British English spellings (e.g., "colour", "centre", "authorise")
- **Markdown Format**: Documentation is written in Markdown for consistency and readability
- **Code Examples**: Include practical code examples where appropriate
- **Up-to-date**: Documentation is kept current with code changes
- **Clear Structure**: Use clear headings, bullet points, and formatting for readability

## Contributing to Documentation

When contributing to documentation:

1. Follow the existing structure and naming conventions
2. Use British English throughout
3. Include code examples and practical guidance
4. Update this contents page when adding new documentation
5. Ensure links are working and up-to-date
6. Follow the project's contributing guidelines
