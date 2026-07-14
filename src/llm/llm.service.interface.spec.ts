import { LLMService, LlmPayload } from './llm.service.interface.js';
import { LlmResponse } from './types.js';
import { ConfigService } from '../config/config.service.js';

// ---------------------------------------------------------------------------
// Test subclass that exposes private error-detection helpers for unit testing
// ---------------------------------------------------------------------------
class ExposedLLMService extends LLMService {
  constructor(configService: ConfigService) {
    super(configService);
  }

  public exposeIsResourceExhaustedError(error: unknown): boolean {
    return (
      this as unknown as { isResourceExhaustedError(error_: unknown): boolean }
    ).isResourceExhaustedError(error);
  }

  public exposeIsRateLimitError(error: unknown): boolean {
    return (
      this as unknown as { isRateLimitError(error_: unknown): boolean }
    ).isRateLimitError(error);
  }

  public exposeExtractErrorStatusCode(error: unknown): number | undefined {
    return (
      this as unknown as {
        extractErrorStatusCode(error_: unknown): number | undefined;
      }
    ).extractErrorStatusCode(error);
  }

  /**
   * Satisfy the abstract contract -- never called in these tests.
   * @param _payload - The LLM payload (unused).
   */
  protected async _sendInternal(_payload: LlmPayload): Promise<LlmResponse> {
    throw new Error('Not implemented');
  }
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
/**
 * Creates a test instance of ExposedLLMService with a mocked ConfigService.
 * @returns A configured ExposedLLMService instance.
 */
function createService(): ExposedLLMService {
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'LLM_MAX_RETRIES') return '2';
      if (key === 'LLM_BACKOFF_BASE_MS') return '100';
      return null;
    }),
  } as unknown as ConfigService;

  return new ExposedLLMService(configService);
}

// ---------------------------------------------------------------------------
// extractErrorStatusCode tests  (M2 — broaden detection)
// ---------------------------------------------------------------------------
describe('extractErrorStatusCode', () => {
  let service: ExposedLLMService;

  beforeEach(() => {
    service = createService();
  });

  it('returns undefined for null / non-object', () => {
    expect(service.exposeExtractErrorStatusCode(null)).toBeUndefined();
    expect(service.exposeExtractErrorStatusCode('string')).toBeUndefined();
    expect(service.exposeExtractErrorStatusCode(undefined)).toBeUndefined();
  });

  it('reads numeric status property', () => {
    expect(service.exposeExtractErrorStatusCode({ status: 429 })).toBe(429);
    expect(service.exposeExtractErrorStatusCode({ status: 500 })).toBe(500);
  });

  it('reads numeric statusCode property', () => {
    expect(service.exposeExtractErrorStatusCode({ statusCode: 429 })).toBe(429);
  });

  it('reads numeric code property', () => {
    expect(service.exposeExtractErrorStatusCode({ code: 429 })).toBe(429);
  });

  it('reads string status that parses to a number', () => {
    expect(service.exposeExtractErrorStatusCode({ status: '429' })).toBe(429);
  });

  it('reads response.status from nested response object', () => {
    expect(
      service.exposeExtractErrorStatusCode({ response: { status: 429 } }),
    ).toBe(429);
  });

  it('reads error.status from nested error object', () => {
    expect(
      service.exposeExtractErrorStatusCode({
        error: { status: 429 },
      }),
    ).toBe(429);
  });

  it('reads error.code from nested error object', () => {
    expect(
      service.exposeExtractErrorStatusCode({
        error: { code: 429 },
      }),
    ).toBe(429);
  });

  it('prefers direct status over nested error.status', () => {
    expect(
      service.exposeExtractErrorStatusCode({
        status: 500,
        error: { status: 429 },
      }),
    ).toBe(500);
  });

  it('returns undefined when no status-like property exists', () => {
    expect(
      service.exposeExtractErrorStatusCode({ foo: 'bar' }),
    ).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// isResourceExhaustedError tests  (M2)
// ---------------------------------------------------------------------------
describe('isResourceExhaustedError', () => {
  let service: ExposedLLMService;

  beforeEach(() => {
    service = createService();
  });

  it('returns true for 429 with resource_exhausted message', () => {
    const error = new Error('RESOURCE_EXHAUSTED: Quota exceeded');
    (error as unknown as Record<string, unknown>).status = 429;
    expect(service.exposeIsResourceExhaustedError(error)).toBe(true);
  });

  it('returns true for 429 with quota exceeded message', () => {
    const error = new Error('API quota exceeded for this project');
    (error as unknown as Record<string, unknown>).status = 429;
    expect(service.exposeIsResourceExhaustedError(error)).toBe(true);
  });

  it('returns true when error.status is the string "RESOURCE_EXHAUSTED"', () => {
    expect(
      service.exposeIsResourceExhaustedError({ status: 'RESOURCE_EXHAUSTED' }),
    ).toBe(true);
  });

  it('returns true when error.code is the string "RESOURCE_EXHAUSTED"', () => {
    expect(
      service.exposeIsResourceExhaustedError({ code: 'RESOURCE_EXHAUSTED' }),
    ).toBe(true);
  });

  it('returns true when nested error.status is "RESOURCE_EXHAUSTED"', () => {
    expect(
      service.exposeIsResourceExhaustedError({
        error: { status: 'RESOURCE_EXHAUSTED' },
      }),
    ).toBe(true);
  });

  it('returns true when nested error.code is "RESOURCE_EXHAUSTED"', () => {
    expect(
      service.exposeIsResourceExhaustedError({
        error: { code: 'RESOURCE_EXHAUSTED' },
      }),
    ).toBe(true);
  });

  it('returns false for 429 with plain rate-limit message', () => {
    const error = new Error('Rate limit exceeded');
    (error as unknown as Record<string, unknown>).status = 429;
    expect(service.exposeIsResourceExhaustedError(error)).toBe(false);
  });

  it('returns false for 500 errors', () => {
    const error = new Error('Server error');
    (error as unknown as Record<string, unknown>).status = 500;
    expect(service.exposeIsResourceExhaustedError(error)).toBe(false);
  });

  it('returns false for non-error objects', () => {
    expect(service.exposeIsResourceExhaustedError('string error')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRateLimitError tests  (M2 — mutually consistent with
//   isResourceExhaustedError)
// ---------------------------------------------------------------------------
describe('isRateLimitError', () => {
  let service: ExposedLLMService;

  beforeEach(() => {
    service = createService();
  });

  it('returns true for 429 with rate limit message', () => {
    const error = new Error('Rate limit exceeded');
    (error as unknown as Record<string, unknown>).status = 429;
    expect(service.exposeIsRateLimitError(error)).toBe(true);
  });

  it('returns true for numeric 429 with no specific message', () => {
    const error = new Error('Too Many Requests');
    (error as unknown as Record<string, unknown>).status = 429;
    expect(service.exposeIsRateLimitError(error)).toBe(true);
  });

  it('returns true for "too many requests" message without 429 status', () => {
    const error = new Error('Too many requests, please slow down');
    expect(service.exposeIsRateLimitError(error)).toBe(true);
  });

  it('returns true for "rate limit" message without 429 status', () => {
    expect(service.exposeIsRateLimitError(new Error('Rate limit hit'))).toBe(
      true,
    );
  });

  it('returns true when error.status is the string "RATE_LIMIT_EXCEEDED"', () => {
    expect(
      service.exposeIsRateLimitError({ status: 'RATE_LIMIT_EXCEEDED' }),
    ).toBe(true);
  });

  it('returns true when error.status is the string "429"', () => {
    expect(service.exposeIsRateLimitError({ status: '429' })).toBe(true);
  });

  it('returns true when nested error.status is "RATE_LIMIT_EXCEEDED"', () => {
    expect(
      service.exposeIsRateLimitError({
        error: { status: 'RATE_LIMIT_EXCEEDED' },
      }),
    ).toBe(true);
  });

  it('returns false for resource exhausted errors', () => {
    const error = new Error('RESOURCE_EXHAUSTED: Free tier quota exceeded');
    (error as unknown as Record<string, unknown>).status = 429;
    expect(service.exposeIsRateLimitError(error)).toBe(false);
  });

  it('returns false when error.status is "RESOURCE_EXHAUSTED" string', () => {
    expect(
      service.exposeIsRateLimitError({ status: 'RESOURCE_EXHAUSTED' }),
    ).toBe(false);
  });

  it('returns false for non-rate-limit 500 errors', () => {
    const error = new Error('Internal server error');
    (error as unknown as Record<string, unknown>).status = 500;
    expect(service.exposeIsRateLimitError(error)).toBe(false);
  });

  it('returns false for non-error objects without matching patterns', () => {
    expect(service.exposeIsRateLimitError('string error')).toBe(false);
  });
});
