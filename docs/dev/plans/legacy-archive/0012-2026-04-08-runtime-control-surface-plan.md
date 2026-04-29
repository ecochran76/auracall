# Runtime Control Surface Plan

## Purpose

Define the first transport-neutral control contract for the runtime layer.

This plan answers one practical question:

- what exact operations should future HTTP, MCP, and CLI-facing adapters call
  once they stop talking directly to runtime internals

It should be read together with:

- [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/service-runtime-execution-plan.md)
- [api-compatibility-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/api-compatibility-plan.md)
- [mcp.md](/home/ecochran76/workspace.local/auracall/docs/mcp.md)

## Current runtime foundation

The repo already has the internal runtime core:

- execution vocabulary in `src/runtime/types.ts`
- runtime validation in `src/runtime/schema.ts`
- team-run projection in `src/runtime/model.ts`
- JSON persistence plus revisioned records in `src/runtime/store.ts`
- sequential dispatch classification in `src/runtime/dispatcher.ts`
- lease transitions in `src/runtime/lease.ts`
- one local composition seam in `src/runtime/control.ts`

What does not exist yet is the stable host-facing contract that would let
future adapters consume that runtime core consistently.

Current checkpoint:

- the contract is now explicit in docs and code
- `src/runtime/contract.ts` now mirrors this contract directly
- `src/runtime/control.ts` now implements it, including run listing
- the first HTTP adapter is now downstream of this contract rather than
  bypassing it

## Design goals

The first control-surface contract should optimize for:

- transport neutrality
- explicit run lifecycle operations
- explicit inspection surfaces
- bounded lease ownership operations
- replayable event/state reads

It should not optimize first for:

- transport-specific convenience
- streaming protocol details
- browser/provider-specific execution details
- multi-host scheduling
- speculative background execution

## Core contract

The first control surface should define these logical operations:

### 1. Create run

Purpose:
- persist a new runtime run from a prepared execution bundle

Inputs:
- execution bundle
- optional creation metadata if the caller needs it later

Output:
- stored runtime record

Notes:
- this is the contract used by future HTTP/MCP/CLI entrypoints
- it should not require the caller to know revision details

### 2. Read run

Purpose:
- retrieve the current stored runtime record by `runId`

Output:
- stored runtime record or `null`

### 3. Inspect run

Purpose:
- retrieve the current stored record plus the derived dispatch view

Output:
- stored runtime record
- derived dispatch plan

Notes:
- this should be the default inspection path for operator-facing surfaces
- callers should not have to recompute dispatcher state independently

### 4. Acquire lease

Purpose:
- claim exclusive active ownership for one runner/controller

Inputs:
- `runId`
- `leaseId`
- `ownerId`
- timestamps/expiry

Output:
- updated stored runtime record

Rules:
- reject if another active lease already exists
- append explicit lease event history

### 5. Heartbeat lease

Purpose:
- extend or confirm active ownership

Inputs:
- `runId`
- `leaseId`
- heartbeat time
- new expiry time

Output:
- updated stored runtime record

### 6. Release lease

Purpose:
- end active ownership cleanly

Inputs:
- `runId`
- `leaseId`
- release timestamp
- optional release reason

Output:
- updated stored runtime record

### 7. Expire leases

Purpose:
- convert stale active leases into explicit expired state

Inputs:
- `runId`
- `now`

Output:
- updated stored runtime record
- or unchanged stored record if nothing expired

### 8. List runs

Purpose:
- bounded operator/admin listing of persisted runtime records

Recommended support:
- `limit`
- status filter
- source-kind filter

Notes:
- this is useful for CLI/admin/API listing surfaces later
- it should remain summary-oriented by default

## Event model expectations

The control contract should treat runtime events as first-class state, not only
debug metadata.

Minimum expectation:

- create run -> `run-created`
- acquire lease -> `lease-acquired`
- release/expire lease -> `lease-released`
- heartbeat -> bounded note/event form

Dispatcher-derived state may remain computed rather than stored for now.

## Deliberate exclusions

The first control-surface contract should not yet define:

- streaming transport framing
- SSE/WebSocket semantics
- MCP tool payload shapes
- HTTP request/response bodies
- auth
- request routing
- background runner loops
- actual step execution transitions
- cancel semantics beyond a placeholder note in the future direction

## Adapter guidance

Future adapters should be clients of this control contract:

- HTTP adapter
- MCP adapter
- richer CLI/service-internal operator surfaces

They should not:

- read/write runtime files directly
- recompute dispatch plans independently
- mutate leases independently

## Recommended next step after this plan

The next implementation decision should now be:

- how to expose the bounded HTTP adapter without widening protocol breadth

Recommended adapter order:

1. HTTP/OpenAI-compatible inspection and creation path, if product pressure is
   external integration first
2. MCP adapter, if product pressure is local agent interoperability first

But either adapter should remain downstream of the same control contract.

## Current adapter choice

The default first adapter should now be:

- HTTP first

Why this is the right default:

- OpenAI compatibility is already an explicit product requirement
- `POST /v1/responses` is the clearest external surface that benefits from the
  new runtime model
- the current MCP server is still primarily a CLI/session mirror, not a
  runtime-native execution client
- choosing HTTP first forces the runtime contract to support durable
  create/read/inspect semantics cleanly before protocol-specific convenience
  grows elsewhere

Implication:

- MCP should follow as a client of the same runtime control contract
- it should not become the place where runtime semantics are invented first
- the current HTTP adapter should stay bounded until its exposure path is
  chosen explicitly
