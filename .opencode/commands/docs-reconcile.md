---
description: Audit documentation in slices, synthesise a deduplicated issues document, delegate fixes by the same split, and review until clean
---

Audit the documentation in `docs/` and the repository-root `README.md`, decide what should
change, delegate the fixes, and review them until no findings remain. Work in three phases:
audit, remediate, review.

Audit and review subagents are read-only. Fix subagents may edit only the files listed in their
batch brief. Fix subagents are `docs` agents, which do not edit production code. Do not overwrite
an existing `.opencode/scratchpad/docs-audit/report.md` from an earlier run; treat it as a
protected artefact.

## Style source of truth

`docs/development/documentation-style-guide.md` is the single source of truth for audience,
writing style, what never belongs in a canonical doc, ownership and audit exclusions. The
`docs` agent's own instructions and `AGENTS.md` supply the non-negotiable project principles.
Agent instructions are injected automatically, so never attach them to a subagent brief.

## Delegation rules

- Run slices in batches of three or four concurrent subagents. Start a fresh session for each. If
  one returns an error or an empty response, run it again as a new session and read any partial
  findings file before re-delegating.
- Do not attach agent definition files or `AGENTS.md` files to any brief; those are injected
  automatically.
- Every subagent writes its output to its own scratchpad file and returns only that path, so
  full results survive if the orchestrating agent is compacted.

## 1. Prepare

1. Read @docs/development/documentation-style-guide.md. It is compulsory reading and the
   source of truth for audience, writing style, ownership and audit exclusions.
2. Apply the exclusions from the style guide: `release-notes/**` content at the repository
   root, and any `docs/plans/**` queued planning artefacts if that directory exists. The style
   guide itself is also out of audit scope because it is the audit's source of truth.
   Release-note navigation and index coverage stay in scope. Architecture pages under
   `docs/architecture/` are ordinary developer documentation.
3. Create `.opencode/scratchpad/docs-audit/slices/`, `.../fixes/` and `.../reviews/` if they
   do not exist. Clear stale files from a previous run only after checking that no in-flight
   slice needs them.
4. Enumerate the remaining Markdown files under `docs/` plus the root `README.md`, and write
   an exact per-slice manifest to `.opencode/scratchpad/docs-audit/slices/manifest.md`. Every
   in-scope file must belong to exactly one slice. Every phase uses this manifest verbatim;
   do not derive slice membership again. Keep each slice at or below roughly 3,000 lines. If a
   slice must be split, give each part a new name derived from its content, record both parts
   and their findings filenames in the manifest, and use those names in every phase.

## 2. Slice plan

The table describes each slice; the manifest written in Prepare is the exact file list. The
style guide is excluded (see Prepare). All slices use the `docs` agent. The root `README.md` is
audited for developer-facing style and terminology.

| Slice               | Content                                                                                     | Approx. lines | Agent  | Findings file            |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------- | ------ | ------------------------ |
| Index and templates | root `README.md`, `docs/README.md`, `docs/ACTION_PLAN_TEMPLATE.md`, `docs/SPEC_TEMPLATE.md` | ~830          | `docs` | `index-and-templates.md` |
| Architecture        | four docs under `docs/architecture/`, `docs/design/ClassStructure.md`                       | ~690          | `docs` | `architecture.md`        |
| Development         | five docs under `docs/development/`, `docs/configuration/environment.md`                    | ~405          | `docs` | `development.md`         |
| API, auth, security | four docs under `docs/api/`, both under `docs/auth/`, `docs/security/auth.md`               | ~600          | `docs` | `api-auth-security.md`   |
| Testing             | three docs under `docs/testing/`                                                            | ~450          | `docs` | `testing.md`             |
| Deployment          | four docs under `docs/deployment/`                                                          | ~710          | `docs` | `deployment.md`          |
| LLM and prompts     | `docs/llm/error-handling.md`, both under `docs/prompts/`                                    | ~640          | `docs` | `llm-and-prompts.md`     |
| Modules             | twelve docs under `docs/modules/`                                                           | ~1,050        | `docs` | `modules.md`             |

## 3. Delegate slice audits

Each brief must state:

1. **Scope**: the exact file list from the manifest for that slice, and nothing else.
2. **Mandatory reading**: the style guide at `docs/development/documentation-style-guide.md`,
   passed as a bare `@`-prefixed path so OpenCode injects it. Include this on every brief. Do
   not attach `docs.md` or another agent definition file; those are injected automatically.
3. **Audience row**: name which row of the style guide's audience table applies to the slice.
   Include this for every slice; the guide is not injected automatically.
4. **Read-only**: do not edit or create any tracked source file. The only permitted write is
   the subagent's own findings file in the scratchpad. State this explicitly in the brief.
5. **Task**: check both accuracy against the codebase (paths, symbols, config keys, versions,
   commands, line anchors, shipped-feature status) and compliance with the style rules
   (delivery narrative, duplication, ownership, density, formatting, terminology).
6. **Method**: locate candidate passages with search first, then read the surrounding
   section. Do not try to read every file in full; for files over 1,000 lines, read only the
   relevant sections.
7. **Evidence**: for every staleness claim, state how it was verified — glob result, path
   lookup, `git cat-file`, config or source file. Do not report a guessed fact. Use "Needs
   verification" only for findings observed in the docs whose resolution needs an owner
   decision or confirmation outside the repository.
8. **Output**: report every finding; do not cap the count. For each give an ID (`IX-01`,
   `AR-01`, and so on), `file:line`, a style-guide category, severity (High/Medium/Low), the
   problem with a short quote, and a concrete suggested fix. Separate "High confidence" from
   "Needs verification". Rank by what would change a reader's action. Add a short list of
   categories that came back clean.
9. **Findings file**: write findings incrementally to
   `.opencode/scratchpad/docs-audit/slices/<slice-name>.md`, using the filename recorded in
   the manifest for that slice. Write each finding as soon as it is confirmed, so a cancelled
   agent leaves usable partial findings. Return only that path to the orchestrating agent.

If a subagent starts repeatedly filling its context and being compacted, cancel it and split
that slice into two smaller briefs rather than waiting for it to finish. Read any partial
findings file it left behind before re-running the slice.

## 4. Central checks

Once the audit batches are dispatched, run these yourself; do not delegate them:

- `docs/README.md` index against files on disk: every in-scope doc is linked, every link
  resolves, and no entry points at a removed or renamed file. Check the root `README.md`
  links too.
- Release-note coverage: every file in `release-notes/` is discoverable from an index or link
  inventory. This is a link inventory, not a content review; release-note content is out of
  scope.
- Duplication and contradictions that span slices, especially the same rule stated in two
  canonical docs and agent instructions that disagree with a doc.
- Terminology: use "Assessment Bot" for the product and "Assessment Bot LLM Service" for
  this service consistently; check the root `README.md` before introducing a variant.
- Architecture pages are ordinary developer docs. Judge them by the general delivery-narrative
  and ownership rules.

Record these as findings with origin `central` and IDs prefixed `C-`, and assign them to the
owning batch. A central decision may add an explicitly named file outside the slice manifest,
such as the root `README.md`, `AGENTS.md` or a file under `.opencode/`, to that batch's allowed
list; the fix brief must then name it verbatim.

## 5. Synthesise the issues document

Read every returned findings file in full. Write one comprehensive document to
`.opencode/scratchpad/docs-audit/issues.md`.

- Deduplicate: merge findings that describe the same defect. Keep every affected location and
  the strongest evidence; full quoted evidence stays in the slice findings files, linked by ID.
- For each issue record: ID, severity, location(s), finding, decision, fix batch, status.
- Decide every structural or ownership question here — for example whether content belongs in
  API or module docs, which doc owns a rule, whether a section is deleted, merged or relocated.
  Fix agents follow the decision; they do not re-decide it.
- Where subagents disagree, choose one account, record the rationale, and apply it consistently.
- Any decision that creates or removes a doc, or materially changes its purpose, must name
  `.opencode/agents/docs.md` and `.opencode/agents/code-reviewer.md` in that batch's allowed
  files. This satisfies the agents' own update obligations without conflicting with the fix
  brief.
- An issue may be marked **Accepted** with a recorded rationale. Accepted issues are not fix
  work and are not re-raised by reviewers.
- Do not fix anything in this phase. The issues document is the complete plan.

## 6. Delegate fixes

Reuse the manifest and the `docs` agent. Run batches of three or four fresh sessions.

Each fix brief must state:

1. The verbatim issue rows assigned to that batch and their decisions.
2. Compulsory reading: the style guide at `docs/development/documentation-style-guide.md`,
   passed as a bare `@`-prefixed path. Follow its Naming rules. Do not attach agent definition
   files.
3. The exact files the agent may edit, taken from the manifest plus any file explicitly added
   by a central decision or by the doc/agent-update obligation. No other file may be touched.
4. Apply the recorded decision only. Do not expand scope, restructure unrelated sections or
   invent new rules. If a decision cannot be applied, report that instead of improvising.
5. Do not commit, and do not change code or JSDoc. Agent instruction files may be edited only
   when named by the issue decision or required by the doc/agent-update obligation.
6. Write a fix log incrementally to
   `.opencode/scratchpad/docs-audit/fixes/<slice>-cycle<N>.md`, starting at cycle 1 and using a
   new file for each later cycle. List each issue ID, the change made and the files touched.
   Return only that path.
7. Do not run the code build or test suites for a docs-only batch; re-read the edited docs and
   check links instead.

Update the status of every issue in `issues.md` after each batch, recording the fix log path.

If a fix agent is cancelled, run `git status` and `git diff` on that batch's files before
re-delegating, and read any partial fix log, so work is neither double-applied nor skipped.

## 7. Review loop

After all fix batches land, delegate a fresh review of every slice that had fixes using the
same manifest and agent type. This first cycle is the full pass. Later cycles review only the
slices changed in that cycle. Each cycle uses a new filename, so previous reviews are preserved.

Each review brief must state:

1. The exact slice files and the verbatim issue rows with their decisions assigned to that
   batch.
2. Compulsory reading: the style guide at `docs/development/documentation-style-guide.md` and
   the issues document at `.opencode/scratchpad/docs-audit/issues.md`, each passed as a bare
   `@`-prefixed path. Do not attach agent definition files.
3. Read-only: do not edit or create any tracked source file. The only permitted write is the
   review file in the scratchpad. State this explicitly in the brief.
4. Report every finding; do not cap the count, using the same format and ID convention as the
   audit phase. Apply the Task, Method and Evidence rules in §3.5–7 to review findings too:
   re-verify accuracy against the codebase and state how staleness claims were checked.

Write the review file incrementally to
`.opencode/scratchpad/docs-audit/reviews/<slice>-cycle<N>.md` and return only that path. Read
every review file in full. If a review agent is cancelled, read any partial review file and run
`git status` and `git diff` on that batch's files before re-delegating.

- Reviewers do not see the fix logs. They check the resulting tree against the style guide and
  against the issues document's decisions, and do not re-raise issues marked Accepted.
- Update issue statuses in `issues.md` after each review. An issue is resolved only when a
  reviewer confirms the fix in that cycle. A recurring issue keeps its original ID and is
  reopened.
- A clean review — no outstanding findings across the slices reviewed in that cycle — is a
  success exit. Stop the loop and go to §8.
- Otherwise, a cycle makes progress when no previously open issue ID recurs and at least one
  issue is confirmed resolved by a reviewer. If a cycle makes no progress, stop and report the
  blocker. This stop rule takes precedence over re-delegation.
- Unless a clean review or the progress check above stops the loop, a review finding at any
  severity is added to `issues.md` with a new ID (recurrences keep the original ID), assigned
  to the owning batch, fixed and reviewed again.

## 8. Report

Write the final report to `.opencode/scratchpad/docs-audit/reconcile-report.md`. Do not
overwrite `.opencode/scratchpad/docs-audit/report.md`. Include the original findings, the
decisions made in synthesis, the fixes applied, each review outcome, and every issue marked
Accepted with its rationale. Return a short summary in chat that leads with the number of
issues resolved and the path to the report.
