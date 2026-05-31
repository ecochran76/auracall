# Gemini Cached Uploaded File Salvage Plan | 0090-2026-05-31

State: OPEN
Lane: P01

## Purpose

Make Gemini history materialization use trustworthy existing local cache files
for uploaded text/file attachments when the current Gemini page no longer
exposes a direct download URL or text-preview surface. Plan 0089 proved bounded
Gemini catch-up can materialize new assets, but it also showed a false-negative
class: `AGENTS.md` was present in the local conversation cache with stable
metadata and checksum evidence, yet the materialization job reported it as
failed because the live provider surface could not re-download it.

This plan adds a narrow, auditable cached-file salvage path without weakening
provider trust boundaries or treating stale cache as automatically valid.

## Current State

- Plan 0089 job `hmj_df40643c30aa45a3b29651e11d379046` attempted
  `ab30a4a92e4b65a9`.
- The same job materialized `uploaded-image-1` and failed `AGENTS.md`.
- Provider evidence for `AGENTS.md`:
  - file id `gemini-conversation-file:ab30a4a92e4b65a9:0:AGENTS.md`;
  - file name `AGENTS.md`;
  - MIME type `text/markdown`;
  - declared size `1813`;
  - `hasDirectUrl=false`;
  - no provider download URL;
  - no live text-preview surface.
- Local cache evidence for the same provider file id exists at:
  `/home/ecochran76/.auracall/cache/providers/gemini/ecochran76@gmail.com/conversation-attachments/ab30a4a92e4b65a9/files/gemini-conversation-file-ab30a4a92e4b65a9-0-AGENTS.md/AGENTS.md`
- Local checksum evidence:
  `913744155dc7310f2072ca4d2989f53dbed12e0b757e1d2e0c868b641142ede2`.

## Root Cause Summary

Gemini uploaded-file readback can preserve stable cache metadata and a local
file path from a prior provider context read, while the current live Gemini
surface does not expose a downloadable URL or readable text preview for that
same attachment. The materialization path currently requires live provider
fetch/read evidence and therefore reports the file as failed, even when the
cache has a provider-id-matching local file with size/checksum evidence.

## Scope

- Add a Gemini uploaded-file cached salvage path for history materialization.
- Allow salvage only when the current provider detail pass still identifies
  the same attachment by stable provider file id, conversation id, file name,
  and size or compatible metadata.
- Recompute checksum and file size from disk during salvage.
- Write normal archive/search materialization evidence with an explicit cached
  method such as `cached-provider-file`.
- Preserve terminal failure when a local file is absent, unreadable, wrong
  size, or not tied to current provider detail evidence.
- Prove the fix with `AGENTS.md` from conversation `ab30a4a92e4b65a9` through
  the installed API path.

## Non-Goals

- Do not trust arbitrary files from disk without current provider detail
  evidence.
- Do not fabricate a provider download URL.
- Do not scrape or infer private Gemini attachment contents from DOM text that
  is not part of the existing provider detail model.
- Do not broaden to Google Drive, ChatGPT, Grok, or non-Gemini providers in
  this slice.
- Do not run a broad Gemini catch-up batch.
- Do not change the retired frontend.

## Architecture Boundaries

- Provider detail extraction remains the authority for whether a Gemini
  attachment exists in the current conversation.
- Cache salvage belongs inside the history materialization/provider
  materialization path, not in search projection.
- Archive/search readback must distinguish cached salvage from live
  direct-download or screenshot materialization.
- The salvage path must not bypass provider guard, account identity, runtime
  profile, browser profile, or conversation id validation.

## Implementation Tracks

### Track 1 | Evidence Contract

Status: planned.

- Identify the Gemini file manifest structures that carry:
  - provider file id;
  - file name;
  - MIME type;
  - declared size;
  - local path;
  - direct URL availability.
- Define the minimum salvage preconditions:
  - same provider;
  - same AuraCall runtime profile or compatible identity-scoped cache root;
  - same bound identity;
  - same conversation id;
  - same provider file id;
  - same file name;
  - existing readable local file;
  - matching declared size when size is available.
- Decide the archive metadata fields that mark salvage explicitly.

### Track 2 | Implementation

Status: planned.

- Add a narrow helper for Gemini uploaded-file cached salvage.
- Recompute local size and SHA-256 before returning a materialized entry.
- Set materialization method/source clearly, for example:
  - `status=materialized`;
  - `source=history-materialization`;
  - `method=cached-provider-file`.
- Keep current failure behavior when salvage preconditions are not met.

### Track 3 | Regression Coverage

Status: planned.

- Add a unit or integration-style test for the `AGENTS.md` class:
  - current provider detail reports an uploaded file with no direct URL;
  - local cached file exists and matches provider file id/name/size;
  - materialization returns a materialized entry with local path and checksum.
- Add a negative test proving no salvage occurs for:
  - mismatched size;
  - missing file;
  - mismatched provider file id;
  - absent current provider detail evidence.

### Track 4 | Installed Proof

Status: planned.

- Build, install, and restart the user-scoped runtime if code changes are
  required.
- Create a bounded installed Gemini history-materialization job for
  `ab30a4a92e4b65a9` with `refreshSnapshot=true`, `assetKinds=[files]`, and a
  conservative item cap.
- Confirm `AGENTS.md` materializes from the cached provider file with:
  - local path;
  - recomputed SHA-256;
  - archive item id;
  - search/archive/account-mirror readback.
- Confirm the job does not visit project/Gem URLs and does not broaden into a
  catch-up batch.

## Acceptance Criteria

- Plan 0090 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Gemini uploaded-file salvage only succeeds when current provider detail
  evidence and local cache evidence agree on stable identity fields.
- `AGENTS.md` from `ab30a4a92e4b65a9` materializes with local path, recomputed
  checksum, and explicit cached-salvage metadata.
- Missing, mismatched, or unverified local cache files still fail terminally
  with clear reasons.
- Search/archive/account-mirror readback distinguishes salvaged cached files
  from live provider downloads.
- Installed runtime proof runs through the normal API path and leaves no active
  materialization jobs behind.

## Validation Plan

- Targeted tests for Gemini cached uploaded-file salvage and negative cases.
- Static gates for changed code:
  - `pnpm run typecheck`;
  - targeted `biome lint` for touched files.
- Plan/doc gates:
  - `pnpm run plans:audit -- --keep 90`;
  - `git diff --check`.
- Installed proof if runtime code changes:
  - `pnpm run build`;
  - `pnpm run install:user-runtime-service`;
  - `systemctl --user restart auracall-api.service`;
  - `systemctl --user is-active auracall-api.service`;
  - bounded installed Gemini `history-materialization-create`;
  - post-run archive/search/account-mirror readback.

## Definition Of Done

- The `AGENTS.md` false-negative is fixed or has a precise blocker with no
  hidden broad-catch-up work.
- Cache salvage has explicit trust preconditions and tests.
- Runtime proof shows the installed API can materialize the cached uploaded
  file without direct service invocation.
- Docs record before/after behavior, validation evidence, and the remaining
  Gemini scale gate.
