# Service Runtime Execution Plan

## Purpose

Define the first bounded implementation plan for Aura-Call's future
service/runtime layer.

This plan exists to answer one practical question:

- what should be built next so teams, agents, API, and MCP can eventually sit
  on one execution core instead of growing separate orchestration paths

It should be read together with:

- [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
- [team-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-config-boundary-plan.md)
- [team-run-data-model-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-run-data-model-plan.md)

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

### Slice 5: Team execution bridge

Goal:
- connect existing team planning data to the runtime layer

Deliverables:
- deterministic projection from:
  - `teamRun`
  - `step`
  - `handoff`
  - `sharedState`
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

The best next code-facing slice is:

- define the durable execution record contract and persistence boundary

That should likely produce:

- one new plan or schema document
- one small runtime module for shared execution types
- no real background runner behavior yet

The immediate goal is to make future implementation harder to fragment, not to
ship service mode in one jump.

## Current checkpoint

The repo has now crossed the first half of Slice 1:

- runtime execution vocabulary exists under:
  - `src/runtime/types.ts`
  - `src/runtime/schema.ts`
  - `src/runtime/model.ts`
- deterministic projection from team-run planning data into runtime execution
  records also exists

This is within the intended scope of this plan.

The repo has also added a small route-neutral API scaffolding seam under:

- `src/runtime/apiTypes.ts`
- `src/runtime/apiSchema.ts`
- `src/runtime/apiModel.ts`

Treat that API seam as provisional scaffolding only.

Current stop line:

- do not extend the API seam into:
  - HTTP handlers
  - `responses` routes
  - `chat/completions` adapters
  - streaming contracts
- do not let the provisional API files become the de facto architecture by
  continued expansion before the persistence boundary is settled

That means the next active implementation target returns to this plan, not the
API plan:

- execution-record persistence boundary first
- dispatcher/lease work later
- transport surfaces after the runtime core is more explicit

The next concrete code slice after this checkpoint is:

- JSON-first execution-record persistence under the AuraCall home dir
- read/write/list helpers only
- no queue/dispatcher semantics yet

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
