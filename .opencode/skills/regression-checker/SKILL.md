---
name: regression-checker
description: Use the config-driven regression checker CLI to establish a baseline, compare follow-up runs, and track repository health while progressing through `ACTION_PLAN.md`.
license: MIT
compatibility: Mistral Vibe CLI
user-invocable: true
allowed-tools:
  - bash
  - read_file
  - write_file
---

# Regression Checker

Use this skill when you need a deterministic snapshot of the codebase while working through
`ACTION_PLAN.md`, especially for builder-led changes that need a stable health signal over time.

## What it does

- runs the repository regression checker from the root npm script
- creates or reuses a session baseline keyed by session ID
- compares the current tree against the saved baseline
- surfaces lint, test, compile, and build regressions with stable report artefacts

## Quick start

From the repository root:

```bash
npm run regression-checker -- <sessionId>
```

`sessionId` is optional. In normal use, omit it so the CLI uses the current Git branch name.
That keeps the report aligned with the branch and gives a clearer view of how the codebase is
changing there.

The wrapper first runs `npm run builder:compile` and then launches
`scripts/builder/dist/regression-checker/run-regression-checker.js`.

> **Timeout:** Do not pass a `timeout` argument when invoking this command via the `bash` tool.
> Test suites can take several minutes. Let the tool use its configured default (300s in this repo).

## How to use it with `ACTION_PLAN.md`

1. Pick one session ID for the whole plan only when you need a non-branch identity; otherwise let
   the CLI use the branch name.
2. Run the checker before starting a phase to establish the current baseline or compare against the saved baseline.
3. Re-run the same session ID after each completed phase or any materially risky change.
4. Record the status and report path in your progress notes before moving on.

## What to inspect

- `mode`: `baseline` or compare mode
- `sessionId` and `sessionStorageKey`
- `overallStatus`
- `regressionsCount`, `newFailuresCount`, `fixesCount`
- `toolSummary`
- whether the run created a baseline this time

## Report artefacts

The full report text that appears on stdout is also persisted to a file in the session
directory under the configured `reportDirectory` (default `.ts-regression-checker/reports`).

| Mode     | File path (relative to session dir) | Contains                                                                                                                     |
| -------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| baseline | `baseline/baseline.txt`             | Header metadata + per-check summary + failed checks with artefact-level details                                              |
| compare  | `runs/<timestamp>/comparison.txt`   | Header metadata + per-check summary + current failures per check + regressions, new failures, and fixes as delta annotations |

Report file tree:

```
.ts-regression-checker/reports/
└── session-<branch-name>/
    ├── baseline/
    │   ├── manifest.json
    │   ├── baseline.txt              ← full baseline report
    │   └── checks/
    │       ├── <check-id>/
    │       │   ├── raw.json          ← tool raw output (raw.txt for tsc)
    │       │   └── derived.json      ← structured summary for comparison
    │       └── ...
    └── runs/
        └── <timestamp>/
            ├── manifest.json
            ├── comparison.json       ← structured comparison data
            ├── comparison.txt        ← full comparison report
            └── checks/
                ├── <check-id>/
                │   ├── raw.json      ← tool raw output (raw.txt for tsc)
                │   └── derived.json  ← structured summary for comparison
                └── ...
```

Use `read` on `comparison.txt` or `baseline.txt` to inspect failure details without
re-running the checker.

## Validation and safety

- The config file is `.ts-regression-checker/regression.config.json`.
- Supported tool families are `eslint`, `vitest`, `playwright`, and `tsc`.
- Invalid config fails fast before execution.
- Compare runs exit non-zero when regressions are detected.

## Notes

- Treat the checker as the source of truth for whether the workspace is improving or regressing
  while the action plan advances.
- Keep the session ID stable so reports remain comparable across checkpoints.
