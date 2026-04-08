# HTTP Responses Adapter Plan

## Purpose

Define the first bounded HTTP adapter slice for the runtime layer.

This plan answers one practical question:

- what is the smallest OpenAI-compatible HTTP surface AuraCall should
  implement first now that the runtime control contract exists

It should be read together with:

- [api-compatibility-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/api-compatibility-plan.md)
- [runtime-control-surface-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/runtime-control-surface-plan.md)
- [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-runtime-execution-plan.md)

## Chosen adapter

The first external adapter is:

- HTTP

The first HTTP surface is:

- `POST /v1/responses`
- `GET /v1/responses/{response_id}`

Optional companion for the same bounded slice:

- `GET /v1/models`

## Why this is the right first slice

- OpenAI compatibility is already an explicit product requirement
- the runtime layer now has enough shape for durable create/read/inspect
  behavior
- `responses` is the most natural fit for mixed text + artifact output
- it avoids forcing `chat/completions` to become the internal authority

## Scope

### In scope

- route-neutral request mapping onto the runtime control contract
- create run from a bounded `responses`-style request
- inspect a stored run as a bounded `responses`-style response
- map mixed `message` + `artifact` outputs from runtime API helpers
- bounded model listing if needed for client bootstrapping

### Out of scope

- `POST /v1/chat/completions`
- streaming / SSE
- image routes
- MCP changes
- auth beyond the minimum needed for local development
- browser/provider-specific execution policy breadth
- full runner/execution loop

## Route contract

### `POST /v1/responses`

Initial goal:

- accept a bounded OpenAI-compatible request
- map it into one runtime run creation path
- return a bounded `response` object tied to the stored runtime record

Recommended initial behavior:

- create a runtime run
- return a deterministic `response` object immediately
- do not promise true asynchronous/background execution semantics yet

Important note:

- for the first slice, this route may still be creation-only over prepared or
  minimally projected runtime state rather than a fully executing runner
- that is acceptable as long as the contract is explicit

### `GET /v1/responses/{response_id}`

Initial goal:

- map a stored runtime record back into the bounded `responses` shape

Required behavior:

- return the same stable `response_id`
- expose current status from runtime state
- include ordered `output[]` items when available

### `GET /v1/models`

Initial goal:

- expose the effective model catalog the HTTP surface is willing to advertise

Notes:

- this can remain simple in the first slice
- do not block `responses` on a fancy model catalog

## Runtime mapping

The HTTP adapter should be a client of:

- `src/runtime/contract.ts`
- `src/runtime/control.ts`
- `src/runtime/apiTypes.ts`
- `src/runtime/apiSchema.ts`
- `src/runtime/apiModel.ts`

It should not:

- read or write runtime files directly
- recalculate dispatch state outside the runtime layer
- invent its own lease/run state model

## First implementation boundary

The first code slice should likely produce:

- one small HTTP server module or adapter module
- request parsing for bounded `responses` create/read
- mapping from runtime records into OpenAI-compatible response objects
- focused tests for:
  - request acceptance
  - response shape
  - mixed text + artifact output preservation

## Acceptance bar

This slice is good enough when:

- `POST /v1/responses` exists in a bounded form
- `GET /v1/responses/{response_id}` exists in a bounded form
- the adapter clearly depends on the runtime control contract
- `chat/completions` is still deferred
- no streaming semantics are implied yet

## Current checkpoint

This acceptance bar is now met in a bounded internal module:

- `src/http/responsesServer.ts`

Current implemented behavior:

- `POST /v1/responses`
  - accepts a bounded compatibility-first request
  - creates a direct runtime run
  - returns an immediate persisted `response` object
- `GET /v1/responses/{response_id}`
  - reads the stored runtime run by the same id
  - maps runtime state back into a bounded `response`
- `GET /v1/models`
  - returns a minimal list-compatible catalog from AuraCall's current model
    registry
- `POST /v1/responses`
  - also accepts bounded `X-AuraCall-*` execution hints:
    - runtime profile
    - agent
    - team
    - service
  - header hints override the optional request-body `auracall` object

Current explicit limits:

- no actual runner/execution loop
- no streaming
- no auth
- local dev-only CLI exposure now exists through:
  - `auracall api serve`
- still no broader service-host integration yet
- no `chat/completions` adapter yet

## Next step after this slice

Only after the bounded `responses` adapter is clean should the repo consider:

- whether and how to expose this HTTP server beyond the local dev server
- `GET /v1/models` polish if needed
- `POST /v1/chat/completions` as a compatibility adapter
- MCP runtime-native adoption on the same control contract
