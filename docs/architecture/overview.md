# Architecture Overview

High-level architecture of the Assessment Bot LLM Service, a NestJS-based API that uses LLMs for automated educational assessment.

## High-Level Architecture

```mermaid
graph TB
    subgraph "External Clients"
        C[API Clients]
    end

    subgraph "Assessment Bot LLM Service"
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
            LLMS[ILlmService and LLMService]
            ROUTER[RoutingLLMService]
            GS[Gemini Service]
            MS[Mistral Service]
        end

        subgraph "Cross-Cutting Concerns"
            CONFIG[Config Service]
            LOG[Logging Service]
            VALID[Validation Pipes]
        end
    end

    subgraph "External Services"
        GEMINI[Google Gemini API]
        MISTRAL[Mistral API]
    end

    C --> GW
    GW --> THROTTLE
    THROTTLE --> AUTH
    AUTH --> AC
    AUTH --> SC
    AC --> AS
    AS --> PF
    PF --> TP
    PF --> IP
    PF --> TAP
    AS --> LLMS
    LLMS --> ROUTER
    ROUTER --> GS
    ROUTER --> MS
    GS --> GEMINI
    MS --> MISTRAL

    CONFIG -.-> AS
    CONFIG -.-> ROUTER
    CONFIG -.-> GS
    CONFIG -.-> MS
    LOG -.-> AS
    LOG -.-> GS
    VALID -.-> AC
```

### Key Components

| Component                    | Responsibility                                           |
| ---------------------------- | -------------------------------------------------------- |
| **Authentication Guard**     | API key validation via Bearer tokens                     |
| **Rate Limiting**            | Request throttling for abuse prevention                  |
| **Assessor Service**         | Core business logic orchestration                        |
| **Prompt Factory**           | Task-specific prompt generation (Factory pattern)        |
| **ILlmService / LLMService** | Provider contract and abstract base (Strategy pattern)   |
| **RoutingLLMService**        | Dispatches to the configured provider and model per task |
| **Gemini Service**           | Google Gemini API integration                            |
| **Mistral Service**          | Mistral API integration                                  |
| **Config Service**           | Zod-validated environment configuration                  |

## External Dependencies

- **Mistral API**: Default provider for content assessment using `mistral-small-latest`.
- **Google Gemini API**: Supported when a Gemini model is selected in configuration.

Module composition and dependencies are described in [Module Responsibilities](modules.md).

## Technology Stack

- **Runtime**: Node.js — see the [production](../../Docker/Dockerfile.prod) and [development](../../Docker/Dockerfile) Dockerfiles
- **Framework**: NestJS with Express.js, TypeScript
- **Validation**: Zod schemas for all runtime validation
- **Auth**: Passport.js with `passport-http-bearer` strategy
- **LLM Integration**: Abstract `LLMService` base class, `RoutingLLMService`, Mistral and Gemini provider implementations, and `jsonrepair` for response parsing
- **Templating**: Mustache for prompt rendering
- **Testing**: Vitest, Supertest
- **Logging**: `nestjs-pino` with structured JSON output
- **Rate Limiting**: `@nestjs/throttler`

### Environment Differences

The production and development images are defined by the [production Dockerfile](../../Docker/Dockerfile.prod), the [development Dockerfile](../../Docker/Dockerfile) and the [dev container configuration](../../.devcontainer/devcontainer.json). Verify production builds against the production image before release.

---

_For class relationships, see the [Class Structure](../design/ClassStructure.md) diagram._
