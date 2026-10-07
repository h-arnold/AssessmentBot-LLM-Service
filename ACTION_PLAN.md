# Multi-part image prompting delivery plan (TDD-first)

## Read-first context

Read `SPEC.md` before executing. It owns behaviour, contracts, errors and scope; this document sequences delivery. No frontend or layout spec is applicable.

## Scope and assumptions

- Add the multi-part assessment base, migrate IMAGE, verify real factory/service/provider flow and document the change.
- Preserve TEXT/TABLE, legacy LLM payload acceptance, HTTP DTO/response shapes, provider implementations, cache-key rules and upstream validation.
- No conversation-example turns, rubric/example fixes, new configuration or generic conversation API.
- Apply migration to all IMAGE assessments without a feature flag. No open questions or authorised deliberate deferrals.

## Global constraints and quality gates

- Check `git status --short` before edits; do not overwrite other agents' changes.
- British English, ESM `.js` imports, NestJS Logger, privacy-gated content logging and public JSDoc. Never bypass quality gates.
- Before non-trivial code/test work, record a baseline with the full check set (`AGENTS.md` §9: linters, formatter, build, and every test suite except `npm run test:e2e:live`); compare after delivery. Planning alone does not require a runtime baseline.
- Every code section follows **Red → Green → Refactor**. Testing Specialist captures and reports the intended failure before Implementation starts. Finish each section with focused checks, then Code Reviewer; resolve findings before moving on.
- Mandatory-read gate: for every delegated phase, include `SPEC.md`, `ACTION_PLAN.md`, that section's listed paths and all touched/read source/tests as `@`-prefixed paths. OpenCode injects those contents, so no `Files read` evidence is required. Agents load their own canonical policy docs. Do not inject AGENTS.md.
- Commit and push each completed section after its review and quality gates pass. No live-provider calls required for acceptance.

### Shared-helper decisions (settled before implementation)

1. **New:** `MultiPartPrompt`, owning path `src/prompt/multi-part.prompt.base.ts`. Shared assembly/cache/validation for multi-part assessment subclasses; IMAGE is the first caller. Exact hook and output contract are in SPEC.md.
2. **Reuse:** `Prompt`, `PromptInputSchema`, `buildMultiPartPromptPayload()` and `buildPromptCacheKey()` in `src/prompt/prompt.base.ts`. Do not move or duplicate them; no schema parse in subclasses/services/providers.
3. **Keep local:** data-URI extraction in `src/prompt/image.prompt.ts`. One caller; no shared image utility.
4. **Reuse:** existing provider conversation mappers, factory Buffer conversion and `test/utils/e2e-helpers.ts` image-loading helper. No cross-provider mapper or test-response abstraction.

The canonical planned entry is already present in `docs/modules/prompt.md` with status **Not implemented**. Reconcile it in section 5; do not mark it delivered during planning.

### Module sizing and separation

Current physical line counts were inspected from file reads. Projections are budgets, not acceptance targets; re-count at implementation handoff. Count includes comments and blanks conservatively. The 500-line separation threshold is a planning-agent requirement, not an existing ESLint rule.

| Module                                                      | Current | Projected | Separation decision                                                        |
| ----------------------------------------------------------- | ------: | --------: | -------------------------------------------------------------------------- |
| `src/prompt/prompt.base.ts`                                 |     199 |   199–201 | Reuse behaviour unchanged; correct directly affected inheritance JSDoc     |
| `src/prompt/prompt.base.spec.ts`                            |     455 |       455 | Comment-only cross-reference correction; no new tests here                 |
| `src/prompt/multi-part.prompt.base.ts`                      | 0 (new) |    90–130 | Separate base module                                                       |
| `src/prompt/multi-part.prompt.base.spec.ts`                 | 0 (new) |   200–300 | Separate base tests; do not extend 455-line `prompt.base.spec.ts`          |
| `src/prompt/image.prompt.ts`                                |      95 |    90–130 | Local hook and URI parser                                                  |
| `src/prompt/image.prompt.spec.ts`                           |      79 |   200–300 | Fits under 500                                                             |
| `src/prompt/prompt.factory.ts`                              |     238 |       238 | No production changes expected                                             |
| `src/prompt/prompt.factory.spec.ts`                         |     133 |   180–260 | Adapt payload assertions and add string build coverage                     |
| `src/prompt/templates/image.system.prompt.md`               |     241 |   241–245 | Wording only; examples unchanged                                           |
| `src/v1/assessor/assessor.service.spec.ts`                  |     431 |       431 | Retain mocked legacy cases; do not grow with new integration coverage      |
| `src/v1/assessor/assessor.image-prompt.integration.spec.ts` | 0 (new) |   150–250 | Explicit separation: existing 431 + new 150–250 = 581–681 would exceed 500 |
| `test/utils/llm-mock.mjs`                                   |     190 |   200–225 | Focused image detector update                                              |
| `test/assessor.e2e-spec.ts`                                 |     104 |   140–180 | Gemini image coverage fits                                                 |
| `test/mistral.e2e-spec.ts`                                  |     137 |   145–170 | Strengthened variant assertions                                            |
| `src/llm/multi-part-prompt.schema.ts`                       |     159 |   159–165 | JSDoc only                                                                 |

If a revised projection exceeds 500, separate tests by responsibility or extract the specific new module before proceeding; never disable lint or remove tests to meet the budget. Production service/providers/router remain unchanged.

## Section 1 — Reusable multi-part base

### Objective and constraints

Implement the base contract using existing input validation and payload/cache helpers. Do not broaden `Prompt` or add history/options/schema abstractions.

### Delegation mandatory reads

Testing Specialist, Implementation and Code Reviewer: `src/prompt/prompt.base.ts`, `src/prompt/prompt.base.spec.ts`, `src/llm/multi-part-prompt.schema.ts`, `docs/modules/prompt.md`; add the new base and its test once they exist. Docs: the new base, tests and `docs/modules/prompt.md`.

### Acceptance criteria

- New base is assignable to `Prompt` and returns branded multipart payloads.
- It assembles system/user messages, derives the key server-side and uses the builder exactly once per build.
- No accumulated history, legacy payload fields or added provider options.

### Required tests and TDD sequence

**Red:** create `multi-part.prompt.base.spec.ts` with a minimal concrete subclass using the hook.

1. Supplied system content is verbatim; absent system produces only the user message; explicitly empty system remains a text part.
2. Ordered mixed text/image hook parts survive unchanged; messages contain no assistant turns or legacy fields.
3. Spy on `MultiPartPromptPayloadSchema.parse` to prove exactly one parse and that the returned payload is the parsed object; do not mock the builder into bypassing validation.
4. Missing/non-string input fields fail inherited input validation; empty parts and deliberately invalid runtime parts fail raw `ZodError` at build.
5. Reference-derived key is unchanged when student/template changes and changes when reference changes. Reuse existing golden helper coverage, do not rewrite golden values.
6. Repeat builds are equivalent without appended messages/parts. Hook failure propagates, with no fallback payload.
7. Content logging remains behind existing configuration; new summary logs contain no image data.

**Green:** add the new base with the SPEC hook and narrow return type, assembling only its agreed fields through reused helpers.

**Refactor:** keep assembly in base and task-specific content in hook. Add JSDoc including no retained history and payload-validation boundary.

### Section checks

- `npm test -- src/prompt/multi-part.prompt.base.spec.ts src/prompt/prompt.base.spec.ts`
- `npm run build` and `npm run lint`
- Mandatory-read and Code Reviewer gates satisfied; planned helper entry retained.

### Implementation notes / deviations / follow-up

Section 1 complete: `c289c03` — `feat: add reusable multi-part prompt base`,
branch `feat/multi-part-image-prompting`; push succeeded.
Full baseline passed on 3 October 2026;
output retained in `.opencode/scratchpad/image-baseline.log`. All linters,
formatter, build, unit/integration and mocked E2E checks passed (mocked E2E:
52 passed, 1 existing todo). User-owned agent-definition changes are excluded
from edits and commits. Red review passed without findings; 19 new tests cover
all seven required groups. Evidence: `section1-red.log`,
`section1-red-full.log`, `section1-red-tsc.txt` and `section1-red-review.md`
in `.opencode/scratchpad/`. Intentional red failures are the absent base module
and its cascading TS2307/TS2339/TS7006 errors; existing 719 unit tests and
52 mocked E2E tests remain green. Green full checks passed (738 unit tests,
52 mocked E2E tests and 1 existing todo); evidence in `section1-green.log`
and independent `review-s1-*.txt` reports. Review finding ledger:
S1-G1 (closed, Implementation): summary now explicitly counts user parts.
Final full gate passed in `section1-final-full.log`; clean sign-off in
`section1-rereview.md`. New base: 85 lines; test suite: 411 lines.

## Section 2 — Labelled image parts and system-template alignment

### Objective and constraints

Migrate ImagePrompt through the new hook while retaining its constructor API, URI parser error and data/MIME fidelity. Change only image-identification wording in the system template; do not alter examples, rubric, JSON structure or output headings.

### Delegation mandatory reads

Testing Specialist, Implementation and Code Reviewer: new base and tests, `src/prompt/image.prompt.ts`, `src/prompt/image.prompt.spec.ts`, `src/prompt/templates/image.system.prompt.md`, `src/prompt/prompt.factory.ts`, `src/prompt/prompt.factory.spec.ts`, `src/llm/multi-part-prompt.schema.ts`. Docs: changed image files and `docs/prompts/README.md`, `docs/modules/prompt.md`.

### Acceptance criteria

- Factory IMAGE yields exactly system + user, six ordered parts with SPEC's exact label strings, unchanged MIME/base64 and reference-derived key.
- Omit legacy fields. No extra image instructions beyond system/labels.
- String and Buffer factory paths both work. Invalid images fail loudly without omission or substitution.

### Required tests and TDD sequence

**Red:** replace legacy image assertions with exact multipart assertions, using distinct genuinely valid base64 (not placeholders such as `REFDATA`).

1. Exact labels, three images, adjacency, ordering and MIME/data pairing; no assistant turns or legacy fields.
2. URI syntax failure retains `BadRequestException` and existing message. Empty, malformed, whitespace-containing or unpadded base64 fails builder with raw `ZodError`.
3. Parameterise each image position: exactly 1 MiB accepted, 1 MiB + one byte rejected. Three individually valid images are not rejected for aggregate size.
4. Cache key hashes original reference data URI; student/template changes do not affect it. Repeat builds do not accumulate.
5. Real factory string path loads the system template; distinct Buffer inputs retain MIME/data order after conversion. Keep existing MIME-detection failure tests if present.
6. Template contract checks assert three labelled-image identification, preserved output headings, rubric and examples. Verify examples remain byte-for-byte identical by diff; do not introduce a duplicate permanent fixture of the entire template.
7. Existing TEXT/TABLE payload and template tests remain green unchanged.

**Green:** change ImagePrompt inheritance and replace its payload assembly with the ordered user-parts hook; keep extraction local. Update template identification language only. Factory production code should not need changes.

**Refactor:** remove obsolete ImagePrompt override/imports; improve only directly affected JSDoc.

### Section checks

- `npm test -- src/prompt`
- `npm run build` and `npm run lint`
- Review template diff for examples/rubric preservation; mandatory-read and reviewer gates passed.

### Implementation notes / deviations / follow-up

Section 2 complete: `5f6f93f` — `feat: migrate image prompts to labelled multi-part messages`,
branch `feat/multi-part-image-prompting`; push succeeded.
Recovered the red delegation after its upstream reporting failure; current
tree and saved evidence independently verified. Red review passed with no
findings (`section2-red-review.md`). Full red gate (`section2-red-full.log`)
has exactly 22 intentional assertion failures (14 missing multipart messages,
7 missing validation, 1 template wording), 738 passing unit tests and 52
passing mocked E2E tests plus 1 existing todo; all other checks clean.
Image tests: 470 lines; factory tests: 172 lines. Original template retained
in ignored `section2-image-system-prompt.original.md` for preservation checks.
Green review passed without findings (`section2-green-review.md`). Final full
gate passed (`section2-final-full.log`): 760 unit tests, 52 mocked E2E tests,
1 existing todo; zero regressions. IMAGE source: 113 lines. Template diff is
only the image-count wording; examples and rubric are byte-identical.
Review ledger: no open findings.

## Section 3 — Real assessment flow and SDK mock fidelity

### Objective and constraints

Prove the real factory/image/base chain reaches AssessorService's LLM boundary, and make Gemini's mocked image-response selection faithful to `inlineData`. Production service, schema, router and providers must remain unchanged.

### Delegation mandatory reads

Testing Specialist, Implementation and Code Reviewer: new prompt source/tests, `src/prompt/prompt.factory.ts`, `src/prompt/prompt.factory.spec.ts`, `src/v1/assessor/assessor.service.ts`, `src/v1/assessor/assessor.service.spec.ts`, `test/utils/llm-mock.mjs`, `test/assessor.e2e-spec.ts`, `test/mistral.e2e-spec.ts`, `test/utils/e2e-helpers.ts`, `test/utils/app-lifecycle.ts`; add the new integration suite. E2E work belongs to Testing Specialist. Docs: touched test harness and `docs/modules/llm.md`.

### Acceptance criteria

- Actual factory-created payload reaches mocked LLM unchanged, including key and six user parts, and is summarised as a two-message conversation.
- Construction failure prevents LLM send. Legacy mocked service cases remain valid, including image-precedence tests; do not convert those fixtures just because IMAGE's production producer changed.
- Gemini IMAGE E2E selects the image response for native conversation inlineData. Mistral IMAGE proves its image variant, not merely a schema-valid text response.

### Required tests and TDD sequence

**Red:** create separated `assessor.image-prompt.integration.spec.ts`, using real PromptFactory (with controlled config) and a mocked LLM token.

1. Valid IMAGE data URIs flow through real construction; assert send payload and conversation summary, and unchanged returned response.
2. Malformed base64 or oversized image passed directly to this service fails raw `ZodError` without send.
3. Extend Gemini HTTP suite with IMAGE fixtures using existing `loadFileAsDataURI` helper. Assert image-specific captured reasoning/score values distinct from text response; before detector repair this must fail for the intended wrong-variant reason.
4. Strengthen Mistral IMAGE with distinct image-response assertions; retain TEXT/TABLE marker assertions. Both HTTP IMAGE calls return the existing score response shape and 201.

Use actual DTO field names for new IMAGE requests; the existing Gemini suite's `TaskData`/`textTask` auth fixtures use legacy field names and must not be copied into valid IMAGE fixtures. Those auth fixtures can remain unchanged.

**Green:** repair mock Gemini detection to recognise native inlineData image parts (including nested conversation contents) while preserving existing legacy detection and text/table selection. Keep detector local and do not broaden mock production semantics or rewrite captured responses. Remove/reuse the currently unused duplicate image loader in Gemini E2E when adding image coverage.

**Refactor:** keep setup local to the separated integration suite; use existing image fixture helpers. No new shared test framework.

### Section checks

- `npm test -- src/v1/assessor/assessor.image-prompt.integration.spec.ts src/v1/assessor/assessor.service.spec.ts`
- `npm run build && npx vitest run --project e2e test/assessor.e2e-spec.ts test/mistral.e2e-spec.ts`
- `npm run lint`; read evidence and reviewer gates passed. Keep unit/provider regression checks for final section.

### Implementation notes / deviations / follow-up

Section 3 complete: `ce7b2b6` — `test: verify real multi-part image assessment flow`,
branch `feat/multi-part-image-prompting`; push succeeded.
Recovered partial red delegation after rate-limit failure; finished Mistral
variant assertions and repaired test scoping lint. Red review clean
(`section3-red-independent-review.md`). Full red gate (`section3-red-full.log`):
764 unit tests pass; mocked E2E 52 pass, 1 intentional Gemini wrong-variant
failure (completeness 3 instead of 5), 1 existing todo. All other checks clean.
Coverage matrix: `section3-red-report.md`; integration suite 208 lines,
Gemini E2E 151 lines, Mistral E2E 152 lines. Green checks passed: 764 unit
tests and 53 mocked E2E tests plus 1 existing todo (`section3-green.log`).
Review ledger: S3-G1 (closed, Implementation): Gemini test comment now
describes the repaired inlineData detector; assertions unchanged. Clean
re-review: `section3-green-rereview.md`. Final full gate independently
verified in `section3-clean-full.log` (764 unit, 53 mocked E2E, 1 todo).
Earlier final attempt timed out during E2E; its retry exposed an ignored
generated early-exit stub left by interruption. Reviewer removed/rebuilt
only generated output, then all checks passed. Failed/interrupted evidence
retained; no infrastructure refactor or quality-gate waiver.

## Section 4 — Regression and contract hardening

### Objective and constraints

Verify migration does not change routing, provider mapping, retries, legacy consumers or API responses. Prefer focused suites first; do not call live providers or alter pre-existing golden fixtures.

### Delegation mandatory reads

Testing Specialist and Code Reviewer: all changed source/tests plus `src/llm/routing-llm.service.spec.ts`, `src/llm/gemini.service.spec.ts`, `src/llm/mistral.service.spec.ts`, `src/llm/llm.service.interface.spec.ts`. Implementation only if repairs required: the same relevant changed files. Docs: section results and changed contracts.

### Acceptance criteria and required red-first checks

- **Red:** if a missing contract regression is discovered, write the focused failing test before repair. Existing suites already cover image-presence routing, model/reasoning overrides, provider part ordering, legacy acceptance and construction-helper constraints; run rather than duplicate them.
- **Green:** fix only in-scope regressions, routing work back to the appropriate section. Stop for a genuinely new product/contract decision.
- **Refactor:** check module counts against sizing budget and remove only migration-specific duplication.
- No regressions against baseline; new tests prove single-parse construction and no send on failure. Default HTTP validation remains upstream; the fixed cap is not made configurable.

### Section checks

- `npm test -- src/llm src/prompt src/v1/assessor`
- `npm run build && npm run lint && npm run test && npm run test:e2e:mocked`
- Run the full check set and compare it against the pre-implementation baseline; retain the output in `.opencode/scratchpad/` as execution handoff evidence.
- Mandatory-read, Code Reviewer and module-sizing gates passed. No quality gate bypass.

### Implementation notes / deviations / follow-up

Section 4 verified and reviewed clean; commit/push gate in progress.
Existing assertions cover all required contracts; no missing regression was
found, so the conditional red/green repair was unnecessary. Focused checks:
512 tests pass. Full gate: 764 unit tests, 53 mocked E2E tests and 1 existing
todo; all linters, formatter and build pass with zero baseline regressions.
Evidence: `section4-focused-check.log`, `section4-full-check-final.log` and
`section4-verification-report.md` in `.opencode/scratchpad/`. Migration sizing:
10 changed modules, 2,201 physical lines total; every module below 500 lines.
No migration-specific duplication requiring cleanup. Review ledger: S4-R1
(closed, Testing Specialist), corrected migration inventory; S4-R2 (closed,
Testing Specialist), relocated ephemeral report to scratchpad. Independent
clean re-review: `section4-rereview.md`. No source/test changes or live calls.

## Section 5 — Documentation and rollout

### Objective and constraints

Reconcile planned documentation to actual implementation. No new endpoint/version/flag or data migration; document transport validation rather than claim proven scoring improvement.

### Delegation mandatory reads

Docs and Code Reviewer: all changed public source and template files, `docs/modules/prompt.md`, `docs/prompts/README.md`, `docs/modules/llm.md`, `docs/design/ClassStructure.md`, `docs/architecture/data-flow.md`, `docs/architecture/patterns.md`, `docs/architecture/modules.md`, `src/llm/multi-part-prompt.schema.ts` and completed test evidence.

### Acceptance criteria and checks

- Describe new hierarchy/hook, two-message labelled IMAGE output, factory Buffer conversion, server-derived cache rule, no history and one payload-validation boundary.
- Reconcile planned helper entry to implemented state. Preserve distinction between server-derived keys from this base and trusted caller keys accepted by the low-level builder.
- Correct touched stale file-loading/path-traversal claims about ImagePrompt; it parses data URIs and relies on upstream validation, not file loading.
- Update directly affected class diagrams/flow references and schema JSDoc's obsolete V2 cache-derivation remarks, without changing schema behaviour.
- Correct `Prompt.buildMessage()` JSDoc's obsolete ImagePrompt override example to describe MultiPartPrompt, and replace stale numbered SPEC decision references in `src/prompt/prompt.base.spec.ts` and `test/utils/llm-mock.mjs` with stable contract/doc references. These are comment-only edits; existing test assertions and golden values remain unchanged.
- State fixed 1 MiB per-image limit, padded base64, raw construction errors and existing HTTP 500 mapping when upstream permits such invalid input (including upload limits configured above 1 MiB).
- Explicitly retain system examples and acknowledge this migration does not revise their content or establish score-quality gains.
- No executable behaviour added here: Red/Green/Refactor applies if documentation review discovers any necessary code correction, routed to its owning section.
- Verify public JSDoc/remarks on base/hook/IMAGE explain adjacency, statelessness and validation ownership; markdown formatting and British English checks pass.
- `npm run lint` and `npm run lint:british`; review doc diffs and mandatory-read evidence. If schema JSDoc changed, `npm run build` and focused prompt/LLM tests remain green.

### Implementation notes / deviations / follow-up

Not started. Record documentation reconciliation and any actual deviations before final handoff.

## Suggested implementation order

Baseline → section 1 → section 2 → section 3 → section 4 → section 5 → final regression comparison if documentation pass changed source → implementation handoff. All requirements are settled in SPEC.md; nothing requires a product decision during execution.
