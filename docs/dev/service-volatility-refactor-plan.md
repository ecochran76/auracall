# Service Volatility Refactor Plan

## Purpose

Move volatile, service-specific data out of core TypeScript and into typed, checked-in service manifests without turning Aura-Call into an untyped rules engine.

This is a repo-wide implementation plan. It is not a substitute for service-specific execution plans. Before any service migration starts, add a dedicated service plan using [service-volatility-service-plan-template.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-service-plan-template.md).

## Problem Statement

Too much dynamic service knowledge is embedded directly in code:

- model aliases and browser picker labels
- URL/route conventions
- selector families and text-match dictionaries
- feature/app capability fingerprints
- artifact classification hints
- rate-limit/backoff policy knobs

That creates three problems:

1. Normal upstream service churn looks like product logic churn.
2. Small surface updates require code edits, retesting, and redeploys.
3. It is hard to tell which adapter behavior is durable workflow logic versus volatile service data.

## Goals

- Externalize service volatility into typed manifests.
- Keep workflow orchestration, recovery, and verification in code.
- Make the migration incremental and reversible.
- Require regression coverage at every phase and every service slice.
- Preserve current behavior unless a service-specific plan explicitly changes it.

## Non-Goals

- Do not move every heuristic into config.
- Do not make manifests user-editable runtime plugins in phase 1.
- Do not refactor all services in one branch/landing.
- Do not weaken acceptance coverage during migration.

## Proposed Output

### Manifest Scope

Service manifests should eventually own:

- model aliases and default browser label mappings
- service URLs, compatible hosts, and route templates
- selector families and known label synonyms
- feature/app tokens used for capability signatures
- artifact classification tables
- rate-limit and quiet-window tuning constants

### Code Scope

Code should continue to own:

- multi-step workflows
- fallback order and recovery strategy
- DOM probing and extraction execution
- verification rules and idempotency checks
- CLI behavior and cache policy

## Proposed File Shape

This is the target direction, not a required final path:

- `configs/services/chatgpt.json5`
- `configs/services/grok.json5`
- `configs/services/gemini.json5`
- `src/services/manifest/schema.ts`
- `src/services/manifest/loader.ts`
- `src/services/manifest/types.ts`

The important constraint is typed loading plus schema validation. The exact folder can change if packaging concerns push this into `packages/browser-service`.

## Execution Phases

### Phase 0: Inventory and Boundaries

- Inventory every hard-coded volatile constant per service.
- Classify each item as:
  - manifest-owned
  - code-owned
  - unresolved
- Produce a field map from current code locations to proposed manifest sections.

Exit criteria:
- inventory complete for ChatGPT, Grok, and Gemini
- no ambiguous ownership left for the first migration slice

### Phase 1: Manifest Core

- Add typed manifest schema and loader.
- Support checked-in default manifests only.
- Fail closed on invalid manifests.
- Add snapshot tests for loader/schema behavior.

Exit criteria:
- manifests can be loaded deterministically in tests
- invalid manifests fail with actionable diagnostics

### Phase 2: Low-Risk Extraction

- Move model aliasing, route templates, compatible hosts, and static label maps first.
- Keep current adapter logic reading from manifests.
- Do not move complex workflows yet.

Exit criteria:
- no behavior drift in current resolver/browser tests
- explicit regression tests cover manifest-driven alias resolution

### Phase 3: Feature and Capability Extraction

- Move known feature keys and app token dictionaries into manifests.
- Feed cache-signature logic from manifest-owned feature definitions.
- Keep actual probe execution in code.

Exit criteria:
- cache invalidation behavior is preserved or improved
- feature detection tests are stable and deterministic

### Phase 4: Selector/Text Dictionary Extraction

- Move service-specific selector families and menu/button synonym sets into manifests.
- Keep fallback order in code.
- Add targeted adapter tests to prevent selector regressions.

Exit criteria:
- provider-local constants are materially reduced
- acceptance bars remain green

### Phase 5: Artifact and Rate-Limit Tuning Extraction

- Move artifact kind lookup tables and rate-limit tuning knobs into manifests.
- Keep materialization transport logic and recovery loops in code.

Exit criteria:
- artifact classification remains correct on representative samples
- rate-limit guard behavior still passes targeted regression coverage

### Phase 6: Service-by-Service Completion

Each service migrates independently under its own plan:

- ChatGPT
- Grok
- Gemini

Mandatory rule:
- do not start implementation for a service until its plan doc exists and names the exact regression suite and acceptance gate

## Recommended Migration Order

Recommended order for implementation slices:

1. ChatGPT pilot, but only for low-risk manifest fields first
2. Grok once the manifest core is proven
3. Gemini after the manifest pattern is stable

Reasoning:
- ChatGPT has the highest volatility pressure, so it should shape the manifest design.
- ChatGPT is also the riskiest full migration, so its first slice should be narrow.
- Grok and Gemini can then reuse the proven schema and test discipline.

## Regression Strategy

Regression testing is part of the refactor, not a follow-up.

### Repo-Wide Gates

- `pnpm run check`
- targeted Vitest suites for every touched area
- schema/loader tests for manifests
- unchanged behavior for current CLI defaults unless intentionally changed

### Service Gates

Every service plan must name:

- unit tests to update/add
- provider adapter tests to run
- cache tests to run
- smoke/acceptance scripts required before merge

### Acceptance Rule

No service migration lands unless:

- the targeted unit suite is green
- the service-specific acceptance bar is green
- docs are updated for any changed operator-facing behavior

## Change Management Rules

- Manifests must be schema-validated and versioned.
- Manifest fields should be additive before they are subtractive.
- Avoid mixing stable product config with volatile checked-in manifests.
- Keep fallback behavior in code until at least two services prove the manifest field is stable.
- Prefer one service field family at a time over giant manifest dumps.

## Deliverables

- top-level roadmap mention
- repo-wide plan
- hard-coded volatility inventory
- service-plan template
- manifest schema/loader design
- service-by-service migration plans and regression matrices

## Immediate Next Steps

1. Keep this plan as the controlling repo-wide document.
2. Create a hard-coded volatility inventory for ChatGPT/Grok/Gemini.
   - Current inventory doc: [service-volatility-inventory.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-inventory.md)
3. Design the manifest schema around the inventory, not around guesses.
4. Before implementation starts, add the first service-specific plan for the chosen pilot slice.
   - Current first pilot: [service-volatility-chatgpt-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-chatgpt-plan.md)
   - Current ChatGPT follow-on behavior/workflow plan: [service-volatility-chatgpt-workflow-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-chatgpt-workflow-plan.md)
