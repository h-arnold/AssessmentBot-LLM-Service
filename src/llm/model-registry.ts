/**
 * Model registry — maps model name prefixes to provider identifiers.
 *
 * This module is the single source of truth for routing decisions and startup
 * validation. It imports nothing from other project files (no circular deps)
 * and is framework-free pure TypeScript.
 * @module model-registry
 */

/**
 * Identifies a supported LLM provider.
 */
export type ProviderId = 'gemini' | 'mistral';

/**
 * A mapping from a model name prefix to its provider.
 * The first entry whose `prefix` is a prefix of the model name wins.
 */
export interface ModelEntry {
  /** The provider that handles models matching this entry. */
  provider: ProviderId;
  /**
   * The model name must start with this string (case-sensitive) to match.
   * Entries are checked in declaration order; the first match wins.
   */
  prefix: string;
}

/**
 * Ordered list of supported model→provider mappings.
 *
 * The first matching entry wins (checked in declaration order). Model names
 * are matched case-sensitively against each entry's `prefix`.
 *
 * The Gemini and Mistral prefix sets are provider-disjoint (no model name can
 * match prefixes from both providers), so ordering across providers is
 * immaterial. Ordering within a provider matters only for same-provider prefix
 * overlaps (e.g. `gemini-2.5-flash` is a prefix of `gemini-2.5-flash-lite`);
 * longer, more-specific prefixes are intentional here — `gemini-2.5-flash-lite`
 * correctly maps to `gemini` because `gemini-2.5-flash` is a prefix of it.
 */
export const SUPPORTED_MODELS: readonly ModelEntry[] = [
  // Gemini models
  { provider: 'gemini', prefix: 'gemini-flash-latest' },
  { provider: 'gemini', prefix: 'gemini-2.5-flash' },
  { provider: 'gemini', prefix: 'gemini-2.0-flash' },
  // Mistral models
  { provider: 'mistral', prefix: 'mistral-small-latest' },
  { provider: 'mistral', prefix: 'pixtral-' },
  { provider: 'mistral', prefix: 'open-mistral-' },
] as const;

/**
 * Formats the supported model prefixes into a human-readable, comma-separated
 * string for use in error messages.
 * @returns A comma-separated string of all registered model prefixes.
 */
function formatSupportedPrefixes(): string {
  return SUPPORTED_MODELS.map((entry) => entry.prefix).join(', ');
}

/**
 * Resolves a model name to its provider identifier.
 *
 * Iterates over {@link SUPPORTED_MODELS} in declaration order and returns the
 * provider of the first entry whose `prefix` is a case-sensitive prefix of
 * `modelName`.
 * @param modelName - The model name to resolve (case-sensitive).
 * @returns The matching provider identifier.
 * @throws {Error} If the model name does not match any known prefix.
 */
export function resolveProvider(modelName: string): ProviderId {
  for (const entry of SUPPORTED_MODELS) {
    if (modelName.startsWith(entry.prefix)) {
      return entry.provider;
    }
  }
  throw new Error(
    `Unsupported model name: '${modelName}'. Supported model prefixes: ${formatSupportedPrefixes()}`,
  );
}

/**
 * Validates that a model name is supported by the registry.
 *
 * Delegates to {@link resolveProvider} and discards the result. Throws a
 * descriptive error (including the model name and the list of supported
 * prefixes) when the model name does not match any registered prefix.
 * @param modelName - The model name to validate (case-sensitive).
 * @throws {Error} If the model name does not match any known prefix.
 */
export function validateModelName(modelName: string): void {
  resolveProvider(modelName);
}
