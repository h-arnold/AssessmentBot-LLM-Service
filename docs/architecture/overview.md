# Architecture Overview

High-level architecture of the Assessment Bot LLM Service, a NestJS-based API that uses LLMs for automated educational assessment.

## High-Level Architecture

```mermaid
graph TB
    subgraph "External Clients"
        C[API Clients]
    end

    subgraph "AssessmentBot Backend"
        subgraph "API Layer"
            GW[API Gateway/NestJS]
            AUTH[Authentication Guard]
            THROTTLE[Rate Limiting]
        end

        subgraph "Business Logic Layer"
            AC[Assessor Controller]
            AS[Assessor Service]
            SC[Status Controller]
        end

        subgraph "Prompt Generation Layer"
            PF[Prompt Factory]
            TP[Text Prompt]
            IP[Image Prompt]
            TAP[Table Prompt]
        end

        subgraph "LLM Integration Layer"
            LLMS[LLM Service Interface]
            GS[Gemini Service]
        end

        subgraph "Cross-Cutting Concerns"
            CONFIG[Config Service]
            LOG[Logging Service]
            VALID[Validation Pipes]
        end
    end

    subgraph "External Services"
        GEMINI[Google Gemini API]
    end

    C --> GW
    GW --> AUTH
    AUTH --> THROTTLE
    THROTTLE --> AC
    THROTTLE --> SC
    AC --> AS
    AS --> PF
    PF --> TP
    PF --> IP
    PF --> TAP
    AS --> LLMS
    LLMS --> GS
    GS --> GEMINI

    CONFIG -.-> AS
    CONFIG -.-> GS
    LOG -.-> AS
    LOG -.-> GS
    VALID -.-> AC
```

### Key Components

| Component                | Responsibility                                          |
| ------------------------ | ------------------------------------------------------- |
| **Authentication Guard** | API key validation via Bearer tokens                    |
| **Rate Limiting**        | Request throttling for abuse prevention                 |
| **Assessor Service**     | Core business logic orchestration                       |
| **Prompt Factory**       | Task-specific prompt generation (Factory pattern)       |
| **LLM Service**          | Abstract interface for LLM providers (Strategy pattern) |
| **Gemini Service**       | Google Gemini API integration                           |
| **Config Service**       | Zod-validated environment configuration                 |

## External Dependencies

- **Google Gemini API**: Primary LLM provider for content assessment

## Module Architecture

```mermaid
graph LR
    subgraph "Core Modules"
        APP[App Module]
        CONFIG[Config Module]
        COMMON[Common Module]
    end

    subgraph "Feature Modules"
        ASSESSOR[Assessor Module v1]
        AUTH[Auth Module]
        STATUS[Status Module]
    end

    subgraph "Integration Modules"
        LLM[LLM Module]
        PROMPT[Prompt Module]
    end

    APP --> CONFIG
    APP --> COMMON
    APP --> ASSESSOR
    APP --> AUTH
    APP --> STATUS

    ASSESSOR --> LLM
    ASSESSOR --> PROMPT

    LLM --> CONFIG
    PROMPT --> CONFIG
    AUTH --> CONFIG
```

## Technology Stack

- **Runtime**: Node.js 22 (Debian dev container / `node:22-alpine` production)
- **Framework**: NestJS with Express.js, TypeScript
- **Validation**: Zod schemas for all runtime validation
- **Auth**: Passport.js with `passport-http-bearer` strategy
- **LLM Integration**: Abstract `LLMService` base class, `GeminiService` implementation, `jsonrepair` for response parsing
- **Templating**: Mustache for prompt rendering
- **Testing**: Vitest, Supertest
- **Logging**: `nestjs-pino` with structured JSON output
- **Rate Limiting**: `@nestjs/throttler`

### Environment Differences

- **Production** (`node:22-alpine`): Minimal Alpine Linux image for smaller, more secure containers.
- **Development** (Debian-based): Full feature set with debugging tools and utilities. Always test production builds against `node:22-alpine` to ensure compatibility.

---

_For detailed module responsibilities, see [Module Responsibilities](modules.md). For class relationships, see the [Class Structure](../design/ClassStructure.md) diagram._
