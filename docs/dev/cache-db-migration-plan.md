# Cache DB Migration Plan (Phase 7)

## Objective
Move Oracle’s provider cache from JSON-only storage to a database-backed model while preserving:
- existing CLI behavior,
- existing on-disk compatibility,
- and fast rollback safety.

This plan introduces SQLite as the structured store and keeps JSON as a compatibility mirror during rollout.

For detailed source/file catalog normalization (including file path pointers for future downloadable assets),
see `docs/dev/cache-sql-file-catalog-plan.md`.
For the prioritized remaining workstream backlog (ops/integrity/query/export), see
`docs/dev/cache-remaining-todos-plan.md`.

## Why now
- Context retrieval now stores richer artifacts (`contexts`, attachments/files, project instructions).
- Query/load patterns are increasingly index-like, which JSON trees handle poorly at scale.
- We need stable cache reads for agents and exports without repeated full-file scans.

## Current baseline
- JSON cache layout is stable and documented in `docs/dev/cache-schema.md`.
- `CacheStore` abstraction exists in `src/browser/llmService/cache/store.ts`.
- `JsonCacheStore` is the current compatibility path.

## Target architecture
- Introduce `SqliteCacheStore` with a single DB per provider+identity:
  - `~/.oracle/cache/providers/<provider>/<identity>/cache.sqlite`
- Keep `JsonCacheStore` as compatibility path.
- Add `DualCacheStore`:
  - read primary (SQLite),
  - fallback read secondary (JSON),
  - write both.
- Make backend selectable via config:
  - `browser.cache.store = "json" | "sqlite" | "dual"`
  - default: `"dual"` for migration safety.

## Data model
- Table: `cache_entries`
  - `dataset` (projects, conversations, context, files, attachments, instructions)
  - `entity_id` (projectId/conversationId/empty for list datasets)
  - `items_json` (payload)
  - `fetched_at`, `source_url`, `user_identity_json`, `identity_key`, `updated_at`
  - PK: `(dataset, entity_id)`
- Table: `meta`
  - migration/backfill sentinels (`backfill_v1`)

## Rollout phases

### Phase A: Plumbing and parity
1. Add store selection in schema/config/profile defaults (`cache.store`).
2. Wire `LlmService` to instantiate cache backend from config.
3. Keep JSON index updates (`cache-index.json`) unchanged for export compatibility.

Exit criteria:
- Typecheck clean.
- Existing commands still work without config changes.

### Phase B: Safe migration (`dual`)
1. On first SQLite use for a provider+identity, backfill from JSON cache files.
2. Mark completion with `meta.backfill_v1`.
3. In dual mode:
  - primary failures should not break CLI if secondary succeeds.
  - reads and writes continue via JSON mirror.

Exit criteria:
- Cache commands read data after upgrade without manual migration.
- SQLite failures degrade gracefully in dual mode.

### Phase C: Verification and observability
1. Validate cache commands and exports in dual mode.
2. Validate JSON and SQLite paths remain coherent after create/rename/delete flows.
3. Add dev docs entries for failure modes and rollback.

Exit criteria:
- `cache context list/get/export` operate with dual mode enabled.
- No regression in project/conversation cache refresh flows.

### Phase D: Future hardening (follow-up)
1. Add integrity checks (`PRAGMA quick_check`) and optional repair tooling.
2. Add explicit migration/version table for future schema evolution.
3. Add query-oriented cache commands that use SQLite efficiently.

## Failure/rollback strategy
- Immediate rollback: set `browser.cache.store: "json"`.
- Because dual writes JSON continuously, rollback requires no data conversion.
- SQLite unavailability (missing `node:sqlite`) is treated as:
  - hard failure in `sqlite` mode,
  - soft fallback to JSON behavior in `dual` mode.

## Risks and mitigations
- Risk: partial migration writes.
  - Mitigation: backfill idempotency via `meta.backfill_v1`.
- Risk: runtime environments without `node:sqlite`.
  - Mitigation: explicit error in sqlite mode + graceful fallback in dual mode.
- Risk: stale divergence between JSON and SQLite.
  - Mitigation: dual writes and read fallback; keep index updates in shared path.

## Validation checklist
- `pnpm run -s check`
- CLI help paths:
  - `pnpm tsx bin/oracle-cli.ts cache context list --help`
  - `pnpm tsx bin/oracle-cli.ts cache context get --help`
  - `pnpm tsx bin/oracle-cli.ts cache export --help`
- Live/real-cache verification:
  - run cache reads with `cache.store=dual`
  - confirm JSON export still contains context entries

## Implementation status
- [x] Store abstraction supports json/sqlite/dual.
- [x] Schema + profile config support `cache.store`.
- [x] LlmService resolves backend from config.
- [x] SQLite backfill from JSON on first use.
- [ ] Add dedicated cache integrity tooling (`doctor`/repair command).
