# API Compatibility Plan

## Purpose

Define the target shape for a future AuraCall HTTP API with one core rule:

- default to OpenAI-compatible paths and request/response semantics whenever a
  sensible mapping exists
- only extend the compatibility layer where there is no practical compatible
  option

This plan should keep AuraCall usable from software that already expects an
OpenAI-style API while still leaving room for AuraCall-native capabilities such
as:

- runtime profile selection
- agent/team selection
- browser-backed execution
- richer artifact families
- provider-specific modalities such as music/video/canvas/deep research

It should be read together with:

- [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-runtime-execution-plan.md)
- [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- [mcp.md](/home/ecochran76/workspace.local/oracle/docs/mcp.md)
- [openai-endpoints.md](/home/ecochran76/workspace.local/oracle/docs/openai-endpoints.md)

## Current checkpoint

This document is the primary API design checkpoint.

The repo also now contains a small route-neutral API scaffolding seam under:

- `src/runtime/apiTypes.ts`
- `src/runtime/apiSchema.ts`
- `src/runtime/apiModel.ts`

That code should be treated as provisional scaffolding, not as permission to
start building the HTTP surface yet.

Current stop line:

- acceptable now:
  - request/response vocabulary
  - compatibility-first mixed text + artifact response modeling
  - route-neutral helpers that do not imply transport behavior
- not started yet:
  - HTTP route handlers
  - `POST /v1/responses`
  - `POST /v1/chat/completions`
  - streaming/SSE contracts
  - auth and request-routing behavior

The next implementation work should return to the runtime/service plan and add
the execution-record persistence boundary before any HTTP work advances.

## Design rule

Compatibility-first means:

1. Use standard OpenAI-style endpoints where the conceptual operation already
   matches.
2. Accept standard OpenAI request bodies without requiring AuraCall-only
   fields.
3. Return standard OpenAI-shaped responses by default.
4. Add AuraCall extensions only through bounded optional mechanisms.
5. Add wholly new endpoints only when no sensible compatible route exists.

## Primary API surface

The first public HTTP API should center on these paths:

### `GET /v1/models`

Purpose:
- expose the effective model catalog the server is willing to advertise

Notes:
- should include both direct provider ids and stable AuraCall aliases where
  appropriate
- may include compatibility metadata in `owned_by` or `metadata`, but should
  remain list-compatible with OpenAI client expectations

### `POST /v1/responses`

Purpose:
- primary modern execution surface

Why:
- this is the best fit for AuraCall's cross-provider and multimodal future
- it is easier to map richer outputs onto `responses` than onto older chat
  completions

Recommended support:
- text input
- file-backed input
- image generation/editing where the request can reasonably map
- tool-style options where they already fit the Responses model

### `GET /v1/responses/{response_id}`

Purpose:
- inspect prior response state

Why:
- fits AuraCall's existing session/run model direction
- gives a compatible shape for durable execution records

### `POST /v1/chat/completions`

Purpose:
- compatibility path for software that still expects chat completions

Rule:
- support it as a compatibility adapter over the same execution core
- do not make it the authoritative internal model

### `GET /v1/chat/completions/{id}`

Only if needed.

Default recommendation:
- do not prioritize this unless a real client ecosystem requires it
- prefer `responses` for durable inspection

### `POST /v1/images/generations`

Purpose:
- expose image generation through the standard OpenAI-compatible route

Rule:
- use this for image generation whenever the request can map cleanly onto the
  execution core

### `POST /v1/images/edits`

Purpose:
- expose image editing through the standard compatible route

Rule:
- support it only when AuraCall can actually back it with a stable provider
  path

## Compatibility mapping rules

### Core text generation

Map onto:
- `POST /v1/responses`
- `POST /v1/chat/completions`

Internal authority:
- one shared execution core

### Browser-backed execution

Default behavior:
- still accept a normal OpenAI-style request
- treat browser-backed execution as a server-side execution choice, not a new
  API family

Implication:
- browser mode should be selectable through optional execution hints, not a
  separate `/browser/...` path

### Attachments/files

Use standard OpenAI-compatible input forms where possible:
- input file references
- multi-part or uploaded file references later if implemented

Do not immediately invent:
- `/v1/auracall/files/attach-to-chat`

unless a real capability cannot map to the existing request shapes.

### Image generation/editing

Prefer:
- `/v1/images/generations`
- `/v1/images/edits`

Do not route image generation through a custom AuraCall endpoint unless the
standard image API shape becomes impossible to honor.

### Music/video/canvas/deep research

Default recommendation:
- first try to expose these through `responses` output and artifact semantics
- only add AuraCall-specific endpoint families if the standard compatible
  surface becomes too lossy

Practical guidance:
- music/video/canvas/deep-research outputs should initially appear as
  response-linked artifacts in the `responses` model
- avoid inventing `/v1/music` or `/v1/video` early unless a strong client need
  appears

## AuraCall extension policy

Extensions should be allowed through two bounded mechanisms:

### 1. Optional HTTP headers

Preferred for execution-selection hints because they do not disturb standard
OpenAI request bodies.

Candidate headers:
- `X-AuraCall-Runtime-Profile`
- `X-AuraCall-Agent`
- `X-AuraCall-Team`
- `X-AuraCall-Service`
- `X-AuraCall-Execution-Mode`

Why headers first:
- easier for gateways and proxies
- less likely to break strict OpenAI client body validation
- keeps the request body compatibility-first

### 2. Optional top-level `auracall` object

Allowed only for first-party or tolerant clients.

Example shape:

```json
{
  "model": "gpt-5.2",
  "input": "Investigate the artifact regression",
  "auracall": {
    "runtimeProfile": "default",
    "agent": "analyst",
    "team": "ops"
  }
}
```

Rule:
- body extensions must always be optional
- headers should remain the preferred compatibility-preserving mechanism

## Where AuraCall-native endpoints are justified

New non-OpenAI-compatible endpoints are justified only when:

1. the feature has no sensible OpenAI-compatible analog
2. forcing it into the compatibility layer would be misleading
3. the feature is materially valuable on its own

Likely examples:
- team-run inspection/manipulation
- run lease/runner admin
- feature discovery snapshots/diffs
- browser doctor/setup state
- cache/operator maintenance

These are operational AuraCall surfaces, not normal model-inference surfaces.

So a future split may look like:

- compatible inference surface under `/v1/...`
- AuraCall operational/admin surface under `/auracall/...`

## Recommended response-shape guidance

### Default

Return standard OpenAI-compatible response shapes by default.

### Extra metadata

When extra AuraCall execution metadata is needed, keep it bounded and optional.

Recommended fields:
- top-level response metadata or headers for:
  - runtime profile used
  - provider/service resolved
  - session/run id

Avoid:
- dumping full AuraCall session internals into standard response objects

### Artifact outputs

For richer non-text outputs:
- return them as response-linked artifacts/files where possible
- preserve stable ids/URIs so later fetch/inspection can use the same
  execution record

When artifacts and text are mixed in one answer:
- model them as ordered sibling output items in the same response timeline
- do not bury artifacts inside plain text
- do not force them into a separate out-of-band endpoint when they are part of
  the same logical answer

Recommended `responses` pattern:
- `output[]` may contain ordered heterogeneous items such as:
  - `message`
  - `artifact`
- `message` items hold assistant text through normal `content[]` parts such as
  `output_text`
- `artifact` items hold durable non-text outputs such as:
  - image
  - music
  - video
  - canvas
  - document

Recommended artifact fields:
- `id`
- `artifact_type`
- `title`
- `mime_type`
- `uri`
- `disposition`
- optional provider metadata such as dimensions, duration, preview text, or
  provider-native artifact metadata

Compatibility guidance:
- `responses` should be the authoritative rich surface for mixed text +
  artifact output
- `chat/completions` may degrade those artifacts into text references or
  bounded extra metadata when a client cannot consume richer output items

## Internal architecture rule

The compatibility layer must be an adapter over one shared execution core.

That means:
- `responses`
- `chat completions`
- MCP
- future CLI HTTP clients

should all resolve into the same runtime execution model rather than each
implementing their own run/session lifecycle.

## Recommended implementation order

### Slice 1: API contract doc and request-routing policy

Deliverables:
- this plan
- one explicit routing policy:
  - compatibility paths
  - extension headers/body policy
  - AuraCall-native admin path policy

### Slice 2: Runtime-backed `responses` contract

Deliverables:
- route-independent execution request/response types
- clear mapping from runtime execution records to `responses`

### Slice 3: `chat/completions` compatibility adapter

Deliverables:
- adapter from chat-completions requests onto the same execution core
- no separate completion-specific execution state

### Slice 4: image routes

Deliverables:
- `/v1/images/generations`
- `/v1/images/edits`

only if the runtime execution core already supports stable artifact outputs

### Slice 5: AuraCall-native operational endpoints

Deliverables:
- `/auracall/...` admin/ops endpoints for things that should not be forced into
  OpenAI compatibility

## Out of scope for the first API slice

- full HTTP server implementation
- auth/productization details
- billing/accounting policy
- speculative music/video custom endpoint families
- browser-admin endpoints mixed into `/v1/...`
- separate MCP-only execution model

## Recommended next coding slice after this plan

Once the runtime execution record contract exists, the next API-facing slice
should be:

- define the route-neutral execution request/response types for a
  runtime-backed `POST /v1/responses` surface

That is the best anchor because it preserves OpenAI compatibility while also
giving AuraCall one authoritative execution shape for later `chat/completions`,
MCP, and operational APIs.
