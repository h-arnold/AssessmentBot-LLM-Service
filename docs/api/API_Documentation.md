# API Documentation

## Base URL

The base URL for the API is `http://localhost:3000` when running locally.

## Authentication

Protected endpoints require an API key in the `Authorization` header as a Bearer token. See the [endpoint table](#endpoints) for which endpoints are protected.

**Example:** `Authorization: Bearer your_api_key_here`

## Endpoints

### Assessor

- **URL:** `/v1/assessor`
- **Method:** `POST`
- **Description:** Initiates an assessment based on the provided task details. This is the primary endpoint for submitting assessment tasks.
- **Authentication:** Required (API key)

#### Request body

The request body is a JSON object with a `taskType` discriminator (`TEXT`, `TABLE`, or `IMAGE`) and the fields `reference`, `template`, and `studentResponse`. For `IMAGE` tasks each field must be a non-empty base64 data URI; `Buffer` input is rejected. Each image decodes to at most 1 MiB (fixed in code), the whole JSON body is capped at 5 MiB (`413 Payload Too Large`), and allowed MIME types come from `ALLOWED_IMAGE_MIME_TYPES` in [environment configuration](../configuration/environment.md).

- **Full request and response schemas:** [schemas.md](./schemas.md).
- **Error codes:** [error-codes.md](./error-codes.md).

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

| URL           | Method | Auth? | Description                                         |
| ------------- | ------ | ----- | --------------------------------------------------- |
| `/`           | `GET`  | No    | Returns a simple "Hello World!" greeting.           |
| `/health`     | `GET`  | No    | Returns application status, version, and timestamp. |
| `/test-error` | `GET`  | No    | Intentionally throws a 400 error for testing.       |
