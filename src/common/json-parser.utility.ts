import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { jsonrepair } from 'jsonrepair';

/**
 * Utility class for parsing and repairing JSON strings.
 * This class attempts to repair malformed JSON strings using the `jsonrepair` library
 * and then parses them into JavaScript objects.
 * @example
 * ```typescript
 * const jsonParser = new JsonParserUtility(new Logger('JsonParserUtility'));
 * const parsedObject = jsonParser.parse('```json\n{"key": "value"}\n```');
 * ```
 * @throws {BadRequestException} Thrown when the provided JSON string is irreparable or malformed.
 */
@Injectable()
export class JsonParserUtility {
  constructor(private readonly logger: Logger) {}

  private parseJsonValue(jsonString: string): unknown {
    return JSON.parse(jsonString) as unknown;
  }

  private parseAndValidate(jsonContent: string): unknown {
    const repairedJsonString = jsonrepair(jsonContent);
    const parsed = this.parseJsonValue(repairedJsonString);

    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Parsed JSON is not a structured object or array.');
    }

    this.logger.debug(`Repaired JSON for debug: ${repairedJsonString}`);
    return parsed;
  }

  /**
   * Scans a character at a given position for string-aware brace tracking.
   * Manages the `inString` and `escaped` flags and returns the updated brace
   * depth, or a sentinel indicating the balanced object has been found.
   * @param ch - The current character to evaluate.
   * @param depth - The current brace nesting depth.
   * @param inString - Whether the scan is currently inside a JSON string.
   * @param escaped - Whether the previous character was a backslash inside a
   *   string (the current character is consumed literally).
   * @returns An object with updated `depth`, `inString`, `escaped`, and
   *   `found` (true when the matching `}` has been reached).
   */
  private scanBraceChar(
    ch: string,
    depth: number,
    inString: boolean,
    escaped: boolean,
  ): { depth: number; inString: boolean; escaped: boolean; found: boolean } {
    if (escaped) {
      return { depth, inString, escaped: false, found: false };
    }

    if (inString && ch === '\\') {
      return { depth, inString, escaped: true, found: false };
    }

    if (ch === '"') {
      return { depth, inString: !inString, escaped, found: false };
    }

    if (inString) {
      return { depth, inString, escaped, found: false };
    }

    // Outside string — track brace depth
    if (ch === '{') {
      return { depth: depth + 1, inString, escaped, found: false };
    }

    if (ch === '}') {
      const newDepth = depth - 1;
      return {
        depth: newDepth,
        inString,
        escaped,
        found: newDepth === 0,
      };
    }

    return { depth, inString, escaped, found: false };
  }

  /**
   * Performs a balanced-brace scan starting from the first `{` character.
   * Tracks nesting depth and ignores braces that appear inside JSON string
   * literals. This prevents a literal `}` inside a string value from being
   * treated as the object terminator.
   * @param text - The text to scan.
   * @returns The JSON substring from the first `{` to its matching `}`,
   *   or `undefined` if no balanced JSON object is found.
   */
  private extractBalancedBraceObject(text: string): string | undefined {
    const start = text.indexOf('{');
    if (start === -1) {
      return undefined;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index++) {
      const result = this.scanBraceChar(
        text.charAt(index),
        depth,
        inString,
        escaped,
      );

      depth = result.depth;
      inString = result.inString;
      escaped = result.escaped;

      if (result.found) {
        return text.slice(start, index + 1);
      }
    }

    return undefined;
  }

  /**
   * Parses and repairs a JSON string into a structured object or array.
   * Optionally trims content outside the first and last curly brackets.
   * If the parsed result is not an object or array (e.g., a string or number),
   * it is considered a failure, as the primary use case is for structured data.
   * @param {string} jsonString The raw string that may contain JSON.
   * @param {boolean} trim If true, trims content before the first '{' and after
   *   the last '}'. Defaults to true.
   * @returns {unknown} The parsed JavaScript object or array.
   */
  parse(jsonString: string, trim = true): unknown {
    let jsonContent = '';

    const jsonBlockRegex = /```json\n([\s\S]*?)\n```/;
    const match = jsonBlockRegex.exec(jsonString);

    if (match?.[1]) {
      jsonContent = match[1];
      this.logger.debug('Extracted JSON from markdown block.');
    } else if (trim) {
      const balanced = this.extractBalancedBraceObject(jsonString);
      if (balanced) {
        jsonContent = balanced;
        this.logger.debug('Extracted JSON by trimming brackets.');
      } else {
        this.logger.error(
          `JSON parsing failed: No valid JSON object found in input: ${jsonString}`,
        );
        throw new BadRequestException(
          'No valid JSON object found in response.',
        );
      }
    } else {
      jsonContent = jsonString;
    }

    try {
      return this.parseAndValidate(jsonContent);
    } catch (error) {
      this.logger.debug(`JSON parsing failed for input: ${jsonString}`, error);
      this.logger.error(
        'JSON parsing failed due to malformed or irreparable input.',
        error,
      );
      throw new BadRequestException(
        'Malformed or irreparable JSON string provided.',
      );
    }
  }
}
