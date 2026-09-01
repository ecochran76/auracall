# History Materialization Fairness | 0324-2026-09-01

State: OPEN
Lane: P17
Operational state: IMPLEMENTING_PROVIDER_FREE
Branch: fix/plan0324-history-materialization-fairness
Target: main
Integration: merge
Revision: 1 | 2026-09-01

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
- Source implementation and provider-free validation remain pending.

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
