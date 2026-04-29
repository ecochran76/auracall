# Cache Artifact + Projection Sync Plan

Architecture reference:
- [cache-architecture-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-architecture-plan.md)
  is the anti-drift contract for canonical records vs derived projections vs
  operator views.

## Purpose

Turn the architecture direction into one bounded implementation slice that:

- makes artifacts first-class cache entities
- extracts projection sync from ad hoc cache write paths
- improves searchability without redefining canonical cache payloads mid-flight

This plan is intentionally narrower than a full cache rewrite. It should land
the next durable seam without destabilizing existing provider cache flows.

## Why this slice now

Current code already proves the gap:

- canonical conversation context can carry `artifacts[]`
- export renders `artifacts[]` directly from raw context
- sources and files already have first-class projection tables
- artifacts still do not

That means:

- artifact-aware operator/search/export work stays more JSON-scan-heavy than it
  needs to be
- projection logic is inconsistent across source/file/artifact surfaces
- future provider parity work will keep adding one-off artifact heuristics
  unless the cache model gives artifacts a shared home

## Anti-drift rules

1. Do not redefine canonical context shape during this slice.
   - keep `ConversationContext.artifacts[]` as the canonical compatibility
     payload
   - introduce projection/schema improvements around it first

2. Do not let export become the artifact source of truth.
   - export may read canonical context and projections
   - it must not invent artifact semantics that the cache model does not own

3. Do not add provider-local artifact tables or Gemini-only cache logic.
   - if the model cannot support ChatGPT, Gemini, and Grok artifact rows, the
     model is not ready

4. Keep projections rebuildable.
   - artifact projection state must be disposable and reconstructible from
     canonical records

5. Keep the implementation entity-oriented.
   - artifact records should be queryable by conversation, message, provider,
     and artifact kind

## Current code boundary

Canonical model:
- [domain.ts](/home/ecochran76/workspace.local/auracall/src/browser/providers/domain.ts)
  defines `ConversationArtifact`

Projection writes today:
- [store.ts](/home/ecochran76/workspace.local/auracall/src/browser/llmService/cache/store.ts)
  syncs `source_links`
- [store.ts](/home/ecochran76/workspace.local/auracall/src/browser/llmService/cache/store.ts)
  syncs `file_bindings` / `file_assets`
- artifact sync does not yet exist

Operator/query surfaces today:
- [catalog.ts](/home/ecochran76/workspace.local/auracall/src/browser/llmService/cache/catalog.ts)
  supports sources/files catalogs
- artifact catalog/query helpers do not yet exist

Export today:
- [export.ts](/home/ecochran76/workspace.local/auracall/src/browser/llmService/cache/export.ts)
  reads `context.artifacts[]` directly

## Proposed bounded outcome

This slice should land three concrete seams.

### Seam 1: Artifact projection schema

Add a first-class SQLite projection table:

- `artifact_bindings`

Minimum columns:
- `artifact_id TEXT`
- `conversation_id TEXT NOT NULL`
- `message_index INTEGER`
- `message_id TEXT`
- `title TEXT NOT NULL`
- `kind TEXT`
- `uri TEXT`
- `provider TEXT`
- `metadata_json TEXT`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

Indexes:
- `(conversation_id, updated_at)`
- `(kind, updated_at)`
- `(message_id, updated_at)`

Rules:
- `artifact_id` should be stable across rebuilds where the same canonical
  artifact record is seen again
- use a deterministic hash over normalized artifact identity inputs

### Seam 2: Projection sync extraction

Extract relation/catalog sync out of ad hoc write code into one shared module,
for example:

- `src/browser/llmService/cache/projectionSync.ts`

That module should own:
- source link sync
- file binding sync
- artifact binding sync

`CacheStore` should remain responsible for:
- canonical record writes
- migration orchestration
- calling projection sync

Projection sync should be a named boundary because it is:
- rebuildable
- repairable
- versioned independently from canonical JSON envelopes

### Seam 3: Artifact operator catalog surface

Add cache catalog support for artifacts comparable to sources/files.

Candidate command family:
- `cache artifacts list`

Minimum filters:
- `--conversation-id`
- `--kind`
- `--query`
- `--limit`

This does not need full artifact materialization yet. The goal is searchable,
provider-agnostic artifact inventory first.

## Proposed implementation order

### Phase 1: Schema + internal sync seam

Code:
- add `artifact_bindings` migration
- extract source/file sync into a shared projection-sync module
- add artifact sync on conversation-context writes

Acceptance:
- no change in user-visible cache behavior required yet
- existing source/file tests remain green
- new artifact projection tests prove rebuild from canonical context

### Phase 2: Internal query helpers

Code:
- add artifact catalog query helpers with SQLite-first and JSON fallback paths
- keep JSON fallback based on `ConversationContext.artifacts[]`

Acceptance:
- artifact catalog rows are returned consistently in `dual` and `json` modes
- no provider-specific special-casing in the catalog layer

### Phase 3: CLI/operator exposure

Code:
- expose `cache artifacts list`
- wire docs/help/examples

Acceptance:
- fixture-backed CLI tests cover artifact listing and filtering
- operator output is deterministic across providers for shared fields

### Phase 4: Export alignment

Code:
- keep export rendering from canonical context for transcript fidelity
- ensure export/report surfaces distinguish:
  - user/provider-supplied `files[]`
  - provider/model output `artifacts[]`
- optionally use artifact catalog rows for discovery/report counts later

Acceptance:
- export behavior is unchanged or clearer
- conversation/context exports do not imply that artifacts are the only
  attachment-like surface
- export no longer needs to be the only practical artifact inspection surface

## Testing plan

Add one shared cache fixture that includes:

- messages
- sources
- files
- artifacts
- provider extension metadata

Use it for:
- projection rebuild tests
- artifact catalog tests
- CLI artifact listing tests

Specific regression goals:
- canonical context with artifacts rebuilds `artifact_bindings`
- artifact queries work when SQLite exists
- artifact queries still work from JSON fallback alone
- projection rebuild remains idempotent

## Non-goals for this slice

- full artifact download/materialization policy
- embedding/semantic search redesign
- canonical JSON schema replacement
- provider-specific artifact normalization beyond shared fields already present

## Exit criteria

This slice is done when:

- artifact projection schema exists
- projection sync is a named shared module
- source/file sync uses that module
- conversation-context artifact rows are projected into SQLite
- a basic artifact catalog/operator surface exists with tests

## Follow-on work after this slice

- artifact materialization policy
- export/discovery use of artifact catalog projections
- richer artifact normalization if providers converge on more shared metadata
