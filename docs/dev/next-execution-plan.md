# Next Execution Plan (2026-03-31)

## Current status

ChatGPT browser functionality is now materially complete for:
- project lifecycle (create/read/list/update/delete, source add/remove),
- root conversation CRUD (with latest row-action + rate-limit hardening),
- conversation source/tool surfaces,
- artifact extraction for core artifact families,
- and service-volatility extraction for a substantial ChatGPT pilot slice (`configs/auracall.services.json` + manifest-backed helpers).

The browser-profile-family refactor has also crossed its useful Phase 1 boundary:
- typed resolved objects are in place,
- launch-profile consumption now reaches config, browser-service, doctor, login,
  and runtime bootstrap,
- and the remaining work in that track is now cleanup and secondary-profile UX,
  not core derivation ambiguity.

The remaining work is to complete the last high-value reliability/refactor slices without introducing behavioral drift.

A new planning constraint now applies:
- the larger config-model refactor should be designed before agents/teams are
  implemented
- but it does not block small reliability or hardening slices in the meantime

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

### 1) Browser profile family Phase 2 cleanup (secondary-profile clarity)

Goal: finish the high-value cleanup after the Phase 1 refactor seam landed.

Deliverables
- explicit first-class browser-family config for secondary WSL Chrome / `wsl-chrome-2`
- docs/schema clarity around:
  - Aura-Call profile
  - browser family
  - source browser profile
  - managed browser profile
- confirm default WSL and secondary WSL families no longer depend on raw-path
  teaching or ambient shell assumptions

Acceptance
- `pnpm vitest run tests/browser/profileResolution.test.ts tests/browser/profileConfig.test.ts tests/browser/config.test.ts tests/browser/browserService.test.ts tests/browser/login.test.ts tests/browser/profileDoctor.test.ts --maxWorkers 1`
- `pnpm run check`
- smoke run default WSL profile with existing non-Pro account
- smoke run secondary `wsl-chrome-2` profile with clean startup and no cross-profile bleed

### 2) Config-model refactor planning

Goal: define the next stable config shape before agent/team work starts.

Deliverables
- explicit plan for:
  - browser profiles
  - AuraCall runtime profiles
  - agents
  - teams
- sequencing guidance for compatibility shims and deferred code renames
- acceptance criteria for the future config migration

Acceptance
- plan captured in `docs/dev/config-model-refactor-plan.md`
- linked from `ROADMAP.md` and kept consistent with
  `docs/dev/browser-profile-family-refactor-plan.md`
- reserved schema/docs landing zone exists for top-level `agents` and `teams`

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

1. Keep the browser-profile-family work at bounded Phase 2 cleanup, not open-ended runtime churn.
2. Finish the config-model refactor planning before any agent/team implementation starts.
3. Continue small reliability and polish slices in parallel where they do not prejudice the future config migration.
