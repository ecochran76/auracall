# Next Execution Plan (2026-03-31)

## Current status

ChatGPT browser functionality is now materially complete for:
- project lifecycle (create/read/list/update/delete, source add/remove),
- root conversation CRUD (with latest row-action + rate-limit hardening),
- conversation source/tool surfaces,
- artifact extraction for core artifact families,
- and service-volatility extraction for a substantial ChatGPT pilot slice (`configs/auracall.services.json` + manifest-backed helpers).

The remaining work is to complete the last high-value reliability/refactor slices without introducing behavioral drift.

## Execution principle

- Work in small, bounded slices.
- Keep behavior ownership where it is currently stable in providers and browser-service:
  - keep workflow orchestration in code,
  - keep volatile service labels/selectors/models/features/artifact hints in manifest/config.
- Don’t move to next slice until the current slice acceptance gate is green.
- Respect observed runtime constraints:
  - ChatGPT rate limits are environment-driven,
  - do not trigger "Answer now",
  - avoid dense write bursts when cooling window is active.

## Slice plan (order: highest confidence first)

### 1) Lock service-volatility extraction completion (low-risk, high leverage)

Goal: move remaining ChatGPT static-config extraction to a typed manifest architecture without changing workflow behavior.

Deliverables
- Manifest shape hardening (`loader + schema + validation`) and compatibility shim for the existing `configs/auracall.services.json` path.
- Finish any remaining low-risk static extraction points still in code but already declared in `service-volatility-inventory`.
- Keep behavior/decision code in `chatgptAdapter.ts` and service providers.

Acceptance
- `pnpm vitest run tests/services/registry.test.ts`
- `pnpm vitest run tests/browser/chatgptProvider.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptComposerTool.test.ts`
- `pnpm run check`
- `DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx scripts/chatgpt-acceptance.ts --phase project --state-file docs/dev/tmp/chatgpt-acceptance-state.json`

### 2) Browser profile family hardening (deterministic launch + naming clarity)

Goal: make Aura-Call profile, browser family, service binding, and launch plan deterministic and explicit.

Deliverables
- typed resolve steps (`Aura-Call profile -> browser family -> service binding -> launch plan`) with explicit display/runtime values.
- default values removed from opportunistic environment branching where possible (`display`, executable, managed/source profile path).
- explicit first-class profile family for "WSL-Chrome-2" (secondary account profile set).

Acceptance
- unit coverage for profile-browser-service binding order.
- smoke run default WSL profile with existing non-Pro account.
- smoke run secondary `wsl-chrome-2` profile with clean startup (no stale modal/cross-profile bleed).

### 3) Service-volatility workflow boundary (ChatGPT behavior slice)

Goal: keep the manifest extraction boundary clean and move reusable mechanics out of providers only when they are truly shared.

Deliverables
- convert reusable menu/row/action diagnostics into package-owned helpers only where a second provider/use case justifies extraction.
- keep single-provider heuristics and workflow sequencing in provider code.
- refresh backlog docs with concrete extraction candidates and why extraction is deferred/permitted.

Acceptance
- provider flow tests for any touched shared helper.
- ChatGPT smoke path remains green on the targeted phases.

### 4) Completion of production-facing polish and reliability gates

Goal: keep MVP criteria for ChatGPT browser delivery stable under constrained live conditions.

Deliverables
- codify a minimal acceptance matrix and run it from stateful resume files only.
- keep bounded live artifact checks:
  - one image path,
  - one canvas/textdoc path,
  - one workbook-like/CSV path.
- expand diagnostics where stale/ambiguous modal or rename timing remains.

Acceptance
- `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProvider.test.ts tests/browser/chatgptComposerTool.test.ts tests/browser/llmServiceRateLimit.test.ts`
- `pnpm run check`
- guarded live smoke at scoped phase granularity (project -> root -> project-followups), stopping on first real blocker with diagnostics.

## Cross-cutting work order

- Any change that touches config parsing and profile resolution goes through `docs/dev/service-volatility-refactor-plan.md` and `docs/dev/browser-profile-family-refactor-plan.md`.
- Any change that risks acceptance regressions adds/updates:
  - `docs/dev/dev-journal.md`,
  - `docs/dev-fixes-log.md` (only if behavior changed),
  - and the run log/state file that triggered the run.

## Not in scope this phase

- full Gemini/Grok workflow migrations,
- new artifact subtypes without repeatable live shape,
- nonessential Pro-account behavior while the non-Pro WSL profile remains unstable from rate-limit cadence.

## Immediate next 3 checkpoints

1. Freeze this as the active execution slice board and update `ROADMAP.md`.
2. Decide and run Slice 1 acceptance gates before touching any new profile-family behavior.
3. Open a planning handoff in dev-journal with the current branch state and next slice owner.
