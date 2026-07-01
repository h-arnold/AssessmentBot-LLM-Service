import { BadRequestException, Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { JsonParserUtil as JsonParserUtility } from './json-parser.utility';

describe('JsonParserUtil', () => {
  let utility: JsonParserUtility;
  let logger: Logger;
  let logSpy: jest.SpyInstance;
  let debugSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    logger = new Logger('JsonParserUtil');
    logSpy = jest.spyOn(logger, 'log').mockImplementation(() => {});
    debugSpy = jest.spyOn(logger, 'debug').mockImplementation(() => {});
    errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JsonParserUtility,
        {
          provide: Logger,
          useValue: logger,
        },
      ],
    }).compile();

    utility = module.get<JsonParserUtility>(JsonParserUtility);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(utility).toBeDefined();
  });

  it('should successfully parse a valid JSON string', () => {
    const json = '{"name": "test"}';
    const expected: Record<string, string> = { name: 'test' };
    expect(utility.parse(json)).toEqual(expected);
  });

  it('should repair and parse a malformed JSON string', () => {
    const malformedJson = '{"name": "test", "age": 30,}'; // Malformed JSON with trailing comma
    const expected: Record<string, string | number> = { name: 'test', age: 30 };
    expect(utility.parse(malformedJson)).toEqual(expected);
  });

  it('should trim content outside curly brackets by default', () => {
    const jsonWithExtraContent = '```json\n{"key": "value"}\n```';
    const expected: Record<string, string> = { key: 'value' };
    expect(utility.parse(jsonWithExtraContent)).toEqual(expected);
  });

  it('should not trim content when trim is false', () => {
    const jsonWithExtraContent = 'some-prefix {"key": "value"}';
    // Expecting a failure because the prefix makes it invalid JSON
    expect(() => utility.parse(jsonWithExtraContent, false)).toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException for irreparable JSON and log the original string', () => {
    const irreparableJson = 'this is not json';
    expect(() => utility.parse(irreparableJson)).toThrow(BadRequestException);
    expect(errorSpy).toHaveBeenCalledWith(
      `JSON parsing failed: No JSON object found in input: ${irreparableJson}`,
    );
  });

  it('should handle JSON embedded within other text and markdown', () => {
    const embeddedJson =
      'Here is the JSON:\n```json\n{"user": {"id": 1, "name": "John Doe"}}\n```\nThanks!';
    const expected: Record<string, unknown> = { user: { id: 1, name: 'John Doe' } };
    expect(utility.parse(embeddedJson)).toEqual(expected);
  });

  it('should log repaired JSON at debug level to prevent PII leakage in production', () => {
    const malformedJson = '{"name": "test", "age": 30,}'; // Malformed JSON with trailing comma
    utility.parse(malformedJson);

    // Verify that repaired JSON is logged at debug level, not info level
    expect(debugSpy).toHaveBeenCalledWith(
      expect.stringContaining('Repaired JSON for debug:'),
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('Repaired JSON'),
    );
  });
});
