# Local-Owned Active Lease Drain | 0035-2026-04-21

State: CLOSED
Lane: P01

## Scope

Implement the Plan 0034 follow-through path: targeted drain may execute a
runnable run when the active lease is already owned by the configured
server-local runner.

## Changes

- Added `existingLeaseId` support to `executeStoredExecutionRunOnce(...)`.
- Existing-lease execution verifies that the active lease is still present and
  owned by the requested execution owner.
- Existing-lease execution heartbeats the lease before starting the runnable
  step, then releases the same lease after completion/failure/cancellation.
- `ExecutionServiceHost.drainRunsOnce(...)` now treats a runnable active lease
  owned by the local execution owner as executable.
- Targeted drain still skips fresh active leases owned by other runners.
- Runner-backed local-owned lease execution still verifies the configured
  runner record is active, fresh, and affinity-compatible.
- No fleet scheduler, background worker loop, non-local assignment, new HTTP
  route, or browser dispatcher bypass was added.

## Behavior

`schedulerControl.action = "claim-local-run"` still only claims or reassigns a
single run to the server-local runner. It does not execute the run by itself.

Operators can follow a successful claim with:

```json
{
  "runControl": {
    "action": "drain-run",
    "runId": "run_123"
  }
}
```

When the active lease is owned by the same server-local runner and the run has
a runnable step, targeted drain reuses the existing lease and executes one host
pass. A foreign active lease remains skipped.

## Validation

- `pnpm vitest run tests/runtime.serviceHost.test.ts --testNamePattern "scheduler-claimed|foreign active lease|scheduler" --maxWorkers 1`
- `pnpm vitest run tests/runtime.serviceHost.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
- `pnpm vitest run tests/runtime.runner.test.ts --maxWorkers 1`
- `pnpm vitest run tests/browser-service/portSelection.test.ts --maxWorkers 1`
- `pnpm test`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 35`
- `git diff --check`

## Next Slice

Run the broader runtime/http validation, then reassess whether this closes the
current scheduler local-control phase or needs one operator-facing compound
control later.
