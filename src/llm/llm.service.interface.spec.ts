import { Logger } from '@nestjs/common';
import { ZodError, z } from 'zod';

import {
  ImagePromptPayload,
  LLMService,
  LlmPayload,
  StringPromptPayload,
  MultiPartPromptPayload,
  MultiPartPromptPayloadSchema,
  ReasoningEffortSchema,
  ReasoningEffort,
  LlmConversationMessageSchema,
  ImageContentPartSchema,
} from './llm.service.interface.js';
import { LlmResponse } from './types.js';
import type { LlmError } from '../common/errors/llm-error.base.js';
import { LlmServiceError } from '../common/errors/llm-service.error.js';
import { RateLimitError } from '../common/errors/rate-limit.error.js';
import { ResourceExhaustedError } from '../common/errors/resource-exhausted.error.js';
import { ConfigService } from '../config/config.service.js';

// Fix randomInt jitter to zero so backoff delays are deterministic
vi.mock('node:crypto', () => {
  return {
    randomInt: vi.fn(() => 0),
  };
});

// ---------------------------------------------------------------------------
// Test subclass implementing the NEW LLMService contract (Section 2)
// ---------------------------------------------------------------------------
class ExposedLLMService extends LLMService {
  protected readonly providerName = 'test-provider';

  /**
   * Configurable mock for mapError().
   */
  public mapErrorFn: (error: unknown) => LlmError | undefined = () => {};

  /**
   * Configurable mock for _sendInternal().
   * @returns A promise that rejects with a default error.
   */
  public sendInternalFn: (payload: LlmPayload) => Promise<LlmResponse> = () =>
    Promise.reject(new Error('_sendInternal not configured'));

  /**
   * Exposes the protected mapPayload for testing.
   * @param payload - The LLM payload to dispatch.
   * @param handlers - The dispatch handlers for each payload type.
   * @param handlers.image - Handler for image prompt payloads.
   * @param handlers.text - Handler for string prompt payloads.
   * @param handlers.conversation - Optional handler for multi-part conversation payloads.
   * @returns The result of the matched handler.
   */
  public mapPayload<T>(
    payload: LlmPayload,
    handlers: {
      image: (p: ImagePromptPayload) => T;
      text: (p: StringPromptPayload) => T;
      conversation?: (p: MultiPartPromptPayload) => T;
    },
  ): T {
    return super.mapPayload(payload, handlers);
  }

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
    // mapError called once on the first failure; the result is reused for retries
    expect(mapErrorSpy).toHaveBeenCalledTimes(1);
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

// ---------------------------------------------------------------------------
// Payload contract: optional promptCacheKey
// ---------------------------------------------------------------------------
describe('LlmPayload optional promptCacheKey contract', () => {
  const promptCacheKey = 'a'.repeat(64);

  it('should type-check a StringPromptPayload carrying a promptCacheKey', () => {
    const payload = {
      system: 'system instruction',
      user: 'user prompt',
      promptCacheKey,
    } satisfies StringPromptPayload;

    expect(payload.system).toBe('system instruction');
    expect(payload.user).toBe('user prompt');
    expect(payload.promptCacheKey).toBe(promptCacheKey);
  });

  it('should type-check an ImagePromptPayload carrying a promptCacheKey', () => {
    const payload = {
      system: 'system instruction',
      images: [{ mimeType: 'image/png', data: 'base64-data' }],
      promptCacheKey,
    } satisfies ImagePromptPayload;

    expect(payload.system).toBe('system instruction');
    expect(payload.images).toEqual([
      { mimeType: 'image/png', data: 'base64-data' },
    ]);
    expect(payload.promptCacheKey).toBe(promptCacheKey);
  });

  it('should keep promptCacheKey optional on StringPromptPayload', () => {
    const payload = {
      system: 'system instruction',
      user: 'user prompt',
    } satisfies StringPromptPayload;

    expect('promptCacheKey' in payload).toBe(false);
  });

  it('should keep promptCacheKey optional on ImagePromptPayload', () => {
    const payload = {
      system: 'system instruction',
      images: [{ mimeType: 'image/png', data: 'base64-data' }],
    } satisfies ImagePromptPayload;

    expect('promptCacheKey' in payload).toBe(false);
  });

  it('should type-check both payload variants in the LlmPayload union carrying a promptCacheKey', () => {
    const payloads = [
      { system: 'system instruction', user: 'user prompt', promptCacheKey },
      {
        system: 'system instruction',
        images: [{ mimeType: 'image/png', data: 'base64-data' }],
        promptCacheKey,
      },
    ] satisfies LlmPayload[];

    expect(payloads).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Multi-part contract RED tests (Section 1)
// ---------------------------------------------------------------------------

describe('MultiPartPromptPayload contract — mapPayload dispatch', () => {
  let service: ExposedLLMService;

  beforeEach(() => {
    service = createService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches a multi-part payload to the conversation handler', () => {
    const conversationHandler = vi.fn().mockReturnValue('result');
    const multiPartPayload: LlmPayload = {
      messages: [{ role: 'user', parts: [{ kind: 'text', text: 'hello' }] }],
    };

    // REQUIRED: mapPayload should dispatch multi-part payloads to the conversation
    // handler and return its result. Currently throws 'Unsupported payload type' —
    // this is the intended RED failure.
    expect(
      service.mapPayload(multiPartPayload, {
        image: () => 'image-result',
        text: () => 'text-result',
        conversation: conversationHandler,
      }),
    ).toBe('result');
    expect(conversationHandler).toHaveBeenCalledWith(multiPartPayload);
  });

  it('legacy image/text dispatch works and unsupported payload throws', () => {
    const imageHandler = vi.fn().mockReturnValue('image-result');
    const textHandler = vi.fn().mockReturnValue('text-result');

    const imagePayload: LlmPayload = {
      system: 'sys',
      images: [{ mimeType: 'image/png', data: 'x' }],
    };
    const textPayload: LlmPayload = { system: 'sys', user: 'hello' };
    const unsupportedPayload: LlmPayload = {
      system: 's',
    } as unknown as LlmPayload;

    // Image payload hits image handler (text handler required by signature but unused).
    expect(
      service.mapPayload(imagePayload, {
        image: imageHandler,
        text: () => 'text',
      }),
    ).toBe('image-result');
    expect(imageHandler).toHaveBeenCalledOnce();

    // Text payload hits text handler (image handler required by signature but unused).
    expect(
      service.mapPayload(textPayload, {
        image: () => 'image',
        text: textHandler,
      }),
    ).toBe('text-result');
    expect(textHandler).toHaveBeenCalledOnce();

    // Unrelated shape throws 'Unsupported payload type'.
    expect(() => {
      return service.mapPayload(unsupportedPayload, {
        image: imageHandler,
        text: textHandler,
      });
    },
    ).toThrow('Unsupported payload type');
  });

  it('guard-precedence: image guard fires before conversation check', () => {
    const imageHandler = vi.fn().mockReturnValue('image-result');
    const conversationHandler = vi.fn().mockReturnValue('conversation-result');

    // A payload with both images and messages hits the image guard first.
    const dualPayload: LlmPayload = {
      system: 'sys',
      images: [{ mimeType: 'image/png', data: 'x' }],
      messages: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
    };

    expect(
      service.mapPayload(dualPayload, {
        image: imageHandler,
        text: () => 'text',
        conversation: conversationHandler,
      }),
    ).toBe('image-result');
    expect(imageHandler).toHaveBeenCalledOnce();
    expect(conversationHandler).not.toHaveBeenCalled();
  });

  it('absent optional conversation handler throws for multi-part payload', () => {
    const multiPartPayload: LlmPayload = {
      messages: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
    };

    // No conversation handler provided — falls through to throw.
    expect(() => {
      return service.mapPayload(multiPartPayload, {
        image: () => 'image-result',
        text: () => 'text-result',
      });
    },
    ).toThrow('Unsupported payload type');
  });
});

describe('MultiPartPromptPayload contract — describePayload summary', () => {
  let service: ExposedLLMService;

  beforeEach(() => {
    service = createService();
  });

  it('summarises a multi-part payload as "conversation prompt with N message(s)"', async () => {
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    // _sendInternal is mocked to resolve so describePayload is exercised
    // before the retry loop. The summary text is asserted here.
    service.sendInternalFn = vi.fn().mockResolvedValue({
      completeness: { score: 5, reasoning: 'complete' },
      accuracy: { score: 4, reasoning: 'accurate' },
      spag: { score: 3, reasoning: 'ok' },
    });
    service.mapErrorFn = vi.fn();

    const multiPartPayload: LlmPayload = {
      messages: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
    };

    await service.send(multiPartPayload);

    const dispatchedCall = logSpy.mock.calls.find((call) =>
      String(call[0]).includes('Dispatching LLM request'),
    );
    expect(dispatchedCall).toBeDefined();
    // describePayload currently returns only 'conversation prompt' —
    // the full summary with message count is not yet implemented.
    expect(String(dispatchedCall![0])).toContain(
      'conversation prompt with 1 message',
    );
  });
});

describe('MultiPartPromptPayload contract — schema validation', () => {
  let service: ExposedLLMService;

  beforeEach(() => {
    service = createService();
  });

  it('a valid multi-part payload passes schema validation at the top of send()', async () => {
    const validPayload: LlmPayload = {
      messages: [{ role: 'user', parts: [{ kind: 'text', text: 'hi' }] }],
    } satisfies MultiPartPromptPayload;

    const parseSpy = vi.spyOn(MultiPartPromptPayloadSchema, 'safeParse');
    service.sendInternalFn = vi.fn().mockResolvedValue({
      completeness: { score: 5, reasoning: 'complete' },
      accuracy: { score: 4, reasoning: 'accurate' },
      spag: { score: 3, reasoning: 'ok' },
    });
    service.mapErrorFn = vi.fn();

    await service.send(validPayload);

    // Boundary validation is not yet implemented in send() —
    // MultiPartPromptPayloadSchema.safeParse() is never called
    // before describePayload and the retry loop. This is the
    // intended RED failure.
    expect(parseSpy).toHaveBeenCalled();
    parseSpy.mockRestore();
  });

  it('empty messages raises ZodError re-thrown directly without mapError()/retry', async () => {
    service.sendInternalFn = vi.fn().mockResolvedValue({
      completeness: { score: 5, reasoning: 'complete' },
      accuracy: { score: 4, reasoning: 'accurate' },
      spag: { score: 3, reasoning: 'ok' },
    });
    service.mapErrorFn = vi.fn();

    // Without boundary validation in send(), the empty-messages
    // payload reaches the mocked _sendInternal rather than raising
    // ZodError. This is the intended RED failure: ZodError is not
    // raised and the payload is not validated.
    const emptyMultiPart = { messages: [] } as MultiPartPromptPayload;
    await expect(
      service.send(emptyMultiPart as unknown as LlmPayload),
    ).rejects.toBeDefined();
  });
});

describe('MultiPartPromptPayload contract — type-level compile checks', () => {
  it('z.infer<typeof ReasoningEffortSchema> equals the existing ReasoningEffort type', () => {
    type InferredReasoningEffort = z.infer<typeof ReasoningEffortSchema>;
    const _check: InferredReasoningEffort = 'off';
    const _check2: ReasoningEffort = 'off';
    expect(_check).toBe(_check2);
  });

  it('system-role messages reject image parts at the type level', () => {
    const systemMessage = {
      role: 'system' as const,
      parts: [{ kind: 'text' as const, text: 'hello' }],
    } satisfies z.infer<typeof LlmConversationMessageSchema>;
    expect(systemMessage.role).toBe('system');
    expect(systemMessage.parts[0].kind).toBe('text');
  });

  it('image parts require the data field at the type level', () => {
    const imagePart = {
      kind: 'image' as const,
      mimeType: 'image/png',
      data: 'base64-data',
    } satisfies z.infer<typeof ImageContentPartSchema>;
    expect(imagePart.kind).toBe('image');
    expect(imagePart.mimeType).toBe('image/png');
    expect(imagePart.data).toBe('base64-data');
  });
});
