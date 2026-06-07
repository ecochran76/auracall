# ChatGPT Project Sources Materialization Plan | 0135-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Continue the cross-tenant handoff work after Plans 0133 and 0134 by closing
the remaining source-depth gap for ChatGPT project URLs: project `Sources` tab
files can be listed today, but source handoff packets cannot yet materialize
those project-level files directly. They are represented by generated project
index evidence or by conversation-level file refs only.

## Current State

- Plan 0133 completed the original ChatGPT Business to SoyLei ChatGPT Pro
  handoff with real cached conversation context, selected files, deterministic
  omissions, and live target readback.
- Plan 0134 removed the stale in-process provider-work queue blocker, so source
  materialization retries no longer need an API restart after readback timeout
  recovery.
- `llmService.listProjectFiles()` already calls provider
  `listProjectFiles()` and writes project knowledge cache entries.
- The ChatGPT adapter already opens the project `Sources` route and extracts
  project source rows through `readChatgptProjectSourceFilesSettled()`.
- Plan 0135 installed project-source materialization under the existing
  history-materialization job model:
  - ChatGPT project `Sources` rows now preserve visible metadata, hrefs,
    DOM/action evidence, MIME/size hints, and backend `file_...` provider ids
    when the page exposes them.
  - `llmService.materializeProjectFiles()` writes
    `project-knowledge/<projectId>/file-fetch-manifest.json`, preserves visible
    row evidence in the project-knowledge cache, and records deterministic
    manifest errors for non-downloadable rows.
  - `provider=chatgpt`, `projectId`, `assetKinds=["files"]` now creates a
    `project_sources` history-materialization job that archives successful
    files and keeps failed rows as ordinary materialization omissions.
  - ChatGPT implements `downloadProjectFile()` only for explicit `file_...`
    provider ids via the authenticated provider-file route; rows without those
    ids are not guessed as downloadable.

## Scope

- Extend ChatGPT project source row extraction to preserve any available
  provider file id, backend file id, download href, MIME/type/size metadata, or
  stable DOM/action evidence without guessing.
- Add a project-source materialization path that starts from
  `provider=chatgpt`, `projectId`, and `assetKinds=["files"]`, lists project
  sources, and attempts authenticated provider-file download when an id or
  download route is available.
- Reuse the Plan 0133 direct provider-file download behavior and omission
  classification for deterministic `404/410` provider misses.
- Persist project-source materialization entries in the same
  `history_materialization_job` result/manifest shape used by conversation
  file materialization so handoff import does not need a parallel source model.
- Keep target mutation unchanged; this slice only improves source packet
  completeness before handoff analysis/approval.

## Non-Goals

- Do not scrape or click destructive project source row actions.
- Do not auto-click ChatGPT `Answer now`.
- Do not claim that project source rows without provider ids are downloadable.
- Do not make ChatGPT project URLs the general handoff boundary; this is one
  provider adapter implementation under the provider-neutral handoff contract.

## Definition Of Done

Plan 0135 closes when a ChatGPT project URL can produce project-level source
file materialization evidence: local files where provider downloads succeed,
deterministic omissions where provider downloads are unavailable, and handoff
manifest items that can be selected without generating a synthetic project
index as the only source-level artifact.

Done: the code path is installed and covered by focused tests. Live source
depth still depends on what the current ChatGPT DOM exposes for a given
project-source row; if no backend `file_...` id is visible, the row is retained
as deterministic non-downloadable evidence instead of being guessed.

## Validation Plan

- Unit tests for ChatGPT project source row normalization with provider ids,
  download hrefs, and metadata-only rows.
- Runtime history materialization tests for a `projectId` file-source job that
  imports materialized project source files and deterministic omissions.
- Handoff tests proving project-source materialization readbacks become source
  manifest items and selection candidates.
- `pnpm vitest run tests/browser/chatgptAdapter.test.ts`
- `pnpm vitest run tests/runtime.historyMaterializationService.test.ts`
- `pnpm vitest run tests/cli/handoffCommand.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint`
- `pnpm run build`
- A bounded live read-only/mutation-safe smoke against the original ChatGPT
  Business project source ref, stopping at deterministic provider evidence.

Validation completed in this slice:

- `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts tests/runtime.historyMaterializationService.test.ts tests/cli/handoffCommand.test.ts tests/cli/apiHistoryMaterializationCommand.test.ts tests/mcp.historyMaterialization.test.ts`
  passed with `220` tests.
- `pnpm exec tsc --noEmit --pretty false` passed.
- Focused `pnpm exec biome lint` on the changed source/test files passed.
- `pnpm run build` passed.
- `pnpm run plans:audit -- --keep 135` passed with `Validation errors: 0`.
- `pnpm run install:user-runtime-service` plus
  `systemctl --user restart auracall-api.service` completed with service
  `active`.
- Live mutation-safe project-source materialization smoke:
  - job `hmj_5927c197d6d6453bb23b90f980e14619`;
  - source `project_sources/chatgpt/g-p-687f9c5cc35c8191a25e6127785b86f8`;
  - status `skipped`, metrics `materialized=0`, `failed=3`;
  - manifest
    `/home/ecochran76/.auracall/cache/providers/chatgpt/ecochran76@gmail.com/project-knowledge/g-p-687f9c5cc35c8191a25e6127785b86f8/file-fetch-manifest.json`;
  - visible rows `SoyLei Knowledge - Main 20251208.md`, `SIP-1111.md`, and
    `SIP-1119.md` were recorded as failed with reason
    `ChatGPT project source lacks a provider file id.`;
  - active history materialization jobs returned `0` after completion.
- Refreshed dry-run handoff packet:
  - packet
    `/tmp/auracall-plan0135-project-source-import/handoffs/plan0135-project-source-import`;
  - imported project-source job
    `hmj_5927c197d6d6453bb23b90f980e14619` via API readback;
  - source completeness `partial`, `messageCount=15`,
    `manifestItemCount=3`, `localMaterializedCount=3`, `checksumCount=3`,
    `omissionCount=20`, `retryableOmissionCount=0`;
  - project source rows `SoyLei Knowledge - Main 20251208.md`, `SIP-1111.md`,
    and `SIP-1119.md` are terminal non-retryable omissions;
  - package digest
    `6876fc1565d469e70c1a7a1e18c2f6cea47856ecdbdb7da37ca0be3bb7342d12`;
  - target mutation stayed disabled with `targetMutationAllowed=false`.
- Refreshed target completion:
  - upload approval and submit approval were both recorded by `codex` against
    package digest
    `6876fc1565d469e70c1a7a1e18c2f6cea47856ecdbdb7da37ca0be3bb7342d12`;
  - target upload completed with `uploadedFileCount=2` and
    `uploadFailureCount=0`;
  - target submit completed with `submitAttemptCount=1`;
  - target readback is cached at
    `https://chatgpt.com/c/6a250296-65d4-83ea-930b-c5658ed7435a` with
    provider message id `handoff-message-dbd77d872c589e1d37711316b7f7c191`;
  - final handoff status is `complete`;
  - API status was healthy and active history-materialization jobs returned
    `0` after completion.

## Closeout Notes

- Handoff packet shape did not need to widen; project-source entries flow
  through existing materialized-file and omission import paths.
- API, CLI, and MCP list filters now accept `sourceType=project_sources`.
- The project-source readback has been imported into a refreshed packet and
  the refreshed packet has been submitted to the SoyLei ChatGPT Pro target with
  cached readback.
