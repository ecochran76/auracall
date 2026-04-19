# Team Service Execution Plan | 0004-2026-04-14

State: OPEN
Lane: P01

## Current State

- the repo already has a bounded team service-execution contract recorded in
  the loose planning docs and referenced from the roadmap
- the adjacent canonical planning cluster now exists under `docs/dev/plans/`:
  - `0002-2026-04-14-task-run-spec.md`
  - `0003-2026-04-14-team-run-data-model.md`
- the adjacent task/run-spec and team-run contracts are now concrete enough to
  support bounded execution work, not just planning
- the first internal implementation slice is now live for projecting one
  persisted `taskRunSpec` into one sequential `teamRun` with initial `step`
  and `sharedState` records
- the bounded CLI write surface is also now live through `auracall teams run`
  on top of that same bounded single-host local-runner bridge
  - the bounded local runner now stays heartbeated while active multi-step CLI
    execution is still draining
- the bounded operator-facing ownership/readback checkpoint is now materially
  sufficient across:
  - service-host reassignment semantics
  - immediate `POST /status` readback
  - `/v1/runtime-runs/inspect`
  - `/status/recovery/{run_id}`
  - aggregate `/status?recovery=true`
- broader public team execution writes remain paused on HTTP/MCP surfaces

# Team Service Execution Plan

## Purpose

Define the first execution contract for future team runs once Aura-Call grows
service mode, runners, and parallelism.

This plan is intentionally one layer above the current CLI-only `--team`
planning surface. It does not authorize implementation by itself. It defines
the default assumptions the later service/runners work should follow unless a
better reason emerges.

## Position in the stack

The intended layering remains:

1. browser profile
2. AuraCall runtime profile
3. agent
4. team
5. task / run spec
6. service mode / runners / parallel execution

Important split:

- team config expresses orchestration intent
- task / run spec expresses the concrete assignment
- the service/runners layer executes that intent

## Team and task split

The execution model should not treat `team` as the complete executable input.

Safer model:

- `team`
  - reusable orchestration template
  - member roles, instructions, routing policy, handoff contracts, automation
    defaults
- `task` / `run spec`
  - one concrete assignment for that team
  - input bundle, objective, success criteria, turn budget overrides, and any
    run-specific constraints
- `team run`
  - one execution attempt of one task through one team template

This avoids baking one-off task detail into long-lived team definitions while
still allowing highly opinionated team behaviors.

## North-star use cases

Future teams are expected to support:

- divide-and-conquer work across multiple agents
- multi-turn automation that moves through multiple agents in sequence
- explicit data handoff between specialist agents
- mixed sequential and parallel collaboration where the orchestration layer
  decides what should happen, and the runner layer decides how to execute it

## Default execution assumptions

Until there is a stronger product reason, the default team execution contract
should be conservative:

- default execution mode is sequential
- parallelism must be explicit, not implied by team membership
- handoff payloads must be explicit, structured, and inspectable
- one team run owns one shared run state object
- failures stop the active run by default unless a future policy explicitly
  marks a step as best-effort or non-blocking

These defaults optimize for operator clarity and debuggability before
throughput.

## Execution model

The future execution model should treat a team run as an orchestration graph
with a conservative MVP shape:

- one concrete task / run spec is bound to one selected team
- a team run resolves to a list of member execution steps
- each step references an agent
- each agent resolves to one AuraCall runtime profile
- that runtime profile resolves to one browser profile and one default service
- the runner layer decides whether a step runs:
  - immediately
  - after another step completes
  - in parallel with another step

Safe first contract:

- ordered steps first
- optional future dependency graph later
- one selected `taskRunSpec` bound to one selected `team`
- one planned `teamRun` derived from that bound pair before runtime execution

Important implementation caution:

- ordered member projection may be a safe MVP execution strategy
- it should not be mistaken for the full conceptual meaning of team
- richer workflows may later derive steps from team policy plus task type,
  rather than from raw member order alone

That means the MVP service layer should start with:

- sequential step execution
- optional explicit fan-out/fan-in later

## Handoff contract

Every inter-agent handoff should be explicit.

Minimum handoff payload shape:

- `runId`
- `teamId`
- `fromAgentId`
- `toAgentId`
- `stepId`
- `taskSummary`
- `artifacts`
- `structuredData`
- `notes`
- `status`

Minimum rules:

- handoffs must be serializable
- handoffs must be storable for postmortem/debug
- handoffs must not depend on hidden browser tab state alone
- handoffs must be valid even if the receiving step runs on a different runner

For unattended multi-turn teams, handoffs may also include:

- deterministic status indicators
- structured turn summaries
- next-turn recommendations
- machine-readable local-action requests for AuraCall to execute on the host

Those should remain explicit payload fields, not informal prompt prose.

## Shared run state

One future team run should own one shared state object with append-only
history.

Minimum responsibilities:

- record step start/end
- record handoffs
- record produced artifacts
- record structured outputs
- record failure reason and owning step

This shared state should be the durable source of truth for team orchestration,
not ad hoc browser/session state.

## Failure and retry ownership

Default policy:

- a step failure stops the team run
- retries belong to the service/runners layer
- retry policy is owned per step execution, not per team membership

Important split:

- teams express the intended workflow
- runners own:
  - retry/backoff
  - queueing
  - concurrency limits
  - lease/ownership
  - cancellation

Possible future exceptions, but not MVP:

- best-effort steps
- partial completion policies
- compensating rollback behavior

## Provider state boundary

Provider passive/live state is intentionally not a generic runner-control
channel in the current architecture.

Current split:

- provider/browser adapters own:
  - passive observation emission during execution
  - live service-state detection for read-only runtime inspection
- the service/runners layer owns:
  - lease ownership
  - queueing
  - retry/cancel behavior
  - step success/failure handling once the executor returns or throws

Important rule:

- runners may expose provider live state for inspection
- runners should not run a generic passive-state watcher loop that translates
  provider UI state directly into execution control decisions
- if a future provider state should become actionable runner control, that
  needs a separate explicit policy slice rather than being inferred from the
  inspection seam

## Parallelism boundary

Parallelism should not be inferred from:

- multiple team members
- multiple browser profiles
- multiple agents with different runtime profiles

Parallelism should require explicit orchestration semantics plus runner support.

Safe future rule:

- team config may eventually express that a phase is parallelizable
- runner policy decides whether enough capacity exists to execute it in parallel

## Runner assignment boundary

Runner assignment belongs to the service layer.

That layer should decide:

- which runner executes a step
- whether two steps may share a runner
- whether a browser-bearing step must stay on a runner with the right browser
  profile/account state
- whether a handoff crosses runner boundaries

Team config should not directly encode:

- worker pool sizing
- runner ids
- queue shards
- runner leases
- service topology

Current bounded implication:

- when more than one active runner is equally eligible for the same bounded
  claim, selection should be deterministic rather than inherited from storage
  listing order
- current deterministic tie-break for bounded claim-candidate ordering is:
  - claim status rank first
  - then fresher runner heartbeat
  - then runner id as a stable fallback
- bounded service-host execution remains runner-scoped:
  - a host configured with one `runnerId` evaluates only that runner for local
    claim and lease ownership
  - it does not arbitrate across all eligible runners on behalf of the fleet
  - the deterministic multi-runner tie-break currently applies to candidate
    inspection/evaluation surfaces, not to a host rewriting its configured
    execution owner
- a bounded `auracall teams run` CLI pass may end with the short-lived local
  runner already marked stale while the stored team run remains paused for
  operator-controlled follow-through
- in that posture, the stale CLI runner is historical ownership only:
  - after operator local-action approval and human resume, a later eligible
    active runner should claim and drain the resumed run
- a resumed paused run is claimable by any currently eligible active runner
- resumed execution should not be pinned implicitly to the runner identity
  that originally paused the step
- the same reassignment rule applies when operator-resolved local-action state
  precedes the later human resume and targeted drain
- bounded HTTP/status readback should report the runner that actually claimed
  the later targeted drain, not stale pre-drain runner state
- bounded HTTP runtime inspection after operator resume should evaluate the
  current queried runner when no active lease exists, not implicitly fall back
  to the historical paused owner
- bounded HTTP recovery detail after operator resume should project current
  local-claim posture and no active lease when the historical paused-owner
  lease has already been released
- bounded HTTP recovery summary after operator resume should classify the run
  under reclaimable/current local-claim buckets, not leave it counted under
  historical paused-owner lease posture
- this bounded operator-facing readback hardening sub-lane is now
  maintenance-only unless a new concrete claimant/reporting mismatch is found

## MVP recommendation

The first real team execution MVP should be:

- sequential only
- one team run at a time
- explicit step list
- explicit handoff payload persistence
- fail-fast by default
- no implicit parallel fan-out
- one concrete task / run spec bound to one team template

Additional explicit binding rule:

- `taskRunSpec` owns assignment intent
- `teamRun` owns execution history
- the service/runtime layer should not accept a bare `team` as the complete
  executable input once `taskRunSpec` exists

Why:

- easier to debug
- easier to inspect
- easier to replay
- compatible with later parallel expansion

## First implementation slice

This slice is now complete.

The completed first implementation slice is:

1. accept one persisted `taskRunSpec`
2. resolve one selected `team`
3. project one planned `teamRun`
4. project the initial sequential `step` list
5. create one empty-but-owned `sharedState` record
6. stop before broader public HTTP/MCP team-execution expansion

### In scope

- internal persistence and projection for:
  - `taskRunSpec`
  - `teamRun`
  - initial `step` records
  - initial `sharedState`
- conservative projection from one team template to one sequential execution plan
- explicit `taskRunSpecId -> teamRun.id` binding
- deterministic initial statuses for planned vs runnable steps

### Out of scope

- multi-runner execution
- queue topology
- lease coordination redesign
- implicit parallelism
- best-effort or compensating execution policies
- broad runner-affinity work beyond what current runtime identity already needs
- broader public team-execution write surfaces beyond the current bounded CLI
  entrypoint

### Proposed implementation target

The first implementation slice should produce this durable chain:

- persisted `taskRunSpec`
- one persisted `teamRun` with:
  - `taskRunSpecId`
  - `teamId`
  - conservative execution `policy`
  - `sharedStateId`
  - ordered `stepIds`
- one persisted `sharedState` with empty initial `history`
- planned `step` records with resolved:
  - `agentId`
  - `runtimeProfileId`
  - `browserProfileId` when present
  - `service`

### Suggested code seam

Keep the first implementation slice bounded to current runtime/team layers:

- `src/teams/model.ts`
- `src/teams/runtimeBridge.ts`
- `src/teams/service.ts`
- `src/runtime/model.ts`
- `src/runtime/schema.ts`
- `src/runtime/projection.ts`
- adjacent tests for teams/runtime projection

Important rule:

- keep broader external-control-surface widening paused beyond the current
  bounded CLI entrypoint
- prove the internal projection path and single-host bridge first

### Acceptance criteria for the first implementation slice

- one `taskRunSpec` can be persisted and validated
- one internal projection creates exactly one `teamRun`
- that `teamRun` references exactly one `taskRunSpecId`
- initial `step` and `sharedState` records are created deterministically
- the slice remains sequential and fail-fast
- no assignment-intent fields are duplicated onto `teamRun`
- the bounded CLI write surface stays on the same sequential bounded
  single-host local-runner bridge
- no broader public HTTP/MCP team-execution write surface is introduced

### Verification target

Minimum proof for the first code slice should include:

- focused unit tests for `taskRunSpec -> teamRun` projection
- focused schema/model tests for the new records
- focused teams/runtime bridge tests for step projection
- `pnpm exec tsc -p tsconfig.json --noEmit`

### Follow-on checkpoint after this slice

Only after the internal projection path is stable should the repo decide whether to:

- expose a bounded internal command for debugging
- widen beyond the current bounded CLI entrypoint
- widen toward runner/service orchestration details

## Not in scope for this plan

- concrete CLI flags for team execution
- runner implementation details
- queue schema
- persistence backend choice
- service deployment layout
- final schema naming for `task` vs `run spec`

## Definition of done for this planning seam

This seam is complete enough when:

- team orchestration intent is clearly separated from runner execution concerns
- the default execution assumptions are explicit
- the handoff payload contract is explicit
- the shared run-state requirement is explicit
- the failure/retry ownership split is explicit
- the first internal implementation slice is explicitly bounded
- the first internal implementation slice is recorded as shipped
- roadmap/execution docs point to this plan before any team execution work begins
