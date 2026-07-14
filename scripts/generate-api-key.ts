#!/usr/bin/env node

/**
 * One-shot CLI for generating a single API key conforming to the strict
 * `<prefix><32-char-base64url-body>` format.
 *
 * The prefix defaults to the `DEFAULT_API_KEY_PREFIX` constant ('abt_') if
 * the `API_KEY_PREFIX` environment variable is not set.
 *
 * Usage:
 * ```
 * npm run generate:api-key
 * API_KEY_PREFIX=custom_ npm run generate:api-key
 * ```
 * Prints exactly one key to stdout.
 */

// `.ts` extensions are required here: this script is executed directly via
// `node --experimental-strip-types`, which does not rewrite `.js` import
// specifiers to `.ts` in this Node toolchain. Do not "correct" these to `.js`.
import { generateApiKey } from '../src/common/utils/crypto.utilities.ts';
import { DEFAULT_API_KEY_PREFIX } from '../src/config/environment.schema.ts';

console.log(
  generateApiKey(process.env.API_KEY_PREFIX ?? DEFAULT_API_KEY_PREFIX),
);
