# Feature Specification Template

Use this template to write a reusable feature specification before implementation planning starts.

Keep the spec focused on intended behaviour, contracts, constraints, and scope boundaries. Do not turn it into an action plan, a task list, or a delivery log.

## Writing rules

- Use explicit, testable language.
- Separate agreed requirements from recommendations.
- State assumptions directly when a detail is not yet fully settled.
- Prefer stable domain terms and field names over temporary implementation wording.
- Record what is out of scope so later work does not drift.
- Do not prescribe file structure or implementation sequencing unless a hard ownership boundary is itself part of the agreed contract.
- Use British English in all prose.

## Suggested companion documents

- `ACTION_PLAN.md` or a workstream plan derived from this spec
- feature-specific UI/layout notes where interaction detail would distract from the core contract
- canonical backend or frontend docs when shared contracts are affected

---

# [Feature name] Specification

## Status

- Draft v1.0
- Replace this section with the current status and, if useful, a short note on why the document was updated

## Purpose

This document defines the intended behaviour for [feature name].

The feature will be used to:

- [primary user or system goal]
- [secondary user or system goal]
- [supporting operational goal]

This feature is **not** intended to:

- [explicit non-goal]
- [explicit non-goal]

## Agreed product decisions

1. [Record a settled product or UX decision.]
2. [Record another settled decision.]
3. [State any important assumption inline if the decision depends on one.]

Add to this list as decisions become firm. Keep each item concrete enough that a future agent or developer can implement and test against it.

## Existing system constraints

Document the constraints that materially shape the design.

### Backend or API constraints already in place

- [existing endpoint, controller, model, or transport surface]
- [existing persistence or validation rule]

### Current data-shape constraints

- [known payload limitation]
- [known migration or compatibility constraint]
- [shape or naming rule that must be preserved]

### Frontend or consumer architecture constraints

- [state-management constraint]
- [routing or composition constraint]
- [error-handling or transport constraint]

## Domain and contract recommendations

Use this section for recommendations that should guide implementation unless later superseded by an explicit decision.

### Why this approach is preferable

- [reason tied to maintainability]
- [reason tied to correctness]
- [reason tied to future extensibility]

### Recommended data shapes

#### [Entity or payload name]

```ts
{
  // ...
}
```

#### [Entity or payload name]

```ts
{
  // ...
}
```

### Naming recommendation

Prefer:

- `[recommendedFieldName]`
- `[recommendedFieldName]`

Avoid:

- `[ambiguousOrLegacyName]`
- `[ambiguousOrLegacyName]`

Explain any naming rule that prevents future ambiguity.

### Validation recommendation

#### Frontend

- [input or selection validation rule]
- [prohibited free-text or invalid state rule]

#### Backend

- [authoritative validation rule]
- [invalid input rejection rule]

### Display-resolution recommendation

- [how stored data should be resolved for display]
- [lookup or join rule]

## Feature architecture

Describe where this feature lives and which composition boundaries must be preserved.

### Placement

- [canonical page, route, tab, modal, worker, or service ownership]
- [explicitly forbidden parallel or duplicate entry point]

### Proposed high-level tree

```text
[TopLevelOwner]
└── [FeatureRoot]
    ├── [Child area]
    └── [Child area]
```

### Out of scope for this surface

- [feature that must not be added here]
- [workflow intentionally deferred]

## Data loading and orchestration

### Required datasets or dependencies

- `[datasetOrDependency]`
- `[datasetOrDependency]`

### Prefetch or initialisation policy

#### Startup

- [what should be prefetched eagerly]
- [which boundary owns readiness]

#### Feature entry

- [what should load on page, tab, or modal entry]
- [what should remain entry-only rather than startup-prefetched]

#### Manual refresh

- [state whether a manual refresh control exists or is intentionally absent]

### Query or transport additions

- `[query key, service wrapper, schema, or transport addition]`
- `[query invalidation or refresh rule]`

## Core view model or behavioural model

Use this section when the feature depends on a merged or derived model rather than rendering directly from one raw payload.

### Suggested shape

```ts
{
  // ...
}
```

### Derivation or merge rules

#### [State or status name]

- [condition]
- [condition]

#### [State or status name]

- [condition]
- [condition]

### Sort order or priority rules

1. [highest-priority state]
2. [next state]
3. [next state]

Also define any deterministic tie-break rules needed for testing.

## Main user-facing surface specification

### Recommended components or primitives

- [table, list, form, modal, card, worker, cron, etc.]
- [status or alert primitive]

### Fields, columns, or visible sections

1. [visible field or section]
2. [visible field or section]
3. [visible field or section]

### Sorting, filtering, or navigation rules

- [user-facing sorting rule]
- [filtering or search rule]
- [default state reset rule]

### Rendering rules

#### [State or case]

- [what should be shown]
- [what should be hidden or disabled]

#### [State or case]

- [warning, tooltip, placeholder, or fallback rule]

## Workflow specification

Create one subsection for each important user or system workflow.

## [Workflow name]

### Eligible inputs or preconditions

- [eligibility rule]
- [ineligible state]

### Inputs, fields, or confirmation copy

- [field]
- [field]

### Behaviour

- [execution rule]
- [success rule]
- [failure or partial-success rule]

Repeat the workflow subsection for each major create, update, delete, bulk, sync, or management flow.

## Error, loading, and empty-state rules

### Blocking failure

- [what counts as blocking]
- [how the user must be told]

### Partial-load or partial-success failure

- [warning behaviour]
- [stale-data rule]
- [refresh-needed messaging rule]

### Empty states

#### [Empty-state name]

- [display rule]

#### [Empty-state name]

- [display rule]

## Accessibility and usability notes

- [disabled reason or tooltip rule]
- [focus management rule]
- [confirmation rule for destructive actions]
- [predictability rule for selection, state, or navigation]

## Backend changes required to support agreed behaviour

List only the backend changes required by the agreed product contract.

1. [contract or model change]
   - [specific requirement]
   - [specific requirement]
2. [validation or API change]
   - [specific requirement]
   - [specific requirement]
3. [query, shaping, or persistence change]
   - [specific requirement]
   - [specific requirement]

## Planning handoff notes

Use this section only for constraints that the later action plan must respect.

- [ordering or dependency rule that comes directly from the agreed contract]
- [ownership or sequencing constraint that must not be lost]
- [explicit note for the later layout spec or action plan]

## Testing expectations

- [backend unit or API coverage]
- [frontend unit or integration coverage]
- [browser or end-to-end coverage if user-visible behaviour changes]
- [contract or regression coverage for risky edges]

## Documentation and rollout notes

- [canonical docs that must be updated]
- [rollout dependency, migration, or reset note]
- [explicitly deferred follow-up work]

## V1 scope recommendation

### Include in v1

- [core capability]
- [core capability]
- [required validation or contract hardening]

### Defer from v1

- [non-essential enhancement]
- [future refinement]
- [separate workflow]

## Open questions

Use this section only for unresolved questions that materially affect the design.

1. [open question]
2. [open question]

If there are no open questions, delete this section before finalising the spec.
