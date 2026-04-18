# Suggested Security Linter Rules and Plugins

## Purpose

This document summarises practical ESLint hardening options for the AssessmentBot backend, focusing on a NestJS + TypeScript + Node.js API service with strict typing, Zod validation, stateless authentication, and existing quality gates.

The recommendations are prioritised to minimise disruption while improving security signal quality.

## Current Baseline (Already in Place)

The repository already includes a solid foundation:

- `eslint-plugin-security` is installed and its recommended rules are applied for `src/**/*.ts`.
- Explicit anti-risk rules are enabled (`no-eval`, `security/detect-eval-with-expression`).
- Type safety baseline rules are in place (`@typescript-eslint/no-explicit-any`, explicit function return types).
- CommonJS is restricted for TypeScript source (`import-x/no-commonjs`).

This means the codebase is already ahead of many default Node.js backends.

## Research Summary: Most Appropriate Additions

Below are the most suitable additions for this specific project, with rationale and suggested rule sets.

---

## Priority 1 (High Value, Low-to-Moderate Risk)

### 1) Tighten type-aware unsafe-flow controls (`@typescript-eslint`)

**Why**

TypeScript security weaknesses often come from implicit `any`-like behaviour at boundaries (deserialisation, external APIs, dynamic JSON, unknown errors). These rules close common escape hatches that can bypass runtime validation strategy.

**Recommended rules**

- `@typescript-eslint/no-unsafe-assignment`
- `@typescript-eslint/no-unsafe-member-access`
- `@typescript-eslint/no-unsafe-call`
- `@typescript-eslint/no-unsafe-return`
- `@typescript-eslint/use-unknown-in-catch-callback-variable`
- `@typescript-eslint/only-throw-error`
- `@typescript-eslint/no-base-to-string`

**Adoption note**

Enable as `warn` first, then migrate to `error` after backlog clean-up.

---

### 2) Add `eslint-plugin-promise`

**Why**

Backend security issues can appear when asynchronous control flow silently fails (missed awaits, dropped rejections, orphaned promise chains). This is both reliability and security hardening.

**Recommended rules**

- `promise/catch-or-return`
- `promise/no-return-wrap`
- `promise/no-nesting`
- `promise/always-return`

**Complementary TypeScript rules**

- `@typescript-eslint/no-floating-promises` (critical)
- `@typescript-eslint/no-misused-promises`

---

### 3) Add `eslint-plugin-regexp`

**Why**

The project uses regex in validation paths (for example API key checks). Unsafe or inefficient regular expressions can produce ReDoS risk.

**Recommended rules**

- `regexp/no-super-linear-backtracking`
- `regexp/no-dupe-disjunctions`
- `regexp/optimal-quantifier-concatenation`
- `regexp/no-useless-escape`

**Adoption note**

This plugin gives concrete, actionable feedback for regular expression complexity.

---

### 4) Add `eslint-plugin-no-secrets`

**Why**

Prevents accidental hardcoded credentials or API keys entering the repository.

**Recommended rules**

- `no-secrets/no-secrets`

**Adoption note**

- Tune entropy and allowlist to reduce false positives.
- Keep this as `error` in CI once tuned.

---

### 5) Add protections against prompt-injection obfuscation and invisible Unicode

**Why**

Prompt injection can be hidden in source, templates, test fixtures, or comments using bidirectional overrides and zero-width characters. These characters are difficult to see in code review and can alter how content is interpreted by humans and LLM-driven tooling.

**Recommended rules**

- `no-bidi-characters` (ESLint core rule)
- `no-irregular-whitespace` (ESLint core rule, keep strict)
- `regexp/no-invisible-character` (from `eslint-plugin-regexp`)

**Additional hardening for this backend's LLM-facing paths**

- Use `no-restricted-syntax` to block known dangerous Unicode ranges in string literals and template literals used for prompts.
- Scope this particularly to prompt-related directories (for example `src/prompt/**`, `test/**/prompt*`, and other LLM fixture locations) to reduce false positives.

**Example restricted ranges to block**

- Bidirectional override/control: `U+202A` to `U+202E`, `U+2066` to `U+2069`
- Zero-width/invisible: `U+200B`, `U+200C`, `U+200D`, `U+2060`, `U+FEFF`

This is one of the highest-value additions for defending against hidden instruction injection aimed at AI-assisted development and review workflows.

---

## Priority 2 (Useful, But Requires Careful Scoping)

### 6) Add `eslint-plugin-n` (Node.js best practices)

**Why**

Improves Node runtime safety and discourages risky patterns.

**Potential rules for this codebase**

- `n/no-deprecated-api`
- `n/no-path-concat`
- `n/prefer-global/process`
- `n/prefer-global/buffer`

**Rule to use selectively**

- `n/no-process-env`: useful to enforce architecture boundaries, but should be scoped so only `src/config/**` can access environment variables directly.

---

### 7) Expand `eslint-plugin-security` beyond current baseline

**Why**

The plugin is already active, but one high-signal rule is disabled.

**Candidate rule to re-evaluate**

- `security/detect-object-injection`

**Adoption strategy**

- Keep globally off if noise remains high.
- Re-enable selectively in high-risk folders where dynamic object indexing occurs on untrusted input.

---

## Priority 3 (Context-Dependent)

### 8) Add `eslint-plugin-sonarjs`

**Why**

Not purely security-focused, but useful for detecting bug-prone control flow and duplicated logic that can hide security mistakes.

**Suggested subset**

- `sonarjs/cognitive-complexity`
- `sonarjs/no-identical-expressions`
- `sonarjs/no-duplicated-branches`

Use with caution to avoid over-policing straightforward NestJS controller/service code.

---

## Suggested Initial Configuration (Example)

```ts
// eslint.config.js (illustrative excerpt)
import promise from 'eslint-plugin-promise';
import regexp from 'eslint-plugin-regexp';
import noSecrets from 'eslint-plugin-no-secrets';
import n from 'eslint-plugin-n';

plugins: {
  promise,
  regexp,
  'no-secrets': noSecrets,
  n,
}

rules: {
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/no-unsafe-assignment': 'warn',
  '@typescript-eslint/no-unsafe-member-access': 'warn',
  '@typescript-eslint/no-unsafe-call': 'warn',
  '@typescript-eslint/no-unsafe-return': 'warn',
  '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
  '@typescript-eslint/only-throw-error': 'error',

  'promise/catch-or-return': 'error',
  'promise/no-return-wrap': 'error',

  'regexp/no-super-linear-backtracking': 'error',
  'regexp/no-invisible-character': 'error',

  'no-bidi-characters': 'error',
  'no-irregular-whitespace': ['error', { skipStrings: false, skipTemplates: false }],

  'no-secrets/no-secrets': [
    'error',
    {
      tolerance: 4.2,
      additionalRegexes: {
        'Potential API key': 'AIza[0-9A-Za-z-_]{35}',
      },
    },
  ],

  'n/no-deprecated-api': 'error',
  'n/no-path-concat': 'error',
}
```

## Recommended Rollout Plan

1. **Baseline measurement**: run lint and capture violations for candidate rules.
2. **Soft launch**: enable new rules as `warn` where churn is expected.
3. **Remediation sprint**: address warnings in critical modules first (`auth`, `config`, `v1/assessor`, `llm`).
4. **Enforcement**: promote high-value rules to `error` in CI.
5. **Exception policy**: require inline justification for any `eslint-disable` comments.

## Final Recommendation Set (Shortlist)

If only a small number of additions are desired, start with:

1. `@typescript-eslint/no-floating-promises` (`error`)
2. `@typescript-eslint/no-misused-promises` (`error`)
3. `@typescript-eslint/no-unsafe-assignment` (`warn` -> `error`)
4. `@typescript-eslint/no-unsafe-member-access` (`warn` -> `error`)
5. `eslint-plugin-regexp` with `regexp/no-super-linear-backtracking` (`error`)
6. `eslint-plugin-no-secrets` with tuned config (`error`)
7. `no-bidi-characters` and strict `no-irregular-whitespace` (`error`)
8. `eslint-plugin-promise` core rules (`error`)

This combination gives the best security uplift without materially conflicting with existing NestJS and TypeScript patterns.
