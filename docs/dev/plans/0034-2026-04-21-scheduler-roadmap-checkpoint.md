# Scheduler Roadmap Checkpoint | 0034-2026-04-21

State: CLOSED
Lane: P01

## Scope

Reassess the scheduler lane after Plan 0033 added explicit local claim control.

This checkpoint chooses the next bounded implementation target. It does not add
runtime behavior.

## Current State

- `ExecutionServiceHost` owns
  `schedulerControl.action = "claim-local-run"`.
- The mutation is explicit, single-run, server-local, and gated by
  `evaluateStoredExecutionRunSchedulerAuthority(...)`.
- Existing `POST /status` only maps the scheduler-control payload/result.
- A successful local claim can leave the run protected by a lease owned by the
  server-local runner.
- The existing targeted drain path treats active leases as busy, so a claimed
  run does not yet have a direct execution follow-through path.

## Decision

- Do not add a fleet scheduler, background worker loop, non-local assignment,
  or parallel execution yet.
- Do not add a release-and-reclaim workaround after `claim-local-run`; that
  would weaken the lease authority that the claim just established.
- The next implementation slice should make targeted drain able to execute a
  run whose active lease is already owned by the same server-local runner.
- Preserve the current execution path:
  - `ExecutionServiceHost` owns route-neutral control
  - stored runtime execution owns step mutation
  - browser-backed work still routes through the browser-service dispatcher
  - HTTP remains a mapper

## Acceptance Criteria For Next Slice

- `runControl.action = "drain-run"` can execute a runnable run when the active
  lease is owned by the configured server-local runner.
- Fresh active leases owned by another runner still block execution.
- Expired stale/missing-owner lease reassignment remains under explicit
  scheduler control, not generic drain.
- The local-owned active lease is reused or heartbeated without creating a
  conflicting lease.
- Browser-backed execution still uses the normal stored-step executor and
  browser-service dispatcher path.
- Tests cover local-owned active lease execution, foreign active lease skip,
  and unchanged no-lease drain behavior.

## Validation

- `pnpm run plans:audit -- --keep 34`
- `git diff --check`

## Next Slice

Implement local-owned active lease drain semantics under `ExecutionServiceHost`
without adding scheduler loops or new public routes.

Completed by
`docs/dev/plans/0035-2026-04-21-local-owned-active-lease-drain.md`.
