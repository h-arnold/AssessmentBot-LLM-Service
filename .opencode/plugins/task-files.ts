import path from 'node:path';

import type { Plugin } from '@opencode-ai/plugin';

// The task tool defines an explicit `jsonSchema` (packages/opencode/src/tool/task.ts),
// so the `files` parameter must be added to BOTH `output.parameters` (the model-facing
// definition) and `output.jsonSchema` (the parse schema). Patching only `parameters`
// would be ignored at parse time and the model's `files` argument would be stripped.
const MAX_FILE_BYTES = 256 * 1024;

interface NormalisedEntry {
  path: string;
  offset: number;
  limit?: number;
  skipNote?: string;
}

const ITEMS_SCHEMA = {
  oneOf: [
    { type: 'string' },
    {
      type: 'object',
      properties: {
        path: { type: 'string' },
        offset: { type: 'integer' },
        limit: { type: 'integer' },
      },
      required: ['path'],
      additionalProperties: false,
    },
  ],
};

const FILES_PARAMETER = {
  type: 'array',
  items: ITEMS_SCHEMA,
  description:
    "Optional list of file paths (relative to the project worktree) to read and inject into this task's context as compulsory reading. The subagent receives the file contents directly, so it does not need to issue read calls for them. Paths are sorted alphabetically before injection to keep the injected content deterministic for prompt caching. Each entry can be a string path or an object with `path` (string), `offset` (1-indexed start line, optional), and `limit` (max lines, optional).",
};

/**
 * Normalise a raw `files` array entry (string or object) into a structured entry.
 * @param item - An entry from the `files` array, either a string path or an object with path/offset/limit.
 * @returns A normalised entry with a `path`, 1-indexed `offset`, optional `limit`, and optional `skipNote`.
 */
function normaliseEntry(item: unknown): NormalisedEntry {
  if (typeof item === 'string') {
    return { path: item, offset: 1 };
  }

  if (typeof item !== 'object' || item === null) {
    return {
      path: String(item),
      offset: 1,
      skipNote:
        'each file entry must be a string or an object with a `path` property',
    };
  }

  const object = item as Record<string, unknown>;

  if (typeof object.path !== 'string') {
    return {
      path: String(object.path ?? ''),
      offset: 1,
      skipNote: `path must be a string, got ${typeof object.path}`,
    };
  }

  const offsetValue = object.offset === undefined ? 1 : object.offset;
  const limitValue = object.limit === undefined ? undefined : object.limit;

  if (
    typeof offsetValue !== 'number' ||
    !Number.isSafeInteger(offsetValue) ||
    offsetValue < 1
  ) {
    return {
      path: object.path,
      offset: 1,
      skipNote: `offset must be an integer >= 1, got ${JSON.stringify(object.offset)}`,
    };
  }

  if (
    limitValue !== undefined &&
    (typeof limitValue !== 'number' ||
      !Number.isSafeInteger(limitValue) ||
      limitValue < 1)
  ) {
    return {
      path: object.path,
      offset: 1,
      skipNote: `limit must be an integer >= 1, got ${JSON.stringify(object.limit)}`,
    };
  }

  return {
    path: object.path,
    offset: offsetValue as number,
    limit: limitValue as number | undefined,
  };
}

/**
 * Process a single normalised entry: read the file, apply offset/limit, and return a formatted block.
 * Returns `null` if an error occurs (the error is recorded in the block text instead).
 * @param root - The project root directory path.
 * @param entry - The normalised file entry to process.
 * @returns A formatted markdown block string, or null if a skip condition is met (the block text includes the skip note).
 */
async function processEntry(
  root: string,
  entry: NormalisedEntry,
): Promise<string | null> {
  if (entry.skipNote) {
    return `### ${entry.path}\n(Skipped: ${entry.skipNote})`;
  }

  const target = path.resolve(root, entry.path);
  const relativePath = path.relative(root, target);
  if (
    relativePath === '' ||
    relativePath.startsWith('..') ||
    path.isAbsolute(relativePath)
  ) {
    return `### ${entry.path}\n(Skipped: path resolves outside the project worktree.)`;
  }

  const handle = Bun.file(target);
  const stat = await handle.stat();
  const size = stat.size;
  if (size > MAX_FILE_BYTES) {
    return `### ${relativePath}\n(Skipped: file is ${size} bytes, exceeding the ${MAX_FILE_BYTES}-byte limit.)`;
  }

  let content: string;
  try {
    content = await handle.text();
  } catch {
    return `### ${relativePath}\n(Skipped: file could not be read.)`;
  }

  // Apply offset/limit and format with line numbers
  const allLines = content.split('\n');
  // Remove trailing empty element from a final newline
  const lines =
    allLines.at(-1) === '' ? allLines.slice(0, -1) : allLines;

  const startIndex = entry.offset - 1; // convert to 0-indexed
  if (startIndex >= lines.length) {
    return `### ${relativePath}\n(Skipped: offset ${entry.offset} exceeds file length (${lines.length} lines).)`;
  }

  const slice =
    entry.limit === undefined
      ? lines.slice(startIndex)
      : lines.slice(startIndex, startIndex + entry.limit);

  const numbered = slice
    .map((line, index) => `${entry.offset + index}: ${line}`)
    .join('\n');

  return `### ${relativePath}\n${numbered}`;
}

/**
 * Build the attachment block from normalised entries and prepend it to the prompt.
 * @param blocks - The formatted markdown block strings for each file.
 * @param taskArguments - The task arguments object.
 * @param taskArguments.prompt - The existing instruction text for the subagent; the attachment is prepended to this.
 */
function buildAttachment(
  blocks: string[],
  taskArguments: { prompt?: string },
): void {
  const attachment = [
    '## Attached files (compulsory reading — provided automatically, do not re-read)',
    '',
    ...blocks,
    '',
    '---',
    '',
  ].join('\n');

  taskArguments.prompt = attachment + (taskArguments.prompt ?? '');
}

export default (async ({
  worktree,
  directory,
}): Promise<Record<string, unknown>> => {
  const root = worktree || directory;

  return {
    'tool.definition': async (
      input: { toolID: string },
      output: { parameters: unknown; description?: string },
    ): Promise<void> => {
      if (input.toolID !== 'task') return;

      const parameters = output.parameters as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      parameters.properties = {
        ...parameters.properties,
        files: FILES_PARAMETER,
      };
      parameters.required = Array.isArray(parameters.required)
        ? parameters.required.filter((name) => name !== 'files')
        : parameters.required;

      const js = (
        output as unknown as {
          jsonSchema?: {
            properties?: Record<string, unknown>;
            required?: string[];
          };
        }
      ).jsonSchema;
      if (js !== undefined && js !== null && typeof js === 'object') {
        (output as unknown as { jsonSchema: unknown }).jsonSchema = {
          ...js,
          properties: { ...js.properties, files: FILES_PARAMETER },
          required: Array.isArray(js.required)
            ? js.required.filter((name) => name !== 'files')
            : js.required,
        };
      }

      output.description =
        (output.description ?? '') +
        "\n\nSupports an optional `files` array of paths (relative to the project worktree). Each named file is read and concatenated into this task's context as compulsory reading, so the subagent does not need to issue read calls for them. Paths are sorted alphabetically before injection to keep the injected content deterministic for prompt caching.";
    },
    'tool.execute.before': async (
      input: { tool: string },
      output: { args: Record<string, unknown> },
    ): Promise<void> => {
      if (input.tool !== 'task') return;
      const files = (output.args as { files?: unknown }).files;
      if (!Array.isArray(files) || files.length === 0) return;

      // Normalise every entry, deduplicate by (path, offset, limit), sort deterministically.
      const seen = new Set<string>();
      const ordered: NormalisedEntry[] = [];
      for (const item of files) {
        const entry = normaliseEntry(item);
        const key = `${entry.path}\0${entry.offset}\0${entry.limit ?? ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          ordered.push(entry);
        }
      }
      ordered.sort((a, b) => {
        const pc = a.path.localeCompare(b.path);
        return pc === 0 ? a.offset - b.offset : pc;
      });

      const blocks: string[] = [];
      for (const entry of ordered) {
        const block = await processEntry(root, entry);
        if (block !== null) {
          blocks.push(block);
        }
      }

      delete (output.args as { files?: unknown }).files;

      if (blocks.length === 0) return;

      const taskArguments = output.args as { prompt?: string };
      buildAttachment(blocks, taskArguments);
    },
  };
}) satisfies Plugin;
