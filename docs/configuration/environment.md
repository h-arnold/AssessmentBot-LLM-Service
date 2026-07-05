# Environment Variables

The application uses environment variables for configuration. All variables are validated at startup using Zod schemas to ensure type safety and proper configuration.

Copy `.env.example` to `.env` and configure the following variables:

## Required for Functionality

These variables are essential for the application's core features to work.

- `GEMINI_API_KEY`: The API key for the Google Gemini service. The application will not start without this key.
- `API_KEYS`: A comma-separated list of valid API keys for client authentication (e.g., `key1,key2,key3`). While the application can start without any keys, no authenticated endpoints will be accessible. Use strong, randomly generated strings (e.g., `openssl rand -base64 32`).

## Optional Variables

These variables have default values but can be customised to change application behaviour.

### Application Settings

- `NODE_ENV`: Application environment (`development`, `production`, `test`). Default is `production`.
- `PORT`: Port on which the server runs. Default is `3000`.
- `APP_NAME`: Application name. Default is `Assessment Bot LLM Service`.
- `APP_VERSION`: Application version. Optional, defaults to the version in `package.json`.
- `LOG_LEVEL`: Logging verbosity level (`fatal`, `error`, `warn`, `info`, `debug`, `verbose`). Default is `info`.

### Image Upload Configuration

- `MAX_IMAGE_UPLOAD_SIZE_MB`: Sets the maximum allowed image size (in megabytes) for uploads. Default is `1` MB.
- `ALLOWED_IMAGE_MIME_TYPES`: Comma-separated list of allowed image MIME types (e.g., `image/png,image/jpeg`). Default is `image/png`.

### Rate Limiting (Throttling)

- `THROTTLER_TTL`: Time-to-live for rate-limiting windows in milliseconds. Default is `10000`.
- `UNAUTHENTICATED_THROTTLER_LIMIT`: Maximum requests per TTL window for unauthenticated routes. Default is `10`.
- `AUTHENTICATED_THROTTLER_LIMIT`: Maximum requests per TTL window for authenticated routes. Default is `90`.

### LLM Configuration

- `LLM_BACKOFF_BASE_MS`: Base backoff time in milliseconds for LLM rate limit retries. Default is `1000`.
- `LLM_MAX_RETRIES`: Maximum number of retry attempts for LLM rate limit errors. Default is `3`.

### Example Configuration

```env
# Required
GEMINI_API_KEY=your_gemini_api_key_here
API_KEYS=your_secret_key,another_secret_key

# Optional (showing defaults)
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
MAX_IMAGE_UPLOAD_SIZE_MB=1
```
