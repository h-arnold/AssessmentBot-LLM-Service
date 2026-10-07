# Feature Delivery Plan (TDD-First)

## Read-First Context

Before writing or executing this plan:

1. Read the current `SPEC.md`.
2. Read any related companion planning doc.
3. Treat those documents as the source of truth for product behaviour, contracts, and layout rules.
4. Use this action plan to sequence delivery and testing; do not restate or redefine material already settled in the spec or companion docs.

## Scope and assumptions

### Scope

- Describe what is in scope for this feature.
- List any explicitly included areas (models, controllers, UI, API, etc.).

### Out of scope

- Note any areas deliberately excluded from the current delivery.

### Assumptions

1. State any assumptions that will guide decisions or design (e.g. contract shape, persistence choices, etc.).
2. Use numbered list format for clarity.

---

## Global constraints and quality gates

### Engineering constraints

- Keep API/entry points thin and delegate behaviour to services or controllers.
- Fail fast on invalid inputs and persistence failures.
- Avoid defensive guards that hide wiring issues.
- Keep changes minimal, localised, and consistent with repository conventions.
- Use British English in comments and documentation.

### TDD workflow (mandatory per section)

For each section below:

1. **Red**: write failing tests for the section’s acceptance criteria.
2. **Green**: implement the smallest change needed to pass.
3. **Refactor**: tidy implementation with all tests still green.
4. Run section-level verification commands.

### Delegation mandatory-read gate (mandatory for sub-agent execution)

When a section is delegated to sub-agents, the plan must define and enforce mandatory documentation reads.

For each delegated phase (`Testing Specialist`, `Implementation`, `Code Reviewer`, `Docs`, `De-Sloppification`, or planning agents when used):

1. list every required file under that phase as an `@`-prefixed worktree-relative path before delegation
2. pass those paths in the handoff's `Mandatory Reading` section; opencode injects the line-numbered contents automatically
3. do not request `Files read` evidence — the injected `@path` contents are the evidence
4. if a required path is missing from the handoff, add it and re-issue the handoff before accepting the work

### Shared-helper planning gate (mandatory when helper changes are expected)

When a section is likely to introduce helper reuse, helper extension, or new shared helpers:

1. record helper decisions in that section before implementation
2. include: decision (`reuse` | `extend` | `new` | `keep local`), owning path, and call-site rationale
3. add planned helper entries to the relevant canonical docs with status `Not implemented`
4. during documentation pass, reconcile planned entries against actual implementation and update status/details accordingly

### Validation commands hierarchy

Run the narrowest relevant command first, then widen as required.

- Lint: `npm run lint`
- British-English check: `npm run lint:british`
- Formatter: `npm run format`
- Build and type-check: `npm run build`
- Unit/integration tests: `npm run test -- <target>`
- Mocked E2E tests: `npm run test:e2e`
- Live E2E tests (explicit user request only): `npm run test:e2e:live`

---

## Section 1 — [Name of section]

### Objective

- State the high‑level goal of this section.

### Constraints

- List relevant architectural or behavioural constraints.

### Delegation mandatory reads (when sub-agents are used)

List every required file as an `@`-prefixed worktree-relative path.

Testing Specialist mandatory paths:

- `@...`

Implementation mandatory paths:

- `@...`

Code Reviewer mandatory paths:

- `@...`

Other delegated agents (if used) mandatory paths:

- `@...`

### Shared helper plan (when helper changes are expected)

Helper decision entries:

1. Helper: `[name or contract]`
   - Decision: `[reuse | extend | new | keep local]`
   - Owning module/path: `[...]`
   - Call-site rationale: `[...]`
   - Relevant canonical doc target: `[...]`
   - Planned doc status: `Not implemented`
2. ...

### Acceptance criteria

- Bullet the concrete observable outcomes that must be satisfied.

### Required test cases (Red first)

Service/unit tests:

1. ...
2. ...

Controller/integration tests:

1. ...

E2E/API tests:

1. ...

### Section checks

- `npm run test -- <target>`
- Mandatory `@`-prefixed paths were passed for every delegated handoff in this section.
- Shared-helper planning entries are present when helper changes are expected.
- Planned helper entries were added to relevant canonical docs with status `Not implemented` before implementation starts.

### Optional `@remarks` JSDoc follow-through

- Use this section only when the implementation is likely to need `@remarks` documentation on classes, functions, methods, hooks, schemas, mappers, or components.
- Record any places where a future developer may need help understanding:
  - why something was implemented in a particular way
  - key gotchas or failure modes to avoid
  - non-obvious interactions with other parts of the codebase
- Prefer this when the reasoning would not be obvious from the final code alone, especially if it is currently captured only in the action plan and would otherwise be lost when the plan is deleted.
- If no such documentation is needed for the section, write `None`.

### Implementation notes / deviations / follow-up

- **Implementation notes:** describe actual changes made when done.
- **Deviations from plan:** note any departures from the original section design.
- **Follow-up implications for later sections:** record effects for downstream work.

---

_(Repeat above section template for each logical chunk of work, renumbering sections.)_

---

## Regression and contract hardening

### Objective

- Describe regression goals for the feature and any contract verifications.

### Constraints

- Prefer focused test runs before broader validation.

### Acceptance criteria

- List tests and lints that must pass before considering feature complete.

### Required test cases/checks

1. Run the targeted unit/integration suites for the code you touch (`npm run test -- <target>`).
2. Run `npm run build` for TypeScript compilation.
3. Run `npm run lint`, `npm run lint:british` and `npm run format`.
4. Run the mocked E2E suite for API-level or integration changes (`npm run test:e2e`).
5. Confirm every delegated handoff passed its mandatory files as `@`-prefixed paths; opencode injects their contents, so no `Files read` return is required.

### Section checks

- Run the commands listed above and ensure green results.

### Implementation notes / deviations / follow-up

- **Implementation notes:** summarise what was done during regression phase.
- **Deviations from plan:** note any additional work discovered or done.

---

## Documentation and rollout notes

### Objective

- Update docs to match implemented feature and highlight any caveats.

### Constraints

- Only modify documents relevant to the touched areas.

### Acceptance criteria

- Documentation accurately reflects data shapes, API methods, or UI changes.
- Any deviations or caveats are documented.

### Required checks

1. Verify docs mention persistence/transport strategies.
2. Verify API docs list new endpoints/methods.
3. Confirm notes/deviations fields are filled during implementation.
4. Confirm every delegated docs/review handoff passed its mandatory files as `@`-prefixed paths; no `Files read` return is required.
5. Reconcile planned shared-helper entries in canonical docs: keep `Not implemented` where still pending, and update implemented entries where delivered.

### Optional `@remarks` JSDoc review

- Confirm whether any non-obvious design decisions, gotchas, or cross-component interactions discovered during implementation should be preserved in `@remarks` documentation.
- If earlier sections planned `@remarks`, verify that the relevant code now contains them before deleting the action plan.
- If no `@remarks` are needed, record `None`.

### Implementation notes / deviations / follow-up

- ...

---

## Suggested implementation order

1. Section 1 (initial setup, data contract, etc.)
2. Section 2 (persistence or core logic)
3. ...

_(Adjust order as appropriate for the feature.)_
