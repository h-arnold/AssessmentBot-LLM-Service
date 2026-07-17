import { Logger } from '@nestjs/common';
import { ZodError } from 'zod';

import { LLMService, LlmPayload } from './llm.service.interface.js';
import { LlmResponse } from './types.js';
import {
  LlmError,
  RateLimitError,
  ResourceExhaustedError,
  LlmServiceError,
} from '../common/errors/index.js';
import { ConfigService } from '../config/config.service.js';

// Fix randomInt jitter to zero so backoff delays are deterministic
vi.mock('node:crypto', () => ({
  randomInt: vi.fn(() => 0),
}));

// ---------------------------------------------------------------------------
// Test subclass implementing the NEW LLMService contract (Section 2)
// ---------------------------------------------------------------------------
class ExposedLLMService extends LLMService {
  protected readonly providerName = 'test-provider';

  /** Configurable mock for mapError(). */
  public mapErrorFn: (error: unknown) => LlmError | undefined = () => {};

  /**
   * Configurable mock for _sendInternal().
   * @returns A promise that rejects with a default error.
   */
  public sendInternalFn: (payload: LlmPayload) => Promise<LlmResponse> = () =>
    Promise.reject(new Error('_sendInternal not configured'));

  protected mapError(error: unknown): LlmError | undefined {
    return this.mapErrorFn(error);
  }

  protected async _sendInternal(payload: LlmPayload): Promise<LlmResponse> {
    return this.sendInternalFn(payload);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
/**
 * Creates a test instance of ExposedLLMService with a mocked ConfigService.
 * @param overrides - Optional overrides for the configuration values.
 * @returns A configured ExposedLLMService instance.
 */
function createService(
  overrides?: Partial<Record<string, number>>,
): ExposedLLMService {
  const configValues: Record<string, number | null> = {
    LLM_MAX_RETRIES: 2,
    LLM_BACKOFF_BASE_MS: 100,
    ...overrides,
  };
  const configService = {
    get: vi.fn((key: string) => {
      if (key === 'LLM_MAX_RETRIES') return configValues['LLM_MAX_RETRIES'];
      if (key === 'LLM_BACKOFF_BASE_MS')
        return configValues['LLM_BACKOFF_BASE_MS'];
      return null;
    }),
  } as unknown as ConfigService;

  return new ExposedLLMService(configService);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('LLMService retry-loop (Section 2 contract)', () => {
  let service: ExposedLLMService;

  beforeEach(() => {
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const minimalPayload: LlmPayload = { system: 'sys', user: 'hello' };
  const successResponse: LlmResponse = {
    completeness: { score: 5, reasoning: 'complete' },
    accuracy: { score: 4, reasoning: 'accurate' },
    spag: { score: 3, reasoning: 'ok' },
  };

  // -----------------------------------------------------------------------
  // 1. Retry on retryable error, eventually succeed
  // -----------------------------------------------------------------------
  it('retries on retryable errors and eventually succeeds', async () => {
    const retryableError = new RateLimitError('too fast', 'test-provider');

    // First N-1 calls fail, Nth call succeeds
    // maxRetries = 2 → attempts 0, 1, 2 → succeed on attempt 2
    const sendMock = vi
      .fn()
      .mockRejectedValueOnce(retryableError)
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce(successResponse);
    service.sendInternalFn = sendMock;

    const mapErrorSpy = vi.fn().mockReturnValue(retryableError);
    service.mapErrorFn = mapErrorSpy;

    // Prevent real delays
    vi.spyOn(
      ExposedLLMService.prototype as unknown as {
        sleep(ms: number): Promise<void>;
      },
      'sleep',
    ).mockResolvedValue(undefined);

    const result = await service.send(minimalPayload);

    expect(result).toEqual(successResponse);
    // _sendInternal called once per attempt: 0, 1, 2 (all 3 with maxRetries=2)
    expect(sendMock).toHaveBeenCalledTimes(3);
    // mapError called for each failed attempt (never for the success)
    expect(mapErrorSpy).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 2. No retry on non-retryable error
  // -----------------------------------------------------------------------
  it('throws immediately on non-retryable errors without retrying', async () => {
    const terminalError = new ResourceExhaustedError(
      'quota exceeded',
      'test-provider',
    );

    service.sendInternalFn = vi.fn().mockRejectedValue(terminalError);
    service.mapErrorFn = vi.fn().mockReturnValue(terminalError);

    await expect(service.send(minimalPayload)).rejects.toThrow(terminalError);
    // Exactly one attempt — no retry for non-retryable errors
    expect(service.sendInternalFn).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // 3. Max retries exhausted on retryable error
  // -----------------------------------------------------------------------
  it('throws the retryable error after exhausting all retries', async () => {
    const retryableError = new RateLimitError('too fast', 'test-provider');

    service.sendInternalFn = vi.fn().mockRejectedValue(retryableError);
    service.mapErrorFn = vi.fn().mockReturnValue(retryableError);

    vi.spyOn(
      ExposedLLMService.prototype as unknown as {
        sleep(ms: number): Promise<void>;
      },
      'sleep',
    ).mockResolvedValue(undefined);

    await expect(service.send(minimalPayload)).rejects.toThrow(retryableError);
    // maxRetries=2 → 3 attempts (0, 1, 2), all fail
    expect(service.sendInternalFn).toHaveBeenCalledTimes(3);
  });

  // -----------------------------------------------------------------------
  // 4. Fallback to LlmServiceError when mapError() returns undefined
  // -----------------------------------------------------------------------
  it('wraps in LlmServiceError when mapError() returns undefined', async () => {
    const original = new Error('boom');

    service.sendInternalFn = vi.fn().mockRejectedValue(original);
    service.mapErrorFn = vi.fn().mockReturnValue(undefined);

    let thrown: unknown;
    try {
      await service.send(minimalPayload);
    } catch (error_) {
      thrown = error_;
    }

    expect(thrown).toBeInstanceOf(LlmServiceError);
    expect((thrown as LlmServiceError).retryable).toBe(false);
    // The getStatus() check confirms HTTP 500
    expect((thrown as LlmServiceError).getStatus()).toBe(500);
    expect((thrown as LlmServiceError).message).toBe('LLM service error: boom');
    expect((thrown as LlmServiceError).originalError).toBe(original);
    expect((thrown as LlmServiceError).providerName).toBe('test-provider');
  });

  // -----------------------------------------------------------------------
  // 5. Fallback to LlmServiceError when mapError() throws
  // -----------------------------------------------------------------------
  it('wraps original error in LlmServiceError and logs when mapError() throws', async () => {
    const original = new Error('original');
    const mappingError = new Error('mapping blew up');

    service.sendInternalFn = vi.fn().mockRejectedValue(original);
    service.mapErrorFn = vi.fn().mockImplementation(() => {
      throw mappingError;
    });

    const loggerErrorSpy = vi.spyOn(Logger.prototype, 'error');

    let thrown: unknown;
    try {
      await service.send(minimalPayload);
    } catch (error_) {
      thrown = error_;
    }

    expect(thrown).toBeInstanceOf(LlmServiceError);
    // Message from the ORIGINAL _sendInternal error, NOT the mapping error
    expect((thrown as LlmServiceError).message).toBe(
      'LLM service error: original',
    );
    expect((thrown as LlmServiceError).originalError).toBe(original);
    expect((thrown as LlmServiceError).getStatus()).toBe(500);
    expect((thrown as LlmServiceError).providerName).toBe('test-provider');

    // The mapping error must be logged for diagnostics
    expect(loggerErrorSpy).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 6. ZodError bypasses mapError() and is re-thrown directly
  // -----------------------------------------------------------------------
  it('re-throws ZodError directly without calling mapError()', async () => {
    const zodError = new ZodError([
      { code: 'custom', message: 'bad', path: ['x'] },
    ]);

    service.sendInternalFn = vi.fn().mockRejectedValue(zodError);
    const mapErrorSpy = vi.fn();
    service.mapErrorFn = mapErrorSpy;

    await expect(service.send(minimalPayload)).rejects.toBe(zodError);
    expect(service.sendInternalFn).toHaveBeenCalledTimes(1);
    // mapError must NOT be called for ZodError
    expect(mapErrorSpy).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // 7. Backoff delay calculation preserved
  // -----------------------------------------------------------------------
  it('calls sleep with exponentially increasing backoff delays', async () => {
    const retryableError = new RateLimitError('too fast', 'test-provider');

    service.sendInternalFn = vi.fn().mockRejectedValue(retryableError);
    service.mapErrorFn = vi.fn().mockReturnValue(retryableError);

    const sleepSpy = vi
      .spyOn(
        ExposedLLMService.prototype as unknown as {
          sleep(ms: number): Promise<void>;
        },
        'sleep',
      )
      .mockResolvedValue(undefined);

    await expect(service.send(minimalPayload)).rejects.toThrow(retryableError);

    // baseBackoffMs=100, randomInt mocked to 0:
    // attempt 0: 100 * 2^0 + 0 = 100
    // attempt 1: 100 * 2^1 + 0 = 200
    expect(sleepSpy).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 100);
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 200);
  });

  // -----------------------------------------------------------------------
  // 8a. waitBeforeRetry is not called on the final failing attempt
  // -----------------------------------------------------------------------
  it('calls waitBeforeRetry on each retryable failure but not on the final attempt', async () => {
    const retryableError = new RateLimitError('too fast', 'test-provider');

    service.sendInternalFn = vi.fn().mockRejectedValue(retryableError);
    service.mapErrorFn = vi.fn().mockReturnValue(retryableError);

    const waitSpy = vi
      .spyOn(
        ExposedLLMService.prototype as unknown as {
          waitBeforeRetry: (...a: unknown[]) => Promise<void>;
        },
        'waitBeforeRetry',
      )
      .mockResolvedValue(undefined);

    await expect(service.send(minimalPayload)).rejects.toThrow(retryableError);
    // maxRetries=2 → 3 attempts; waitBeforeRetry runs on attempts 0 and 1 only.
    expect(waitSpy).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // 8b. describePayload emits singular text form
  // -----------------------------------------------------------------------
  it('describes a single-character text payload in the singular', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    service.sendInternalFn = vi.fn().mockResolvedValue(successResponse);
    service.mapErrorFn = vi.fn();

    await service.send({ system: 'sys', user: 'a' });

    const dispatchedCall = logSpy.mock.calls.find((call) =>
      String(call[0]).includes('Dispatching LLM request'),
    );
    expect(dispatchedCall).toBeDefined();
    expect(String(dispatchedCall![0])).toContain(
      'text prompt with 1 character',
    );
  });

  it('describes a single-image payload in the singular', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    service.sendInternalFn = vi.fn().mockResolvedValue(successResponse);
    service.mapErrorFn = vi.fn();

    await service.send({
      system: 'sys',
      images: [{ mimeType: 'image/png', data: 'x' }],
    });

    const dispatchedCall = logSpy.mock.calls.find((call) =>
      String(call[0]).includes('Dispatching LLM request'),
    );
    expect(dispatchedCall).toBeDefined();
    expect(String(dispatchedCall![0])).toContain('image prompt with 1 image');
  });

  // -----------------------------------------------------------------------
  // 9. Non-Error original → LlmServiceError with "Unknown error"
  // -----------------------------------------------------------------------
  it.each([
    { label: 'plain object', original: { foo: 'bar' } as unknown },
    { label: 'string', original: 'some string error' as unknown },
    { label: 'null', original: null as unknown },
  ])(
    'produces "Unknown error" and undefined originalError for non-Error original: $label',
    async ({ original }) => {
      service.sendInternalFn = vi.fn().mockRejectedValue(original);
      service.mapErrorFn = vi.fn().mockReturnValue(undefined);

      let thrown: unknown;
      try {
        await service.send(minimalPayload);
      } catch (error_) {
        thrown = error_;
      }

      expect(thrown).toBeInstanceOf(LlmServiceError);
      expect((thrown as LlmServiceError).retryable).toBe(false);
      expect((thrown as LlmServiceError).getStatus()).toBe(500);
      expect((thrown as LlmServiceError).message).toBe(
        'LLM service error: Unknown error',
      );
      expect((thrown as LlmServiceError).originalError).toBeUndefined();
      expect((thrown as LlmServiceError).providerName).toBe('test-provider');
    },
  );
});
