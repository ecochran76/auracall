# Cache Remaining TODOs Plan

## Objective
Finish the cache transition so Oracle can depend on SQLite as the primary cache system for:
- agent retrieval,
- end-user export,
- and operational maintenance (reset/cleanup/integrity).

This plan focuses on what is still missing after SQL catalog + SQL-first `cache context` reads.

## Current state (as of 2026-02-23)
- Done:
  - dual store (`json|sqlite|dual`) and SQL catalog tables (`source_links`, `file_bindings`, `file_assets`)
  - catalog backfill (`backfill_catalog_v2`)
  - SQL-first `cache context list/get`
  - cache context query surface: `cache context search` (keyword) and `cache context semantic-search`
  - context source extraction + persistence
  - refresh hydration modes: default existing-ID project backfill + opt-in `--include-project-only-conversations`
  - cache maintenance lock + SQLite busy retry for clear/cleanup/compact/repair/doctor paths
  - doctor parity checks (`cache_entries` vs `cache-index.json`) + orphan catalog checks
  - repair parity actions (`prune-orphan-source-links`, `prune-orphan-file-bindings`)
- Not done:
  - operator cache lifecycle commands (advanced multi-process contention monitoring still pending)
  - SQL-first catalog query commands (sources/files) in CLI (base `list` commands landed)
  - SQL-first export/discovery path (still index/json-centric in places)
  - deterministic downloadable file ingestion for ChatGPT (started: deterministic blob staging + detached blob cleanup)
  - integrity checks with automated repair options (remaining: deeper migration/catalog parity checks)

## Design constraints
- Keep per-provider/per-identity segregation (`~/.oracle/cache/providers/<provider>/<identity>/`).
- Keep JSON mirror in dual mode until parity and repair tooling are complete.
- Avoid destructive behavior without explicit user confirmation (`--yes`).
- Keep rollback simple: `cache.store=json` must continue to work.

## Workstreams

### WS1: Cache operations (reset/cleanup)
Purpose: give users/admins safe cache lifecycle controls.

Status: Landed (`cache clear`, `cache compact`, `cache cleanup`) with per-identity lock + SQLite busy retry hardening.

Tasks:
1. Add `oracle cache clear`:
   - scope by `--provider`, `--identity-key`, `--dataset`, optional `--older-than`.
   - default dry-run preview; require `--yes` to execute.
2. Add `oracle cache compact`:
   - run SQLite `VACUUM` and `ANALYZE` per selected provider/identity.
3. Add `oracle cache cleanup`:
   - prune stale/orphaned JSON artifacts and optional stale SQL rows by TTL policy.

Acceptance:
- clear/compact/cleanup have deterministic output and summary counts.
- no accidental destructive operation without `--yes`.

### WS2: SQL-first query surface
Purpose: expose catalog data without raw DB inspection.

Status: In progress (context-level query/search landed; `cache sources/files list` and `cache files resolve` landed; richer diagnostics and doctor integration still pending).

Tasks:
1. Add `oracle cache sources list`:
   - filters: `--conversation-id`, `--provider`, `--identity-key`, `--domain`, `--limit`.
2. Add `oracle cache files list`:
   - filters: `--project-id`, `--conversation-id`, `--dataset`, `--provider`.
3. Add `oracle cache files resolve`:
   - show path-pointer status (`storage_relpath`, external path, missing local target).

Acceptance:
- commands read from SQL first in dual/sqlite mode.
- JSON fallback remains available in json mode.

### WS3: Export path hardening
Purpose: reduce index/json dependency for exports.

Status: In progress (SQL-first export discovery + store-backed materialization landed for conversation/context flows; full parity matrix and broader project-scope validation still pending).

Tasks:
1. Make export entry discovery SQL-first where dataset exists in SQL.
2. Keep `cache-index.json` as compatibility manifest, but no longer required for core exports.
3. Add export parity test matrix (`json/md/html/csv/zip`) against SQL-only populated cache.

Acceptance:
- exports succeed when index is missing but SQL contains required data.
- exported payload counts match SQL row counts for selected scope.

### WS4: Downloadable file lifecycle (ChatGPT-ready)
Purpose: support high-volume file-heavy conversations/projects.

Status: Started (deterministic local blob staging + `file_assets` pointer updates + detached blob cleanup in `cache cleanup`).

Tasks:
1. Define local storage policy for downloads:
   - path template: `<provider>/<identity>/blobs/<sha256>/<filename>`
   - enforce metadata write (`mime`, checksum, bytes, source URL).
2. Add ingestion path that upserts `file_assets` and binds via `file_bindings.asset_id`.
3. Add retention policy:
   - `maxBytes`, `maxAgeDays`, optional `keepPinned`.

Acceptance:
- file rows are resolvable to either local cache path or explicit remote pointer.
- retention cleanup does not break bindings without marking status.

### WS5: Integrity + repair tooling
Purpose: detect and correct silent drift/corruption.

Status: In progress (`cache doctor` + `cache repair` landed with parity drift checks/actions; further migration/catalog depth still pending).

Tasks:
1. Add `oracle cache doctor`:
   - checks: `PRAGMA quick_check`, missing tables, orphan bindings, broken relpaths, stale migration markers.
2. Add `oracle cache repair`:
   - optional actions: rebuild index from SQL, re-run catalog backfill, prune orphan rows.
3. Emit machine-readable report (`--json`) for automation.

Acceptance:
- doctor reports actionable findings with counts and severity.
- repair actions are idempotent and reversible via backup/snapshot.

## Priority and sequence
1. WS1 (operations) and WS5 (doctor/repair) first.
2. WS2 (SQL query commands) second.
3. WS3 (export SQL-first) third.
4. WS4 (download lifecycle) fourth.

Reason:
- operational safety and integrity are prerequisite to relying on SQL at scale.

## Smoke checklist (must pass before marking complete)
- `pnpm run -s check`
- `pnpm tsx scripts/verify-cache-sql-catalog.ts --provider grok <conversationId>`
- `oracle cache context list/get` in `dual` and `json` modes
- new operations:
  - `oracle cache clear --dry-run`
  - `oracle cache compact`
  - `oracle cache doctor --json`
  - `oracle cache repair --dry-run`

## Open decisions
1. Should `cache clear` remove blobs by default or require `--include-blobs`?
2. Should `cache repair` auto-backup `cache.sqlite` before mutation?
3. When can we switch default from `dual` to `sqlite`?

## Exit criteria
- Core cache CLI flows (list/get/export/ops) are SQL-first and parity-tested.
- Integrity tooling exists and is documented.
- JSON mirror remains optional compatibility layer, not a hard dependency.
