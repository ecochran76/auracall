# Runner Topology Readiness Status | 0027-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Plan 0026 selected a read-only runner topology/readiness seam before any
  scheduler, reassignment loop, background worker pool, or parallel execution
  work.
- `ExecutionServiceHost` already owns route-neutral local runner lifecycle,
  drain execution, recovery, and operator-control mutations.
- `api serve` already registers one local runner and projects runner status
  through `/status`.

## Scope

Add one read-only topology projection:

- service-host-owned runner topology/readiness summary
- `/status.runnerTopology` projection for local API server status
- tests proving topology readback does not mutate runner state or transfer
  claim authority to another runner

## Non-Goals

- no scheduler
- no worker daemon
- no automatic reassignment to another eligible runner
- no lease acquisition from topology readback
- no step execution from topology readback
- no parallel execution

## Completed

- Added `ExecutionServiceHost.summarizeRunnerTopology()`.
- The summary includes:
  - `localExecutionOwnerRunnerId`
  - generated timestamp
  - runner id, host id, status, heartbeat freshness, activity, services,
    runtime/browser profiles, service-account ids, browser capability, and
    eligibility note
  - aggregate metrics for total, active, stale, fresh, expired, and
    browser-capable runners
- Added `/status.runnerTopology`.
- Kept `/status.localClaimSummary` scoped to the server-local runner even when
  another runner is also eligible.

## Acceptance Criteria

- [x] `ExecutionServiceHost` owns the route-neutral topology projection.
- [x] `/status` exposes bounded runner topology/readiness state.
- [x] topology readback preserves the local server's configured execution
  owner.
- [x] tests prove expired active runners are reported as expired without being
  marked stale by the topology projection.
- [x] tests prove alternate eligible runners remain read-only topology
  evidence, not selected execution owners.

## Validation

- `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
- `pnpm run check`
