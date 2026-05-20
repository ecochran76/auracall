# Searchable Run Cache And Artifact Archive

Status: OPEN
Date: 2026-05-16
Lane: P01

## Context

AuraCall's core product boundary is orchestration, not domain validation. It
should accept intelligence requests from the CLI, local API, and MCP server;
queue and manage jobs; execute configured agents and teams; preserve user
uploads and provider-generated artifacts; and make the resulting evidence
retrievable through a searchable cache/archive.

Account mirroring already builds provider-account catalogs for projects,
conversations, files, artifacts, and media. That is related but not sufficient.
AuraCall also needs a first-class archive for work it created: response runs,
response batches, team runs, media generations, uploaded files, provider
conversation ids, generated artifacts, and caller-supplied post-processing
evidence.

## Current State

Implemented:

- Response, batch, team-run, media, and browser-run records are persisted under
  the AuraCall runtime/cache tree.
- Response-batch children preserve request payloads, input artifact metadata,
  provider conversation ids, and output text/structured content.
- A first read-only archive projection can list existing response runs,
  response batches, team runs, media generations, uploaded input artifacts,
  generated artifacts, and provider conversation references through
  `GET /v1/archive`, `auracall api archive`, and MCP `run_archive_search`.
- Stable archive item detail is available through
  `GET /v1/archive/items/{archive_item_id}`, `auracall api archive-item`, and
  MCP `run_archive_item`.
- Archive reads now use a user-scoped JSON index under the AuraCall runtime
  tree. Missing indexes are built from persisted records on first read, and
  operators can explicitly rebuild with `POST /v1/archive/backfill`,
  `auracall api archive-backfill`, or MCP `run_archive_backfill`.
- Upload and generated-artifact items carry stable cache keys and SHA-256
  checksums when AuraCall can read the local file.
- Archive list/detail/asset-lookup reads refresh file-bearing upload and
  generated-artifact metadata from local filesystem evidence and persist changed
  availability, file size, checksum, cache key, and asset route fields back into
  the archive index. This keeps already-indexed uploaded and generated files
  current for Search without requiring provider browser work or a full backfill.
- File-bearing archive items can stream their readable local file through
  `GET /v1/archive/items/{archive_item_id}/asset` without exposing callers to
  runtime filesystem layout.
- Caller-owned validators and post-processors can attach generic evidence
  records through `POST /v1/archive/evidence`,
  `auracall api archive-evidence`, or MCP `run_archive_attach_evidence`;
  evidence is indexed as `kind = "evidence"` and can link to response, batch,
  archive item, or provider conversation ids.
- Response creation, response-batch creation, service-host run settlement, and
  media-generation settlement/materialization upsert only the affected archive
  items when possible, falling back to first-use/backfill index creation when
  needed.
- Account mirror catalog APIs can search cached provider-account manifests
  without launching browsers.
- Runtime inspection can link some stored provider conversation ids back to
  cache-only account-mirror details.
- Browser artifact materialization can enforce declared output artifact
  contracts when a workflow asks for provider-generated files.
- Archive records now carry first-class provider project ids and configured
  bound identity keys when browser-run or media-generation metadata contains
  them. Project id filtering is exposed through `/v1/archive`,
  `auracall api archive --project-id`, and MCP `run_archive_search`.
- Browser response artifact references preserve provider/file metadata into
  response output and archive records, including provider artifact ids,
  remote/local paths, checksums, and file sizes when available.
- Cache-owned uploads and generated artifacts can be resolved without browser
  work by SHA-256 checksum, cache key, provider artifact id, or AuraCall
  artifact id through `/v1/archive/assets/lookup`,
  `auracall api archive-asset-lookup`, and MCP `run_archive_asset_lookup`.
- Provider-backed generated-artifact recovery now has a durable async job
  wrapper through `POST /v1/archive/materializations`,
  `GET /v1/archive/materializations`,
  `GET /v1/archive/materializations/{job_id}`,
  `auracall api archive-materialization-create`,
  `auracall api archive-materialization-jobs`,
  `auracall api archive-materialization-cancel`,
  `auracall api archive-materialization-status`, and MCP
  `run_archive_materialization_create` /
  `run_archive_materialization_cancel` /
  `run_archive_materialization_jobs` / `run_archive_materialization_job`.
  Active jobs for the same archive item are de-duplicated, job state is
  persisted under the user-scoped run archive tree, and interrupted active jobs
  are marked failed on API/MCP startup instead of remaining indefinitely
  running. Listing supports status, archive item id, and limit filters so
  operator surfaces can poll without retaining job ids out of band. Queued jobs
  can be cancelled before provider work starts; running jobs remain
  non-abortable until the provider materializer accepts cooperative
  cancellation.

Remaining:

- Fill remaining upload/generated-artifact gaps where provider-specific
  artifact ids, project ids, or bound identity keys are not yet exposed by a
  provider-specific runner/materializer.
- Continue hardening provider-specific artifact materializers for generated
  assets that still require browser recovery.
- Promote asset lookup results into a canonical dedupe manifest if callers need
  a persisted duplicate-group table instead of on-demand lookup.

## Scope

This plan owns the searchable archive for AuraCall-created work:

- `/v1/responses` outputs and artifacts
- `/v1/chat/completions` outputs projected through response runs
- `/v1/response-batches` parent/child records
- `/v1/team-runs` records
- media-generation outputs
- uploaded input files and local attachment metadata
- provider conversation references created by AuraCall jobs
- generated/downloaded artifacts
- caller-supplied validation, review, or post-processing evidence

It does not own provider account-history crawling. That remains in the
account-mirror/live-follow lane. It does not own domain correctness checks such
as course grading arithmetic, transcript readout semantics, or LitScout science
moderation. Those belong to calling workflows and can be stored as archive
evidence.

## Non-Goals

- Do not add course-, transcript-, or research-domain validators to AuraCall
  core.
- Do not launch provider browsers during archive search/readback.
- Do not replace the provider account mirror catalog.
- Do not make the archive portable repo state by default; it is user-scoped
  runtime/cache state under `~/.auracall`.
- Do not require provider API access for browser-created artifacts.

## Public Contract

The archive should expose:

- list/search by provider, runtime profile, bound identity, agent id, team id,
  project id, response id, batch id, status, resource kind, created time, text
  query, and artifact/file availability
- item detail by stable archive id
- local materialized file serving/download when a generated artifact or uploaded
  file is cache-owned
- links from runtime-run status/detail pages into archive item detail
- links from archive item detail back to the response, batch, team run, media
  generation, provider conversation, and account-mirror catalog item when
  available
- caller-supplied evidence records that are explicitly labeled by producer,
  schema, source response/batch id, and validation status

## Implementation Slices

1. Archive inventory read model
   - scan existing runtime/cache records into a read-only normalized projection
   - assign stable archive ids for responses, batch children, uploads,
     generated artifacts, and provider conversations
   - expose a local CLI/API/MCP list/detail surface over the projection

2. Incremental write-through
   - build a user-scoped archive index and operator backfill surface
   - update response, batch, team-run, and media completion paths to write
     archive index entries as jobs complete
   - preserve compatibility with existing runtime record files
   - add backfill for older records when an operator asks for it
   - use targeted item-level upserts for normal response, batch, media, and
     evidence writes so routine completion does not rescan all runtime records

3. Search and retrieval
   - add text/metadata search over indexed records
   - serve cache-owned file previews/downloads through stable archive URLs
   - add dashboard navigation for run archive search and item detail

4. Evidence attachment
   - add a generic evidence attachment contract for caller-owned validators and
     post-processors
   - allow evidence to be linked to response ids, batch ids, archive ids, and
     provider conversation ids
   - keep validator execution outside AuraCall core

## Acceptance Criteria

- A CLI/API/MCP caller can find AuraCall-created runs and artifacts without
  knowing filesystem paths.
- A response-batch audit can prove which uploads were sent, which provider
  conversations were created, which outputs were returned, and which artifacts
  were materialized from archive readback alone.
- Archive search/readback never acquires browser dispatcher locks or navigates
  provider pages.
- Cache-owned generated artifacts and uploaded files have stable item ids and
  dedupe metadata.
- Caller-supplied validation evidence can be stored and retrieved beside the
  underlying AuraCall output without adding domain-specific validation logic to
  AuraCall.
- Existing account-mirror catalog links continue to work and are used as
  provider-account context, not as the only archive of AuraCall-created work.
- Routine response, batch, media, and evidence writes avoid full archive
  rescans once the index exists.
