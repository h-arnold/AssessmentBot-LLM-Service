# Class Structure

The diagram shows the main classes and how they relate. An arrow with a hollow triangle (`<|--`) means inheritance: the class on the left is a base of the class on the right. A plain arrow (`-->`) means the class on the left uses or composes the class on the right; module arrows show composition by import.

```mermaid
classDiagram
    %% Root Application Module
    class AppModule

    %% Feature Modules
    class AssessorModule
    class AuthModule
    class ConfigModule
    class LoggerModule
    class ThrottlerModule
    class CommonModule
    class LlmModule
    class PromptModule
    class StatusModule

    %% Assessor Components
    class AssessorController
    class AssessorService
    class CreateAssessorDto

    %% Status Components
    class StatusController
    class StatusService

    %% Auth Components
    class ApiKeyStrategy
    class ApiKeyGuard
    class ApiKeyService

    %% Common Utilities
    class HttpExceptionFilter
    class ZodValidationPipe
    class JsonParserUtility
    class ImageValidationPipe

    %% Prompt Hierarchy
    class Prompt
    class MultiPartPrompt
    class TextPrompt
    class TablePrompt
    class ImagePrompt
    class PromptFactory

    %% LLM Service Hierarchy
    class LLMService
    class GeminiService
    class MistralService
    class RoutingLLMService

    %% Module Relationships (composition by import)
    AppModule --> AssessorModule
    AppModule --> AuthModule
    AppModule --> ConfigModule
    AppModule --> LoggerModule
    AppModule --> ThrottlerModule
    AppModule --> StatusModule

    %% Assessor Relationships
    AssessorModule --> AssessorController
    AssessorModule --> AssessorService
    AssessorController --> CreateAssessorDto
    AssessorController --> AssessorService

    %% Status Relationships
    StatusModule --> StatusController
    StatusModule --> StatusService

    %% Auth Relationships
    AuthModule --> ApiKeyStrategy
    AuthModule --> ApiKeyGuard
    AuthModule --> ApiKeyService

    %% Common Module Relationships
    CommonModule --> HttpExceptionFilter
    CommonModule --> JsonParserUtility

    %% Prompt Module Relationships
    PromptModule --> PromptFactory

    %% LLM Module Relationships
    LlmModule --> LLMService
    LlmModule --> RoutingLLMService

    %% Prompt Inheritance
    Prompt <|-- TextPrompt
    Prompt <|-- TablePrompt
    Prompt <|-- MultiPartPrompt
    MultiPartPrompt <|-- ImagePrompt

    %% LLM Service Inheritance
    LLMService <|-- GeminiService
    LLMService <|-- MistralService

    %% Service Integration
    AssessorService --> RoutingLLMService
    RoutingLLMService --> GeminiService
    RoutingLLMService --> MistralService
    GeminiService --> JsonParserUtility
    MistralService --> JsonParserUtility
    AssessorService --> PromptFactory

    %% Usage Relationships
    AssessorController --> ApiKeyGuard
    AssessorService --> Prompt
```
