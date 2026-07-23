# Environment Variables

The application uses environment variables for configuration. All variables are validated at startup using Zod schemas to ensure type safety and proper configuration.

Copy `.env.example` to `.env` and configure the following variables:

## Required for Functionality

These variables are essential for the application's core features to work.

- `GEMINI_API_KEY`: The API key for the Google Gemini service. Required when any assessment is routed to a Gemini model (this is the default for the `gemini-2.5-flash-lite` / `gemini-2.5-flash` model ids). The application will not start without this key if a Gemini model is selected, because the `GeminiService` constructor fails fast when it is absent.
- `MISTRAL_API_KEY`: The API key for the Mistral AI service. Required (non-empty) when any assessment is routed to a Mistral model (the `mistral-*` model ids, which are now the `DEFAULT_TEXT_TABLE_MODEL` / `DEFAULT_IMAGE_MODEL` defaults). The `MistralService` constructor fails fast when it is absent. The two providers are routed by model id, so **both** keys must be present in any deployment that permits either provider's models — they are independently validated and neither is a fallback for the other.
- `API_KEYS`: A comma-separated list of valid API keys for client authentication. Each key must match the required format: `<API_KEY_PREFIX>` followed by exactly 32 base64url characters (`[A-Za-z0-9_-]`). Example: `API_KEYS=abt_<32-char-base64url-body>`. Keys not matching this format will abort application startup via Zod config validation. Use `npm run generate:api-key` to mint correctly-formatted keys. While the application can start without any keys, no authenticated endpoints will be accessible.
- `API_KEY_PREFIX`: Selects the required prefix for all API keys. Default is `abt_`. Must match `[A-Za-z0-9_-]+`. Only override this together with regenerated keys.

## Breaking Change — API Key Format

This release introduces a breaking change to the API key format: all configured keys must now use the `<API_KEY_PREFIX><32-char base64url body>` format (e.g., `abt_` followed by exactly 32 base64url characters).

**What has changed:**

- Previously, any alphanumeric string was accepted as an API key.
- Now, each key must start with `API_KEY_PREFIX` (default `abt_`) and have a body of exactly 32 base64url characters (`[A-Za-z0-9_-]`).
- Existing unprefixed keys will cause application startup to abort via Zod config validation.

**Required migration:**
Before redeploying, regenerate all configured API keys using the provided generator:

```bash
npm run generate:api-key
```

This will output a single key in the correct format (default prefix `abt_`). For a custom prefix:

```bash
API_KEY_PREFIX=custom_ npm run generate:api-key
```

Update your `API_KEYS` environment variable with the regenerated keys.

**Key rotation:** To rotate keys during normal operation, mint new keys with `npm run generate:api-key` and replace the values in `API_KEYS`, then restart the application.

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
- `MISTRAL_API_KEY`: The API key for the Mistral AI service. Required (non-empty) when any assessment is routed to a Mistral model. Zod type: `z.string().min(1)`. No default — startup aborts if empty. See the "Required for Functionality" section above for the routing interaction with `GEMINI_API_KEY`.
- `DEFAULT_TEXT_TABLE_MODEL`: The model id used for text and table assessment tasks. Zod type: `z.string()`. Default is `'mistral-small-latest'`. The model id's prefix selects the provider at send time (a `mistral-*` id routes to `MistralService`; a `gemini-*` id routes to `GeminiService`).
- `DEFAULT_IMAGE_MODEL`: The model id used for image assessment tasks. Zod type: `z.string()`. Default is `'mistral-small-latest'`. Same prefix-based routing as `DEFAULT_TEXT_TABLE_MODEL`.
- `TEXT_REASONING_EFFORT`: The abstract reasoning-effort level applied to text/table tasks. Zod type: `z.enum(['off', 'low', 'high', 'max'])`. Default is `'low'`. Mapped to the provider-native value at send time (Mistral: `off`→omitted, `low`→`low`, `high`→`medium`, `max`→`xhigh`; Gemini: `off`/`low`→thinking budget `0`, `high`→`1024`, `max`→`8192`).
- `IMAGE_REASONING_EFFORT`: The abstract reasoning-effort level applied to image tasks. Zod type: `z.enum(['off', 'low', 'high', 'max'])`. Default is `'high'`. Same mapping as `TEXT_REASONING_EFFORT`.

### Example Configuration

```env
# Required (provider keys are independently required for the models you enable)
GEMINI_API_KEY=your_gemini_api_key_here
MISTRAL_API_KEY=your_mistral_api_key_here
API_KEY_PREFIX=abt_
API_KEYS=abt_<32-char-base64url-body>

# Optional (showing defaults)
NODE_ENV=development
PORT=3000
LOG_LEVEL=info
MAX_IMAGE_UPLOAD_SIZE_MB=1
DEFAULT_TEXT_TABLE_MODEL=mistral-small-latest
DEFAULT_IMAGE_MODEL=mistral-small-latest
TEXT_REASONING_EFFORT=low
IMAGE_REASONING_EFFORT=high
```
