# Section 5 — RoutingLLMService and Module Wiring — Code Review

**Reviewer:** Code Reviewer agent
**Date:** 2026-07-23
**Scope:** Uncommitted working-tree changes for ACTION_PLAN.md Section 5 (RoutingLLMService + module wiring).
**Verdict:** **PASS** (no Critical or blocking issues; minor Improvement + Nitpicks noted).

---

## Automated checks (all green)

| Check           | Command                         | Result                                               |
| --------------- | ------------------------------- | ---------------------------------------------------- |
| Unit tests      | `npx vitest run --project unit` | **456 passed** (54 files) — matches the 456 expected |
| Build           | `npm run build`                 | Successful (`nest build`)                            |
| Lint            | `npm run lint`                  | Clean (0/0)                                          |
| British English | `npm run lint:british`          | "British English compliance verified"                |

Section-level expectations from ACTION_PLAN.md are met: `routing-llm.service` 14/14, `llm.module` 4/4, `assessor/` green, full LLM suite 182/182, `npm test` 456/456.

---

## Acceptance-criteria verification (1–11 + supplementary)

| #   | Criterion                                                                                                                                                 | Result | Evidence                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Constructor validates **both** model names; single aggregated `Error` listing every unrecognised name + supported prefixes                                | PASS   | `validateModelConfig()` validates `DEFAULT_TEXT_TABLE_MODEL` and `DEFAULT_IMAGE_MODEL` in separate `try/catch` blocks, collects `badNames`, throws one `Error` joining names + `SUPPORTED_MODELS` prefixes. Test "throws a single aggregated error mentioning both names" asserts both `gpt-4o` and `claude-3` appear. |
| 2   | Constructor does **not** read/check `GEMINI_API_KEY`/`MISTRAL_API_KEY`                                                                                    | PASS   | `validateModelConfig()` only reads `DEFAULT_TEXT_TABLE_MODEL` / `DEFAULT_IMAGE_MODEL`. No key access. Provider key checks remain in their own services (unchanged).                                                                                                                                                    |
| 3   | No throw when both models valid                                                                                                                           | PASS   | Test "does not throw when both models are valid, regardless of provider combination" (Gemini/Gemini, Mistral/Mistral, Gemini/Mistral).                                                                                                                                                                                 |
| 4/5 | `send()` routes text→`DEFAULT_TEXT_TABLE_MODEL` provider, image→`DEFAULT_IMAGE_MODEL` provider; config read at **send** time (not cached at construction) | PASS   | `send()` reads both model + effort via `configService.get(...)` on every call; resolver via `resolveProvider(modelName)`.                                                                                                                                                                                              |
| 6   | Mixed-provider config works                                                                                                                               | PASS   | Test "supports mixed config: text → Gemini and image → Mistral in the same test run".                                                                                                                                                                                                                                  |
| 7   | Delegated payload carries `model` + `reasoningEffort` from config                                                                                         | PASS   | `send()` sets `payload.model = modelName` and `payload.reasoningEffort = effort` before delegating. Tests "routed payload carries model/reasoningEffort set from config" assert the delegated payload.                                                                                                                 |
| 8   | Router **authoritatively overwrites** caller-supplied `model`/`reasoningEffort`                                                                           | PASS   | Unconditional assignment (no caller-precedence branch). Tests "caller-supplied model/reasoningEffort is overwritten by server config" assert values match server config, not caller values.                                                                                                                            |
| 9   | `LlmModule`: token → `RoutingLLMService` via `useClass`; **no** separate `RoutingLLMService` class-provider entry                                         | PASS   | `llm.module.ts` providers = `[GeminiService, MistralService, { provide: LLM_SERVICE_TOKEN, useClass: RoutingLLMService }]`. Confirmed no standalone `RoutingLLMService` class provider anywhere.                                                                                                                       |
| 10  | `GeminiService` and `MistralService` independently injectable                                                                                             | PASS   | `llm.module.spec.ts` tests `module.get(GeminiService)` and `module.get(MistralService)` both `toBeInstanceOf`.                                                                                                                                                                                                         |
| 11  | `assessor.module.spec.ts` mock returns `MISTRAL_API_KEY` + four model/effort vars                                                                         | PASS   | `getMockConfigValue` returns `MISTRAL_API_KEY` (l.14-15), `DEFAULT_TEXT_TABLE_MODEL`, `DEFAULT_IMAGE_MODEL`, `TEXT_REASONING_EFFORT`, `IMAGE_REASONING_EFFORT` (l.28-35).                                                                                                                                              |

**Supplementary requirements:**

- **Does NOT extend `LLMService`; implements `ILlmService`** — `routing-llm.service.ts` declares `class RoutingLLMService implements ILlmService`. PASS.
- **NO retry logic in router** — `send()` contains no loop/backoff; providers handle their own retries (inherited `LLMService.send`). PASS.
- **`resolveProvider` error at send-time propagates (no catch in router)** — `send()` has no `try/catch`; an unsupported model name throws straight out of `resolveProvider()` and bubbles up. PASS (see Nitpick #3 re: documented surfacing behaviour).
- **`assessor.service.spec.ts` keeps `GeminiService` override, adds `MistralService` override, keeps all prior assertions** — l.144-147 add `MistralService` override alongside existing `GeminiService` override; assertions at l.185-189 and l.226-227 unchanged. PASS.

---

## Code-quality assessment

- **British English JSDoc:** Present and correct throughout `routing-llm.service.ts` (one stray-period typo — see Nitpick #1).
- **Explicit return types:** `send(): Promise<LlmResponse>`, `validateModelConfig(): void` — all present.
- **No `any`:** Grep for `\bany\b` matches only prose in JSDoc ("any model name", "any caller-supplied"); no `any` _type_ usage. No `console.*` anywhere in scope.
- **Complexity ≤ 15:** Both methods are trivial linear control flow; `npm run lint` (which enforces the cognitive-complexity threshold) passes clean.
- **KISS / minimal:** Implementation is minimal and localised — only the required routing + aggregated validation. No speculative abstraction.
- **No scope creep:** Only unit-test/module wiring changed; no E2E changes (Sections 8/9 untouched). Consistent with Section 5 scope.

---

## Findings

### Critical

None.

### Improvement (low priority, optional)

1. **Minor DRY — duplicated supported-prefix string builder.** `RoutingLLMService.validateModelConfig()` re-derives the comma-separated prefix list inline (`SUPPORTED_MODELS.map((entry) => entry.prefix).join(', ')`), which is exactly what the (currently _non-exported_) `formatSupportedPrefixes()` helper in `model-registry.ts` already does. Optional fix: `export function formatSupportedPrefixes()` from `model-registry.ts` and import it into the router. Low severity — it is a one-line error-message fragment, and AGENTS.md permits "duplication over the wrong abstraction"; flagged purely for consistency with the existing helper.

### Nitpick

1. **JSDoc typo** — `src/llm/routing-llm.service.ts` line 46: `see SPEC resolved open question. #8` should read `see SPEC resolved open question #8` (stray period before `#8`).
2. **Error-message wording differs from SPEC example.** Router emits `Unsupported model name(s): <names>. Supported model prefixes: ...` whereas SPEC "Runtime validation" shows `Unsupported model name: '<name>'. Supported model prefixes: ...`. Functionally meets AC1 (lists every unrecognised name + prefixes); the `(s)` plural form and message preamble are stylistic only. Consider aligning to the SPEC phrasing for documentation consistency.
3. **SPEC narrative vs implementation (informational, not an AC violation).** SPEC resolved open question #8 states a runtime `resolveProvider()` failure "is caught by the provider's `mapError()` cascade — surfacing as `InvalidRequestError`." In the actual implementation, `resolveProvider()` is called **before** the `provider.send()` delegation, so if it throws the raw `Error` propagates directly out of `RoutingLLMService.send()` and is _not_ routed through a provider's `mapError()`. The explicit acceptance criterion ("no catch in router; propagates") is satisfied; this note only flags that the documented end-state (`InvalidRequestError`) is not what actually occurs for this path. (In practice the path is also unreachable at runtime because `ConfigService` snapshots env at construction and does not hot-reload.) No code change required; consider a SPEC wording tweak.

---

## Files read

- `/home/developer/AssessmentBot-LLM-Service/ACTION_PLAN.md` (full; Section 5 + Section 1 context)
- `/home/developer/AssessmentBot-LLM-Service/SPEC.md` (full; routing flow, runtime validation, constructor signatures, product decisions #7/#12, backend changes #4/#6, resolved open question #8)
- `/home/developer/AssessmentBot-LLM-Service/src/llm/routing-llm.service.ts` (new, full)
- `/home/developer/AssessmentBot-LLM-Service/src/llm/routing-llm.service.spec.ts` (new, full)
- `/home/developer/AssessmentBot-LLM-Service/src/llm/llm.module.ts` (modified, full)
- `/home/developer/AssessmentBot-LLM-Service/src/llm/llm.module.spec.ts` (modified, full)
- `/home/developer/AssessmentBot-LLM-Service/src/v1/assessor/assessor.module.spec.ts` (modified, full)
- `/home/developer/AssessmentBot-LLM-Service/src/v1/assessor/assessor.service.spec.ts` (modified, full)
- `/home/developer/AssessmentBot-LLM-Service/src/llm/model-registry.ts` (context, full)
- `/home/developer/AssessmentBot-LLM-Service/src/llm/llm.service.interface.ts` (context, full — confirms `ILlmService`, `LLM_SERVICE_TOKEN`, payload fields, `LLMService implements ILlmService`)
- `/home/developer/AssessmentBot-LLM-Service/src/config/config.service.ts` (context — `get<T>` typed return confirms `send()` typing is sound)
- `AGENTS.md` (provided in system context)

---

## Summary

**SECTION 5 REVIEW CLEAN** for merge gating: all 11 acceptance criteria plus the supplementary requirements (no `LLMService` extension, no retry logic, runtime error propagation, spec overrides preserved) are satisfied; all 456 unit tests pass; build, lint, and British-English lint are clean. The only follow-ups are one optional low-priority DRY tidy-up and three non-blocking nitpicks (a JSDoc typo, an error-message wording nuance, and a SPEC/implementation narrative discrepancy about how a runtime `resolveProvider` failure surfaces).
