// src/common/utils/crypto.utilities.ts
import { randomBytes } from 'node:crypto';

/**
 * Generates a cryptographically random API key with the given prefix.
 * @param prefix - The prefix string for the API key (e.g. 'abt_').
 * @returns The full API key as `${prefix}${body}` where body is 32 base64url characters.
 * @remarks The body is `randomBytes(24).toString('base64url')` = 192 bits of entropy,
 * matching the validator in Sections 1–2 exactly; do not shorten the body without
 * updating both the schema validator and the service validator.
 */
export function generateApiKey(prefix: string): string {
  return prefix + randomBytes(24).toString('base64url');
}
