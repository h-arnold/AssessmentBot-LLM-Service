# API Documentation

## Introduction

This document provides an overview of the Assessment Bot LLM Service API, detailing available endpoints, authentication methods, and data structures.

## Base URL

The base URL for the API is `http://localhost:3000` when running locally.

## Authentication

API access is secured using API Keys. Provide your API key in the `Authorization` header as a Bearer token.

**Example:** `Authorization: Bearer your_api_key_here`

## Endpoints

### Assessor

- **URL:** `/v1/assessor`
- **Method:** `POST`
- **Description:** Initiates an assessment based on the provided task details. This is the primary endpoint for submitting assessment tasks.
- **Authentication:** Required (API key)

#### Request Body

The request body is a JSON object that defines the assessment task. It uses a `taskType` field to discriminate between `TEXT`, `TABLE`, and `IMAGE` assessments.

- **For detailed request/response schemas, see [schemas.md](./schemas.md).**
- **For a full list of error codes, see [error-codes.md](./error-codes.md).**

**Key Fields:**

- `taskType`: (Required) `TEXT` | `TABLE` | `IMAGE`
- `reference`: (Required) The reference solution.
- `template`: (Required) The assessment template or instructions.
- `studentResponse`: (Required) The student's response.

For `IMAGE` tasks, the `reference`, `template`, and `studentResponse` fields can be a `Buffer` or a base64-encoded string with a Data URI prefix (e.g., `data:image/png;base64,...`).

#### Image Validation (`IMAGE` Task Type)

When `taskType` is `IMAGE`, specific validation rules apply to the image fields:

- **Max Size:** The maximum image size is defined by the `MAX_IMAGE_UPLOAD_SIZE_MB` environment variable (default: 1 MB).
- **MIME Types:** Allowed MIME types are defined in the `ALLOWED_IMAGE_MIME_TYPES` environment variable (default: `image/png`).
- **Format:** Base64-encoded images **must** include the Data URI prefix.

#### Example (`TEXT` task)

```json
{
  "taskType": "TEXT",
  "reference": "The quick brown fox jumps over the lazy dog.",
  "template": "Write a sentence about a fox.",
  "studentResponse": "A fox is a mammal."
}
```

#### Example (`IMAGE` task)

```json
{
  "taskType": "IMAGE",
  "reference": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "template": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "studentResponse": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}
```

#### Success Response (201 Created)

```json
{
  "completeness": { "score": 5, "reasoning": "..." },
  "accuracy": { "score": 4, "reasoning": "..." },
  "spag": { "score": 3, "reasoning": "..." }
}
```

### Status & Health Check Endpoints

These endpoints are for monitoring and testing the application status.

| URL           | Method | Auth? | Description                                           |
| ------------- | ------ | ----- | ----------------------------------------------------- |
| `/`           | `GET`  | No    | Returns a simple "Hello World!" greeting.             |
| `/health`     | `GET`  | No    | Returns application status, version, and timestamp.   |
| `/check-auth` | `GET`  | Yes   | Verifies API key authentication is working correctly. |
| `/test-error` | `GET`  | No    | Intentionally throws a 400 error for testing.         |
