---
name: pre-pr-review
description: Pre-PR code review orchestrator. Runs the full check set first and blocks on any regressions, then runs a set of code review focuses in parallel (repo rule compliance, KISS/DRY, de-sloppification, performance/Big-O, logging rules, plus optional layer-scoped focuses), synthesises them into a single PR_REVIEW.md at the repo root, walks through each finding with the user via the ask-user-a-question tool to capture a decision, and records those decisions in detail in the review document.
user-invocable: true
allowed-tools:
  - bash
  - read_file
  - write_file
  - task
---

# Pre-PR Review

Use this skill before opening a pull request. It produces a single synthesised review document at the
repo root named `PR_REVIEW.md`.

The skill does **not** run automated checks itself beyond the gate in Step 1. Every review agent is
explicitly told not to run lint, type-check, or tests — those are expected to already pass and are
verified up front.

## What it does

1. Runs the full check set and blocks if the branch has regressed against the baseline.
2. Captures the diff between the current branch and `main`.
3. Launches the review focuses in parallel.
4. Synthesises the results into `PR_REVIEW.md` at the repo root.

## Quick start

From the repository root, invoke the skill directly (e.g. `pre-pr-review`). No arguments are required;
the branch name and `main` are detected automatically.

## Core principles

- Delegate outcomes, not implementation. Review sub-agents contain their own methodology.
- Sub-agents cannot spawn sub-agents. The skill coordinates all parallel calls.
- Only task-specific files appear in a sub-agent's `Mandatory Reading` list as `@`-prefixed
  worktree-relative paths; agents read their own
  standards (AGENTS.md, module docs) per their own instructions.
- British English in all outputs and the synthesised document.
- Stay within scope: no auto-fix, no commit/push, no CI wiring.

## Step 1 — Check gate

Run the full check set from the repo root (see `AGENTS.md` §9) with a long timeout — test suites can
take minutes:

```bash
npm run lint && npm run lint:british && npm run format && npm run build && npm run test && npm run test:e2e
```

> **Timeout:** Always set a 900000 ms (15 minute) timeout when invoking this via the `bash` tool.

`npm run test:e2e:live` is deliberately excluded: it calls real LLM endpoints and requires provider
credentials.

Record the outcome of every command. If `npm run format` rewrites any file, the gate has failed —
inspect the diff, then re-run.

**If any check fails or regresses:**

- Stop immediately. Do not start the review.
- Report the failing commands to the user and instruct them to fix those first, then re-run this skill.
- This gate is the source of truth for whether the branch is healthy enough to review.

**If clean:** proceed to Step 2.

## Step 2 — Diff and scope

Capture the change set between the current branch and `main`:

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Save the full diff and the `--stat` summary to the scratchpad. Build the changed-file list and
classify which layers are touched:

- Backend: any path under `src/`, including the root application and bootstrap files
  (`src/main.ts`, `src/app.module.ts`, `src/bootstrap.ts`) and the NestJS modules
  (`src/v1/assessor/`, `src/auth/`, `src/common/`, `src/config/`, `src/llm/`,
  `src/prompt/`, `src/status/`), plus E2E tests under `test/`.
- Documentation and agent instructions: any path under `docs/`, `AGENTS.md`, `.opencode/` or
  `.github/agents/`.

This repository has no frontend or Apps Script/builder source tree. Select only focuses whose layer
appears in the diff (Step 3).

## Step 3 — Parallel review agents

Launch every focus as a separate `task` agent in a **single message** (multiple tool calls) so they
run in parallel. The skill owns all coordination; never instruct a sub-agent to spawn other agents.

For every focus, the handoff prompt MUST include:

- The changed files (and changed test files) for that focus as `@`-prefixed worktree-relative
  paths — opencode injects the line-numbered contents into the sub-agent's prompt; do not rely
  on the sub-agent to read them itself.
- The explicit constraint: _"Do NOT run lint, type-check, or tests. All automated checks are expected
  to pass already and are verified by the check gate before this review began."_
  - The instruction to focus primarily on the diff findings, but also to report incidental issues
    discovered while inspecting the changed files (e.g. in surrounding code read for context). Incidental
    findings should be clearly separated from diff findings and labelled as incidental so the orchestrator
    can surface them in `PR_REVIEW.md` for the user to triage. Every claim needs file:line evidence.
- The requested outcome: a structured review (Critical / Improvement / Nitpick) for that focus only.

### Core focuses (always run)

1. **Repo rule compliance** → `code-reviewer`
   - Focus on AGENTS.md rules, module-specific checklists, and the universal/module standards in the
     code-reviewer instructions.
2. **KISS & DRY** → `code-reviewer`
   - Focus on simplicity, SOLID, duplication-versus-wrong-abstraction (WET), and speculative abstraction.
3. **De-Sloppification** → `de-sloppification`
   - Full slop hunt on the changed code per its own workflow.
4. **Performance (Big-O)** → `code-reviewer`
   - Focus on algorithmic complexity of hot paths and routines. Identify loops, nested iteration, and
     data-structure choices that could be faster; express cost in Big-O notation and name the routine.
5. **Logging rules compliance** → `code-reviewer`
   - Focus on the logging and error-handling policy for the touched modules. Use the canonical
     references `docs/modules/llm.md` and `docs/configuration/environment.md`, including the
     privacy-gated `LOG_LLM_CONTENT` content logging. Check no `console.*`, correct log boundaries,
     no double-logging, and rethrow-at-boundary discipline.

### Optional focuses (run only when the layer is in the diff)

Enable each only if its layer appears in the Step 2 classification.

- **Backend data shape / schema consistency** → `code-reviewer` (backend only)
  - Consistency of Zod DTO schemas, `toJSON`/`fromJSON` shapes, and API request/response contracts.
- **Security & secrets** → `code-reviewer` (backend only)
  - Hardcoded credentials/keys, `process.env` secret handling, injection-prone string building, and
    missing Zod input validation.
- **Test-coverage gaps** → `code-reviewer` (backend only)
  - Changed logic with no corresponding test, per `docs/testing/README.md`,
    `docs/testing/PRACTICAL_GUIDE.md` and `docs/testing/E2E_GUIDE.md`. Flag untested paths; do not
    write tests.
- **British-English consistency** → `code-reviewer`
  - American-English spellings in user-facing strings, identifiers, and comments — use the British forms (`colour`, `centre`, `normalise`, etc.).
- **Error-handling robustness** → `code-reviewer` (backend only)
  - Broad `catch`/swallow, missing rethrow at boundaries, and missing Zod validation on public
    controller/DTO boundaries.

## Step 4 — Synthesise into PR_REVIEW.md

Write the synthesised document to `PR_REVIEW.md` at the repository root. Structure:

```markdown
# Pre-PR Review — <branch-name>

- **Base branch:** main
- **Generated:** <ISO timestamp>
- **Check gate:** PASS (no regressions) | BLOCKED (see failures above)
- **Changed files:** <count> (<diff --stat summary pasted here>)

## Verdict

**Pass / Needs Improvement / Fail** — one sentence rationale. Fail if any focus reported a Critical.

## Focus areas

### Repo rule compliance

<verbatim Critical/Improvement/Nitpick items from the agent, with file:line evidence>

### KISS & DRY

...

### De-Sloppification

...

### Performance (Big-O)

...

### Logging rules compliance

...

### Backend data shape / schema consistency (optional)

...

### Security & secrets (optional)

...

### Test-coverage gaps (optional)

...

### British-English consistency (optional)

...

### Error-handling robustness (optional)

...
```

Paste each agent's items verbatim (with their file:line evidence). Keep the agent's separation between
diff findings and incidental findings intact — render incidental items in their own subsection
(e.g. `#### Incidental (triage)`) so the user can distinguish blocking PR issues from separate
cleanup opportunities. Omit a section only if that focus did not run (optional focus not in scope);
label omitted optional sections with `_(not in scope for this diff)_`.

## Step 5 — Decision pass with the user

Before finalising, walk through **every** finding in the synthesised `PR_REVIEW.md` with the user, one
item at a time, using the **ask user a question** tool. For each finding, capture the user's decision on
whether and how to address it. Where appropriate, ask for the chosen approach (e.g. fix now, fix later,
wontfix, or a specific remediation strategy) so the outcome is unambiguous.

Guidance:

- Work through findings in order of severity (Critical → Improvement → Nitpick), including incidental items.
- For each item, present the finding, its `file:line` evidence, and the available options, then let the
  user decide.
- Record each decision in full detail — do not reduce it to a single word. Capture the chosen option and
  any specifics the user provides about _how_ the issue should be addressed (e.g. the intended fix, the
  trade-offs considered, or why a finding is being rejected).

## Step 6 — Record decisions in PR_REVIEW.md

Append a **Decisions** section to `PR_REVIEW.md` that documents, in detail, every decision captured in
Step 5. Each decision MUST be written so that another engineer can pick up the document later and act on
it without further context from the conversation. For each finding include:

- The finding reference (focus area + severity + `file:line`).
- The decision (e.g. Fix now / Fix later / Wontfix).
- The detailed rationale and, where applicable, the agreed approach for addressing it.

Structure:

```markdown
## Decisions

### Repo rule compliance

- **[Critical] `src/v1/assessor/foo.service.ts:42`** — Decision: Fix later. Approach: extract the
  duplicated validation into a shared Zod schema and add a unit test; deferred because it is not on the
  hot path. Rationale: user wants the PR to ship first, follow-up ticket to be raised.
- **[Nitpick] `src/prompt/bar.ts:88`** — Decision: Wontfix. Rationale: intentional deviation agreed
  with the module owner; documented so a future reviewer does not re-raise it.

...
```

## Step 7 — Return to the user

Print a brief summary:

- The overall verdict (Pass / Needs Improvement / Fail).
- Check gate result.
- The list of focuses run.
- The path to `PR_REVIEW.md` (now including the recorded decisions).

Do not mark the review complete while any Critical item remains unaddressed; instead report the
Critical items so the user can address them and re-run the skill.

## Notes

- Keep the Step 1 check gate as the single source of truth for branch health. Never bypass the gate.
- Parallelise all review agents in one message to keep the review fast.
- The skill synthesises; it does not re-litigate individual findings. Trust agent evidence.
