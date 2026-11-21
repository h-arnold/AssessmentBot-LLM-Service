# Git Workflow

Branching strategy and commit conventions for the Assessment Bot LLM Service.

## Branch Naming Conventions

```
feature/description          # New features
fix/description              # Bug fixes
docs/description             # Documentation changes
hotfix/description           # Urgent production fixes
```

Create branches from an up-to-date `master`, and delete them after merging.

## Conventional Commits

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>
```

| Type       | Usage                                     |
| ---------- | ----------------------------------------- |
| `feat`     | New feature                               |
| `fix`      | Bug fix                                   |
| `docs`     | Documentation changes                     |
| `refactor` | Code restructuring without feature change |
| `perf`     | Performance improvement                   |
| `test`     | Adding or updating tests                  |
| `build`    | Build system or dependency changes        |
| `ci`       | CI/CD configuration changes               |
| `deps`     | Dependency version updates                |
| `style`    | Code style/formatting (lint fixes)        |
| `chore`    | Maintenance tasks                         |

Use British English in all commit messages.

## Pre-commit Hooks (Husky)

Husky runs `lint-staged` automatically on every commit. The configured file patterns are under the `lint-staged` key in [package.json](../../package.json).

Fix any reported lint, type or test failure before committing — the hooks must pass.

## Pull Request Workflow

1. Ensure the full check set passes before creating the PR (see [AGENTS.md §9](../../AGENTS.md)):
   ```bash
   npm run lint && npm run lint:british && npm run format && npm run build && npm run test && npm run test:e2e
   ```
2. Use a descriptive title in conventional commit format.
3. Describe what changed, why, and how to test.
4. CI runs unit tests, E2E tests and linting; security scanning runs in the separate `codeql.yml` and `sonarqube.yml` workflows.
5. At least one approval is required before merging.
6. **Squash and merge** is the preferred convention for a clean commit history.
