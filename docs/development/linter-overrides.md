# Linter Override Authorisations

This document records every inline `eslint-disable` comment in the codebase
along with its explicit authorisation. Per `AGENTS.md`:

> Do not disable or override any quality gate (including linter rules) without
> explicit authorisation.

Each entry below identifies the file, the suppressed rule, the justification
for the suppression, and the authorisation context.

## Registered Overrides

| #   | Location                          | ESLint Rule                               | Justification                                                                                                                                                                                                                                                                                                                                                                                        | Authorisation                                                                                                                                                                                                             |
| --- | --------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/config/config.service.ts:50` | `security/detect-non-literal-fs-filename` | The file path is `path.resolve(process.cwd(), environmentFileName)` where `environmentFileName` is a fixed string constant (`'.env'` or `'.test.env'`). It is **not** user-controlled — the value depends only on the `NODE_ENV` environment variable (which is set by the deployment platform, not by request input).                                                                               | Remediation of CODE_REVIEW.md finding "Linter override comments without recorded authorisation" (lines 150–154). Approved as part of a security review; the suppressions are legitimate and refactoring is not warranted. |
| 2   | `src/config/config.service.ts:52` | `security/detect-non-literal-fs-filename` | Same file path as entry #1 (`environmentFilePath` constructed from `process.cwd()` + fixed filename). The `fs.readFileSync` call uses the same safe, non-user-controlled path.                                                                                                                                                                                                                       | Same authorisation as entry #1.                                                                                                                                                                                           |
| 3   | `src/config/config.service.ts:77` | `security/detect-object-injection`        | The `key` parameter is constrained by TypeScript to `T extends keyof Config` — only keys from the validated Zod schema are accepted. The `Config` type is derived from `configSchema`, so access is type-safe and cannot be driven by arbitrary user input.                                                                                                                                          | Same authorisation as entry #1.                                                                                                                                                                                           |
| 4   | `src/common/file-utilities.ts:98` | `security/detect-non-literal-fs-filename` | The path is `path.resolve(baseDirectory, name)`. Before the `fs.readFile` call, a path-traversal guard (`if (!resolvedPath.startsWith(baseDirectory)) continue;`) ensures the resolved path stays within its intended base directory. Additionally, the `name` parameter is already validated earlier in the call chain (e.g., `readMarkdown` rejects names containing `..` or not ending in `.md`). | Same authorisation as entry #1.                                                                                                                                                                                           |

## Policy

- No `eslint-disable` comment may be added to the codebase without a
  corresponding entry in this table and an accompanying inline comment that
  references this document.
- If a refactoring removes the need for a suppression, both the inline comment
  **and** this table entry must be removed.
- All entries are reviewed as part of the standard security-review process
  (CODE_REVIEW.md).
