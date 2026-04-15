# Durable State And Account Mirroring Plan | 0005-2026-04-14

State: OPEN
Lane: P01

## Current State

- the durable ownership lane is still explicitly referenced from
  `ROADMAP.md`, so it remains future-signal planning rather than archive-only
  history
- the adjacent runtime/history design notes have already been archived under
  `docs/dev/plans/legacy-archive/`
- the planning-compliance framework is green, so this slice is promoting the
  durable-state plan into canonical authority without changing the underlying
  design intent
- the live need is stable plan placement and wiring, not another semantic
  rewrite of the durable ownership model

# Durable State And Account Mirroring Plan

## Purpose

Define the first bounded design checkpoint for the roadmap lane:

- durable state and account mirroring

This plan answers one practical question:

- what durable ownership model must exist before Aura-Call grows beyond the
  current single-process `serviceHost` posture into broader service/runtime
  mode

It should be read together with:

- [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
- [0001-2026-04-14-execution.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0001-2026-04-14-execution.md)
- archived service/runtime history:
  - [0018-2026-04-14-service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0018-2026-04-14-service-runtime-execution-plan.md)
  - [0017-2026-04-14-runtime-service-host-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0017-2026-04-14-runtime-service-host-plan.md)

## Why this is the next lane

The current `api serve` / `serviceHost` lane is now coherent enough for an
internal checkpoint:

- bounded startup recovery
- bounded background drain
- pause/resume control
- recovery class summaries
- recoverable-stranded distinction
- reduced-noise batch reporting
- actionable prioritization
- explicit oldest-first ordering
- bounded class-aware budgeting
- operator metrics on `/status` and startup logs

What is still missing is not more local host policy nuance. It is the durable
ownership model for broader service/runtime mode:

- queue/run/step/handoff persistence beyond one local process
- service-account/browser-affinity mirroring
- runner heartbeat and liveness ownership
- replay/debug/postmortem behavior without relying on one in-memory host

## Problem statement

Aura-Call already has durable runtime records, but they are still used in a
single-process posture:

- one local control implementation
- one local `serviceHost`
- one bounded HTTP host loop
- one local browser/account environment

If the project expands into broader service mode before durable ownership is
explicit, it risks:

- queue state that cannot be replayed cleanly
- ambiguous run ownership across processes
- browser-bearing work claimed by the wrong account or machine
- postmortems that depend on ephemeral local process context
- API/MCP/team execution surfaces growing on assumptions that do not survive
  multi-runner mode

## Design goals

The next design checkpoint should optimize for:

- durable ownership clarity
- replayability
- postmortem-friendly state
- explicit account/browser affinity
- compatibility with sequential-first execution
- minimal distributed assumptions

It should not optimize first for:

- worker-pool scale-out
- distributed scheduling cleverness
- speculative parallelism
- provider-specific routing
- cross-machine failover breadth

## Required boundaries

### Durable state owns

- queue/run identity
- step identity and lifecycle
- handoff identity and linkage
- lease ownership and heartbeat state
- replay/postmortem-ready event history
- service-account/browser-affinity claims needed to execute safely

### Runner/host owns

- active local process identity
- heartbeat updates while it is alive
- lease acquisition/release attempts
- execution side effects
- bounded recovery attempts

### Teams/agents own

- orchestration intent
- reusable instructions/policy
- task/run-spec defaults

### Browser-service/providers own

- browser mechanics
- provider DOM/request semantics
- provider-specific recovery logic

## Current baseline

The repo already has enough substrate to define this boundary concretely:

- persisted runtime bundles for:
  - runs
  - steps
  - events
  - leases
- bounded local recovery and host ownership in:
  - `src/runtime/serviceHost.ts`
- bounded HTTP host exposure in:
  - `src/http/responsesServer.ts`
- team/task/run planning seams in:
  - `src/teams/*`

What the repo does not yet have is an explicit durable model for:

- queue membership separate from “runs discovered by listRuns()”
- service-account/browser-affinity ownership separate from current local
  environment assumptions
- multi-runner heartbeat ownership beyond one local process
- replay/debug guarantees across process restarts and machine boundaries

## Recommended bounded model

### 1. Durable execution state stays run-centric

Keep the current run bundle as the durable core for now:

- `run`
- `steps`
- `handoffs`
- `sharedState`
- `events`
- `leases`

Do not introduce a second queue-only object model yet if the current run bundle
can still be the durable source of truth.

### 2. Add one explicit queue/projection layer

The next durable seam should be a projection, not a replacement:

- one durable queue-ready projection derived from run state
- enough to answer:
  - runnable now
  - waiting on dependencies
  - held by active lease
  - blocked by affinity mismatch

This can remain local-storage-backed at first, but the ownership boundary
should be explicit enough to move to Redis/Postgres later.

Current checkpoint:

- the first code-facing queue-ready projection seam now exists in:
  - [src/runtime/projection.ts](/home/ecochran76/workspace.local/oracle/src/runtime/projection.ts)
- it derives from the existing inspection/dispatch model and currently exposes:
  - `queueState`
  - `claimState`
  - active lease owner/id
  - runnable/waiting/running/deferred/terminal step posture
  - one future-facing affinity evaluation hook that can report
    `blocked-mismatch`
- it remains a derived local projection, not a second durable source of truth

Additional bounded host-consumption checkpoint:

- `serviceHost` now consumes the first repair seam conservatively instead of
  blanket-expiring every expired lease by timestamp alone
- before bounded drain/recovery-summary work, host liveness now expires stale
  runner records on the persisted runner-control seam
- host lease repair then follows the current conservative rule:
  - stale or missing runner + expired lease => locally reclaimable
  - active runner + expired lease => keep `active-lease`
- this keeps bounded host recovery aligned with the durable
  lease/runner/repair model without adding reassignment or scheduler breadth

### 3. Add one explicit execution-affinity model

Browser-bearing work cannot be treated like generic local compute.

Minimum durable affinity fields should distinguish:

- service account identity
- browser-bearing vs non-browser work
- required runtime/browser profile family
- machine-local execution affinity when needed

The first durable model does not need full credential mirroring. It does need a
stable durable claim that explains why a given runner is or is not eligible to
execute a run.

Current checkpoint:

- the first explicit runtime-local affinity record/schema now exists in:
  - [src/runtime/types.ts](/home/ecochran76/workspace.local/oracle/src/runtime/types.ts)
  - [src/runtime/schema.ts](/home/ecochran76/workspace.local/oracle/src/runtime/schema.ts)
  - [src/runtime/model.ts](/home/ecochran76/workspace.local/oracle/src/runtime/model.ts)
- the queue-ready projection in
  [src/runtime/projection.ts](/home/ecochran76/workspace.local/oracle/src/runtime/projection.ts)
  can now consume that record directly while staying derived from runtime
  inspection state
