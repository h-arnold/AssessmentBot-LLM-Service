# Contributing to Assessment Bot - Backend

We welcome contributions to the Assessment Bot backend! To ensure a smooth and collaborative development process, please follow these guidelines.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Pull Request Guidelines](#pull-request-guidelines)
- [Development Setup](#development-setup)
- [Coding Style](#coding-style)
- [Commit Messages](#commit-messages)
- [Security Policy](#security-policy)

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/0/code_of_conduct.html). By participating, you are expected to uphold this code.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue on our [GitHub Issues page](https://github.com/h-arnold/AssessmentBot-LLM-Service/issues). When reporting a bug, please include:

- A clear and concise description of the bug.
- Steps to reproduce the behavior.
- Expected behavior.
- Actual behavior.
- Screenshots or error messages if applicable.
- Your environment details (OS, Node.js version, etc.).

### Suggesting Enhancements

For feature requests or enhancements, please open an issue on our [GitHub Issues page](https://github.com/h-arnold/AssessmentBot-LLM-Service/issues). Describe the enhancement, why it would be useful, and any potential solutions.

### Pull Request Guidelines

1.  **Fork the repository** and create your branch from `master`.
2.  **Ensure your code adheres to the project's coding style** (see [Coding Style](#coding-style)).
3.  **Write clear, concise, and descriptive commit messages** (see [Commit Messages](#commit-messages)).
4.  **Ensure all tests pass** and add new tests for new features or bug fixes.
5.  **Update documentation** as necessary.
6.  **Open a pull request** to the `master` branch. Provide a clear description of your changes.

## Development Setup

Refer to the [README.md](README.md) for instructions on setting up your development environment.

## Coding Style

This project uses ESLint and Prettier to enforce a consistent coding style. Please ensure your code passes linting and formatting checks before submitting a pull request. You can run these checks using:

```bash
npm run lint
npm run format
```

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification for commit messages. This helps with automated changelog generation and understanding the history of the project. Examples:

- `feat: Add new user authentication module`
- `fix: Resolve issue with LLM response parsing`
- `docs: Update README with development setup instructions`
- `refactor: Improve error handling in common module`

## Security Policy

If you discover any security vulnerabilities, please report them responsibly by contacting [your-email@example.com](mailto:your-email@example.com) instead of opening a public issue. We will address all legitimate concerns promptly.
