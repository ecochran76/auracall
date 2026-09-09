# History Materialization Fairness | 0324-2026-09-01

State: CLOSED
Lane: P17
Operational state: INTEGRATED_AWAITING_INSTALLED_ADOPTION
Branch: fix/plan0324-history-materialization-fairness
Target: main
Integration: merge
Revision: 3 | 2026-09-01

## Stable Objective

Stop retryable no-asset conversations from monopolizing reconciliation, keep
synthetic skip evidence outside the transfer budget, and make live-follow
completion depend on retrievable rather than raw missing-local assets.

## Current State

- Live follow is operator-paused for AuraCall runtime profiles `default` and
  `wsl-chrome-3`; this plan does not resume either target.
- The latest eight terminal jobs for each target materialized zero assets. The
  same front conversations repeat because synthetic `no-materializable-*`
  entries consume the transfer budget while remaining correctly retryable.
- Raw missing-local counts also retain unsupported metadata-only and static
  false-positive assets after the actionable recovery inventory is smaller.
- Source checkpoint `c8cc682e` implements one durable job-store snapshot,
  concrete-asset transfer accounting, never/least-recent retry ordering, and
  recovery-planner gating at both live-follow materialization queue seams.
- Provider-free acceptance passes 166 focused/adjacent tests plus five HTTP
  wiring tests, typecheck, production build, scoped zero-warning Biome lint,
  CodeGraph sync/readback, diff hygiene, and a zero-error plan-library audit.
- Installed adoption, API-service restart, and any live proof remain separate
  effect work. Both operator-paused live-follow targets remain paused.
- Merge receipt `87fec070` is published on `main`. The supported installed
  adoption gate was evaluated without mutation and stopped on the existing
  `auracall-gemini-pro` `manual_clear_required` / `google-sorry` provider
  guard; no install, restart, or canary ran.

## Execution Graph

1. Freeze consecutive-job regressions for retry rotation and transfer-budget
   accounting at the public history-materialization service seam.
2. Implement durable fair ordering from prior attempt receipts and count only
   concrete provider asset attempts against the transfer budget.
3. Freeze and repair the live-follow completion decision so only retrievable
   missing assets keep materialization work open.
4. Run focused and adjacent provider-free tests, typecheck, build, scoped lint,
   CodeGraph readback, and planning audits.

## Acceptance Criteria

- `HMF-R1`: consecutive reconciliation jobs advance beyond retryable
  no-materializable front candidates without making those candidates terminal.
- `HMF-R2`: synthetic no-materializable and known-files-excluded evidence does
  not consume the concrete asset-transfer budget.
- `HMF-R3`: live-follow completion remains open for retrievable assets and does
  not remain open solely for unsupported metadata-only or static false-positive
  missing-local assets.
- `HMF-R4`: focused runtime and account-mirror suites, typecheck, production
  build, scoped lint, CodeGraph readback, and planning audits pass.

## Bounds

- No installed-runtime mutation, service restart, browser/provider action,
  scheduler resume, provider-guard mutation, or live canary.
- Preserve retryability for provider assets whose current conversation detail
  exposes no downloadable asset.
- Do not delete archive, catalog, job, or account-mirror evidence.
- Exclude unrelated media-fixture cleanup unless it is required to satisfy the
  frozen fairness or completion contracts.

## Definition Of Done

All four criteria have provider-free evidence on the plan branch, docs record
the new semantics, and installed adoption plus any live proof remain explicitly
separate effect work.

## Closeout Evidence

- `HMF-R1`: two consecutive public-service jobs advance from conversations
  one/two to three/four while preserving skipped zero-asset attempts as
  retryable durable receipts.
- `HMF-R2`: four conversations run under `maxItems: 4` despite two synthetic
  entries apiece; every receipt reports `assetsAttempted: 0`.
- `HMF-R3`: a five-asset retrievable backlog queues materialization, while the
  same raw inventory with zero retrievable and zero deferred assets proceeds to
  ordinary cadence without creating a history-materialization job.
- `HMF-R4`: checkpoint `c8cc682e` passed the complete provider-free gate named
  in Current State. No live, installed-runtime, scheduler, browser, or provider
  action was used as evidence.
- Integration iteration 1 repeated the same 166 focused/adjacent tests, five
  HTTP wiring tests, typecheck, build, scoped lint, diff hygiene, and zero-error
  plan audit against pending merge `87fec070`; all passed before `main` was
  published.
