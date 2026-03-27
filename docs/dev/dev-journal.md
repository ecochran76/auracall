# Dev Journal

Log ongoing progress, current focus, and problems/solutions. Keep entries brief and ordered newest-first.

## Entry format

- Date:
- Focus:
- Progress:
- Issues:
- Next:

## Entries

- Date: 2026-02-24
- Focus: Mirror-first cache defaults (history depth + project-only hydration + cleanup retention).
- Progress: Added config/schema support for `cache.includeProjectOnlyConversations` and `cache.cleanupDays`; wired profile cache override propagation; switched CLI/browser fallback defaults to generous mirror-oriented values (`historyLimit=2000`, cleanup default `days=365`); made `cache --refresh` default `includeProjectOnlyConversations` resolve from cache config instead of hard-coded false; aligned Grok/llmService history fallback limits to `2000`; updated configuration/browser docs accordingly.
- Issues: Existing user configs with explicit conservative cache values will continue using those values until updated (expected precedence behavior).
- Next: Run cache refresh + cleanup smoke on a real account fixture to confirm defaults behave as expected under non-CLI override paths.

- Date: 2026-02-23
- Focus: Cache hardening wave (refresh regression smoke, maintenance contention, parity repair, WS4 bootstrap).
- Progress: Added `scripts/verify-cache-refresh-modes.ts` to assert refresh-mode behavior (default excludes project-only IDs; `--include-project-only-conversations` increases project-only coverage). Hardened cache maintenance with SQLite busy retry handling on doctor/clear/compact/repair SQL operations. Extended `cache doctor` with parity diagnostics (`cache_entries` vs `cache-index.json`) and orphan catalog counts; extended `cache repair` with targeted parity actions (`prune-orphan-source-links`, `prune-orphan-file-bindings`). Started WS4 by staging local file refs into deterministic cache blobs (`blobs/<sha256>/<filename>`) in SQL store sync, updating file-asset pointers/metadata, and pruning detached stale blobs during cleanup.
- Issues: Runtime CLI smoke commands (`pnpm tsx ...`) are blocked in this sandbox (`EPERM` tsx IPC socket), so command-level execution must be validated in your normal terminal.
- Next: Add dedicated doctor checks for migration marker/catalog parity and validate blob retention safety thresholds (`maxBytes` / `maxAgeDays`) before enabling aggressive cleanup policies.

- Date: 2026-02-23
- Focus: Opt-in project-only conversation ID hydration during `cache --refresh`.
- Progress: Added `--include-project-only-conversations` to `oracle cache --refresh`. Default refresh behavior is unchanged (backfill project linkage only for global conversation IDs). With the new flag, refresh also inserts project-scoped conversation IDs discovered via per-project `listConversations(projectId)` and writes via cache-store APIs.
- Issues: Enabling the flag can increase cached conversation volume for large project sets; operators should pair it with sensible history bounds when needed.
- Next: Add a dedicated refresh smoke that compares baseline vs opt-in ID counts for a known project fixture.

- Date: 2026-02-23
- Focus: Project-linked conversation ID enrichment during cache refresh.
- Progress: Updated `refreshProviderCache` to enrich global conversations with project associations by querying each project’s scoped conversation list and only backfilling `projectId`/project URL for conversation IDs that already exist in the global list. Also switched refresh writes to cache-store APIs (`json|sqlite|dual`) so SQL + JSON stay consistent for exports/search.
- Issues: Backfill depends on global list coverage; if a project conversation ID is not present in the global snapshot (for example low history limit), it is intentionally not inserted.
- Next: Consider adding an opt-in mode to include project-only IDs when users explicitly request full project-link hydration.

- Date: 2026-02-23
- Focus: Cache export `--project-id` regression fix.
- Progress: Fixed export planner/renderer so project filtering works for `scope=projects` and is applied deterministically at payload level (not only index-entry selection). Added conversation project-id fallback extraction from URL to improve `scope=conversations --project-id` filtering when explicit `projectId` is missing. Verified with CLI exports and parity smoke.
- Issues: Current Grok cached `conversations.json` for `ez86944@gmail.com` contains no project-associated conversation rows for SoyLei (`projectId` absent and URLs are `/c/...`), so `scope=conversations --project-id ...` legitimately yields an empty conversations payload in this identity.
- Next: Decide whether to enrich cached conversation metadata with project linkage during scrape/refresh so project-scoped conversation exports can include project chats reliably.

- Date: 2026-02-23
- Focus: Cache validation sweep (Grok, SQL-backed identity).
- Progress: Ran strict cache checks and export parity for `grok/ez86944@gmail.com`: `cache doctor --strict` clean, `cache repair --actions all` dry-run clean, context source parity confirmed (`37` live vs `37` cache for `d9845a8e-f357-4969-8b1b-960e73af8989`), SQL catalog smoke clean, and conversation export parity (`6707a57d-4bfe-4859-82a5-968b19c052f8`) including no-index path clean. Also ran `cache clear` and `cache cleanup` dry-runs for safety checks.
- Issues: `cache export` filtering by `--project-id` appears ineffective for both `--scope projects` and `--scope conversations` (returns all or zero unexpectedly despite project existing in cached `projects.json`).
- Next: Fix export planner filtering semantics for project-scoped exports and add regression coverage for `--project-id` across scopes.

- Date: 2026-02-23
- Focus: Grok project CRUD regression check after sidebar/instructions UI updates.
- Progress: Patched `pushProjectInstructionsEditButton` to fall back from label-based button press to clicking the visible instructions side-panel card (`group/side-panel-section`). Re-ran Grok project smokes: instructions edit + modal read pass, project menu open/rename/remove entry points pass (remove pass confirmed after exiting rename-edit mode), create modal steps 1–3 pass, and CLI `projects instructions get` now succeeds for SoyLei project `8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`.
- Issues: Sequential menu smokes can leave the UI in "Editing project name" state; subsequent menu open checks can fail until edit mode is exited (Save/Escape).
- Next: Add state-reset guard in project menu smoke scripts (or helper) so rename-mode side effects do not contaminate subsequent checks.

- Date: 2026-02-23
- Focus: SoyLei cache scrape + export parity validation.
- Progress: Resolved SoyLei project (`8d2b61a7-6bcd-496f-ae3a-c20b3bd09e62`), refreshed project/conversation caches, scraped context payloads for all SoyLei conversations (`6707a57d-4bfe-4859-82a5-968b19c052f8`, `38469740-1cd0-42db-86b8-347ba07516f7`, `054f8198-6505-47a5-a7f4-42e23359fdd8`, `093151a7-2ab8-4383-9ea2-f05451a86a93`), and ran export parity smoke successfully per conversation.
- Issues: `projects instructions get` still fails in Grok with `ensureProjectSidebarOpen` selector miss (`Button not found (candidates: home page, search, history, ec, toggle sidebar)`), so project-instructions dataset was not hydrated during this pass.
- Next: Stabilize Grok project-sidebar opener for instructions modal path, then rerun SoyLei project-level scrape to populate/verify project-scope export entries.

- Date: 2026-02-23
- Focus: WS3 validation automation.
- Progress: Added `scripts/verify-cache-export-parity.ts` to run a cache export matrix (`conversation` json/csv/md/html/zip + json broader scopes) and verify no-index SQL-first behavior automatically. Live smoke passed for Grok conversation `d9845a8e-f357-4969-8b1b-960e73af8989`.
- Issues: Node 25 still emits `node:sqlite` experimental warning unless `NODE_NO_WARNINGS=1` is set.
- Next: Extend parity script with project-scope checks once reliable project fixture IDs are available in cache.

- Date: 2026-02-23
- Focus: WS3 cache export hardening (SQL-first discovery/materialization).
- Progress: Reworked `cache export` planning to use SQL (`cache.sqlite`) entries first, then `cache-index.json`, then filesystem fallback. Added store-backed JSON materialization so exports succeed when JSON mirror files are missing (sqlite-first/dual paths). Verified conversation exports across `json|csv|md|html|zip` and verified export still works when `cache-index.json` is temporarily absent.
- Issues: `cache export --conversation-id` initially ignored dashed option parsing and exported full scope; fixed by normalizing nested command options and reading dashed/camel keys consistently.
- Next: Extend SQL-first discovery/materialization checks to project scopes with heavy project-knowledge/project-instructions coverage.

- Date: 2026-02-23
- Focus: Cache catalog CLI option parsing (`cache sources/files list|resolve`).
- Progress: Fixed hyphenated filter flags (`--conversation-id`, `--project-id`) being silently ignored in catalog commands. Actions now normalize options via command+parent+program merges, and filter extraction reads both camelCase and dashed keys.
- Issues: Commander option resolution differs across nested commands and global flags; relying on a single callback arg object is fragile.
- Next: Apply the same normalized option extraction pattern to any remaining nested cache commands that accept dashed flags.

- Date: 2026-02-23
- Focus: Grok context source completeness (`conversations context get` + cache parity).
- Progress: Hardened Grok source extraction to detect/click the real `N sources` chip controls (not only `[role="button"][aria-label]`), wait for sidebar accordion render, expand `Searched ...` sections, and persist full citations into `context.sources`. Verified live + cache parity for `d9845a8e-f357-4969-8b1b-960e73af8989` (`37` sources in both flows).
- Issues: Source-chip DOM shape differs across Grok layouts; selector logic must stay text/visibility-based rather than strict role+aria assumptions.
- Next: Keep `cache context` machine-friendly for pipelines (`jq`) and continue WS3 SQL-first export/discovery hardening.

- Date: 2026-02-22
- Focus: Cache operations workstream (WS1): clear/compact/cleanup.
- Progress: Added `oracle cache clear`, `oracle cache compact`, and `oracle cache cleanup` with provider/identity scoping, dry-run-first behavior for destructive paths (`clear`/`cleanup` require `--yes`), dataset/cutoff filtering, and JSON reports. Cleanup now also prunes stale cache-index entries and old backups by cutoff.
- Issues: SQLite commands should be run sequentially per identity; parallel cache operations can hit transient `database is locked`.
- Next: Add a dedicated `cache lock`/retry strategy or serialized operation wrapper for batched cache maintenance.

- Date: 2026-02-22
- Focus: Cache repair tooling (`cache repair`).
- Progress: Added `oracle cache repair` with default dry-run and explicit mutation guard (`--apply --yes`), plus action selection (`sync-sql`, `rebuild-index`, `prune-orphan-assets`, `mark-missing-local`, `all`). Repair now creates per-identity backups of `cache.sqlite`/`cache-index.json` before mutating.
- Issues: Repair currently focuses on structural/cache-pointer cleanup only; no high-level conflict resolution for provider-specific semantic drift yet.
- Next: Add targeted `cache repair` sub-actions for catalog re-backfill and index/sql parity validation.

- Date: 2026-02-22
- Focus: Cache integrity tooling (`cache doctor`).
- Progress: Added `oracle cache doctor` with provider/identity filters, JSON output, `--strict` fail mode, SQLite checks (`cache.sqlite` presence, `PRAGMA quick_check`, required table presence), and missing-local file pointer detection via `resolveCachedFiles`.
- Issues: Legacy JSON-only identities still show warning findings (`cache.sqlite not found`), which is expected until those identities are migrated/written via SQL-capable flows.
- Next: Add `cache repair` with safe dry-run actions (index rebuild, catalog backfill rerun, orphan pruning).

- Date: 2026-02-22
- Focus: Cache file-pointer diagnostics.
- Progress: Added `oracle cache files resolve` command and `resolveCachedFiles(...)` in `cache/catalog.ts` to classify file bindings as `local_exists`, `missing_local`, `external_path`, `remote_only`, or `unknown`, with summary counts and `--missing-only` filtering.
- Issues: Current Grok identity cache used for smoke has zero file-binding rows, so resolve output is empty in this environment despite command correctness.
- Next: Add `cache doctor` checks that fail on `missing_local`/orphan bindings and optionally emit repair suggestions.

- Date: 2026-02-22
- Focus: SQL-first cache catalog query commands (sources/files).
- Progress: Added `oracle cache sources list` and `oracle cache files list` backed by new `cache/catalog.ts` (SQL-first reads from `source_links`/`file_bindings` with JSON fallback in `json|dual` modes). Added filter support (conversation/project/domain/dataset/query/limit) and optional `--resolve-paths` for file path expansion.
- Issues: `cache files list` can legitimately return `count: 0` for identities without file-binding writes yet; this is expected until file datasets are cached for that identity.
- Next: Add `cache files resolve`/orphan checks plus cache maintenance commands (`clear`, `compact`, `doctor`) from WS1/WS5.

- Date: 2026-02-22
- Focus: Cache context retrieval/query ergonomics (keyword + semantic search).
- Progress: Added `oracle cache context search <query>` and `oracle cache context semantic-search <query>` backed by SQL-first cache context loading (with JSON fallback), role/conversation filters, and embedding caching in `semantic_embeddings` table. Added docs/testing command examples.
- Issues: Semantic search requires `OPENAI_API_KEY`; Node 25 emits `node:sqlite` experimental warning noise that can break `jq` pipelines unless warnings are suppressed.
- Next: Add cache catalog query commands (`cache sources/files list`) and cache maintenance commands (`clear/compact/doctor`) from the remaining TODO plan.

- Date: 2026-02-22
- Focus: Cache backlog planning (post SQL migration).
- Progress: Added `docs/dev/cache-remaining-todos-plan.md` with prioritized workstreams: cache ops (`clear/compact/cleanup`), SQL-first catalog queries, export hardening, downloadable file lifecycle, and integrity/repair tooling.
- Issues: Current cache operations are still minimal (`refresh`, context list/get, export); no dedicated clear/repair commands yet.
- Next: Implement WS1 (cache clear/compact/cleanup) and WS5 (doctor/repair) first.

- Date: 2026-02-22
- Focus: SQL-first cache context access in CLI.
- Progress: Moved `oracle cache context list/get` to llmService cache APIs that use the active cache store abstraction (SQLite primary in dual mode, JSON fallback), instead of directly reading `cache-index.json`/`contexts/*.json` from CLI code.
- Issues: Sandbox here blocks `tsx` runtime commands (`EPERM` on IPC pipes), so runtime CLI smoke must be re-run in your normal environment.
- Next: Add SQL-first catalog query commands (sources/files tables) so agent workflows can avoid raw DB inspection.

- Date: 2026-02-22
- Focus: SQL cache catalog hardening (sources/files metadata).
- Progress: Added catalog migration/backfill pass (`backfill_catalog_v2`) so existing cache DBs populate `source_links`/`file_bindings`; added file-asset pointer write-through (`file_assets`) with cache-relative path support when available; added `verify-cache-sql-catalog.ts` smoke script.
- Issues: Existing DBs that never hit llmService cache paths can still look v1-only until a cache read/write initializes/backsfills SQL.
- Next: Add SQL-first `cache context`/catalog read commands so verification does not depend on JSON-index pathways.

- Date: 2026-01-24
- Focus: Context cache persistence correctness (SQLite + JSON mirror).
- Progress: Fixed nested-path cache writes so `contexts/<id>.json` is created; verified `conversations context get` now persists both SQLite (`conversation-context`) and JSON mirror with `sources[]`.
- Issues: CLI piping still needs `--json-only` + `NODE_NO_WARNINGS=1` for clean `jq` output due Node SQLite warning noise.
- Next: Add a first-class quiet/json output mode for machine pipelines across CLI commands.

- Date: 2026-01-24
- Focus: Conversation context completeness (include consulted sources).
- Progress: Extended `ConversationContext` with optional `sources[]`; updated Grok context scraper to collect citation links from both inline assistant content and the dedicated `N sources` sidebar (`Searched web` / `Searched 𝕏` accordions), then flow them through llmService normalization/cache output.
- Issues: Live verification still depends on a conversation that includes source links in the current Grok UI.
- Next: Run live `oracle conversations context get <id> --target grok` against a cited conversation and confirm source list quality.

- Date: 2026-01-24
- Focus: Cache DB migration (json/sqlite/dual) with safe rollout.
- Progress: Added `docs/dev/cache-db-migration-plan.md`; wired `browser.cache.store` through schema/profile defaults and `LlmService`; hardened dual-store behavior so SQLite primary failures fall back to JSON mirror; fixed SQLite cache-dir resolution to use provider cache path.
- Issues: Need dedicated integrity/repair tooling for SQLite (`doctor` follow-up).
- Next: Add cache integrity command(s) and broader dual-mode smoke coverage.

- Date: 2026-01-24
- Focus: Cached context accessibility for agents + user exports.
- Progress: Added `oracle cache context list/get` to read cached contexts without live browser calls; extended cache export scope to `contexts` for json/md/html/csv/zip outputs.
- Issues: None so far; relies on existing cache identity resolution.
- Next: Smoke `cache context` and `cache export --scope contexts` against populated Grok cache.

- Date: 2026-01-24
- Focus: Conversation context retrieval plumbing (provider + llmService + CLI).
- Progress: Added Grok `readConversationContext` scraping, `LlmService.getConversationContext` with cache write-through + cached fallback, and `oracle conversations context get <id>` plus `scripts/verify-grok-context-get.ts`.
- Issues: Context retrieval needs resilient scraping for both `/c/<id>` and `/project/<id>?chat=<id>` routes; added explicit invalid-URL checks and message-presence validation to fail clearly.
- Next: Run live Grok context smoke from CLI and confirm cache entries under `contexts/<conversationId>.json`.

- Date: 2026-01-24
- Focus: Grok project file flows after Personal Files UX change.
- Progress: Migrated add/remove/list flows to Personal Files modal interactions; added pending-remove verification (line-through/Undo/opacity) before Save; validated CLI add/remove stability.
- Issues: File listing semantics were briefly inconsistent during transition between old Sources-root and new modal-root selectors.
- Next: Keep CLI file flows stable and continue Phase 7 project/conversation CRUD tasks.

- Date: 2026-01-24
- Focus: Grok Sources tab CRUD smoke + helper exports.
- Progress: Exported Sources helpers for direct smoke scripts; added `verify-grok-project-sources-steps.ts` for per-step testing; made Sources file expansion tolerant when the list is empty.
- Issues: Step runner originally chained steps unintentionally; fixed to run only the requested step.
- Next: Commit Sources smoke + helper exports, then finish UI helper upgrade integration and smoke in CLI.

- Date: 2026-01-24
- Focus: UI helper upgrades + Grok menu/hover reliability.
- Progress: Added `waitForMenuOpen`, `pressMenuButtonByAriaLabel`, `hoverAndReveal`, and `pressButton` diagnostics; scoped menu selection with `menuRootSelectors`; adopted helpers in Grok project menu + history rename/delete; added fallback navigation when create-project hover fails; added `scripts/start-devtools-session.ts` to launch/resolve a DevTools port.
- Issues: Local smoke scripts require a live DevTools port; no active port caused verify scripts to fail.
- Next: Resume Phase 7 CRUD (project sources knowledge + conversations).

- Date: 2026-01-15
- Focus: Grok project sources file management + UI helper extraction.
- Progress: Added project file add/list/remove CLI; hardened Sources tab attach/upload/remove flows; extracted reusable helpers (`ensureCollapsibleExpanded`, `hoverRowAndClickAction`, `queryRowsByText`, `openRadixMenu`) and updated docs.
- Issues: Grok sources collapse state + hover-only controls required coordinate hover; Radix menus required pointer event sequence.
- Next: Continue Phase 7 project CRUD (knowledge files + clone fix), then revisit conversation flows.
