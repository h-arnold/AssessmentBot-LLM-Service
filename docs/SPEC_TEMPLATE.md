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

---

## [Feature name] Specification

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

1. [Record a settled product decision.]
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

- [authoritative validation rule]
- [invalid input rejection rule]

## Feature architecture

Describe where this feature lives and which composition boundaries must be preserved.

### Placement

- [service, controller or worker ownership]
- [explicitly forbidden parallel or duplicate entry point]

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

### Service or transport contract additions

- `[request, schema, service wrapper, or transport addition]`
- `[retry, refresh, or consistency rule for the API response]`

## Workflow specification

Create one subsection for each important user or system workflow.

### [Workflow name]

#### Eligible inputs or preconditions

- [eligibility rule]
- [ineligible state]

#### Inputs and fields

- [field]
- [field]

#### Outputs or observable results

- [response field or observable outcome]
- [response field or observable outcome]

#### Behaviour

- [execution rule]
- [success rule]
- [failure or partial-success rule]

Repeat the workflow subsection for each major create, update, delete, bulk, sync, or management flow.

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

## Scope boundaries

Use this section only for constraints that the later action plan must respect.

- [ordering or dependency rule that comes directly from the agreed contract]
- [ownership or sequencing constraint that must not be lost]
- [core capability]
- [core capability]
- [required validation or contract hardening]

## Testing expectations

- [backend unit or API coverage]
- [contract or regression coverage for risky edges]

## Documentation and rollout notes

- [canonical docs that must be updated]
- [rollout dependency, migration, or reset note]
- [explicitly deferred follow-up work]

## Explicitly deferred behaviour

- [non-essential enhancement]
- [future refinement]
- [separate workflow]

## Open questions

Use this section only for unresolved questions that materially affect the design.

1. [open question]
2. [open question]

If there are no open questions, delete this section before finalising the spec.
