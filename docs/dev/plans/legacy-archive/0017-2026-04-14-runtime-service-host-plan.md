# Runtime Service Host Plan

## Purpose

Define the next bounded service-host slice after the first local runner pass.

This plan answers one practical question:

- what is the smallest host-owned runtime execution loop AuraCall should add
  now that direct runs can already advance through one bounded local pass

It should be read together with:

- [0001-2026-04-14-execution.md](/home/ecochran76/workspace.local/auracall/docs/dev/plans/0001-2026-04-14-execution.md)
- [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/service-runtime-execution-plan.md)
- [runtime-runner-slice-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/runtime-runner-slice-plan.md)
- [http-responses-adapter-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/http-responses-adapter-plan.md)

## Why this slice is next

The repo already has:

- durable runtime records
- dispatcher inspection
- lease transitions
- revisioned writes
- one local control contract
- one bounded local runner pass
- one bounded local `responses` host

What it does not have yet is a host-owned execution loop.

Current behavior is still request-scoped:

- `POST /v1/responses` creates a direct run
- the same request path immediately invokes one bounded local execution pass
- the server host does not yet own:
  - draining pending runs
  - recovering work after restart
  - expiring stale leases before retry
  - background/local service identity separate from the HTTP request

That gap now matters more than new API breadth.

## Scope

### In scope

- one local service-host module above the existing runner/control seams
- one bounded drain-once operation over persisted runs
- stale-lease expiry before claiming work
- single-owner, sequential, fail-fast execution
- local host identity for lease ownership
- recovery of persisted runnable runs after process restart

### Out of scope

- auth
- streaming / SSE
- `POST /v1/chat/completions`
- distributed scheduling
- worker pools
- multi-host coordination
- team-specific execution semantics
- browser/provider execution policy expansion
- new public routes

## Target behavior

The next host-owned slice should let AuraCall do this:

1. persist one or more runs
2. have a local host inspect persisted work
3. expire stale active leases if they are already dead
4. claim one eligible run as the current owner
5. advance it through one sequential runner pass
6. repeat until no eligible local work remains, or until an explicit bounded
   drain limit is reached

Safe MVP rule:

- one host instance drains sequentially
- one claimed run at a time
- fail-fast still applies within a run
- no hidden daemon behavior is introduced yet

## Recommended code seam

Add one internal host-oriented runtime module, likely under:

- `src/runtime/serviceHost.ts`

Recommended responsibilities:

- list/inspect persisted runs through the runtime control seam
- expire stale leases before attempting new claims
- choose the next eligible run deterministically
- invoke the existing runner for one run at a time
- record a stable host owner id / lease prefix

It should not:

- embed HTTP request parsing
- read or write runtime files directly
- replace the runner
- define transport routes

## Relationship to the current HTTP host

The current `responses` host should stay bounded.

After this slice, the intended layering should be:

- `responsesServer.ts`
  - HTTP adapter only
- `responsesService.ts`
  - direct-run creation/readback mapping
- `serviceHost.ts`
  - local host-owned drain/claim/recovery behavior
- `runner.ts`
  - one-run step progression

Safe first posture:

- `POST /v1/responses`
  - may still create a run synchronously
  - may ask the local host to drain once
  - should stop owning runner orchestration details directly
- `auracall api serve`
  - startup recovery source can be selected with
    `--recover-runs-on-start-source <direct|team-run|all>`
- `GET /v1/responses/{response_id}`
  - remains a readback of persisted state

## Acceptance bar

This slice is good enough when:

- one local service-host module exists
- it can drain persisted eligible runs sequentially
- it expires stale leases before reclaiming work
- it uses the existing runtime control/runner seams
- restart recovery is possible for local persisted direct runs, team runs, or both
- no new route breadth is introduced

## After this slice

Only after the local service-host seam is real should the repo consider:

- broader background execution semantics
- richer inspect/list operator surfaces
- MCP runtime-native adoption on the same host-owned runner substrate
- `chat/completions` only if concrete client pressure appears
- team-execution bridge on top of the shared host/runner substrate

## Current checkpoint

The first bounded host-owned execution seam is now in code:

- `src/runtime/serviceHost.ts`
  - local host identity
  - sequential `drainRunsOnce(...)`
  - stale-lease expiry before reclaim
  - deterministic oldest-first candidate ordering
- `src/runtime/responsesService.ts`
  - now delegates direct-run execution to the service-host seam instead of
    calling the runner directly

Current explicit limits remain:

- still request-scoped through the existing `responses` create path
- no background loop
- no restart watcher/daemon
- no new routes
- no streaming
- no auth
- no `chat/completions`

Current bounded recovery behavior now also distinguishes:

- reclaimable runnable work
- still-busy runs with an active lease
- stranded running work with no active lease

The service-host seam now also has one internal recovery summary helper for
those categories, and `GET /status?recovery=true` exposes a narrow
operator/debug surface for those same buckets with optional
`sourceKind=direct|team-run` filtering.
