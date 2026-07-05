import type { Plugin } from '@opencode-ai/plugin';

const SILENCE_PATTERNS = [
  /eslint-disable(?:-next-line|-line)?/i,
  /@ts-ignore/i,
  /@ts-nocheck/i,
  /@ts-expect-error/i,
  /noqa/i,
  /type:\s*ignore/i,
];

/**
 * Check whether the given text contains any silencing rule patterns.
 * @param {string} text - The text to check for silencing rules.
 * @returns {string | null} The matched pattern source, or null if no silencing
 *   rule is found.
 */
function hasSilencingRule(text: string): string | null {
  for (const pattern of SILENCE_PATTERNS) {
    if (pattern.test(text)) return pattern.source;
  }
  return null;
}

export default (async (): Promise<Plugin> => {
  return {
    'tool.execute.before': async (input, output): Promise<void> => {
      if (input.tool === 'edit') {
        const match = hasSilencingRule(output.args.newString);
        if (match) {
          throw new Error(
            `Blocked edit: new text contains a lint/ts silencing rule (${match}). ` +
              `Fix the underlying issue instead of suppressing the warning. ` +
              `If you truly believe there is no good way around the eslint rule, stop and hand back to the user for permission before proceeding.`,
          );
        }
      } else if (input.tool === 'write') {
        const match = hasSilencingRule(output.args.content);
        if (match) {
          throw new Error(
            `Blocked write: content contains a lint/ts silencing rule (${match}). ` +
              `Fix the underlying issue instead of suppressing the warning. ` +
              `If you truly believe there is no good way around the eslint rule, stop and hand back to the user for permission before proceeding.`,
          );
        }
      }
    },
  };
}) satisfies Plugin;
