# Read-Only Scheduler Authority Evaluator | 0029-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Plan 0028 defined the scheduler authority boundary:
  - topology visibility is not assignment authority
  - claim-candidate ordering is not assignment authority
  - `api serve` remains a local runner, not a fleet scheduler
  - no scheduler mutation or worker loop should exist before read-only
    authority evaluation

## Scope

Add a route-neutral read-only evaluator that explains what scheduler authority
would allow without performing any mutation.

## Completed

- Added `src/runtime/schedulerAuthority.ts`.
- Added `evaluateStoredExecutionRunSchedulerAuthority(...)`.
- The evaluator consumes:
  - runtime run queue projection
  - active lease state
  - persisted runner records
  - deterministic claim-candidate ordering
  - configured affinity
  - optional local runner identity
- The evaluator returns:
  - one deterministic decision
  - reason
  - selected runner id when there is a read-only candidate
  - local runner id
  - active lease posture
  - candidate summary
  - future mutation label
  - `mutationAllowed: false`

## Decisions Covered

- `claimable-by-local-runner`
- `claimable-by-other-runner`
- `reassignable-after-expired-lease`
- `blocked-active-lease`
- `blocked-affinity`
- `blocked-missing-capability`
- `not-ready`
- `no-op`

## Non-Goals

- no scheduler mutation
- no worker loop
- no automatic reassignment
- no lease acquisition
- no step execution
- no HTTP surface in this slice

## Acceptance Criteria

- [x] evaluator lives below HTTP and CLI surfaces
- [x] evaluator never persists runs, runners, leases, or steps
- [x] fresh active leases owned by fresh active runners block reassignment
- [x] expired stale lease owners are only classified as potentially
  reassignable
- [x] alternate eligible runners do not become selected execution owners
  without scheduler authority
- [x] missing browser capability is reported as blocked capability

## Validation

- `pnpm vitest run tests/runtime.schedulerAuthority.test.ts tests/runtime.claims.test.ts tests/runtime.inspection.test.ts --maxWorkers 1`
- `pnpm run check`
- `pnpm exec biome lint src/runtime/schedulerAuthority.ts tests/runtime.schedulerAuthority.test.ts --max-diagnostics 80`
- `pnpm run plans:audit`
- `git diff --check`

## Follow-Up

- Plan 0030 exposed this evaluator through
  `GET /v1/runtime-runs/inspect?...&authority=scheduler` as read-only
  `inspection.schedulerAuthority`.
