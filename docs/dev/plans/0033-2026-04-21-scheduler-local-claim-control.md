# Scheduler Local Claim Control | 0033-2026-04-21

State: CLOSED
Lane: P01

## Scope

Implement the first scheduler mutation from Plan 0032:
`schedulerControl.action = "claim-local-run"`.

The mutation is explicit operator control for one run. It is not a scheduler
loop, worker pool, fleet assignment surface, or browser dispatcher bypass.

## Changes

- Added route-neutral scheduler control under `ExecutionServiceHost`.
- Added `schedulerControl` mapping to existing `POST /status`.
- Kept HTTP as a payload/result mapper; runtime mutation stays below the
  route.
- Gated every mutation through
  `evaluateStoredExecutionRunSchedulerAuthority(...)`.
- Scoped v1 mutation to the configured server-local runner.
- Persisted claim/reassignment as one bounded bundle write with revision
  checks and a scheduler-control audit event.

## Behavior

Accepted payload:

```json
{
  "schedulerControl": {
    "action": "claim-local-run",
    "runId": "run_123",
    "schedulerId": "operator:local-status"
  }
}
```

Success returns `kind = "scheduler-control"` and either:

- `status = "claimed"` for no-lease local claims
- `status = "reassigned"` for expired stale/missing-owner lease reassignment

Rejected cases return `409` through HTTP and do not mutate:

- selected runner is not the server-local runner
- fresh active lease exists
- active lease is expired but owner runner is still active
- local runner lacks required capability/account/browser affinity
- run is idle, blocked, human-paused, not ready, or missing runnable work
- state changes before the revision-checked persist

Missing runs return `404`.

## Validation

- `pnpm vitest run tests/runtime.serviceHost.test.ts --testNamePattern "scheduler"`
- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "scheduler-authorized local run through POST /status|scheduler authority"`
- `pnpm vitest run tests/runtime.serviceHost.test.ts tests/runtime.schedulerAuthority.test.ts tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
- `pnpm test`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 33`
- `git diff --check`

## Next Slice

Pause for a scheduler roadmap checkpoint before deciding whether to add
execution follow-through after explicit local claim.
