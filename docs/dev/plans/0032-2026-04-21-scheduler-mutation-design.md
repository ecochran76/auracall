# Scheduler Mutation Design | 0032-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Read-only scheduler-authority evidence is live in:
  - route-neutral runtime evaluator:
    `evaluateStoredExecutionRunSchedulerAuthority(...)`
  - HTTP runtime inspection:
    `GET /v1/runtime-runs/inspect?...&authority=scheduler`
  - CLI runtime inspection:
    `auracall api inspect-run ... --authority scheduler`
- The evidence chain reports deterministic decisions with
  `mutationAllowed: false`.
- Existing service-host controls can repair locally reclaimable stale-heartbeat
  leases and can run targeted local drain, but there is still no explicit
  scheduler-authority mutation path.

## Scope

Define the first allowed scheduler-mutation shape before implementation.

This is a design/checkpoint plan only. It does not add runtime behavior.

## Decision

The first scheduler mutation should be a single-run explicit operator-control
path that is gated by the existing read-only evaluator and scoped to the
server-local runner.

It is not a fleet scheduler.

## Authority Model

The mutation caller must provide an explicit scheduler-authority context:

- `schedulerId`
- `schedulerScope = "single-run"`
- `schedulerMode = "operator-local"`
- `runId`

The service host owns the mutation because it already owns route-neutral
operator control, local runner identity, lease repair, and targeted drain.

HTTP may expose this later through `POST /status`, but HTTP must remain a
transport mapper. Runtime mutation stays below the route.

## First Mutation Shape

Name the first implementation target:

- `schedulerControl.action = "claim-local-run"`

The action may do exactly one of these:

- if the evaluator reports `futureMutation = "local-claim"` for the
  server-local runner:
  - acquire a lease for the server-local runner using the existing lease
    acquisition semantics
- if the evaluator reports
  `futureMutation = "scheduler-reassign-expired-lease"` and the selected
  runner is the server-local runner:
  - expire the stale/missing owner's active lease
  - acquire a new lease for the server-local runner

The action must reject:

- `claimable-by-other-runner`
- fresh active leases
- expired active leases whose owner runner is still active
- missing browser/service/account capability
- human-blocked or not-ready runs
- any selected runner other than the server-local runner

## Required Mutation Sequence

The implementation must use a re-read and compare-and-persist sequence:

1. Expire stale runner records for liveness.
2. Inspect the run and runner set.
3. Evaluate scheduler authority.
4. Reject unless the evaluator reports an allowed local mutation.
5. Re-read the stored run immediately before mutating.
6. For reassignment:
   - expire the existing active lease only if it is still the lease evaluated
   - acquire a new lease for the server-local runner
7. Persist with revision checks.
8. Record a bounded runtime event that identifies:
   - scheduler id
   - action
   - previous lease id/owner when reassignment occurred
   - new lease id/owner
   - authority decision used

If any state changed between evaluation and persistence, return a conflict and
do not partially mutate.

## Browser Dispatcher Rule

Scheduler mutation may claim browser-backed work, but it must not execute the
browser step directly and must not bypass the browser-service dispatcher.

Browser dispatch remains owned by the normal stored-step executor path. That
path must still acquire the managed-browser-profile operation lease before
navigation, prompt submission, uploads, or response capture.

## Operator Surface

The first operator surface should be existing `POST /status`, not a new route.

Candidate payload:

```json
{
  "schedulerControl": {
    "action": "claim-local-run",
    "runId": "run_123",
    "schedulerId": "operator:local-status"
  }
}
```

Response shape should include:

- `kind = "scheduler-control"`
- `action = "claim-local-run"`
- `runId`
- `status = "claimed" | "reassigned" | "blocked" | "conflict" | "not-found"`
- `mutationAllowed`
- `decision`
- `reason`
- `previousLeaseId`
- `previousOwnerId`
- `newLeaseId`
- `newOwnerId`

## Non-Goals

- no background scheduler loop
- no worker pool
- no assignment to non-local runners
- no fleet scheduler authority
- no parallel execution
- no new HTTP route
- no automatic reassignment from plain inspection
- no browser dispatcher bypass

## Acceptance Criteria For Implementation

- fresh active leases block mutation
- expired active leases owned by still-active runners block mutation
- expired stale/missing-owner leases can be reassigned only to the server-local
  runner
- claimable local runs can be claimed only by the server-local runner
- eligible alternate runners are reported but not assigned
- capability/account/browser-affinity mismatches block mutation
- mutation uses persisted revision checks and returns conflict on stale input
- reassignment emits a bounded runtime event
- HTTP only maps payload/result; `ExecutionServiceHost` owns the route-neutral
  mutation
- browser-backed claims do not execute browser work inside scheduler control

## Validation For This Design Slice

- `pnpm run plans:audit`
- `git diff --check`

## Next Slice

Implemented by
`docs/dev/plans/0033-2026-04-21-scheduler-local-claim-control.md`.
