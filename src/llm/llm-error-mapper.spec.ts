import { describe, it, expect } from 'vitest';

import type { LlmErrorMapperProbes } from './llm-error-mapper.js';
import { classifyLlmError } from './llm-error-mapper.js';
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

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Constructs a synthetic {@link LlmErrorMapperProbes} configuration that
 * mimics a Gemini-like provider. Each test may override individual probes to
 * simulate provider-specific behaviour (e.g. Mistral's `isHttpClientError`).
 *
 * The default `extractStatusCode` reads `statusCode`, `status`, or `code`
 * (number or coercible string) from the error object, matching the union of
 * shapes used by the real Gemini and Mistral probes.
 *
 * The default `hasStringStatus` checks `error.status` and `error.code`
 * case-insensitively, matching Gemini's string-status convention.
 * @param overrides - Optional partial probes to override the defaults.
 * @returns A fully populated {@link LlmErrorMapperProbes} object.
 */
function buildProbes(
  overrides?: Partial<LlmErrorMapperProbes>,
): LlmErrorMapperProbes {
  return {
    providerName: 'test-provider',
    extractStatusCode: (error: unknown): number | undefined => {
      if (typeof error !== 'object' || error === null) return undefined;
      const error_ = error as Record<string, unknown>;
      const raw = error_.statusCode ?? error_.status ?? error_.code;
      if (typeof raw === 'number') return raw;
      if (typeof raw === 'string') {
        const n = Number(raw);
        if (!Number.isNaN(n)) return n;
      }
      return undefined;
    },
    hasStringStatus: (error: unknown, value: string): boolean => {
      if (typeof error !== 'object' || error === null) return false;
      const error_ = error as Record<string, unknown>;
      const lowerValue = value.toLowerCase();
      const matches = (v: unknown): boolean =>
        typeof v === 'string' && v.toLowerCase() === lowerValue;
      return matches(error_.status) || matches(error_.code);
    },
    networkPattern:
      /ECONNREFUSED|ETIMEDOUT|ECONNRESET|ENOTFOUND|fetch failed|network/i,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 429 — ResourceExhaustedError vs RateLimitError priority
// ---------------------------------------------------------------------------
describe('429 status — quota/rate-limit tie-break', () => {
  it('returns ResourceExhaustedError when status is 429 and message matches quota pattern', () => {
    const probes = buildProbes();
    const error = { statusCode: 429, message: 'Quota exceeded for project' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ResourceExhaustedError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns RateLimitError when status is 429 and message matches rate-limit pattern', () => {
    const probes = buildProbes();
    const error = { statusCode: 429, message: 'Rate limit exceeded' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(RateLimitError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns ResourceExhaustedError when status is 429 and message matches both quota and rate-limit patterns (priority)', () => {
    const probes = buildProbes();
    const error = {
      statusCode: 429,
      message: 'Quota has been exhausted. Rate limit exceeded.',
    };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ResourceExhaustedError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns RateLimitError when status is 429 and message is generic (no quota or rate-limit match)', () => {
    const probes = buildProbes();
    // "Too many concurrent requests" would match the rate-limit pattern
    // (`/rate[ _]?limit|too many requests/i`), so use a message that does not.
    const errorGeneric = {
      statusCode: 429,
      message: 'An unexpected error occurred',
    };
    const resultGeneric = classifyLlmError(probes, errorGeneric);
    expect(resultGeneric).toBeInstanceOf(RateLimitError);
    expect(resultGeneric!.providerName).toBe('test-provider');
  });
});

// ---------------------------------------------------------------------------
// hasStringStatus probe
// ---------------------------------------------------------------------------
describe('hasStringStatus probe', () => {
  it('returns RateLimitError when hasStringStatus matches "429"', () => {
    // The error carries a string status that the probe recognises as "429".
    const probes = buildProbes();
    const error = { status: '429', message: 'some error' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(RateLimitError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns RateLimitError when hasStringStatus matches "rate_limit_exceeded"', () => {
    const probes = buildProbes();
    const error = { status: 'RATE_LIMIT_EXCEEDED', message: 'some error' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(RateLimitError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns ResourceExhaustedError when hasStringStatus matches "resource_exhausted"', () => {
    const probes = buildProbes();
    const error = { status: 'RESOURCE_EXHAUSTED', message: 'some error' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ResourceExhaustedError);
    expect(result!.providerName).toBe('test-provider');
  });
});

// ---------------------------------------------------------------------------
// Authentication errors (401, 403)
// ---------------------------------------------------------------------------
describe('HTTP 401 / 403 — AuthenticationError', () => {
  it('returns AuthenticationError when extractStatusCode returns 401', () => {
    const probes = buildProbes();
    const error = { statusCode: 401, message: 'Invalid credentials' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(AuthenticationError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns AuthenticationError when extractStatusCode returns 403', () => {
    const probes = buildProbes();
    const error = { statusCode: 403, message: 'Forbidden' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(AuthenticationError);
    expect(result!.providerName).toBe('test-provider');
  });
});

// ---------------------------------------------------------------------------
// 400 — ContentFilteredError vs ContextLengthExceededError priority
// ---------------------------------------------------------------------------
describe('HTTP 400 — safety/content-length tie-break', () => {
  it('returns ContentFilteredError when status is 400 and message matches safety/blocked/filter pattern', () => {
    const probes = buildProbes();
    const error = {
      statusCode: 400,
      message: 'Content blocked by safety filter',
    };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ContentFilteredError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns ContextLengthExceededError when status is 400 and message matches context-length pattern', () => {
    const probes = buildProbes();
    const error = {
      statusCode: 400,
      message: 'Input exceeds maximum context length',
    };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ContextLengthExceededError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns ContentFilteredError when status is 400 and message matches both safety and context-length patterns (priority)', () => {
    const probes = buildProbes();
    const error = {
      statusCode: 400,
      message:
        'Content blocked by safety filter. Input exceeds context length.',
    };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ContentFilteredError);
    expect(result!.providerName).toBe('test-provider');
  });
});

// ---------------------------------------------------------------------------
// InvalidRequestError — generic 4xx (including 400 generic, 418, 422)
// ---------------------------------------------------------------------------
describe('HTTP 4xx (unrecognised) — InvalidRequestError', () => {
  it('returns InvalidRequestError when status is 400 and message is generic (no safety or context-length match)', () => {
    const probes = buildProbes();
    const error = { statusCode: 400, message: 'Bad request' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(InvalidRequestError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns InvalidRequestError when status is 418', () => {
    const probes = buildProbes();
    const error = { statusCode: 418, message: "I'm a teapot" };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(InvalidRequestError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns InvalidRequestError when status is 422', () => {
    const probes = buildProbes();
    const error = {
      statusCode: 422,
      message: 'Unprocessable entity',
    };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(InvalidRequestError);
    expect(result!.providerName).toBe('test-provider');
  });
});

// ---------------------------------------------------------------------------
// ProviderServerError — 5xx
// ---------------------------------------------------------------------------
describe('HTTP 5xx — ProviderServerError', () => {
  it('returns ProviderServerError when extractStatusCode returns 500', () => {
    const probes = buildProbes();
    const error = { statusCode: 500, message: 'Internal server error' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ProviderServerError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns ProviderServerError when extractStatusCode returns 503', () => {
    const probes = buildProbes();
    const error = { statusCode: 503, message: 'Service unavailable' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(ProviderServerError);
    expect(result!.providerName).toBe('test-provider');
  });
});

// ---------------------------------------------------------------------------
// NetworkError — message pattern match & isHttpClientError
// ---------------------------------------------------------------------------
describe('NetworkError', () => {
  it('returns NetworkError when no HTTP status is extractable and message matches network pattern', () => {
    const probes = buildProbes();
    const error = { message: 'fetch failed: ECONNREFUSED' };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(NetworkError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns NetworkError when isHttpClientError matches ConnectionError and no HTTP status is extractable', () => {
    const probes = buildProbes({
      // Probe that recognises ConnectionError as a transport-layer error but
      // deliberately excludes InvalidRequestError (see name-collision test).
      isHttpClientError: (error: unknown): boolean => {
        if (typeof error !== 'object' || error === null) return false;
        const name = (error as Record<string, unknown>).name;
        return [
          'ConnectionError',
          'RequestTimeoutError',
          'RequestAbortedError',
          'UnexpectedClientError',
        ].includes(name as string);
      },
    });
    const error = {
      name: 'ConnectionError',
      message: 'Client-side connection issue',
    };
    const result = classifyLlmError(probes, error);
    expect(result).toBeInstanceOf(NetworkError);
    expect(result!.providerName).toBe('test-provider');
  });

  it('returns undefined for name === InvalidRequestError when isHttpClientError excludes it (name-collision guard)', () => {
    const probes = buildProbes({
      isHttpClientError: (error: unknown): boolean => {
        if (typeof error !== 'object' || error === null) return false;
        const name = (error as Record<string, unknown>).name;
        // Deliberately exclude 'InvalidRequestError' to avoid false positives
        // with our own LlmError subclass of the same name.
        return [
          'ConnectionError',
          'RequestTimeoutError',
          'RequestAbortedError',
          'UnexpectedClientError',
        ].includes(name as string);
      },
    });
    const error = {
      name: 'InvalidRequestError',
      message: 'Client-side programming error',
    };
    const result = classifyLlmError(probes, error);
    // No HTTP status is present, no message-pattern matches, and the
    // isHttpClientError probe excludes 'InvalidRequestError' → unclassifiable.
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// originalError narrowing
// ---------------------------------------------------------------------------
describe('originalError narrowing', () => {
  it('sets originalError to the input Error for Error instances, and to undefined for non-Error objects', () => {
    const probes = buildProbes();

    // Error instance — must match a pattern. Use network-pattern message.
    const errorInstance = new Error('fetch failed: ECONNREFUSED');
    const resultFromError = classifyLlmError(probes, errorInstance);
    expect(resultFromError).toBeInstanceOf(NetworkError);
    expect(resultFromError!.originalError).toBe(errorInstance);

    // Non-Error plain object — must match a pattern too.
    const plainObject = { statusCode: 500, message: 'Internal server error' };
    const resultFromPlain = classifyLlmError(probes, plainObject);
    expect(resultFromPlain).toBeInstanceOf(ProviderServerError);
    expect(resultFromPlain!.originalError).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Non-object / null / undefined / string inputs
// ---------------------------------------------------------------------------
describe('Non-object, null, undefined, and string inputs', () => {
  it('returns undefined for null input', () => {
    const probes = buildProbes();
    const result = classifyLlmError(probes, null);
    expect(result).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    const probes = buildProbes();
    const result = classifyLlmError(probes, undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined for string input', () => {
    const probes = buildProbes();
    const result = classifyLlmError(probes, 'some string error');
    expect(result).toBeUndefined();
  });
});
