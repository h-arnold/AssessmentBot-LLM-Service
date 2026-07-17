---
name: pre-pr-review
description: Pre-PR code review orchestrator. Runs the regression checker first and blocks on any regressions, then runs a set of code review focuses in parallel (repo rule compliance, KISS/DRY, de-sloppification, performance/Big-O, logging rules, plus optional layer-scoped focuses), synthesises them into a single PR_REVIEW.md at the repo root, walks through each finding with the user via the ask-user-a-question tool to capture a decision, and records those decisions in detail in the review document.
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

The skill does **not** run automated checks itself beyond the regression gate. Every review agent is
explicitly told not to run lint, type-check, or tests — those are expected to already pass and are
verified by the regression checker up front.

## What it does

1. Runs the regression checker and blocks if the branch has regressed against the baseline.
2. Captures the diff between the current branch and `main`.
3. Launches the review focuses in parallel.
4. Synthesises the results into `PR_REVIEW.md` at the repo root.

## Quick start

From the repository root, invoke the skill directly (e.g. `pre-pr-review`). No arguments are required;
the branch name and `main` are detected automatically.

## Core principles

- Delegate outcomes, not implementation. Review sub-agents contain their own methodology.
- Sub-agents cannot spawn sub-agents. The skill coordinates all parallel calls.
- Only task-specific files appear in a sub-agent's `Mandatory Reading`; agents read their own
  standards (AGENTS.md, module docs) per their own instructions.
- British English in all outputs and the synthesised document.
- Stay within scope: no auto-fix, no commit/push, no CI wiring.

## Step 1 — Regression gate

Run the regression checker from the repo root with a long timeout (test suites can take minutes):

```bash
npm run regression-checker
```

> **Timeout:** Always set a 600000 ms (10 minute) timeout when invoking this via the `bash` tool.

Read the resulting `comparison.txt` (or `baseline.txt` on the first run) from the report directory
(default `.ts-regression-checker/reports/<branch-name>/`). Inspect:

- `overallStatus`
- `regressionsCount` / `newFailuresCount`

**If regressions are present:**

- Stop immediately. Do not start the review.
- Report the regressions (failed checks, new failures) to the user and instruct them to fix those
  first, then re-run this skill.
- The regression checker is the source of truth for whether the branch is healthy enough to review.

**If clean:** proceed to Step 2.

See `regression-checker/SKILL.md` for full report-artefact details and validation notes.

## Step 2 — Diff and scope

Capture the change set between the current branch and `main`:

```bash
git diff main...HEAD --stat
git diff main...HEAD
```

Save the full diff and the `--stat` summary to the scratchpad. Build the changed-file list and
classify which layers are touched:

- Frontend: any path under `src/frontend/`
- Backend: any path under `src/backend/`
- Builder: any path under `scripts/builder/`

This classification drives which optional focuses run (Step 3).

## Step 3 — Parallel review agents

Launch every focus as a separate `task` agent in a **single message** (multiple tool calls) so they
run in parallel. The skill owns all coordination; never instruct a sub-agent to spawn other agents.

For every focus, the handoff prompt MUST include:

- The `Mandatory Reading` section with the actual changed files (and changed test files) for that focus.
- The explicit constraint: _"Do NOT run lint, type-check, or tests. All automated checks are expected
  to pass already and are verified by the regression gate before this review began."_
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
   - Focus on the logging and error-handling policy for the touched modules (backend
     `docs/developer/backend/backend-logging-and-error-handling.md`, frontend
     `docs/developer/frontend/frontend-logging-and-error-handling.md`). Check no `console.*`, correct
     log boundaries, no double-logging, and rethrow-at-boundary discipline.

### Optional focuses (run only when the layer is in the diff)

Enable each only if its layer appears in the Step 2 classification.

- **Frontend layout / design principles / accessibility** → `code-reviewer` (frontend only)
  - References: `docs/developer/frontend/frontend-spacing-and-padding-standards.md`,
    `docs/developer/frontend/frontend-loading-and-width-standards.md`,
    `docs/developer/frontend/frontend-shell-navigation-and-motion.md`,
    `docs/developer/frontend/frontend-modal-patterns.md`.
  - Check 8px grid spacing, width-token ownership, loading/busy accessibility semantics
    (`role="status"`, `aria-busy`, `aria-live`), keyboard activation, and motion conventions.
- **Frontend data shape / schema consistency** → `code-reviewer` (frontend only)
  - Consistency of view-model/prop shapes and API boundary contracts in the changed frontend code.
- **Backend data shape / schema consistency** → `code-reviewer` (backend only)
  - Consistency of entities, `toJSON`/`fromJSON` shapes, and `appsscript.json` scope/service changes.
- **Security & secrets** → `code-reviewer`
  - Hardcoded credentials/keys, `PropertiesService`/`ScriptApp` misuse, unsafe HtmlService output,
    and injection-prone string building.
- **Test-coverage gaps** → `code-reviewer`
  - Changed logic with no corresponding test, per `docs/developer/backend/backend-testing.md` and
    `docs/developer/frontend/frontend-testing.md`. Flag untested paths; do not write tests.
- **British-English consistency** → `code-reviewer`
  - American-English leaks in user-facing strings, identifiers, and comments (`color`→`colour`,
    `center`→`centre`, `normalize`→`normalise`, etc.).
- **Error-handling robustness** → `code-reviewer`
  - Broad `catch`/swallow, missing rethrow at boundaries, and missing `Validate.requireParams` on
    public backend methods.

## Step 4 — Synthesise into PR_REVIEW.md

Write the synthesised document to `PR_REVIEW.md` at the repository root. Structure:

```markdown
# Pre-PR Review — <branch-name>

- **Base branch:** main
- **Generated:** <ISO timestamp>
- **Regression gate:** PASS (no regressions) | BLOCKED (see regressions above)
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

### Frontend layout / design / accessibility (optional)

...

### Frontend data shape / schema consistency (optional)

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

- **[Critical] `src/backend/foo.js:42`** — Decision: Fix later. Approach: extract the duplicated
  validation into `Validate.requireParams` and add a unit test; deferred because it is not on the hot
  path. Rationale: user wants the PR to ship first, follow-up ticket to be raised.
- **[Nitpick] `src/frontend/Bar.tsx:88`** — Decision: Wontfix. Rationale: intentional deviation agreed
  with design; documented so a future reviewer does not re-raise it.

...
```

## Step 7 — Return to the user

Print a brief summary:

- The overall verdict (Pass / Needs Improvement / Fail).
- Regression gate result.
- The list of focuses run.
- The path to `PR_REVIEW.md` (now including the recorded decisions).

Do not mark the review complete while any Critical item remains unaddressed; instead report the
Critical items so the user can address them and re-run the skill.

## Notes

- Keep the regression checker as the single source of truth for branch health. Never bypass the gate.
- Parallelise all review agents in one message to keep the review fast.
- The skill synthesises; it does not re-litigate individual findings. Trust agent evidence.
