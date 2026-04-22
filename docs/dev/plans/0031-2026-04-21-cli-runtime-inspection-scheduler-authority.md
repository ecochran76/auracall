# CLI Runtime Inspection Scheduler Authority | 0031-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Plan 0030 exposed scheduler-authority evidence through HTTP runtime
  inspection as an explicit `authority=scheduler` opt-in.
- `auracall api inspect-run` already formats queue projection, runner
  evaluation, and optional service-state probe evidence.
- The CLI did not yet request or render scheduler-authority evidence.

## Scope

Expose the existing read-only scheduler-authority inspection evidence through
the existing CLI runtime inspection command.

## Completed

- Added `--authority scheduler` to `auracall api inspect-run`.
- Passed `includeSchedulerAuthority` through to `inspectRuntimeRun`.
- Used the queried `--runner-id` as the local scheduler-authority context when
  provided.
- Added a compact `Scheduler authority` section to the human formatter:
  - decision
  - reason
  - mutation allowed
  - selected runner
  - local runner
  - future mutation
  - candidate count
  - active lease posture when present
- Preserved JSON output as the full machine-readable payload.

## Non-Goals

- no scheduler mutation
- no reassignment
- no lease acquisition
- no step execution
- no new CLI command
- no HTTP contract change

## Acceptance Criteria

- [x] scheduler-authority CLI output is opt-in
- [x] formatted output clearly says mutation is not allowed
- [x] active lease posture is visible when scheduler authority reports it
- [x] existing runtime inspection formatting remains intact
- [x] JSON output continues to return the underlying payload

## Validation

- `pnpm vitest run tests/cli/runtimeInspectionCommand.test.ts --maxWorkers 1`
- `pnpm run check`
- `pnpm exec biome lint src/cli/runtimeInspectionCommand.ts tests/cli/runtimeInspectionCommand.test.ts bin/auracall.ts --max-diagnostics 40`

## Next Slice

- Plan 0032 closed the scheduler mutation design checkpoint.
- Next implementation target is
  `schedulerControl.action = "claim-local-run"` under `ExecutionServiceHost`.
