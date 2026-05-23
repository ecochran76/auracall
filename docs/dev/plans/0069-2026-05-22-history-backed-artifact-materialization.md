# History-Backed Artifact Materialization

Status: OPEN
Date: 2026-05-22
Lane: P01

## Context

AuraCall now has two adjacent but incomplete surfaces:

- the account mirror can crawl provider account history and cache metadata for
  conversations, files, artifacts, and media
- the run archive can search AuraCall-created runs and materialize some missing
  generated artifacts when an archive item already carries provider conversation
  evidence

That is not enough for historical artifact recovery. If a provider chat contains
downloadable artifacts, AuraCall should be able to use the mirrored history as a
discovery index, reopen the provider conversation through the managed browser,
download the provider assets through the provider's own controls, and persist
the resulting files into the identity-scoped cache and run archive.

This plan owns that missing backend materialization lane.

## Current State

Available now:

- Account mirror history crawl:
  - `POST /v1/account-mirrors/refresh`
  - `GET /v1/account-mirrors/status`
  - `GET /v1/account-mirrors/catalog`
  - `GET /v1/account-mirrors/catalog/items/{item_id}`
  - MCP `account_mirror_status`, `account_mirror_refresh`, and
    `account_mirror_catalog`
- ChatGPT account mirror detail inventory can collect conversation-level
  artifacts/files and account-library rows, though the current collector can
  return after library inventory without also walking conversation detail rows in
  the same pass.
- ChatGPT and Gemini provider adapters can reopen a known historical
  conversation and expose conversation context/artifact materialization helpers.
- `LLMService` already has internal primitives for:
  - `getConversationContext(...)`
  - `materializeConversationArtifacts(...)`
  - `materializeConversationArtifact(...)`
  - `materializeConversationFiles(...)`
  - `listAccountFiles(...)`
  - `listConversationFiles(...)`
- Run archive materialization has durable async jobs for one generated-artifact
  archive item through API, CLI, and MCP.
- Media generation has a CLI `media materialize` command that can materialize
  active/provider media when supplied with enough provider conversation evidence.

Missing:

- No durable job lane accepts an account-mirror catalog item or provider
  conversation id and downloads all fetchable artifacts/files from that
  historical chat.
- The account-mirror catalog asset route is cache-only; it serves local files
  only when they already exist and does not enqueue provider download work.
- No bulk reconciliation worker walks account-mirror history, identifies
  missing local assets, and queues bounded provider downloads.
- Gemini and Grok account mirror collectors do not yet populate provider detail
  artifact/media inventory comparable to ChatGPT's conversation detail pass.
- Media-generation archive recovery is not linked to account-mirror/history
  lookup. Older media rows that lack local paths need provider conversation
  matching before they can be refetched.
- MCP/API/CLI parity is incomplete for account-mirror materialization and media
  materialization. Existing MCP media tools can create/check media generation
  jobs, but do not expose media materialization.

Live audit snapshot:

- `/v1/search?kind=artifact&assetAvailability=unavailable` reports 71
  unavailable generated artifacts in the installed runtime:
  - 68 Gemini media rows with `media-artifact-missing-local-path`
  - 3 ChatGPT rows, including 2 skipped `legacy_readout.json` sandbox downloads
- `/status.liveFollow.targets` shows ChatGPT mirrors already cache substantial
  artifact/file history across runtime profiles, so the first blocker is not
  absence of history; it is the missing history-to-download orchestration layer.

## Scope

This plan owns backend recovery of downloadable provider artifacts discovered
from cached account history:

- single-conversation materialization by provider/runtime profile/conversation id
- account-mirror catalog item materialization
- bounded bulk reconciliation from history/catalog rows into cache/archive assets
- provider-specific history detail collection needed to discover downloadable
  artifacts and media
- API, CLI, and MCP surfaces for the above

## Non-Goals

- Do not scrape historical session text as a substitute for downloading
  provider artifacts.
- Do not submit new prompts while materializing historical assets.
- Do not make account-mirror catalog reads launch browsers implicitly.
- Do not assume projects are synchronized across tenants or services.
- Do not treat missing provider evidence as silently successful. Missing local
  assets should remain explicit unavailable rows until recovery has enough
  evidence or records a failed/skipped materialization reason.

## Public Contract

The new backend surface should expose:

- create/list/status/cancel for history materialization jobs
- input by account-mirror catalog item id, provider conversation id, or archive
  item id when the archive row lacks enough local evidence
- filters for artifact/file/media kind, max item count, force refresh, provider,
  runtime profile, project id, and bound identity
- per-item manifest entries with provider ids, local paths, cache keys,
  checksums, MIME types, materialization method, and skip/failure reason
- archive backfill/upsert after successful downloads so `/v1/search`,
  `/v1/archive`, account-mirror detail, and asset routes agree

## Implementation Slices

1. Conversation asset materialization service
   - add a durable service that accepts provider, runtime profile, conversation
     id, optional project id, and asset kind filters
   - route through the existing browser operation dispatcher and `LLMService`
     conversation artifact/file materializers
   - persist manifests under the existing conversation-attachment cache
   - upsert archive evidence after each successful local file

2. API/CLI/MCP job surface
   - add account-mirror/history materialization create/list/status/cancel routes
   - expose CLI parity for single conversation and catalog item materialization
   - expose MCP parity for agent callers
   - keep account-mirror catalog reads cache-only; materialization remains an
     explicit queued operation

3. ChatGPT history reconciliation
   - adjust ChatGPT detail inventory so account-library discovery does not
     prevent bounded conversation detail inventory
   - queue missing historical ChatGPT files/artifacts from catalog rows
   - prove the remaining legacy sandbox rows either materialize or record a
     concrete provider skip reason with a conversation link

4. Gemini media/history reconciliation
   - add Gemini account-mirror detail/media inventory using existing
     conversation context and artifact materializer paths
   - connect media-generation rows without local paths to candidate historical
     Gemini conversations by provider/runtime prompt/timestamp evidence
   - materialize matched assets and persist evidence linking the media row to
     the provider conversation

5. Grok history/media follow-through
   - audit whether Grok has a provider-supported historical artifact/media
     materialization path beyond active media materialization
   - add provider-specific materializer support or record explicit unsupported
     skip reasons

## Acceptance Criteria

- A caller can materialize all downloadable artifacts/files for one cached
  provider conversation without submitting a prompt.
- A caller can queue materialization from an account-mirror catalog item and poll
  durable status without retaining browser details out of band.
- A bounded reconciliation pass can use account history to reduce unavailable
  generated artifacts, including media rows, or record exact provider evidence
  explaining why an item is not fetchable.
- Account-mirror catalog reads remain cache-only and never acquire browser
  dispatcher locks.
- Downloaded files land in the existing identity-scoped cache with manifests and
  are reflected in run archive/search asset availability.
- ChatGPT is proven first, then Gemini media recovery, then Grok provider
  support or explicit unsupported evidence.
