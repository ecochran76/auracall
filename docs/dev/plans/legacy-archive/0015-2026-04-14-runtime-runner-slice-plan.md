# Runtime Runner Slice Plan

## Purpose

Define the first bounded runner/service execution slice for Aura-Call's new
runtime core.

This plan answers one practical question:

- what is the smallest real execution behavior we should add now that durable
  runtime records, leases, dispatcher inspection, and a bounded `responses`
  host already exist

It should be read together with:

- [0001-2026-04-14-execution.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0001-2026-04-14-execution.md)
- [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-runtime-execution-plan.md)
- [runtime-control-surface-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/runtime-control-surface-plan.md)
- [http-responses-adapter-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/http-responses-adapter-plan.md)

## Why this slice is next

The repo already has:

- durable runtime records
- revisioned mutation discipline
- sequential dispatch classification
- lease ownership transitions
- one transport-neutral control seam
- one bounded HTTP `responses` adapter
- local dev-only host exposure through `auracall api serve`

What it does not have yet is the first real execution behavior that can move a
stored direct run beyond a durable `in_progress` placeholder.

That gap now blocks:

- useful progression of the local `responses` host
- future MCP adoption on the same runtime core
- future team execution, which should consume a real runner substrate rather
  than invent its own execution semantics first

## Scope

### In scope

- one sequential local runner path
- one active owner at a time
- fail-fast progression
- persisted run/step/event/shared-state mutations
- bounded readback through the existing `responses` host

### Out of scope

- auth
- streaming / SSE
- `POST /v1/chat/completions`
- distributed scheduling
- background daemons
- queue shards / worker pools
- team-specific execution semantics
- browser/provider-specific execution policy breadth

## Target behavior

The first runner slice should let Aura-Call do this for a direct run:

1. create a stored run
2. inspect the dispatch plan
3. acquire one active lease
4. mark the next runnable step as running
5. record bounded completion or failure for that step
6. update run/shared-state status accordingly
7. release the lease

Safe MVP rule:

- only one runnable step may advance at a time
- if a step fails, the run fails immediately under fail-fast policy

## Recommended code seam

Add one internal runtime runner module, likely under:

- `src/runtime/runner.ts`

It should be a client of the existing runtime control/store/dispatcher/lease
seams rather than a replacement for them.

Recommended responsibilities:

- claim ownership of one run through the existing lease contract
- inspect the current dispatch plan
- perform one explicit step-state mutation cycle
- persist appended events/history
- release ownership cleanly

It should not:

- embed HTTP concerns
- read/write runtime files directly
- introduce its own competing dispatch model

## Minimum state transitions

The first slice likely needs explicit helpers for:

- run start
  - `planned -> running`
- step start
  - `planned|runnable -> running`
- step success
  - `running -> succeeded`
- step failure
  - `running -> failed`
- run completion
  - `running -> succeeded|failed`

Minimum persisted updates:

- `run.updatedAt`
- step status/timestamps/output/failure
- appended `events`
- appended `sharedState.history`
- `sharedState.status`
- `sharedState.lastUpdatedAt`

Likely event additions:

- `step-started`
- `step-succeeded`
- `step-failed`
- optional bounded run-status note/event if useful

## Relationship to the HTTP host

The existing `responses` host should remain bounded.

The first runner slice should not add:

- streaming progress
- background polling loops
- auth
- route expansion

Instead, the host should only gain the minimum needed to observe real runner
progress through the existing create/read model.

Safe first posture:

- `POST /v1/responses`
  - still creates a run
  - may optionally invoke a bounded local execution pass
- `GET /v1/responses/{response_id}`
  - reflects the persisted run state after that pass

## Acceptance bar

This slice is good enough when:

- one stored direct run can advance through one sequential step using the
  runtime runner seam
- the runner uses the existing lease/control/dispatcher foundations
- success/failure is durably visible through persisted runtime state
- the existing `responses` host can read back that progressed state
- no new transport breadth is introduced

## After this slice

Only after the first local runner behavior is real should the repo consider:

- service-host integration beyond the dev server
- MCP runtime-native adoption on the same runner substrate
- the team-execution bridge onto that shared execution path
- `chat/completions` only if concrete client pressure appears

## Current checkpoint

This acceptance bar is now met in bounded local form:

- `src/runtime/runner.ts`
  - one sequential local runner pass
  - single-owner lease-backed execution
  - fail-fast success/failure transitions
- `src/http/responsesServer.ts`
  - `POST /v1/responses` now performs one bounded local execution pass for
    direct runs before returning

Current explicit limits remain:

- no streaming
- no auth
- no `chat/completions`
- no broader service-host integration yet
- no team-specific execution semantics yet

## Next step after this slice

The next active lane is now broader service-host / runner orchestration, not
more adapter polish.

Why:

- the bounded local runner pass is already real
- the remaining missing behavior is host-owned execution and recovery
- the `responses` host still executes work in a request-scoped way rather than
  through a broader local host loop

That next slice is now captured in:

- [runtime-service-host-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/runtime-service-host-plan.md)
