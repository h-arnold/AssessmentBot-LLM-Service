# Git Workflow

This document outlines the branching strategy and commit conventions for the Assessment Bot LLM Service project.

## Branching Strategy

### Main Branches

- **`master`**: Production-ready code. All releases are tagged from this branch.
- **Feature branches**: Short-lived branches for specific features or bug fixes.

### Branch Naming Conventions

```bash
# Feature branches
feature/user-authentication
feature/add-image-upload
feature/improve-error-handling

# Bug fix branches
fix/memory-leak-in-llm-service
fix/validation-error-messages
fix/cors-configuration

# Documentation branches
docs/update-api-documentation
docs/add-deployment-guide

# Hotfix branches (for urgent production fixes)
hotfix/security-patch-auth
hotfix/critical-bug-fix
```

### Branch Lifecycle

1. **Create Branch**: Create from `master` for new work

   ```bash
   git checkout master
   git pull origin master
   git checkout -b feature/your-feature-name
   ```

2. **Development**: Make commits following conventional commit format

3. **Pre-commit Checks**: Husky runs automatically on commit:
   - ESLint fixes
   - Prettier formatting
   - British English compliance
   - Type checking

4. **Push and PR**: Push branch and create pull request to `master`

5. **Review and Merge**: After approval, merge to `master`

6. **Cleanup**: Delete feature branch after merge

## Commit Message Conventions

### Conventional Commits Format

The project follows [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

```bash
# Features
feat: add user authentication module
feat(api): implement image upload endpoint
feat(llm): add support for Gemini Pro model

# Bug fixes
fix: resolve memory leak in LLM service
fix(auth): handle expired API keys properly
fix(validation): improve error message clarity

# Documentation
docs: update API documentation
docs(readme): add installation instructions
docs(contributing): clarify commit conventions

# Refactoring
refactor: simplify user validation logic
refactor(config): extract environment validation
refactor(tests): improve test data setup

# Performance improvements
perf: optimise LLM response parsing
perf(db): add database query caching
perf(api): implement request batching

# Tests
test: add unit tests for user service
test(e2e): add authentication flow tests
test(integration): test LLM service integration

# Build/CI changes
build: update Node.js to version 22
ci: add SonarQube analysis
ci(docker): optimise container build

# Dependency updates
deps: update @nestjs/core to v11.1.5
deps(dev): update jest to v30.0.4

# Code style/formatting
style: fix linting issues
style(prettier): apply formatting rules

# Chores
chore: update .gitignore
chore(release): prepare version 1.2.0
```

### Commit Message Examples

#### Good Commit Messages

```bash
# Clear, descriptive feature addition
feat(assessor): add support for PDF file uploads

# Specific bug fix with context
fix(auth): prevent duplicate API key registration

# Documentation improvement
docs(api): add examples for authentication endpoints

# Refactoring with clear benefit
refactor(llm): extract response parsing into utility class

# Test addition with scope
test(e2e): add comprehensive throttling tests
```

#### Bad Commit Messages

```bash
# ❌ Too vague
fix: bug fix

# ❌ No type prefix
Update documentation

# ❌ American English
feat: implement user authorization module

# ❌ Too detailed in subject line
feat: add new user authentication module with JWT tokens, API key validation, and role-based access control
```

### Multi-line Commit Messages

For complex changes, use the body and footer:

```bash
feat(llm): add retry mechanism for rate-limited requests

Implement exponential backoff strategy for handling LLM API rate limits.
The retry mechanism includes:
- Configurable base delay and maximum retries
- Exponential backoff with jitter
- Specific handling for 429 status codes

This improves system reliability when LLM quotas are reached.

Closes #123
Co-authored-by: Jane Smith <jane@example.com>
```

## Pull Request Workflow

### Creating Pull Requests

1. **Ensure Quality**: All checks must pass before creating PR

   ```bash
   npm run lint
   npm run test
   npm run test:e2e
   npm run build
   ```

2. **Descriptive Title**: Use conventional commit format

   ```
   feat(api): add image upload validation
   ```

3. **Detailed Description**: Include:
   - What changes were made
   - Why the changes are necessary
   - How to test the changes
   - Any breaking changes

### PR Template

```markdown
## Description

Brief description of the changes made.

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing

- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed

## Checklist

- [ ] Code follows the project's coding standards
- [ ] Self-review of code completed
- [ ] Code is properly documented
- [ ] Tests added for new functionality
- [ ] British English spelling verified
```

### Review Process

1. **Automated Checks**: GitHub Actions runs CI pipeline
   - Unit tests
   - E2E tests
   - Linting and formatting
   - Security scans (CodeQL, SonarQube)

2. **Code Review**: Team members review for:
   - Code quality and standards
   - Security considerations
   - Performance implications
   - Documentation completeness

3. **Approval Required**: At least one approval needed before merge

4. **Merge Strategy**: Squash and merge preferred for clean history

## Git Hooks and Automation

### Pre-commit Hooks (Husky)

Automatically runs on every commit:

```bash
# .husky/pre-commit
npx lint-staged
```

### Lint-staged Configuration

```json
{
  "lint-staged": {
    "*.ts": "eslint --fix",
    "*.{js,ts,json,md}": "prettier --write",
    "*.{ts,js}": "./scripts/check-british-english.sh"
  }
}
```

### Pre-commit Checklist

Before each commit, the following happens automatically:

- [ ] TypeScript files are linted and auto-fixed
- [ ] Code is formatted with Prettier
- [ ] British English compliance is verified
- [ ] Type checking passes

## Release Management

### Version Tagging

```bash
# Create annotated tag for releases
git tag -a v1.2.0 -m "Release version 1.2.0"
git push origin v1.2.0
```

### Release Branch Strategy

For major releases, consider using release branches:

```bash
# Create release branch
git checkout -b release/1.2.0

# Finalise release
git checkout master
git merge release/1.2.0
git tag -a v1.2.0 -m "Release version 1.2.0"
```

## Common Git Operations

### Starting New Work

```bash
# Sync with remote
git checkout master
git pull origin master

# Create feature branch
git checkout -b feature/new-feature

# Make changes and commit
git add .
git commit -m "feat: implement new feature"

# Push to remote
git push -u origin feature/new-feature
```

### Updating Feature Branch

```bash
# Keep feature branch up to date with master
git checkout master
git pull origin master
git checkout feature/your-feature
git merge master

# Or use rebase for cleaner history
git rebase master
```

### Fixing Commit Messages

```bash
# Amend last commit message
git commit --amend -m "feat: corrected commit message"

# Interactive rebase for multiple commits
git rebase -i HEAD~3
```

### Handling Merge Conflicts

```bash
# When conflicts occur during merge/rebase
git status  # See conflicted files
# Edit files to resolve conflicts
git add .
git commit  # Complete the merge
```

## Git Configuration

### Repository-specific Settings

```bash
# Set up line ending handling
git config core.autocrlf false  # Linux/Mac
git config core.autocrlf true   # Windows

# Set default branch name
git config init.defaultBranch master
```

## Troubleshooting

### Common Issues

#### Pre-commit Hook Failures

```bash
# If pre-commit hooks fail:
npm run lint:fix      # Fix linting issues
npm run format        # Fix formatting
npm run lint:british  # Check British English

# Bypass hooks in emergency (not recommended)
git commit --no-verify -m "emergency fix"
```

#### Merge Conflicts

```bash
# Abort merge if conflicts are complex
git merge --abort

# Or abort rebase
git rebase --abort

# Start over with a clean approach
```

#### Accidentally Committed Secrets

```bash
# Remove from last commit
git reset --soft HEAD~1
# Edit files to remove secrets
git add .
git commit -m "feat: implement feature (secrets removed)"

# If already pushed, force push (dangerous!)
git push --force-with-lease origin feature-branch
```

### Getting Help

```bash
# Git command help
git help <command>
git <command> --help

# Show repository status
git status
git log --oneline -10

# Show recent changes
git show HEAD
git diff HEAD~1..HEAD
```

## Best Practices Summary

1. **Always** create branches from an up-to-date `master`
2. **Use** conventional commit messages
3. **Write** descriptive commit messages (British English)
4. **Keep** commits focused and atomic
5. **Test** before committing (automated via hooks)
6. **Review** your changes before pushing
7. **Squash** related commits when merging PRs
8. **Delete** feature branches after merging
9. **Tag** releases consistently
10. **Document** breaking changes clearly
