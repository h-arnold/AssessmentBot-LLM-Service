import type { Hooks, Plugin } from '@opencode-ai/plugin';

const FRESH_CONTEXT_NOTE = [
  'Subagent sessions are never resumed in this project: every invocation starts with a fresh context,',
  'so the `task_id` parameter is unavailable and any previous context must be restated in the prompt.',
].join(' ');

const STRIPPED_NOTICE = [
  '<notice>The task_id you supplied was ignored and a brand new subagent session was created,',
  'so this result comes from a fresh context rather than a continuation of the earlier session.',
  'Restate any needed context in the next prompt instead of relying on resumption.</notice>',
].join(' ');

type JsonSchemaLike = {
  properties?: Record<string, unknown>;
};

type ToolDefinitionOutput = {
  description: string;
  parameters: unknown;
  jsonSchema?: JsonSchemaLike;
};

/**
 * Strip the `task_id` argument from Task tool invocations so that every
 * subagent runs in a fresh session, and tell the orchestrator when this
 * happened.
 *
 * OpenCode exposes no configuration option to disable Task tool session
 * resumption, so the behaviour is enforced here for every agent in the
 * project. The model-facing JSON Schema is `output.jsonSchema`; `parameters`
 * is an opaque Effect schema. When `experimentalBackgroundSubagents` is
 * enabled, the Task tool provides no `jsonSchema`, so only argument stripping
 * applies.
 * @returns The opencode plugin hooks enforcing fresh subagent contexts.
 */
export default (async (): Promise<Hooks> => {
  const strippedCalls = new Set<string>();

  return {
    'tool.definition': async (input, output): Promise<void> => {
      if (input.toolID !== 'task') return;
      const definition = output as unknown as ToolDefinitionOutput;
      const properties = definition.jsonSchema?.properties;
      if (properties) delete properties.task_id;
      output.description = `${output.description}\n\n${FRESH_CONTEXT_NOTE}`;
    },
    'tool.execute.before': async (input, output): Promise<void> => {
      if (input.tool !== 'task' || !output.args.task_id) return;
      strippedCalls.add(input.callID);
      delete output.args.task_id;
    },
    'tool.execute.after': async (input, output): Promise<void> => {
      if (input.tool !== 'task' || !strippedCalls.delete(input.callID)) return;
      output.output = `${output.output}\n\n${STRIPPED_NOTICE}`;
    },
  };
}) satisfies Plugin;
