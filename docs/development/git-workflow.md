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

Husky runs `lint-staged` automatically on every commit:

```json
{
  "*.ts": "eslint --fix",
  "*.{js,ts,json,md}": "prettier --write",
  "*.{ts,js}": "./scripts/check-british-english.sh"
}
```

To bypass hooks in an emergency (not recommended): `git commit --no-verify`.

## Pull Request Workflow

1. Ensure quality checks pass before creating the PR:
   ```bash
   npm run lint && npm test && npm run test:e2e && npm run build
   ```
2. Use a descriptive title in conventional commit format.
3. Describe what changed, why, and how to test.
4. CI runs automated checks (unit tests, E2E tests, linting, security scans).
5. At least one approval is required before merging.
6. Use **squash and merge** for a clean commit history.
