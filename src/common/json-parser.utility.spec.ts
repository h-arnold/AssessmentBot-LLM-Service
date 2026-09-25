import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MockInstance } from 'vitest';

import { JsonParserUtility } from './json-parser.utility.js';
import { ConfigService } from '../config/config.service.js';

const createConfigGetter = (value: unknown): ((key: string) => unknown) => {
  const values = new Map<string, unknown>([['LOG_LLM_CONTENT', value]]);
  return (key: string): unknown => values.get(key) ?? null;
};

describe('JsonParserUtil', () => {
  let utility: JsonParserUtility;
  let logger: Logger;
  let logSpy: MockInstance;
  let debugSpy: MockInstance;
  let errorSpy: MockInstance;
  let configService: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    logger = new Logger('JsonParserUtil');
    logSpy = vi.spyOn(logger, 'log').mockImplementation(() => {});
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    configService = {
      get: vi.fn(createConfigGetter(false)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JsonParserUtility,
        {
          provide: Logger,
          useValue: logger,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    utility = module.get<JsonParserUtility>(JsonParserUtility);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(utility).toBeDefined();
  });

  it('should successfully parse a valid JSON string', () => {
    const json = '{"name": "test"}';
    const expected: Record<string, string> = { name: 'test' };
    expect(utility.parse(json, false)).toEqual(expected);
  });

  it('should repair and parse a malformed JSON string', () => {
    const malformedJson = '{"name": "test", "age": 30,}'; // Malformed JSON with trailing comma
    const expected: Record<string, string | number> = { name: 'test', age: 30 };
    expect(utility.parse(malformedJson, false)).toEqual(expected);
  });

  it('should trim content outside curly brackets when requested', () => {
    const jsonWithExtraContent = '```json\n{"key": "value"}\n```';
    const expected: Record<string, string> = { key: 'value' };
    expect(utility.parse(jsonWithExtraContent, true)).toEqual(expected);
  });

  it('should not trim content when trim is false', () => {
    const jsonWithExtraContent = 'some-prefix {"key": "value"}';
    // Expecting a failure because the prefix makes it invalid JSON
    expect(() => utility.parse(jsonWithExtraContent, false)).toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException for irreparable JSON and log the failure without raw content by default', () => {
    const irreparableJson = 'this is not json';
    expect(() => utility.parse(irreparableJson, true)).toThrow(
      BadRequestException,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      'JSON parsing failed: No valid JSON object found in input.',
    );
    // Raw content is gated behind LOG_LLM_CONTENT, which defaults to false:
    // the raw input must not appear in any log call at any level.
    const allLogCalls = [
      ...debugSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...logSpy.mock.calls,
    ].flat();
    expect(allLogCalls.join('\n')).not.toContain(irreparableJson);
  });

  it('logs raw unparseable response content only when LOG_LLM_CONTENT is enabled', () => {
    configService.get.mockImplementation(createConfigGetter(true));
    utility = new JsonParserUtility(
      configService as unknown as ConfigService,
      logger,
    );

    const irreparableJson = 'this is not json';
    expect(() => utility.parse(irreparableJson, true)).toThrow(
      BadRequestException,
    );

    expect(errorSpy).toHaveBeenCalledWith(
      'JSON parsing failed: No valid JSON object found in input.',
    );
    expect(debugSpy).toHaveBeenCalledWith(
      `Unparseable LLM response input: ${irreparableJson}`,
    );
  });

  it('should handle JSON embedded within other text and markdown', () => {
    const embeddedJson =
      'Here is the JSON:\n```json\n{"user": {"id": 1, "name": "John Doe"}}\n```\nThanks!';
    const expected: Record<string, unknown> = {
      user: { id: 1, name: 'John Doe' },
    };
    expect(utility.parse(embeddedJson, true)).toEqual(expected);
  });

  it('should handle JSON followed by commentary containing a closing brace (M3)', () => {
    const text = 'Here is the result: {"a":1} and note that x > y } done';
    expect(utility.parse(text, true)).toEqual({ a: 1 });
  });

  it('should handle a closing brace inside a string value without truncating (regression)', () => {
    const text = '{"reasoning": "The closing brace } is shown"}';
    expect(utility.parse(text, false)).toEqual({
      reasoning: 'The closing brace } is shown',
    });
  });

  it('should throw BadRequestException for unbalanced braces even when trailing } exists', () => {
    // The trailing } is not part of a balanced JSON object, and there is
    // no valid JSON to extract.
    const text = 'Some text } here';
    expect(() => utility.parse(text, true)).toThrow(BadRequestException);
  });

  it('should handle deeply nested JSON with trailing prose containing }', () => {
    const text =
      'Output: {"outer": {"inner": [1, 2, 3]}} and final check } end';
    expect(utility.parse(text, true)).toEqual({ outer: { inner: [1, 2, 3] } });
  });

  it('should log repaired JSON only at debug level and only when LOG_LLM_CONTENT is enabled', () => {
    const malformedJson = '{"name": "test", "age": 30,}'; // Malformed JSON with trailing comma

    // Default deployment: LOG_LLM_CONTENT is false, so raw content is
    // never emitted.
    utility.parse(malformedJson, false);
    expect(debugSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Repaired JSON'),
    );
    expect(logSpy).not.toHaveBeenCalled();

    // Content logging explicitly enabled: repaired JSON appears at debug
    // level, not info level.
    configService.get.mockImplementation(createConfigGetter(true));
    utility = new JsonParserUtility(
      configService as unknown as ConfigService,
      logger,
    );
    utility.parse(malformedJson, false);

    // Verify that repaired JSON is logged at debug level, not info level
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Repaired JSON for debug:'),
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Repaired JSON'),
    );
  });

  it('preserves the original parser or repair exception as the cause of the thrown BadRequestException', () => {
    const malformedJson = '{"value":"\u{0}"}';

    let thrown: unknown;
    try {
      utility.parse(malformedJson, false);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BadRequestException);
    expect((thrown as BadRequestException).cause).toBeInstanceOf(Error);
  });
});
