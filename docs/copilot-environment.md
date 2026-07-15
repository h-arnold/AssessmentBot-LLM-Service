# GitHub Copilot Coding Agent Environment (Legacy)

> **Note**: This describes a legacy GitHub Copilot Coding Agent setup that has been superseded by the OpenCode sub-agent system. See `AGENTS.md` and `.opencode/agents/` for current agent configuration and delegation workflows.

## Still in Use

- **`.github/copilot/agent-config.yml`** - Defines the development environment (Node.js version, commands, quality checks). This file remains and configures the GitHub Copilot Coding Agent environment for any users relying on Copilot.

## Superseded / Removed

- **`.github/workflows/copilot-environment.yml`** - The CI workflow that validated the Copilot environment has been removed. All CI validation is now handled by the standard CI/CD pipeline (see `docs/deployment/cicd.md`).
