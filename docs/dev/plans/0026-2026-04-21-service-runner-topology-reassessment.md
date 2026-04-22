# Service/Runner Topology Reassessment | 0026-2026-04-21

State: CLOSED
Lane: P01

## Current State

- HTTP and MCP public team-run writes are now live:
  - `POST /v1/team-runs`
  - MCP `team_run`
- both surfaces support:
  - compact assignment input
  - prebuilt flattened `taskRunSpec` input validated by `TaskRunSpecSchema`
- public write expansion is now sufficient for the current single-host
  execution model
- `ExecutionServiceHost` owns route-neutral runtime mutations:
  - local runner lifecycle writes
  - queued drain execution for one host instance
  - startup recovery drain execution
  - lease repair
  - local-action resolution
  - run control
- `api serve` intentionally still owns transport and process-local HTTP
  concerns:
  - listener lifecycle
  - background-drain timer scheduling and pause/resume flags
  - request parsing and HTTP projection
  - status readback projection
  - live `probe=service-state` routing
- browser-profile CDP ownership is now protected below the runtime layer by
  the browser-service operation dispatcher.

## Inventory

The current runtime already has several multi-runner-relevant primitives:

- durable runner records under `~/.auracall/runtime/runners`
- runner heartbeats, stale marking, and activity recording
- run leases with owner ids, heartbeats, expiry, and release reasons
- local claim evaluation for one configured `runnerId`
- claim-candidate evaluation and deterministic ordering across runner records
- queue projection and affinity evaluation
- recovery summary/detail surfaces

Those primitives are not yet a fleet scheduler. The current service host is
deliberately runner-scoped:

- a host configured with one `runnerId` evaluates and claims only for that
  runner
- `api serve` background drain and startup recovery inherit that local-runner
  ownership rule
- claim-candidate ordering is an inspection/evaluation aid, not authority for
  one host to rewrite execution ownership to another runner
- no background worker process, runner pool, reassignment loop, or parallel
  step execution currently exists

## Decision

Do not start broad multi-runner/background-worker execution next.

The next implementation slice should add a route-neutral service/runner
topology readiness seam that makes fleet capacity explicit without changing
claim authority:

- project the active runner inventory through the service-host layer
- expose bounded runner topology/readiness state for the local server
- preserve the current server-local runner as the only execution owner for
  `api serve`
- keep candidate evaluation read-only unless a later scheduler plan explicitly
  grants assignment authority
- keep parallel team execution and background worker pools deferred

## Next Bounded Slice

Open one implementation plan for a read-only runner topology/readiness surface.

Acceptance criteria for that next slice:

- `ExecutionServiceHost` owns a route-neutral runner-topology projection method
- the projection includes active/stale runner counts, runner ids, host ids,
  service/runtime/browser/account capability summaries, heartbeat freshness,
  and the configured local execution owner
- `api serve` can include that bounded projection in `/status` without taking
  over runner ownership
- tests prove the projection does not change claim selection, acquire leases,
  or execute steps
- docs continue to say multi-runner scheduling, reassignment, worker pools, and
  parallel execution are deferred

## Non-Goals

- no new public team-run write shape
- no new scheduler or worker daemon
- no automatic reassignment to a fresher eligible runner
- no parallel step dispatch
- no browser-service dispatcher redesign

## Definition Of Done

- roadmap and runbook record this reassessment
- `0001` and `0004` point to runner topology/readiness as the next bounded
  implementation checkpoint
- deterministic plan audit passes
- no runtime behavior changes are introduced in this reassessment slice
