# Environment Variables

All configuration is validated at startup against the Zod schema in `src/config/environment.schema.ts` (the single source of truth). Invalid values abort startup with a `Invalid environment configuration` error — the application fails fast rather than running misconfigured.

Copy `.env.example` to `.env` and set the values below. `process.env` takes precedence over the `.env` file (`src/config/config.service.ts`).

## Conditionally required

No variable is unconditionally required — each is required only when the configured behaviour needs it. An omitted `GEMINI_API_KEY` / `MISTRAL_API_KEY` is fine until a model routes to that provider.

| Variable          | Required when                                                                                                 | What it does                                                        | Allowed values                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`  | `DEFAULT_TEXT_TABLE_MODEL` or `DEFAULT_IMAGE_MODEL` resolves to the Gemini provider (see model routing below) | Authenticates calls to the Google Gemini API                        | Non-empty string. Empty or whitespace-only counts as unset and fails validation when required                                                      |
| `MISTRAL_API_KEY` | `DEFAULT_TEXT_TABLE_MODEL` or `DEFAULT_IMAGE_MODEL` resolves to the Mistral provider                          | Authenticates calls to the Mistral API                              | Non-empty string. Empty or whitespace-only counts as unset and fails validation when required                                                      |
| `API_KEYS`        | Any authenticated endpoint must be reachable                                                                  | Comma-separated list of client API keys checked by the bearer guard | Comma-separated list in the [API key format](#api-key-format). May be omitted — the app starts, but no authenticated endpoint will accept requests |

## Optional (with defaults)

Omit any of these to accept the default.

### Application

| Variable          | What it does                                                                              | Allowed values / default                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`        | Selects the runtime environment (also decides whether `.test.env` or `.env` is loaded)    | `development` \| `production` \| `test`. Default `production`                                                                            |
| `PORT`            | Port the HTTP server listens on                                                           | Integer 1–65535. Default `3000`                                                                                                          |
| `APP_NAME`        | Application name used in logs/startup                                                     | Any string. Default `Assessment Bot LLM Service`                                                                                         |
| `APP_VERSION`     | Optional version override for consumers of `ConfigService`                                | Any string. No default — `undefined` when unset. Note: the `/health` endpoint reports the version from `package.json`, not this variable |
| `API_KEY_PREFIX`  | Prefix every entry in `API_KEYS` must start with                                          | `[A-Za-z0-9_-]+`. Default `abt_`. Only change together with regenerating all keys                                                        |
| `LOG_LEVEL`       | Logging verbosity                                                                         | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `verbose`. Default `info`                                                           |
| `LOG_FILE`        | Writes logs to a file in addition to stdout. Intended for E2E runs                        | File path string. No default (unset)                                                                                                     |
| `LOG_LLM_CONTENT` | Includes raw LLM prompt/response content (may contain student-derived data) in debug logs | `true` / `1` → enabled, anything else → disabled. Default `false`                                                                        |

### Image uploads

| Variable                   | What it does                                          | Allowed values / default                                                |
| -------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `MAX_IMAGE_UPLOAD_SIZE_MB` | Maximum accepted image size in megabytes              | Integer ≥ 0. Default `1`                                                |
| `ALLOWED_IMAGE_MIME_TYPES` | Comma-separated MIME types accepted for image uploads | Comma-separated list. Default `image/png` (e.g. `image/png,image/jpeg`) |

### Rate limiting

| Variable                          | What it does                                       | Allowed values / default     |
| --------------------------------- | -------------------------------------------------- | ---------------------------- |
| `THROTTLER_TTL`                   | Length of each rate-limit window in milliseconds   | Integer ≥ 0. Default `10000` |
| `UNAUTHENTICATED_THROTTLER_LIMIT` | Max requests per window for unauthenticated routes | Integer ≥ 0. Default `10`    |
| `AUTHENTICATED_THROTTLER_LIMIT`   | Max requests per window for authenticated routes   | Integer ≥ 0. Default `90`    |

### LLM models and reasoning

| Variable                   | What it does                                                                                   | Allowed values / default                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_TEXT_TABLE_MODEL` | Model used for text and table assessments. The prefix selects the provider (see below)         | Any string; unrecognised prefixes fail fast at startup in `RoutingLLMService`. Default `mistral-small-latest` |
| `DEFAULT_IMAGE_MODEL`      | Model used for image assessments. Same routing as above                                        | Any string. Default `mistral-small-latest`                                                                    |
| `TEXT_REASONING_EFFORT`    | Abstract reasoning effort for text/table tasks, mapped to a provider-native value at send time | `off` \| `low` \| `high` \| `max`. Default `low`                                                              |
| `IMAGE_REASONING_EFFORT`   | Abstract reasoning effort for image tasks                                                      | `off` \| `low` \| `high` \| `max`. Default `high`                                                             |
| `LLM_BACKOFF_BASE_MS`      | Base delay for retries after LLM rate-limit errors                                             | Integer ≥ 100 (milliseconds). Default `1000`                                                                  |
| `LLM_MAX_RETRIES`          | Max retry attempts after LLM rate-limit errors                                                 | Integer ≥ 0. Default `3`                                                                                      |

#### Model → provider routing

The prefix of the model name decides the provider (`src/llm/model-registry.ts`, case-sensitive, first match wins):

| Provider | Recognised prefixes                                           |
| -------- | ------------------------------------------------------------- |
| Gemini   | `gemini-flash-latest`, `gemini-2.5-flash`, `gemini-2.0-flash` |
| Mistral  | `mistral-small-latest`, `pixtral-`, `open-mistral-`           |

So `mistral-small-latest` requires `MISTRAL_API_KEY`, while `gemini-2.5-flash-*` requires `GEMINI_API_KEY`. A mixed deployment (e.g. Mistral text model + Gemini image model) requires both keys.

#### Reasoning-effort mapping

`off` / `low` / `high` / `max` is mapped per provider at send time:

| Abstract level | Mistral (`mistral-small-latest`)          | Gemini 2.5 series              | Gemini 3 series (incl. `gemini-flash-latest`)   | Gemini 2.0 series                    |
| -------------- | ----------------------------------------- | ------------------------------ | ----------------------------------------------- | ------------------------------------ |
| `off`          | Omitted from request (reasoning disabled) | Thinking budget `0` (disabled) | Thinking level `minimal` (cannot fully disable) | No thinking supported — nothing sent |
| `low`          | `none`                                    | Thinking budget `0`            | Thinking level `low`                            | Nothing sent                         |
| `high`         | `high`                                    | Thinking budget `1024`         | Thinking level `medium`                         | Nothing sent                         |
| `max`          | `high`                                    | Thinking budget `8192`         | Thinking level `high`                           | Nothing sent                         |

The Gemini 3-series level is always sent explicitly because omitting it defaults the model to medium thinking.

## API key format

Every entry in `API_KEYS` must be `<API_KEY_PREFIX>` followed by exactly 32 base64url characters (`[A-Za-z0-9_-]`). Malformed entries abort startup via Zod validation. Mint keys with:

```bash
npm run generate:api-key
```

With a custom prefix (must match `API_KEY_PREFIX`):

```bash
API_KEY_PREFIX=custom_ npm run generate:api-key
```

To rotate keys, mint replacements, update `API_KEYS`, and restart the application. Note this is a breaking change from earlier releases, which accepted any alphanumeric string — existing unprefixed keys must be regenerated.

## Example configuration

```env
# Provider API keys — each required only when a configured model routes to that provider
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
