---
name: agent-setup
description: Create, configure, and manage OpenCode agents and subagents via JSON config or markdown files
license: MIT
compatibility: opencode
metadata:
  audience: developers
  workflow: configuration
---

# Agent Setup and Configuration Skill

## MANDATORY: Consult Official Docs First

Before using this skill, refer to the canonical source:

- **[OpenCode Agents Docs](https://opencode.ai/docs/agents/)** — Agent types, configuration, options, and examples

## Agent Types

OpenCode has two agent types:

| Type       | Description                                                       | Selection                                      |
| ---------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| `primary`  | Main assistant you interact with directly                         | **Tab** key or `switch_agent` keybind          |
| `subagent` | Specialised assistant invoked by primary agents or via `@mention` | `@name` in messages or automatic via Task tool |

### Built-in Agents

**Primary:** `build` (default, all tools), `plan` (restricted, planning only)
**Subagent:** `general` (full tool access), `explore` (read-only codebase search), `scout` (read-only external docs/deps research)
**Hidden system:** `compaction`, `title`, `summary` (run automatically, not user-selectable)

## Configuration Locations

Agents can be defined in two ways:

### 1. JSON via `opencode.json`

Project-level `opencode.json` or global `~/.config/opencode/opencode.json`:

```json
{
  "agent": {
    "code-reviewer": {
      "description": "Reviews code for best practices and potential issues",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "You are a code reviewer. Focus on security, performance, and maintainability.",
      "permission": {
        "edit": "deny"
      }
    }
  }
}
```

### 2. Markdown Files

Place in global `~/.config/opencode/agents/` or project `.opencode/agents/`. The filename (without `.md`) becomes the agent name.

```markdown
---
description: Reviews code for quality and best practices
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
permission:
  edit: deny
  bash: deny
---

You are in code review mode. Focus on:

- Code quality and best practices
- Potential bugs and edge cases
- Performance implications
- Security considerations

Provide constructive feedback without making direct changes.
```

## Agent Options Reference

| Option        | Type                        | Description                                            |
| ------------- | --------------------------- | ------------------------------------------------------ | ------- | ------------------- |
| `description` | string                      | **Required.** Brief description of the agent's purpose |
| `mode`        | `"primary"`                 | `"subagent"`                                           | `"all"` | Defaults to `"all"` |
| `model`       | string                      | Override the model (format: `provider/model-id`)       |
| `temperature` | number                      | 0.0-1.0 (lower = more focused, higher = more creative) |
| `steps`       | number                      | Max agentic iterations before forced text response     |
| `prompt`      | string or `"{file:./path}"` | System prompt or path to prompt file                   |
| `permission`  | object                      | Per-tool permissions: `"allow"`                        | `"ask"` | `"deny"`            |
| `color`       | string                      | Hex colour or theme token for UI                       |
| `top_p`       | number                      | Alternative to temperature for randomness control      |
| `disable`     | boolean                     | Set `true` to disable the agent                        |
| `hidden`      | boolean                     | Hide subagent from `@` autocomplete (subagent only)    |

### Permission Keys

| Key                  | Tools Gated                                   |
| -------------------- | --------------------------------------------- |
| `read`               | `read`                                        |
| `edit`               | `write`, `edit`, `apply_patch`                |
| `glob`               | `glob`                                        |
| `grep`               | `grep`                                        |
| `list`               | `list`                                        |
| `bash`               | `bash`                                        |
| `task`               | `task`                                        |
| `external_directory` | Any tool reading/writing outside the worktree |
| `todowrite`          | `todowrite`, `todoread`                       |
| `webfetch`           | `webfetch`                                    |
| `websearch`          | `websearch`                                   |
| `lsp`                | `lsp`                                         |
| `skill`              | `skill`                                       |
| `question`           | `question`                                    |

Permissions support glob patterns for fine-grained control:

```json
{
  "permission": {
    "bash": {
      "*": "ask",
      "git status *": "allow"
    }
  }
}
```

The last matching rule wins, so put broad `*` rules first and specific rules after.

### Task Permissions

Control which subagents an agent can invoke:

```json
{
  "permission": {
    "task": {
      "*": "deny",
      "code-reviewer": "allow"
    }
  }
}
```

## Creating Agents via CLI

Use the interactive command:

```
opencode agent create
```

This will:

1. Prompt for save location (global or project-specific)
2. Ask for a description of the agent's purpose
3. Generate an appropriate system prompt and identifier
4. Let you select which permissions to allow
5. Create a markdown agent file

## Using Subagents

- **Automatic**: Primary agents invoke subagents via the Task tool when needed
- **Manual**: Type `@agent-name` in your message
- **Session navigation**: Use `session_child_first` (default: `<Leader>+Down`) to enter child sessions, `session_child_cycle` (Right) / `session_child_cycle_reverse` (Left) to switch, `session_parent` (Up) to return

## Example: Read-Only Code Reviewer Agent

Place as `.opencode/agents/review.md`:

```markdown
---
description: Reviews code for quality and best practices without making changes
mode: subagent
permission:
  edit: deny
  bash:
    '*': ask
    'git diff': allow
    'git log*': allow
    'grep *': allow
  webfetch: deny
---

Only analyse code and suggest changes. Do not modify any files.
```

## Example: Documentation Agent

```markdown
---
description: Writes and maintains project documentation
mode: subagent
permission:
  bash: deny
---

You are a technical writer. Create clear, comprehensive documentation.
Focus on:

- Clear explanations
- Proper structure
- Code examples
- User-friendly language
```

## Validation

- Agent markdown files must have valid YAML frontmatter with at minimum `description` and `mode`
- Agent names in markdown files derive from the filename stem (e.g. `review.md` → `review`)
- Restart OpenCode after adding/removing agent files to refresh the agent registry
