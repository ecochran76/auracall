# Runtime Inspection Scheduler Authority | 0030-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Plan 0029 added the route-neutral read-only scheduler-authority evaluator.
- The evaluator returns deterministic authority evidence with
  `mutationAllowed: false`.
- No HTTP/operator surface exposed that evaluator before this slice.

## Scope

Expose scheduler-authority evidence through the existing runtime inspection
route without adding scheduler mutation, reassignment, a worker loop, or a new
endpoint.

## Completed

- Added `authority=scheduler` as an opt-in query on
  `GET /v1/runtime-runs/inspect`.
- Added optional `schedulerAuthority` to runtime inspection payloads.
- The payload includes:
  - decision
  - reason
  - active lease posture
  - candidates
  - selected runner evidence
  - local runner context
  - future mutation label
  - `mutationAllowed: false`
- HTTP runtime inspection passes the queried `runnerId` as local context when
  provided, otherwise the server-local runner id when available.
- Updated user-facing endpoint/testing docs for the new opt-in.

## Non-Goals

- no scheduler mutation
- no automatic reassignment
- no lease acquisition
- no step execution
- no worker loop
- no new HTTP route
- no CLI formatting change in this slice

## Acceptance Criteria

- [x] runtime inspection exposes scheduler authority only when explicitly
  requested
- [x] the projection remains read-only
- [x] expired stale lease ownership can be reported as potentially
  reassignable without mutating the stored lease
- [x] the route can still combine normal queue/runner inspection with
  scheduler-authority evidence
- [x] user-facing docs describe the opt-in and read-only posture

## Validation

- `pnpm vitest run tests/runtime.schedulerAuthority.test.ts tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts --maxWorkers 1`
- `pnpm run check`

## Next Slice

- Plan 0031 added CLI formatting for the existing runtime inspection command.
- Reassess scheduler-authority mutation design next.
- Do not add assignment or reassignment mutation without a new bounded plan.
