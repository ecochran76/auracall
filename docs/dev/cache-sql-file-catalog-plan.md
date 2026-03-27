# Cache SQL File Catalog Plan

## Objective
Make SQLite a dependable metadata backbone for cached context and files, with:
- strict segregation by `provider + identity`,
- normalized source/file relations for agent retrieval,
- and path-pointer storage that supports future ChatGPT file downloads.

This doc covers catalog architecture. For prioritized remaining implementation tasks across
operations/integrity/export/query surfaces, see `docs/dev/cache-remaining-todos-plan.md`.

## Scope
- Cache metadata only (no blob migration in this phase).
- Grok and ChatGPT cache trees under:
  - `~/.oracle/cache/providers/<provider>/<identity>/cache.sqlite`
- Keep JSON mirror compatibility while we harden SQL reads.

## Current design decisions
- Segregation:
  - one SQLite DB per provider+identity cache directory.
  - identity remains in row metadata for lineage, even with per-identity DB partitioning.
- Source links:
  - persist per conversation/message/url in `source_links`.
  - keep `source_group` (for buckets like `Searched web` / `Searched 𝕏`) when available.
- File bindings:
  - persist references in `file_bindings` keyed by dataset/entity.
  - include optional `asset_id` pointer to `file_assets`.
- File assets:
  - metadata-only record (`size`, `mime`, `checksum`, `storage_relpath`, status).
  - `storage_relpath` is used when file lives under cache root.
  - external absolute paths are kept in binding metadata, not as blobs.

## Phases

### Phase A (now)
1. Ensure schema tables exist for catalog data:
   - `schema_migrations`, `file_assets`, `file_bindings`, `source_links`.
2. Write-through from existing flows:
   - conversation context -> `source_links`, `file_bindings`.
   - conversation files/attachments + project knowledge -> `file_bindings`.
   - optional local file path -> `file_assets`.
3. Add v2 catalog backfill:
   - populate catalog tables from existing `cache_entries` rows.
4. Add smoke verification script for table presence + row counts.

### Phase B
1. Add SQL-first read APIs for agents:
   - context sources by conversation,
   - file bindings by project/conversation.
2. Add `oracle cache` subcommands to query catalog tables directly.

### Phase C
1. Add ChatGPT download-aware asset ingestion:
   - deterministic cache-relative storage paths for downloaded files.
   - checksum/mime enrichment where available.
2. Add retention/cleanup policies for local cached files.

### Phase D
1. Add schema migration utilities:
   - migration version checks + repair command.
2. Add integrity checks:
   - orphaned file bindings,
   - missing asset paths,
   - stale source link references.

## Verification
- Typecheck: `pnpm run -s check`
- SQL catalog smoke:
  - `pnpm tsx scripts/verify-cache-sql-catalog.ts --provider grok <conversationId>`
  - `pnpm tsx scripts/verify-cache-sql-catalog.ts --provider chatgpt`

## Risks
- Existing DBs may contain only v1 tables until a write/seed path runs.
  - Mitigation: explicit catalog backfill pass (`backfill_catalog_v2`) after DB init.
- External file paths are host-specific.
  - Mitigation: prefer cache-relative pointers when files are under cache root; keep external path metadata explicit.
