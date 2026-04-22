# Status Runner Topology Compaction | 0047-2026-04-22

State: CLOSED
Lane: P01

## Scope

Reduce default `/status` noise from accumulated stale runner records while
preserving read-only runner topology metrics and a forensic escape hatch.

## Current State

- Long-lived dogfood environments can accumulate hundreds of stale runner
  records.
- Plain `/status` previously returned every stored runner entry under
  `runnerTopology.runners`, which made the active local runner and current
  readiness state hard to see.
- The stored runner history is still useful for debugging and should not be
  deleted or mutated by a read-only status request.

## Change

- Plain `GET /status` now compacts `runnerTopology.runners` to:
  - the local execution owner
  - fresh runners
  - active runners
- `runnerTopology.metrics` still counts all stored runners.
- `runnerTopology.metrics` now also reports:
  - `displayedRunnerCount`
  - `omittedRunnerCount`
  - `omittedStaleRunnerCount`
  - `omittedExpiredRunnerCount`
- `GET /status?runnerTopology=full` returns the complete stored runner list.

## Acceptance Criteria

- Default `/status` stays readable in long-lived dogfood environments.
- Full topology readback remains available without changing stored runner
  state.
- Topology readback remains read-only: no claim selection, lease acquisition,
  step execution, reassignment, or stale-runner mutation.
- Operator docs describe the compact default and full escape hatch.

## Validation

- `pnpm vitest run tests/http.responsesServer.test.ts tests/runtime.serviceHost.test.ts`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 47`
- `git diff --check`
- Installed runtime smoke:
  - `ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 DISPLAY=:0.0 ~/.local/bin/auracall api serve --port 8099`
  - `curl -sS "http://127.0.0.1:8099/status"`
  - `curl -sS "http://127.0.0.1:8099/status?runnerTopology=full"`
