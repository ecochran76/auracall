# Cache Architecture Plan

## Purpose

Define the next durable architecture for Aura-Call's provider cache subsystem so
it is:

- robust under partial failure and migration
- maintainable as more providers and artifact surfaces land
- highly searchable for agents and operators
- explicit about what data is canonical versus derived

This document is intentionally above the current implementation plans:

- [cache-schema.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-schema.md)
- [cache-db-migration-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-db-migration-plan.md)
- [cache-sql-file-catalog-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-sql-file-catalog-plan.md)
- [cache-remaining-todos-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-remaining-todos-plan.md)
- [cache-artifact-projection-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-artifact-projection-plan.md)

It should be treated as the anti-drift reference for future cache work:

- do not add new cache command behavior without mapping it to this model
- do not make provider-local cache exceptions unless a shared cache seam truly
  cannot support the surface
- do not blur canonical records with search/export/maintenance projections

## Current audit

The current cache subsystem already has strong pieces:

- provider + identity segregation
- `LlmService` cache context and identity resolution
- JSON cache payloads with stable on-disk locations
- SQLite `cache_entries` plus catalog tables
- source/file query surfaces
- export, doctor, repair, clear, compact, and cleanup commands

The main remaining weakness is architectural clarity.

Today the subsystem still mixes three concerns too closely:

1. canonical cache records
2. derived relational/search catalogs
3. operator/report/export views

That makes the system effective, but harder than necessary to evolve safely.

## Design principles

### 1. Canonical first

Every cache write should have one authoritative record shape.

Canonical records should answer:

- what entity was cached
- what provider/account/runtime scope it belongs to
- what normalized data Aura-Call believes is true
- what provider-specific extension metadata still needs to be preserved

Canonical records should not be optimized first for:

- SQL queries
- export shape
- maintenance reports
- CLI convenience

Those are projection concerns.

### 2. Derived projections are rebuildable

Anything used for:

- search
- catalog queries
- export planning
- parity checks
- maintenance scans

should be treated as a derived projection over canonical cache records.

That means:

- SQLite catalogs should be rebuildable from canonical records
- `cache-index.json` should be rebuildable from canonical records
- export plans should not need hidden provider heuristics to recover what the
  cache "really meant"

### 3. Entity-oriented model, dataset-oriented storage

The implementation can still store data by dataset, but the conceptual model
should center on entities:

- provider cache scope
- project
- conversation
- conversation context
- file
- source
- artifact
- instruction

This matters because operators and agents ask entity-shaped questions, not
dataset-shaped ones.

### 4. Provider-specific semantics belong in typed extension payloads

Aura-Call should normalize the shared fields it can depend on and preserve
provider-specific richness without collapsing everything into unstructured
metadata blobs.

Rule:

- normalize shared fields into typed top-level records
- keep provider-specific extras in explicit extension payloads, not ad hoc
  command-local parsing

### 5. Searchability is a first-class requirement

The cache is not only a persistence layer. It is a retrieval substrate for:

- CLI inspection
- local workflows
- agent retrieval
- export and audit

That means the cache model should make it easy to query:

- messages
- sources
- files
- artifacts
- entity relationships

without requiring every feature to scan raw JSON trees.

## Target architecture

The target subsystem should have four layers.

### Layer A: Cache scope

One scope per:

- provider
- identity key

Scoped under:

- `~/.auracall/cache/providers/<provider>/<identityKey>/`

This layer owns:

- segregation
- TTL/config lineage
- provider/account identity lineage
- cache version markers

### Layer B: Canonical records

Canonical records are the authoritative cached payloads.

Proposed canonical record families:

1. `project`
2. `conversation`
3. `conversation-context`
4. `project-instructions`
5. `file-manifest`
6. `artifact-manifest`

Canonical record properties:

- stored durably on disk in JSON-compatible form
- versioned
- readable without SQLite
- complete enough to rebuild projections

Proposed rule:

- JSON remains the canonical compatibility artifact until Aura-Call explicitly
  decides to promote a versioned structured record store beyond current JSON
  envelopes

### Layer C: Derived projections

Derived projections are optimized views over canonical records.

They include:

- `cache_entries`
- `source_links`
- `file_bindings`
- `file_assets`
- future `artifact_bindings`
- future search chunk / embedding tables
- `cache-index.json`

Derived projections should be:

- versioned
- backfillable
- rebuildable
- disposable when corrupted

### Layer D: Operator views

Operator views are command-facing and export-facing renderings.

They include:

- `cache context list|get|search|semantic-search`
- `cache sources list`
- `cache files list|resolve`
- `cache export`
- `cache doctor|repair|clear|compact|cleanup`

These should depend on Layers B and C, but should not define cache meaning.

## Canonical data model

### Cache scope record

Fields Aura-Call should consistently know for every cache scope:

- `provider`
- `identityKey`
- `userIdentity`
- `featureSignature`
- `configuredUrl`
- `cacheVersion`
- `projectionVersion`

### Project record

Shared normalized fields:

- `id`
- `name`
- `provider`
- `url`
- `memoryMode`

Extension payload:

- provider-specific project metadata

### Conversation record

Shared normalized fields:

- `id`
- `title`
- `provider`
- `projectId`
- `url`
- `updatedAt`

Extension payload:

- provider-specific listing metadata

### Conversation context record

Shared normalized fields:

- `provider`
- `conversationId`
- `projectId` when known
- `messages[]`
- `sources[]`
- `files[]`
- `artifacts[]`

Important requirement:

- this record should be the canonical parent for all conversation-local
  relations that can be derived into catalogs

### File manifest record

This should cover:

- account files
- conversation files
- conversation attachments
- project knowledge

Shared normalized file fields:

- `id`
- `name`
- `provider`
- `source`
- `size`
- `mimeType`
- `remoteUrl`
- `localPath`
- `checksumSha256`

Binding-level metadata should stay separate from asset-level metadata.

### Artifact manifest record

Artifacts need to become first-class instead of living only as optional arrays
inside conversation context plus provider-specific `metadata`.

Shared normalized artifact fields should include:

- `id`
- `title`
- `kind`
- `conversationId`
- `projectId` when known
- `messageIndex`
- `messageId`
- `uri`
- `materializationState`
- `materializedFiles[]`

Extension payload:

- provider-specific artifact metadata

Examples this must support:

- ChatGPT downloadable files
- ChatGPT textdocs/canvas blocks
- ChatGPT generated images
- ChatGPT tables/spreadsheets
- Gemini generated assets
- Grok downloadable/generated outputs

## Projection model

### Existing projections worth keeping

- `cache_entries`
- `source_links`
- `file_bindings`
- `file_assets`

### Projections to add

1. `artifact_bindings`
   - artifact-level searchable catalog
   - link to conversation/message/project scope
   - link to materialized file assets when present

2. optional `entity_inventory`
   - a single searchable inventory of project/conversation/context/file/artifact
     identities
   - useful for export planning, doctor, and future UI

3. optional `search_chunks`
   - pre-chunked normalized text units for messages, sources, and artifacts
   - keeps semantic/keyword search from repeatedly re-deriving chunks from raw
     context

### Projection ownership rule

Projection sync should be explicit.

Do not hide projection semantics inside arbitrary cache writes.

Instead:

- canonical record write
- projection sync/update
- projection rebuild path

should be separately named phases, even if they happen in one call today.

## Search model

### Keyword search

Keyword search should operate over normalized search units with stable scopes:

- message text
- source descriptors
- artifact descriptors
- optional file descriptors

### Semantic search

Semantic search should use the same normalized search units, not a separate
ad hoc representation.

Rule:

- chunking policy should be shared across keyword and semantic search
- embeddings are cached projections, not canonical data

### Search result identity

Every hit should resolve cleanly back to:

- cache scope
- entity type
- entity id
- optional conversation message index
- optional artifact id

## Export model

Exports should be generated from canonical records plus projection lookups when
helpful, not from whichever index happens to be available.

Preferred export order:

1. canonical record lookup
2. projection-assisted enumeration
3. filesystem fallback only for compatibility/recovery

This keeps export behavior stable even if one derived projection is stale.

## Maintenance model

Maintenance should work on projections and blobs, while preserving canonical
records unless the operator explicitly asks to clear them.

Maintenance classes:

1. integrity checks
2. projection repair/rebuild
3. blob lifecycle/retention
4. cache record clear/cleanup

Important rule:

- repairing derived projections should not mutate canonical records unless the
  operator chose a destructive canonical cleanup action

## Migration strategy

### Phase 1: Clarify contracts

- document canonical vs derived ownership
- add explicit cache/model terminology to code comments and docs
- stop introducing new command-local cache semantics

### Phase 2: Artifact-first schema expansion

- add first-class artifact catalog/projection support
- add artifact-aware export/search surfaces

### Phase 3: Projection sync extraction

- extract projection sync out of mixed write paths into clearer shared helpers
- make rebuild/backfill path explicit and reusable

### Phase 4: Search normalization

- unify keyword and semantic search over shared normalized search units
- add artifact search coverage

### Phase 5: Maintenance hardening

- doctor/repair operate over explicit canonical/projection boundaries
- make projection rebuild and parity verification more complete

## Anti-drift rules for future cache work

1. Do not add a new cache surface without classifying it as:
   - canonical record
   - derived projection
   - operator view

2. Do not hide provider-specific meaning only inside untyped `metadata` if the
   field is likely to matter for search, export, or maintenance.

3. Do not let exports depend on `cache-index.json` as if it were authoritative.

4. Do not let CLI commands assemble their own cache policy when a shared cache
   seam can own it.

5. Do not add a new artifact surface without deciding:
   - canonical representation
   - catalog/search projection
   - export/materialization behavior

## Immediate next implementation slice

The next highest-value slice is:

1. artifact catalog design + schema proposal
2. projection sync extraction plan
3. one shared cache model test fixture that covers:
   - messages
   - sources
   - files
   - artifacts
   - provider-specific extension payloads

That concrete next-step plan now exists in:

- [cache-artifact-projection-plan.md](/home/ecochran76/workspace.local/auracall/docs/dev/cache-artifact-projection-plan.md)

That should happen before more ad hoc cache export or maintenance expansion.
