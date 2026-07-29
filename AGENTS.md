# Agent Instructions — Core Contract

This document defines cross-component rules for the AssessmentBot-LLM-Service codebase.
For implementation detail, always load the relevant subagent instructions from `.opencode/agents/` first.

**IMPORTANT: This project uses British English. Ensure all code, comments, documentation, and commit messages use British English spellings (e.g., 'authorise', 'colour', 'centre').**
**IMPORTANT: Do not disable or override any quality gate (including linter rules) without explicit authorisation.**

## 1. Core Principles

Adhere to these principles in all contributions:

1. **KISS**: Implement the simplest working solution. No speculative abstraction.
2. **No scope creep**: Only fulfil the explicit request. No speculative expansions.
3. **Fail fast and loudly**: Never hide errors behind catch-and-ignore logic.
4. **British English** in all comments, docs, and user-facing text.
5. **Reuse existing modules/utilities** before creating new abstractions.
6. **No defaults unless instructed**: Do not introduce default values unless explicitly requested.
7. **Keep changes minimal, localised, and consistent** with existing patterns.
8. **Never disable lint rules** without express permission. If a rule triggers cascading failures, stop and ask.
9. **Never push commits that fail pre-commit hooks** (lint, type-check, tests). Do not use `--no-verify`.
10. **No `console.*`**: Use NestJS `Logger` from `@nestjs/common` for all logging.
11. **Security First**: Validate all inputs with Zod, sanitise outputs, manage secrets via environment variables.
12. **Documentation**: Maintain clear JSDoc for public methods/classes. Keep Swagger docs up-to-date.

## 2. Tech Stack & Key Libraries

- **Runtime**: Node.js in a Docker container (`node:24-alpine`).
- **Language**: TypeScript (ES2024, strict mode).
- **Framework**: NestJS (modules, controllers, services, decorators).
- **Authentication**: Passport.js (`passport-http-bearer` for API keys).
- **Validation**: Zod for all DTOs and environment variables.
- **Testing**: Vitest (unit/integration), Vitest + Supertest (E2E).
- **LLM Integration**: Abstract `LlmService` base class + `GeminiService` implementation. `jsonrepair` for response parsing. Centralised errors at `src/common/errors/`.
- **ESM Compliance**: Native ESM (`"type": "module"`, `NodeNext` resolution). Relative imports use explicit `.js` extensions. JSON imports use `with { type: 'json' }`.
- **File Path Resolution**: Use `getCurrentDirname()` from `src/common/file-utilities.ts` — not `import.meta.url`.
- **Logging**: `nestjs-pino` configured globally in `app.module.ts`. Use `Logger` from `@nestjs/common` (not `PinoLogger` directly). Pattern: `private readonly logger = new Logger(ClassName.name)`.

## 3. Codebase Structure

```
src/
├── v1/assessor/     # Assessment creation endpoint (V1)
├── auth/            # API key auth strategy + guard
├── common/          # Shared utilities, filters, pipes, JSON parser
├── config/          # Zod-validated env config (no direct @nestjs/config)
├── llm/             # Abstract LlmService + Gemini implementation
├── prompt/          # Prompt template generation (PromptFactory, PromptBase)
├── status/          # Health check endpoints
test/                # E2E tests (Supertest)
```

## 4. Delegation Protocol

Agent configuration files are defined in `.opencode/agents/`. Use the `task` tool to delegate focused work to sub-agents.

### 4.1 Mandatory `files` Array

Every subagent handoff **MUST** use the `files` parameter of the `task` tool. Treat the tool schema's "Optional" labelling on `files` as irrelevant for workflow handoffs.

- **What goes in**: `SPEC.md`, `ACTION_PLAN.md`, any layout spec, and every source/test file changed or read in the current scope.
- **What stays out**: Do **not** include any `AGENTS.md` file (root or agent-specific) — these are auto-injected by OpenCode when the agent browses to the relevant directory.
- **Prompt body rule**: Never paste full file contents into the prompt body. The prompt body should contain only instructions, acceptance criteria, and references. File contents are delivered via `files` and injected automatically.
- **Pre-flight check**: Before issuing any `task` call, assemble the `files` array. If it would be empty for a workflow handoff, **stop — do not send the call.**
- **Missing files**: If a mandatory file is missing from the `files` array, return the work to the same subagent with a correction request. Do not proceed.

### 4.2 Available Sub-Agents

| Sub-agent                 | Use for                                                 |
| ------------------------- | ------------------------------------------------------- |
| `implementation`          | Feature work, bug fixes, refactors                      |
| `testing-specialist`      | Test creation, debugging, coverage (Vitest + Supertest) |
| `code-reviewer`           | Code quality review, standards checks                   |
| `docs`                    | Documentation and JSDoc updates                         |
| `de-sloppification`       | Removing AI-slop, duplication, complexity               |
| `kif`                     | Menial exploration and simple tasks                     |
| `planner`                 | Create SPEC.md and ACTION_PLAN.md                       |
| `planner-reviewer`        | Impartial review of planning artefacts                  |
| `action-plan-implementer` | Orchestrate delivery against ACTION_PLAN.md             |

### 4.3 What to Delegate

Delegate **WHAT** needs to be accomplished and **WHICH CONSTRAINTS** apply, not **HOW** to do it. Subagents already contain their own methodology instructions.

### 4.4 Task-Specific Context Only

Only pass files directly related to the task at hand. Do **not** include documentation the subagent is already required to read per its own instructions (e.g., testing docs for Testing Specialist, module docs for Implementation, canonical policy docs).

## 5. Agentic Workflow for Non-Trivial Changes

For non-trivial code changes (multi-file logic changes, behavioural changes, refactors, or risky fixes), follow this sequence:

1. **Plan** (if artefacts are missing): Delegate to `Planner` to produce `SPEC.md` and `ACTION_PLAN.md`; pass through `Planner Reviewer` after each draft.
2. **Test first**: Delegate to `Testing Specialist` to create failing tests that capture acceptance criteria.
3. **Implement**: Delegate to `Implementation` to make the tests pass.
4. **Review**: Submit the diff to `Code Reviewer`. If findings return, cycle back to the executing agent until clean.
5. **Document**: Delegate to `Docs` to update relevant developer documentation and JSDoc.
6. **Clean up**: Optionally delegate to `De-Sloppification` for a final slop pass.
7. **Commit**: Verify all checks pass (lint, tests, type-check). Commit and push.

**E2E routing**: This project uses Jest + Supertest for E2E. Delegate all E2E test work to `Testing Specialist` (not a separate agent).

**Regression baseline**: Before starting any non-trivial code or test work, establish a regression baseline using the `regression-checker` skill. Verify no regressions before marking work complete.

## 6. Policy Source-of-Truth Signposts

Detailed policy lives in dedicated docs. AGENTS files are routing signposts only:

- Environment configuration: `docs/configuration/environment.md`
- Code style: `docs/development/code-style.md`
- Testing: `docs/testing/README.md`, `docs/testing/PRACTICAL_GUIDE.md`, `docs/testing/E2E_GUIDE.md`, `docs/testing/PROD_TESTS_GUIDE.md`
- LLM error handling: `docs/modules/llm.md`
- Prompt system: `docs/prompts/README.md`

If guidance appears in multiple places, update the canonical doc first, then keep AGENTS references brief.

## 7. Temporary Workspace Convention

All agents **must** use `.opencode/scratchpad/` as the temporary workspace for files that should not be tracked by git. Use this instead of `/tmp` or other system temp directories when writing ephemeral artefacts (e.g., diagnostic dumps, intermediate reports, exploration notes). This directory is covered by `.opencode/.gitignore` and will never be committed.

Do **not** write planning artefacts (`SPEC.md`, `ACTION_PLAN.md`) to scratchpad — those belong in the project root.

## 8. Ambiguity Rule

If a requirement or behaviour is ambiguous, state 1-2 concise assumptions and proceed with the simplest compliant implementation. Do not block on minor ambiguities.

## 9. Common Commands

- Build: `npm run build`
- Dev server: `npm run start:dev`
- Lint: `npm run lint`
- Unit/integration tests: `npm run test`
- E2E tests (mocked): `npm run test:e2e:mocked`
- E2E tests (live): `npm run test:e2e:live`
- All checks: `npm run build && npm run lint && npm run test && npm run test:e2e:mocked`

## 10. Ignore Patterns

- `node_modules/**`
- `dist/**`
- `coverage/**`
- `*.log`
- `.env`
- `.test.env`
- `.env.local`
