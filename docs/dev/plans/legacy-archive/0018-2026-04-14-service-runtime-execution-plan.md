# Service Runtime Execution Plan

## Purpose

Define the first bounded implementation plan for Aura-Call's future
service/runtime layer.

This plan exists to answer one practical question:

- what should be built next so teams, agents, API, and MCP can eventually sit
  on one execution core instead of growing separate orchestration paths

It should be read together with:

- [0001-2026-04-14-execution.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0001-2026-04-14-execution.md)
- [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
- [team-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-config-boundary-plan.md)
- [0003-2026-04-14-team-run-data-model.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0003-2026-04-14-team-run-data-model.md)

## Current baseline

The repo already has the first planning/data seams for future execution:

- config layering for:
  - browser profile
  - AuraCall runtime profile
  - agent
  - team
- team-run vocabulary and validation in:
  - `src/teams/types.ts`
  - `src/teams/schema.ts`
  - `src/teams/model.ts`
  - `src/teams/service.ts`
- browser-service as the reusable browser substrate in:
  - `packages/browser-service/`

What does not exist yet is the service/runtime layer that would:

- persist runs durably
- dispatch work
- manage leases/runners
- expose the same execution state to CLI, API, and MCP

Current phase-1 checkpoint now reached:

- runtime vocabulary exists
- runtime persistence exists
- dispatcher classification exists
- lease transitions exist
- revisioned mutation discipline exists
- local control contract exists
- bounded `responses` HTTP create/read inspection exists
- local dev-only exposure exists through `auracall api serve`

What is still missing is the first real runner/service behavior that can
advance a stored run beyond a durable placeholder state.

## Problem statement

Aura-Call now has enough lower-layer structure that the next risk is
architectural drift above it.

If API, MCP, future teams, and future agent execution each add their own
execution semantics independently, the project will end up with:

- duplicate run state
- incompatible status models
- divergent retry/cancellation behavior
- inconsistent provenance
- separate orchestration paths for the same logical work

The next implementation work should prevent that divergence before it starts.

## Design goals

The first service/runtime slice should optimize for:

- one execution vocabulary
- durable run records
- explicit ownership boundaries
- debuggability
- replayability
- compatibility with future sequential-first team execution

It should not optimize first for:

- high concurrency
- distributed scheduling
- speculative parallelism
- background daemon breadth
- provider-specific execution shortcuts

## Required boundaries

### Service/runtime owns

- durable run identity
- execution status/state transitions
- queue and lease concepts
- retry/cancel policy
- step dispatch decisions
- run event history
- runner heartbeat/liveness state
- stable API/MCP/CLI execution contracts

### Teams own

- orchestration intent
- member composition
- handoff intent
- sequencing/dependency intent

### Agents own

- workflow specialization
- instructions/persona
- task-level defaults

### Browser-service owns

- generic browser mechanics
- DevTools/browser-session primitives
- structured DOM inspection
- generic blocking-state/page-probe contracts

### Providers own

- provider DOM semantics
- provider request/response mapping
- provider-specific recovery logic

## Recommended implementation order

### Slice 1: Durable execution record contract

Goal:
- define one run record that all future invocation surfaces can share

Deliverables:
- explicit runtime-facing shapes for:
  - `run`
  - `runStep`
  - `runEvent`
  - `runLease`
- mapping from current team-run terms to runtime terms where needed
- one persistence/storage note for JSON-first or SQLite-first staging

Acceptance:
- docs align on one execution vocabulary
- no separate API-only or MCP-only run model is introduced

### Slice 2: Sequential dispatcher plan

Goal:
- define the smallest real dispatcher that can execute one run safely

Deliverables:
- sequential-first dispatch rules:
  - one runnable step at a time
  - explicit dependency checks
  - fail-fast default
  - explicit cancellation points
- clear boundary between:
  - planner
  - dispatcher
  - worker/runner

Acceptance:
- no implied parallelism
- no provider-specific branching in the dispatcher model

Current intended boundary for this slice:

- pure classification/planning is in scope:
  - next runnable step
  - deferred runnable steps under sequential mode
  - blocked-by-failure classification for fail-fast policy
  - missing dependency reporting
- still out of scope:
  - actual step execution
  - lease acquisition
  - retries
  - worker ownership

### Slice 3: Lease and runner ownership model

Goal:
- prevent multiple processes from “owning” the same run implicitly

Deliverables:
- first `runLease` concept
- runner heartbeat/liveness rules
- stale-lease recovery policy
- explicit note on how browser-bearing work and non-browser work differ

Acceptance:
- one run has one active owner at a time
- crash recovery semantics are documented before broad execution lands

Current intended boundary for this slice:

- pure lease-state transitions are in scope:
  - acquire
  - heartbeat
  - release
  - expire
- acceptable outputs:
  - updated run bundle
  - appended lease events
  - explicit single-owner rejection when an active lease already exists
- still out of scope:
  - background runners
  - polling loops
  - automatic stale-run recovery daemons
  - step execution side effects

Storage discipline note for this phase:

- bundle-local lease/dispatcher mutations should move through explicit
  persistence revisions
- optimistic compare-and-swap semantics are in scope before any external
  control surface lands
- distributed locking and daemon ownership are still out of scope

Immediate follow-on after this phase:

- one local runtime control seam may compose:
  - persisted record reads
  - dispatch-plan inspection
  - lease-state transitions
- but it should remain an internal/local module, not an HTTP or MCP surface

### Slice 4: External control surface contract

Goal:
- make API and MCP consumers share the same execution core

Deliverables:
- one host-facing execution contract for:
  - create run
  - inspect run
  - cancel run
  - stream run events
- note which parts are synchronous CLI convenience versus true runtime state

Acceptance:
- API and MCP are clients of one execution model, not separate orchestrators

Current checkpoint for this slice:

- the transport-neutral runtime control contract is now explicit in:
  - `src/runtime/contract.ts`
- the local control implementation conforms to it in:
  - `src/runtime/control.ts`
- one bounded HTTP adapter now exists in:
  - `src/http/responsesServer.ts`
- still intentionally deferred:
- public server exposure
- auth
- streaming
- `chat/completions`
- MCP runtime-native adoption

Checkpoint result after slices 1-4:

- the first external control surface now exists in bounded local form
- the next active lane should therefore move back downward to runner/service
  execution behavior, not upward to broader transport breadth

Current recommended next slice:

- sequential local runner/service execution over the existing runtime control
  seam
- explicitly in scope:
  - single-owner execution
  - fail-fast step progression
  - persisted run/step/event/shared-state transitions
  - bounded consumption by the existing `responses` host
- still out of scope:
  - auth
  - streaming
  - `chat/completions`
  - team-specific execution semantics
  - distributed scheduling

That slice is now detailed in:

- [runtime-runner-slice-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/runtime-runner-slice-plan.md)

Updated checkpoint after the first runner slice:

- the bounded runner acceptance bar is now met in code:
  - `src/runtime/runner.ts`
  - `src/runtime/responsesService.ts`
  - `src/http/responsesServer.ts`
- one direct run can now advance through one bounded local execution pass and
  read back terminal summary metadata through the local `responses` host
- the next missing shared substrate is no longer step-state mutation itself;
  it is broader local service-host ownership of execution and recovery

That next slice is now detailed in:

- [runtime-service-host-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/runtime-service-host-plan.md)

### Slice 5: Team execution bridge

Goal:
- connect existing team planning data to the runtime layer

Deliverables:
- deterministic projection from:
  - `teamRun`
  - `step`
  - `handoff`
  - `sharedState`

Current recommendation:

- keep this slice deferred until the runtime/service layer can advance direct
  runs through real runner behavior
- teams should consume that shared execution substrate later rather than force
  the first real execution semantics into the team layer
  into the runtime execution model
- explicit note that initial team execution remains:
  - sequential
  - explicit-handoff
  - fail-fast

Acceptance:
- team execution becomes a consumer of the runtime layer, not a separate engine

## What should remain out of scope for the next slice

Do not mix these into the first execution/service implementation track:

- broad provider parity work
- browser-service extraction not tied to execution needs
- speculative parallel runners
- distributed or multi-host scheduling
- captcha automation
- team auto-decomposition intelligence
- account/file/cache product expansion unrelated to execution state

## Recommended next concrete coding slice

The best next code-facing slice is now:

- one local service-host module above the existing control/runner seams

That should likely produce:

- one `src/runtime/serviceHost.ts`-style module
- one bounded drain-once operation over persisted runs
- stale-lease expiry before reclaiming local work
- no auth, streaming, or new route breadth

## Current checkpoint

The foundational runtime/service milestones from this plan are now in place:

- runtime execution vocabulary and projection
- persisted record storage with revisioned writes
- dispatcher inspection
- lease transitions
- local runtime control contract
- bounded HTTP `responses` adapter
- bounded local runner pass for direct runs

The current stop line is now different:

- do not widen protocol breadth by inertia
- do not jump to team execution before the host/runner substrate is broader
- do not treat the bounded request-scoped direct-run pass as a finished service
  host

The next active implementation target remains within this plan:

- local service-host / runner orchestration over the existing seams

## Definition of done for this planning seam

This seam is complete enough when:

- the active roadmap points to one execution/service plan
- the plan states a bounded implementation order
- the plan explicitly separates:
  - runtime/service ownership
  - team ownership
  - agent ownership
  - browser-service ownership
  - provider ownership
- the next implementation slice is small enough to start without reopening the
  overall architecture debate
