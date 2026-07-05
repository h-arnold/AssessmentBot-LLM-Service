/**
 * Type guard functions for runtime type checking.
 *
 * This module provides type guard functions that can be used to safely check
 * the shape and type of objects at runtime, particularly useful for validating
 * LLM payload structures and other dynamic data.
 */

/**
 * Type guard to check if an unknown value has the structure of a system-user message.
 *
 * Validates that the provided value is an object containing both 'system' and 'user'
 * properties that are both strings. This is commonly used for LLM prompt payloads.
 * @param {unknown} message - The value to check.
 * @returns {message is { system: string; user: string }} True if the value
 *   matches the expected system-user message structure.
 */
export function isSystemUserMessage(
  message: unknown,
): message is { system: string; user: string } {
  return (
    typeof message === 'object' &&
    message !== null &&
    'system' in message &&
    'user' in message &&
    typeof (message as { system?: unknown }).system === 'string' &&
    typeof (message as { user?: unknown }).user === 'string'
  );
}
