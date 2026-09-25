import { describe, expect, it } from 'vitest';

import * as pluginModule from '../.opencode/plugins/no-task-resume.js';

type Hooks = {
  'tool.definition': (
    input: { toolID: string },
    output: { description: string; parameters: unknown; jsonSchema?: unknown },
  ) => Promise<void>;
  'tool.execute.before': (
    input: { tool: string; sessionID: string; callID: string },
    output: { args: Record<string, unknown> },
  ) => Promise<void>;
  'tool.execute.after': (
    input: {
      tool: string;
      sessionID: string;
      callID: string;
      args: Record<string, unknown>;
    },
    output: { output: string; title: string; metadata: unknown },
  ) => Promise<void>;
};

const plugin = pluginModule.default as unknown as (
  input: unknown,
) => Promise<Hooks>;

const freshContextNote =
  'Subagent sessions are never resumed in this project: every invocation starts with a fresh context, so the `task_id` parameter is unavailable and any previous context must be restated in the prompt.';

const strippedNotice =
  '<notice>The task_id you supplied was ignored and a brand new subagent session was created, so this result comes from a fresh context rather than a continuation of the earlier session. Restate any needed context in the next prompt instead of relying on resumption.</notice>';

describe('no-task-resume plugin', () => {
  it('removes task_id from the model-facing JSON Schema', async () => {
    const hooks = await plugin({});
    const parameters = { opaque: true };
    const jsonSchema = {
      properties: { task_id: {}, prompt: { type: 'string' } },
    };
    const output = { description: 'Task tool', parameters, jsonSchema };

    await hooks['tool.definition']?.({ toolID: 'task' }, output);

    expect(jsonSchema.properties).toEqual({ prompt: { type: 'string' } });
    expect(output.parameters).toBe(parameters);
    expect(output.description).toBe(`Task tool\n\n${freshContextNote}`);
  });

  it('does not modify definitions for other tools', async () => {
    const hooks = await plugin({});
    const jsonSchema = {
      properties: { task_id: {}, prompt: { type: 'string' } },
    };
    const output = { description: 'Other tool', parameters: {}, jsonSchema };

    await hooks['tool.definition']?.({ toolID: 'other' }, output);

    expect(output).toEqual({
      description: 'Other tool',
      parameters: {},
      jsonSchema,
    });
  });

  it('strips task_id before execution and reports it after execution', async () => {
    const hooks = await plugin({});
    const arguments_ = { task_id: 'old-call', prompt: 'Continue' };
    const beforeOutput = { args: arguments_ };
    const afterOutput = { output: 'Result', title: 'Task', metadata: {} };

    await hooks['tool.execute.before']?.(
      { tool: 'task', sessionID: 'session', callID: 'call' },
      beforeOutput,
    );
    await hooks['tool.execute.after']?.(
      { tool: 'task', sessionID: 'session', callID: 'call', args: arguments_ },
      afterOutput,
    );

    expect(arguments_).toEqual({ prompt: 'Continue' });
    expect(afterOutput.output).toBe(`Result\n\n${strippedNotice}`);

    const otherArguments = { task_id: 'other-call' };
    const otherOutput = { args: otherArguments };
    const otherAfterOutput = {
      output: 'Other result',
      title: 'Other',
      metadata: {},
    };
    await hooks['tool.execute.before']?.(
      { tool: 'other', sessionID: 'session', callID: 'other' },
      otherOutput,
    );
    await hooks['tool.execute.after']?.(
      {
        tool: 'other',
        sessionID: 'session',
        callID: 'other',
        args: otherArguments,
      },
      otherAfterOutput,
    );

    expect(otherArguments).toEqual({ task_id: 'other-call' });
    expect(otherAfterOutput.output).toBe('Other result');
  });
});
