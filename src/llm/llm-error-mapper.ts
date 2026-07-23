import {
  AuthenticationError,
  ContentFilteredError,
  ContextLengthExceededError,
  InvalidRequestError,
  type LlmError,
  NetworkError,
  ProviderServerError,
  RateLimitError,
  ResourceExhaustedError,
} from '../common/errors/index.js';
import { isErrorObject } from '../common/utils/type-guards.js';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

/**
 * Per-provider probe configuration supplied to {@link classifyLlmError}.
 * Each provider supplies its own probe implementation; the cascade is shared.
 */
export interface LlmErrorMapperProbes {
  /** Provider identifier embedded in every produced `LlmError` instance. */
  providerName: string;

  /**
   * Extracts a numeric HTTP status code from a raw error, or returns
   * `undefined` when no status can be extracted. Each provider knows its
   * SDK's status-bearing fields.
   *
   * Gemini probes: `error.status`, `error.statusCode`, `error.code`,
   * `error.response.status`, `error.error.status`, `error.error.code`
   * (string values coerced to numbers).
   * Mistral probes: `MistralError.statusCode` (numeric), with the same
   * fallback shapes as Gemini for non-`MistralError` inputs.
   */
  extractStatusCode: (error: unknown) => number | undefined;

  /**
   * Case-insensitive match against the SDK's string-status conventions.
   * Gemini uses status strings like `'RESOURCE_EXHAUSTED'`,
   * `'RATE_LIMIT_EXCEEDED'`, `'429'`, `'rate_limit_exceeded'`,
   * `'resource_exhausted'`. Mistral errors do not use string statuses;
   * the Mistral probe implementation returns `false` for all inputs.
   */
  hasStringStatus: (error: unknown, value: string) => boolean;

  /**
   * Regex matching network-failure message patterns. Shared across
   * providers (`ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch
   * failed|network`).
   */
  networkPattern: RegExp;

  /**
   * Whether the input is an `HTTPClientError` subclass (Mistral only).
   * Gemini returns `false`. The check is by `error.name` membership in
   * the SDK's subclass-name set — see the SPEC warning about the
   * `InvalidRequestError` name collision.
   * @default `() => false` — if omitted, the helper treats all errors
   *   as if the `HTTPClientError` probe returned `false`.
   */
  isHttpClientError?: (error: unknown) => boolean;
}

// ---------------------------------------------------------------------------
// Module-level pattern constants (extracted from GeminiService)
// ---------------------------------------------------------------------------

/**
 * Pattern matching resource-exhaustion / quota-exhausted messages.
 */
const RESOURCE_EXHAUSTED_PATTERN =
  /resource[ _]?exhausted|quota (exceeded|exhausted|has been exhausted)/i;

/**
 * Pattern matching rate-limit / too-many-requests messages.
 */
const RATE_LIMIT_PATTERN = /rate[ _]?limit|too many requests/i;

/**
 * Pattern matching content-filter / safety / blocked messages.
 */
const CONTENT_FILTERED_PATTERN = /safety|blocked|filter/i;

/**
 * Pattern matching context-length-exceeded messages.
 */
const CONTEXT_LENGTH_PATTERN = /context[ _]?length/i;

// ---------------------------------------------------------------------------
// Module-local helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a usable message string from a raw error.
 *
 * Reads `error.message` for `Error` instances. For plain objects, reads
 * `error.message` and `error.body` (Mistral SDK raw response body) and
 * concatenates them with a space. Falls back to `'Unknown error'` when no
 * message is available.
 * @param error - The raw error from `_sendInternal`.
 * @returns The extracted message string.
 */
function extractMessage(error: unknown): string {
  if (isErrorObject(error)) {
    const parts = [error.message];
    const errorRecord = error as unknown as Record<string, unknown>;
    if (typeof errorRecord.body === 'string') {
      parts.push(errorRecord.body);
    }
    return parts.join(' ');
  }
  if (typeof error === 'object' && error !== null) {
    const errorRecord = error as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof errorRecord.message === 'string')
      parts.push(errorRecord.message);
    if (typeof errorRecord.body === 'string') parts.push(errorRecord.body);
    if (parts.length > 0) return parts.join(' ');
  }
  return 'Unknown error';
}

/**
 * Constructs an `LlmError` instance with a given provider name.
 * @param ErrorClass - The LlmError subclass constructor.
 * @param message - The error message.
 * @param providerName - The provider name to embed in the error.
 * @param error - The original error (narrowed to `Error` for `originalError`
 *   when applicable).
 * @returns A new `LlmError` instance of the given class.
 */
function buildError<T extends LlmError>(
  ErrorClass: new (
    message: string,
    providerName: string,
    options?: { originalError?: Error; cause?: Error },
  ) => T,
  message: string,
  providerName: string,
  error: unknown,
): T {
  const originalError = isErrorObject(error) ? error : undefined;
  return new ErrorClass(message, providerName, { originalError });
}

/**
 * Checks whether the error matches a `ResourceExhaustedError` pattern.
 * @param probes - Per-provider probe configuration.
 * @param statusCode - The extracted numeric status code, if any.
 * @param message - The error message string.
 * @param error - The raw error from `_sendInternal`.
 * @returns `true` if the error matches the resource-exhausted classification.
 */
function isResourceExhausted(
  probes: LlmErrorMapperProbes,
  statusCode: number | undefined,
  message: string,
  error: unknown,
): boolean {
  return (
    probes.hasStringStatus(error, 'resource_exhausted') ||
    (statusCode === 429 && RESOURCE_EXHAUSTED_PATTERN.test(message))
  );
}

/**
 * Checks whether the error matches a `RateLimitError` pattern.
 * @param probes - Per-provider probe configuration.
 * @param statusCode - The extracted numeric status code, if any.
 * @param message - The error message string.
 * @param error - The raw error from `_sendInternal`.
 * @returns `true` if the error matches the rate-limit classification.
 */
function isRateLimit(
  probes: LlmErrorMapperProbes,
  statusCode: number | undefined,
  message: string,
  error: unknown,
): boolean {
  return (
    probes.hasStringStatus(error, 'rate_limit_exceeded') ||
    probes.hasStringStatus(error, '429') ||
    statusCode === 429 ||
    RATE_LIMIT_PATTERN.test(message)
  );
}

// ---------------------------------------------------------------------------
// Main classification function
// ---------------------------------------------------------------------------

/**
 * Classifies a raw error from `_sendInternal` into an `LlmError` subclass
 * (or `undefined` when no pattern matches), following the priority order
 * documented in `docs/llm/error-handling.md`.
 *
 * Behaviour:
 * 1. Non-object or `null`/`undefined` inputs return `undefined`.
 * 2. `extractStatusCode()` and `hasStringStatus()` are called once each.
 *    Message is extracted from `error.message` (and `error.body` for
 *    Mistral) — see `extractMessage`.
 * 3. Priority order (highest first): `ResourceExhaustedError`,
 *    `RateLimitError`, `AuthenticationError`, `ContentFilteredError`,
 *    `ContextLengthExceededError`, `InvalidRequestError`,
 *    `ProviderServerError`, `NetworkError`, `undefined`.
 * 4. Tie-breaks: resource-exhausted > rate-limit; content-filtered >
 *    context-length.
 * 5. `originalError` on the produced `LlmError` is narrowed to
 *    `Error | undefined` (non-`Error` inputs produce
 *    `originalError: undefined`).
 * @param probes - Per-provider probe configuration.
 * @param error - The raw error from `_sendInternal`.
 * @returns An `LlmError` instance, or `undefined` if the error is
 *   unclassifiable.
 */
export function classifyLlmError(
  probes: LlmErrorMapperProbes,
  error: unknown,
): LlmError | undefined {
  // 1. Non-object and falsy inputs (null, undefined, string, number) → undefined
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const statusCode = probes.extractStatusCode(error);
  const message = extractMessage(error);

  // 2. ResourceExhaustedError — hasStringStatus('resource_exhausted') or
  //    429 with resource-exhausted / quota-exhausted message.
  if (isResourceExhausted(probes, statusCode, message, error)) {
    return buildError(
      ResourceExhaustedError,
      message,
      probes.providerName,
      error,
    );
  }

  // 3. RateLimitError — hasStringStatus('rate_limit_exceeded'/'429') or
  //    numeric 429 or rate-limit / too-many-requests message.
  if (isRateLimit(probes, statusCode, message, error)) {
    return buildError(
      RateLimitError,
      'The LLM provider rate limit was exceeded',
      probes.providerName,
      error,
    );
  }

  // 4. AuthenticationError — 401 or 403
  if (statusCode === 401 || statusCode === 403) {
    return buildError(
      AuthenticationError,
      'Authentication with the LLM provider failed',
      probes.providerName,
      error,
    );
  }

  // 5. ContentFilteredError — 400 with safety/blocked/filter pattern
  if (statusCode === 400 && CONTENT_FILTERED_PATTERN.test(message)) {
    return buildError(
      ContentFilteredError,
      'Request blocked by provider safety filters',
      probes.providerName,
      error,
    );
  }

  // 6. ContextLengthExceededError — 400 with context-length pattern
  if (statusCode === 400 && CONTEXT_LENGTH_PATTERN.test(message)) {
    return buildError(
      ContextLengthExceededError,
      'Input exceeds the model context window',
      probes.providerName,
      error,
    );
  }

  // 7. InvalidRequestError — any other 4xx (incl. 400 generic, 418, 422)
  if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
    return buildError(
      InvalidRequestError,
      'The request was rejected by the provider as invalid',
      probes.providerName,
      error,
    );
  }

  // 8. ProviderServerError — any 5xx
  if (statusCode !== undefined && statusCode >= 500) {
    return buildError(ProviderServerError, message, probes.providerName, error);
  }

  // 9. NetworkError — isHttpClientError probe returns true, OR message matches
  //    network pattern, and no extractable HTTP status is present.
  if (statusCode === undefined) {
    const isHttpClientError_ = probes.isHttpClientError?.(error) ?? false;
    if (isHttpClientError_ || probes.networkPattern.test(message)) {
      return buildError(NetworkError, message, probes.providerName, error);
    }
  }

  // 10. Undefined (unclassifiable)
  return undefined;
}
