---
name: loc-counter
description: Counts lines of code and compares changes to determine LOC reduction, particularly useful for deduplication tasks.
license: MIT
compatibility: Mistral Vibe CLI
user-invocable: true
---

# LOC Counter Skill

## Purpose

Counts lines of code (LOC) and provides comparison capabilities to determine if changes have resulted in code reduction. Optimised for deduplication verification tasks.

## When to Use

- **Before refactoring/dedup**: Establish baseline LOC count
- **After changes**: Verify LOC reduction
- **Code review**: Quantify code simplification
- **Deduplication tasks**: Measure DRYness improvements

## Prerequisites

Requires `scc` (Sloc, Cloc and Code) to be installed.

### Recommended: Direct Binary Download (Linux/Unix)

The most reliable installation method uses pre-built binaries from GitHub releases:

```bash
# 1. Download the latest release for your architecture
# Linux x86_64 (most common):
curl -L -o /tmp/scc.tar.gz https://github.com/boyter/scc/releases/latest/download/scc_Linux_x86_64.tar.gz

# 2. Extract and install to ~/.local/bin (no sudo required)
mkdir -p ~/.local/bin
tar -xzf /tmp/scc.tar.gz -C ~/.local/bin/

# 3. Add to PATH (persistent)
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# 4. Verify
scc --version
```

**Note:** The apt package (`sudo apt install scc`) is **not available** on Debian/Ubuntu. Use the direct binary download above instead.

### Troubleshooting

- **Permission denied on /usr/local/bin**: Use `~/.local/bin` as shown above
- **install.sh blocked**: Some environments block shell script execution; use direct binary download
- **404 on GitHub URLs**: Ensure you're using the correct filename format with underscores, e.g., `scc_Linux_x86_64.tar.gz` not `scc-Linux-x86-64`

## Invocation

```bash
task agent=loc-counter task="<action>: <path> [options]"
```

## Actions

### 1. Count

Count LOC for a file or directory:

```bash
task agent=loc-counter task="Count: src/backend"
task agent=loc-counter task="Count: src/backend/controllers/AssignmentController.js"
```

**Output**: JSON with total lines, code, comments, blanks, and per-language breakdown.

### 2. Compare

Compare two directories or states to determine LOC delta:

```bash
# Compare two directories
task agent=loc-counter task="Compare: src/backend,src/backend-refactored"

# Compare before/after in git (requires clean working tree)
task agent=loc-counter task="Compare: HEAD~1,HEAD --git"
```

**Output**: JSON with LOC delta, percentage change, and per-file differences.

### 3. Baseline

Establish a baseline for later comparison:

```bash
task agent=loc-counter task="Baseline: src --name my-refactor"
```

Baseline saved to the agent's scratchpad under `loc-counter/<name>/baseline.json`

### 4. Check Reduction

Check if changes resulted in LOC reduction (dedicated dedup action):

```bash
task agent=loc-counter task="Check reduction: src/backend --name dedup-task-001"
```

Runs a comparison against the most recent baseline for the named task. Returns:

- `reduction: true/false`
- `loc_delta: <number>` (negative = reduction)
- `percentage_change: <number>`

## Output Format

All actions return JSON to stdout and save a report file.

### Count Output Example

```json
{
  "path": "src/backend",
  "total": {
    "lines": 15234,
    "code": 11200,
    "comments": 2500,
    "blanks": 1534
  },
  "languages": {
    "JavaScript": {
      "lines": 11200,
      "code": 9800,
      "comments": 1000,
      "blanks": 400
    },
    "TypeScript": {
      "lines": 4034,
      "code": 2400,
      "comments": 1500,
      "blanks": 134
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Compare Output Example

```json
{
  "comparison": {
    "before": { "lines": 15234, "code": 11200 },
    "after": { "lines": 14123, "code": 10500 },
    "delta": {
      "lines": -1111,
      "code": -700,
      "percentage": -7.29
    }
  },
  "reduction": true,
  "files_changed": 42,
  "files_added": 5,
  "files_removed": 3,
  "timestamp": "2024-01-15T10:35:00Z"
}
```

## Report Location

All reports saved to the agent's scratchpad under `loc-counter/<session-name>/`

- `baseline.json` — Baseline counts
- `report-<timestamp>.json` — Comparison reports
- `summary.txt` — Human-readable summary

## scc Options

Underlying `scc` command supports these relevant flags:

- `--by-file`: Show output for each file (verbose)
- `--exclude-dir`: Exclude specific directories
- `--include-ext`: Only include specific extensions
- `--no-dupe`: Exclude duplicate files from count
- `--format json`: Output results in JSON format
- `--ci`: Enable CI-friendly output (ASCII only)

Pass options via task:

```bash
task agent=loc-counter task="Count: src -- --exclude-dir node_modules"
```

**Note on trace output:** If you see verbose TRACE messages, this may be caused by a configuration file. Run without the `-t` flag (which enables trace) or check for any `scc` configuration files that may have tracing enabled.

## DRYness Metrics

`scc` provides DRYness estimation. Use for dedup verification:

```bash
task agent=loc-counter task="Count: src -- --dryness"
```

Returns duplicate line counts and DRYness score (0-100, higher = more duplication).

## Best Practices

1. **Use baselines**: Always establish a baseline before starting dedup work
2. **Name sessions**: Use descriptive names like `dedup-assessment-form` or `refactor-api-layer`
3. **Compare frequently**: Check reduction after each significant change
4. **Review outliers**: Investigate files with unexpected LOC increases
5. **Combine with complexity**: Use `--complexity` flag to verify code quality improvements alongside LOC reduction

## Example Dedup Workflow

```bash
# 1. Establish baseline before dedup
task agent=loc-counter task="Baseline: src/frontend --name dedup-modal-components"

# 2. Perform deduplication work...

# 3. Check if LOC reduced
task agent=loc-counter task="Check reduction: src/frontend --name dedup-modal-components"

# 4. If reduction=true, verify quality
task agent=loc-counter task="Count: src/frontend -- --complexity"
```
