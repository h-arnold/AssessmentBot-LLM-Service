import { createWriteStream, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  Codex,
  type StreamedEvent,
  type StreamedItem,
} from '@openai/codex-sdk';

const require = createRequire(import.meta.url);
// eslint-disable-next-line import-x/no-commonjs
const { getCurrentDirname } = require('../src/common/file-utils') as {
  getCurrentDirname: () => string;
};
type DelegateOptions = {
  role: string;
  task: string;
  instructions: string;
  model?: string;
  reasoning?: string;
  workingDir?: string;
  sandbox?: 'read-only' | 'workspace-write' | 'danger-full-access';
  approval?: 'never' | 'on-request' | 'on-failure' | 'untrusted';
  network?: boolean;
  webSearch?: 'disabled' | 'cached' | 'live';
  verbose?: boolean;
  structured?: boolean;
  schemaFile?: string;
  logFile?: string;
  maxItems?: number;
  timeoutMinutes?: number;
};

const DEFAULT_OPTIONS: DelegateOptions = {
  role: 'implementation',
  task: '',
  instructions: '',
  sandbox: 'danger-full-access',
  approval: 'never',
  network: true,
  webSearch: 'live',
  verbose: false,
  timeoutMinutes: 10,
};

const CURRENT_DIR = getCurrentDirname();

const ARG_ALIASES: Record<string, keyof DelegateOptions> = {
  '--role': 'role',
  '--task': 'task',
  '--instructions': 'instructions',
  '--model': 'model',
  '--reasoning': 'reasoning',
  '--working-dir': 'workingDir',
  '--sandbox': 'sandbox',
  '--approval': 'approval',
  '--network': 'network',
  '--web-search': 'webSearch',
  '--verbose': 'verbose',
  '--structured': 'structured',
  '--schema-file': 'schemaFile',
  '--log-file': 'logFile',
  '--max-items': 'maxItems',
  '--timeout-minutes': 'timeoutMinutes',
};

const BOOLEAN_KEYS = ['network', 'verbose', 'structured'] as const;
type BooleanOptionKey = (typeof BOOLEAN_KEYS)[number];
// cSpell:ignore xhigh
const REASONING_LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const;
type ReasoningLevel = (typeof REASONING_LEVELS)[number];
const SANDBOX_MODES = [
  'read-only',
  'workspace-write',
  'danger-full-access',
] as const;
const APPROVAL_POLICIES = [
  'never',
  'on-request',
  'on-failure',
  'untrusted',
] as const;
const WEB_SEARCH_MODES = ['disabled', 'cached', 'live'] as const;

function parseBoolean(value: string): boolean | undefined {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

function isOption(value: string | undefined): boolean {
  return Boolean(value && value.startsWith('--') && value in ARG_ALIASES);
}

function isBooleanOption(key: keyof DelegateOptions): key is BooleanOptionKey {
  return BOOLEAN_KEYS.includes(key as BooleanOptionKey);
}

function printHelp(): void {
  console.info(
    [
      'Usage: node scripts/codex-delegate.js [options]',
      '',
      'Options:',
      '  --role <role>             Role to use (default: implementation)',
      '  --task <task>             Short task description (required)',
      '  --instructions <text>     Additional instructions',
      '  --model <model>           Codex model to use',
      '  --reasoning <level>       Reasoning effort (minimal|low|medium|high|xhigh)',
      '  --working-dir <path>      Working directory for the agent',
      '  --sandbox <mode>          Sandbox mode (read-only|workspace-write|danger-full-access)',
      '  --approval <policy>       Approval policy (never|on-request|on-failure|untrusted)',
      '  --network <true|false>    Enable network access (default: true)',
      '  --web-search <mode>       Web search mode (disabled|cached|live)',
      '  --verbose <true|false>    Enable verbose logging',
      '  --structured <true|false> Emit structured JSON output',
      '  --schema-file <path>      Path to JSON schema file for structured output',
      '  --log-file <path>         Path to write a verbose event log',
      '  --max-items <n>           Limit number of items printed in summaries',
      '  --timeout-minutes <n>     Timeout in minutes (default: 10)',
      '  --list-roles              Print available prompt roles and exit',
      '  --help, -h                Show this help message',
    ].join('\n'),
  );
}

function handleImmediateFlag(arg: string): boolean {
  if (arg === '--list-roles') {
    const roles = listPromptRoles();
    if (roles.length === 0) {
      console.info('No roles available.');
    } else {
      console.info(`Available roles:\n${roles.join('\n')}`);
    }
    process.exit(0);
  }

  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }

  return false;
}

function applyBooleanOption(
  options: DelegateOptions,
  key: BooleanOptionKey,
  value: string | undefined,
): number {
  if (value && !isOption(value)) {
    const parsed = parseBoolean(value);
    if (parsed !== undefined) {
      options[key] = parsed;
      return 2;
    }
  }
  options[key] = true;
  return 1;
}

function parseArgs(argv: string[]): DelegateOptions {
  const options: DelegateOptions = { ...DEFAULT_OPTIONS };

  const ASSIGN_HANDLERS = createAssignHandlers(options);

  function createAssignHandlers(
    opts: DelegateOptions,
  ): Record<string, (v: string) => void> {
    return {
      role: (v: string): void => {
        opts.role = v;
      },
      task: (v: string): void => {
        opts.task = v;
      },
      instructions: (v: string): void => {
        opts.instructions = v;
      },
      model: (v: string): void => {
        opts.model = v;
      },
      reasoning: (v: string): void => {
        opts.reasoning = v;
      },
      workingDir: (v: string): void => {
        opts.workingDir = v;
      },
      sandbox: (v: string): void => {
        opts.sandbox = v as DelegateOptions['sandbox'];
      },
      approval: (v: string): void => {
        opts.approval = v as DelegateOptions['approval'];
      },
      webSearch: (v: string): void => {
        opts.webSearch = v as DelegateOptions['webSearch'];
      },
      schemaFile: (v: string): void => {
        opts.schemaFile = v;
      },
      logFile: (v: string): void => {
        opts.logFile = v;
      },
      maxItems: (v: string): void => {
        const parsed = Number.parseInt(v, 10);
        if (!Number.isNaN(parsed)) {
          opts.maxItems = parsed;
        }
      },
      timeoutMinutes: (v: string): void => {
        const parsed = Number.parseFloat(v);
        if (!Number.isNaN(parsed) && parsed > 0) {
          opts.timeoutMinutes = parsed;
        }
      },
    };
  }

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i];
    const key = ARG_ALIASES[arg];
    if (!key) {
      i++;
      continue;
    }

    const value = argv[i + 1];
    if (handleImmediateFlag(arg)) {
      i++;
      continue;
    }

    if (isBooleanOption(key)) {
      i += applyBooleanOption(options, key, value);
      continue;
    }

    if (!value || isOption(value)) {
      i++;
      continue;
    }

    const handler = ASSIGN_HANDLERS[key as string];
    if (handler) {
      handler(value);
      i += 2;
      continue;
    }

    i++;
  }

  return options;
}

function resolvePromptTemplate(role: string): string {
  const fileName = `${role}.md`;
  const templatePath = path.join(CURRENT_DIR, 'agent-prompts', fileName);
  try {
    return readFileSync(templatePath, 'utf-8').trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function listPromptRoles(): string[] {
  const promptsPath = path.join(CURRENT_DIR, 'agent-prompts');
  try {
    return readdirSync(promptsPath)
      .filter((entry) => entry.endsWith('.md'))
      .map((entry) => entry.replace(/\.md$/, ''))
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

function buildPrompt(options: DelegateOptions): string {
  const template = resolvePromptTemplate(options.role);
  const sections = [
    template,
    options.instructions ? `Instructions:\n${options.instructions}` : '',
    options.task ? `Task:\n${options.task}` : '',
  ].filter((section) => section.length > 0);

  return sections.join('\n\n');
}

function validateOptions(options: DelegateOptions): void {
  if (
    options.reasoning &&
    !REASONING_LEVELS.includes(options.reasoning as ReasoningLevel)
  ) {
    throw new Error(
      `Invalid --reasoning value "${options.reasoning}". Expected one of: ${[
        ...REASONING_LEVELS,
      ].join(', ')}.`,
    );
  }
  if (options.sandbox && !SANDBOX_MODES.includes(options.sandbox)) {
    throw new Error(
      `Invalid --sandbox value "${options.sandbox}". Expected one of: ${[
        ...SANDBOX_MODES,
      ].join(', ')}.`,
    );
  }
  if (options.approval && !APPROVAL_POLICIES.includes(options.approval)) {
    throw new Error(
      `Invalid --approval value "${options.approval}". Expected one of: ${[
        ...APPROVAL_POLICIES,
      ].join(', ')}.`,
    );
  }
  if (options.webSearch && !WEB_SEARCH_MODES.includes(options.webSearch)) {
    throw new Error(
      `Invalid --web-search value "${options.webSearch}". Expected one of: ${[
        ...WEB_SEARCH_MODES,
      ].join(', ')}.`,
    );
  }
}

function resolveOutputSchema(
  options: DelegateOptions,
  defaultSchema: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const readJsonObject = (schemaPath: string): Record<string, unknown> => {
    const parsed = JSON.parse(readFileSync(schemaPath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new Error(
      `Schema file at ${schemaPath} must contain a JSON object at the root.`,
    );
  };

  if (options.schemaFile) {
    try {
      const schemaPath = path.resolve(options.schemaFile);
      return readJsonObject(schemaPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to read or parse schema file at ${options.schemaFile}: ${message}`,
      );
    }
  }

  if (options.structured) {
    return defaultSchema;
  }

  return undefined;
}

type StreamResults = {
  commands: string[];
  fileChanges: string[];
  toolCalls: string[];
  webQueries: string[];
  finalResponse: string;
  usageSummary: string;
};

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isAgentMessage(
  item: StreamedItem,
): item is StreamedItem & { text: string } {
  return (
    item.type === 'agent_message' && isString((item as { text?: unknown }).text)
  );
}

function isCommandExecution(
  item: StreamedItem,
): item is StreamedItem & { command: string } {
  return (
    item.type === 'command_execution' &&
    isString((item as { command?: unknown }).command)
  );
}

type FileChange = { kind: string; path: string };
function isFileChangeArray(changes: unknown): changes is FileChange[] {
  return (
    Array.isArray(changes) &&
    changes.every(
      (change) =>
        change &&
        typeof change === 'object' &&
        isString((change as { kind?: unknown }).kind) &&
        isString((change as { path?: unknown }).path),
    )
  );
}

function isFileChangeItem(
  item: StreamedItem,
): item is StreamedItem & { changes: FileChange[] } {
  return (
    item.type === 'file_change' &&
    isFileChangeArray((item as { changes?: unknown }).changes)
  );
}

function isMcpToolCall(
  item: StreamedItem,
): item is StreamedItem & { server: string; tool: string } {
  const candidate = item as { server?: unknown; tool?: unknown };
  return (
    item.type === 'mcp_tool_call' &&
    isString(candidate.server) &&
    isString(candidate.tool)
  );
}

function isWebSearch(
  item: StreamedItem,
): item is StreamedItem & { query: string } {
  return (
    item.type === 'web_search' && isString((item as { query?: unknown }).query)
  );
}

function handleItemCompleted(item: StreamedItem, results: StreamResults): void {
  switch (item.type) {
    case 'agent_message':
      if (isAgentMessage(item)) {
        results.finalResponse = item.text;
      }
      break;
    case 'command_execution':
      if (isCommandExecution(item)) {
        results.commands.push(item.command);
      }
      break;
    case 'file_change': {
      if (isFileChangeItem(item)) {
        const files = item.changes.map(
          (change) => `${change.kind}: ${change.path}`,
        );
        results.fileChanges.push(...files);
      }
      break;
    }
    case 'mcp_tool_call':
      if (isMcpToolCall(item)) {
        results.toolCalls.push(`${item.server}:${item.tool}`);
      }
      break;
    case 'web_search':
      if (isWebSearch(item)) {
        results.webQueries.push(item.query);
      }
      break;
    default:
      break;
  }
}

function handleTurnCompleted(
  event: StreamedEvent,
  results: StreamResults,
): void {
  if (event.usage) {
    results.usageSummary = `Usage: input ${event.usage.input_tokens}, output ${event.usage.output_tokens}`;
  }
}

function toStreamResults(): StreamResults {
  return {
    commands: [],
    fileChanges: [],
    toolCalls: [],
    webQueries: [],
    finalResponse: '',
    usageSummary: '',
  };
}

async function processStream(
  events: AsyncIterable<StreamedEvent>,
  options: DelegateOptions,
  logStream: ReturnType<typeof createWriteStream> | undefined,
  timeoutMs: number,
): Promise<StreamResults> {
  const iterator = events[Symbol.asyncIterator]();
  const results = toStreamResults();
  let timeoutId: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `Codex delegation timed out after ${options.timeoutMinutes ?? 10} minutes.`,
        ),
      );
    }, timeoutMs);
  });

  try {
    while (true) {
      const nextPromise = iterator.next();
      const result = await Promise.race([nextPromise, timeoutPromise]);

      if (result.done) {
        break;
      }

      const event = result.value;

      if (logStream) {
        logStream.write(JSON.stringify(event) + '\n');
      }
      if (options.verbose) {
        process.stdout.write(JSON.stringify(event) + '\n');
      }

      switch (event.type) {
        case 'item.completed':
          if (event.item) {
            handleItemCompleted(event.item, results);
          }
          break;
        case 'turn.completed':
          handleTurnCompleted(event, results);
          break;
        case 'turn.failed':
          throw new Error(event.error?.message ?? 'Unknown error');
        case 'error':
          throw new Error(event.message ?? 'Unknown error');
        default:
          break;
      }
    }
  } finally {
    await iterator.return?.(undefined);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  return results;
}

function printSummaries(
  results: StreamResults,
  options: DelegateOptions,
): void {
  if (options.verbose) {
    return;
  }
  const limit = options.maxItems ?? Number.POSITIVE_INFINITY;
  if (results.commands.length > 0) {
    const limited = results.commands.slice(0, limit);
    process.stdout.write(`Commands:\n- ${limited.join('\n- ')}\n\n`);
  }
  if (results.fileChanges.length > 0) {
    const limited = results.fileChanges.slice(0, limit);
    process.stdout.write(`File changes:\n- ${limited.join('\n- ')}\n\n`);
  }
  if (results.toolCalls.length > 0) {
    const limited = results.toolCalls.slice(0, limit);
    process.stdout.write(`Tool calls:\n- ${limited.join('\n- ')}\n\n`);
  }
  if (results.webQueries.length > 0) {
    const limited = results.webQueries.slice(0, limit);
    process.stdout.write(`Web searches:\n- ${limited.join('\n- ')}\n\n`);
  }
}

function printFinalResponse(
  results: StreamResults,
  outputSchema: Record<string, unknown> | undefined,
): void {
  if (!results.finalResponse) {
    return;
  }
  if (outputSchema) {
    try {
      const parsed = JSON.parse(results.finalResponse);
      process.stdout.write(JSON.stringify(parsed, null, 2) + '\n');
      return;
    } catch {
      // fall through to print raw text
    }
  }
  process.stdout.write(results.finalResponse + '\n');
}

function tailLogFile(logPath: string, lineCount: number): string[] {
  try {
    const content = readFileSync(logPath, 'utf-8');
    const trimmed = content.trim();
    if (!trimmed) {
      return [];
    }
    const lines = trimmed.split('\n');
    return lines.slice(-lineCount);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options.task) {
    throw new Error('Missing required --task value.');
  }

  const defaultSchema: Record<string, unknown> = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      status: { type: 'string' },
      risks: { type: 'array', items: { type: 'string' } },
      actions: { type: 'array', items: { type: 'string' } },
      nextSteps: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'status'],
    additionalProperties: true,
  } as const;

  const outputSchema = resolveOutputSchema(options, defaultSchema);
  validateOptions(options);

  const availableRoles = listPromptRoles();
  if (availableRoles.length > 0 && !availableRoles.includes(options.role)) {
    throw new Error(
      `Unknown --role "${options.role}". Available roles: ${availableRoles.join(
        ', ',
      )}.`,
    );
  }

  const codex = new Codex();
  // Ensure the reasoning option is narrowed to the allowed literal union before
  // passing it into the Codex API.
  let reasoningArg: ReasoningLevel | undefined;
  if (
    options.reasoning &&
    REASONING_LEVELS.includes(options.reasoning as ReasoningLevel)
  ) {
    reasoningArg = options.reasoning as ReasoningLevel;
  }

  const thread = codex.startThread({
    model: options.model,
    modelReasoningEffort: reasoningArg,
    workingDirectory: options.workingDir,
    sandboxMode: options.sandbox,
    approvalPolicy: options.approval,
    networkAccessEnabled: options.network,
    webSearchMode: options.webSearch,
  });

  const prompt = buildPrompt(options);
  const streamed = await thread.runStreamed(prompt, { outputSchema });
  const timeoutMs = (options.timeoutMinutes ?? 10) * 60 * 1000;

  const logPath =
    options.logFile ?? path.join(process.cwd(), 'codex-delegate.log');
  const shouldLog = options.verbose || Boolean(options.logFile);
  const logStream = shouldLog
    ? createWriteStream(logPath, { flags: 'a' })
    : undefined;
  const progressIntervalMs = 60_000;
  let progressInterval: NodeJS.Timeout | undefined;
  if (logStream) {
    progressInterval = setInterval(() => {
      const tail = tailLogFile(logPath, 5);
      if (tail.length === 0) {
        return;
      }
      process.stdout.write(
        ['\nSub-agent progress (last 5 log lines):', ...tail].join('\n') + '\n',
      );
    }, progressIntervalMs);
  }

  try {
    const results = await processStream(
      streamed.events,
      options,
      logStream,
      timeoutMs,
    );

    printSummaries(results, options);
    printFinalResponse(results, outputSchema);
    if (results.usageSummary) {
      process.stdout.write(results.usageSummary + '\n');
    }
  } finally {
    logStream?.end();
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  }
}

async function main(): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  }
}

// top-level await is unavailable with CommonJS; call the async entrypoint explicitly
void main();
