# ChatGPT Conversation File Fetch Plan | 0094-2026-06-01

State: CLOSED
Lane: P01

## Purpose

Implement and prove ChatGPT conversation-file retrieval so file rows that are
currently visible only as metadata can become real cache/archive assets when
the provider exposes a retrievable file surface. Plan 0093 proved that
`chatgpt/wsl-chrome-3` live follow can retrieve eligible generated artifacts;
this plan covers the remaining intentionally unsupported ChatGPT
conversation-file class.

## Current State

- Latest completed plan:
  `docs/dev/plans/0093-2026-06-01-live-follow-full-artifact-retrieval-readiness.md`.
- `chatgpt/wsl-chrome-3` is configured for bounded full retrieval:
  - `full_sweep`;
  - `full_missing_assets`;
  - `materializationAssetKinds: [all]`;
  - `materializationMaxItems: 3`;
  - `materializationRefreshSnapshot: true`;
  - `materializationForce: false`.
- Plan 0093 installed proof job
  `hmj_13c5108693104ae0833942a49fac3993` materialized one ChatGPT DOCX
  generated artifact through a DOM download-button row and left active
  history-materialization jobs at `0`.
- ChatGPT conversation-file rows still return terminal skipped entries such as
  `Conversation file fetch is not supported for chatgpt.`
- Catalog eligibility currently marks ChatGPT conversation files without a
  retrievable provider URL, cache key, or provider file id as
  `unsupported_conversation_file`.
- Known example conversation from Plan 0093:
  `6a092419-33c0-83ea-bca8-27c694312842` contains two input file rows:
  - `Earthline - ISU Mutual Confidentiality Agreement.pdf`;
  - `docx-skill(1).zip`.

## Scope

- Audit the current ChatGPT conversation context and catalog shapes for file
  rows:
  - ids;
  - names;
  - labels;
  - message ids / turn ids;
  - any `chatgpt://file/...`, backend, sandbox, blob, or DOM download
    affordance;
  - local cache evidence if already mirrored from another provider surface.
- Add provider support for ChatGPT conversation-file materialization when a
  file has a retrievable source.
- Preserve explicit skipped classification for ChatGPT file rows that still do
  not expose a retrievable provider source.
- Wire retrieved files into the same durable surfaces used by artifact
  materialization:
  - history-materialization job entries;
  - provider cache;
  - archive/search asset rows;
  - catalog item asset route when applicable.
- Prove the installed path with a bounded `chatgpt/wsl-chrome-3` job.

## Non-Goals

- Do not run broad catch-up or multi-tenant file retrieval.
- Do not mark unsupported ChatGPT file rows as materialized.
- Do not scrape private provider implementation details unless they are
  reachable through the active conversation and current authenticated session.
- Do not weaken Plan 0091/0092/0093 guards for SoyFuze duplicate families,
  static-image false positives, feature-signature/model-selector suppression,
  or download-button artifact precedence.
- Do not touch the retired frontend.

## Architecture Boundaries

- ChatGPT file retrieval belongs in the ChatGPT provider adapter and
  `LlmService.materializeConversationFiles` path, not in live-follow scheduler
  policy.
- Candidate selection must remain conservative:
  - retrievable file rows may spend materialization budget;
  - metadata-only file rows must remain visible but skipped with a precise
    reason.
- Retrieval must remain durable and inspectable through existing
  history-materialization jobs rather than one-off browser side effects.
- Cache identity must keep using the non-interactive history-materialization
  options that skip feature-signature/model-selector probing.

## Implementation Tracks

### Track 1 | File Surface Audit

Status: completed.

- Use installed catalog and item-detail readback for representative
  `chatgpt/wsl-chrome-3` file rows.
- Inspect the active conversation DOM only for a bounded selected conversation,
  starting with `6a092419-33c0-83ea-bca8-27c694312842`.
- Classify file rows into:
  - provider-file URL available;
  - DOM download affordance available;
  - cache-salvage candidate;
  - metadata-only unsupported.
- Record exact selectors, provider ids, and source fields that can be used
  without ambiguous title-only matching.

### Track 2 | Provider Retrieval Contract

Status: completed.

- Add or enable `downloadConversationFile` support for ChatGPT when the file
  row has a retrievable source.
- Prefer stable provider ids or source URLs over title-only matching.
- If DOM interaction is required, scope it to the selected conversation and
  selected file row.
- Ensure failed or missing provider affordances return `null` or a precise
  skipped reason rather than throwing broad fetch failures for normal
  unsupported rows.

### Track 3 | Materialization And Archive Integration

Status: completed.

- Ensure `LlmService.materializeConversationFiles` writes a sidecar file-fetch
  manifest for ChatGPT with:
  - provider file id;
  - file name;
  - local path;
  - remote URL when available;
  - MIME type;
  - size;
  - materialization method;
  - skipped reason.
- Ensure history-materialization readback converts terminal file manifest
  entries into checksum-bearing archive/search rows when local files exist.
- Keep unsupported file rows as terminal skipped entries with
  `Conversation file fetch is not supported for chatgpt` or a more specific
  reason.

### Track 4 | Eligibility And Budgeting

Status: completed.

- Update ChatGPT file eligibility so rows with retrievable provider evidence
  are no longer classified as `unsupported_conversation_file`.
- Keep metadata-only rows classified as unsupported before provider browser
  work.
- Verify file rows do not crowd out retrievable generated artifacts in
  bounded `[all]` jobs unless the file row is genuinely retrievable.

### Track 5 | Installed Proof And Regression Checks

Status: completed.

- Rebuild, reinstall, and restart `auracall-api.service`.
- Run one bounded installed `chatgpt/wsl-chrome-3` file-fetch proof:
  - selected conversation first if needed;
  - then a capped reconcile job if selected proof succeeds.
- Acceptance proof must include:
  - history-materialization job id;
  - provider conversation id;
  - provider file id or DOM/source affordance used;
  - local path;
  - SHA-256;
  - archive item id and asset route when created.
- Confirm active history-materialization jobs return to `0`.
- Scan the proof log window for:
  - feature-signature/model-selector/model-control hits;
  - SoyFuze / Chemical Composition Dossier duplicate downloads;
  - static favicon false-positive attempts.

## Acceptance Criteria

- Plan 0094 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- ChatGPT conversation-file rows are classified into retrievable and
  metadata-only unsupported classes using concrete provider evidence.
- ChatGPT file materialization can retrieve at least one installed
  `chatgpt/wsl-chrome-3` conversation file when the provider exposes a
  retrievable source.
- Retrieved files are durable cache/archive/search assets with local path and
  SHA-256 evidence.
- Metadata-only file rows remain visible and explicitly skipped; they are not
  misreported as materialized.
- The installed proof has no Plan 0091/0092/0093 regressions.

## Validation Plan

- Read-only installed baseline:
  - catalog item detail for a selected conversation with ChatGPT files;
  - current history-materialization jobs;
  - recovery candidate counts.
- Targeted unit tests:
  - ChatGPT adapter file matching/retrieval helper behavior;
  - `LlmService.materializeConversationFiles` manifest output;
  - history-materialization file-entry conversion;
  - catalog eligibility classification.
- Static validation:
  - `pnpm exec biome lint` on touched files;
  - `pnpm run typecheck`;
  - `pnpm run build`.
- Installed proof:
  - `pnpm run install:user-runtime-service`;
  - restart `auracall-api.service`;
  - run bounded ChatGPT file-fetch materialization proof;
  - verify active jobs return to `0`;
  - scan proof log window.
- Documentation gates:
  - `pnpm run plans:audit -- --keep 94`;
  - `git diff --check`.

## Definition Of Done

- We can say, with installed-runtime evidence, whether ChatGPT conversation
  files are retrievable through AuraCall.
- If retrievable, at least one real ChatGPT conversation file has been
  materialized into a checksum-bearing local archive/search asset.
- If not retrievable from current provider surfaces, the plan records the exact
  missing source/DOM affordance and keeps the rows explicitly metadata-only.

## Execution Summary

- ChatGPT conversation file tiles do not expose stable DOM `href` or
  `download` attributes. The retrievable surface is in the mounted React tile
  data and the authenticated browser session.
- The audited conversation
  `6a092419-33c0-83ea-bca8-27c694312842` exposed provider file ids:
  - `file_000000004a0c71f89172ec251ae22c52` for
    `Earthline - ISU Mutual Confidentiality Agreement.pdf`;
  - `file_00000000270c71fbb8653af5f007a921` for `docx-skill(1).zip`.
- ChatGPT file rows now preserve provider file id, MIME type, `downloadable`,
  `previewable`, and `materializationSurface` metadata, and use
  `chatgpt://file/<providerFileId>` as the retrievable remote URL.
- `downloadConversationFile` is implemented for ChatGPT. It scopes to the
  selected conversation, finds virtualized file tiles by provider file id,
  captures authenticated file-download responses after clicking the tile,
  skips `/simple` metadata responses, follows JSON `download_url` responses,
  and writes the final signed content body.
- `LlmService.materializeConversationFiles` now passes the full `FileRef` to
  provider download code and records provider-download materialization method
  in the file-fetch manifest.
- History-materialization archive projection now preserves provider file ids
  and manifest materialization methods on archive/search rows.

## Closure Evidence

- First proof job `hmj_73216adb0f49427696e0d8bb55ba087c` failed with
  `tile_not_found`; that exposed the virtualized DOM search bug. The downloader
  now scrolls/searches before clicking.
- Second proof job `hmj_fc29ea50c03e4296ab54e9c4dacfa267` wrote JSON metadata
  stubs; that exposed the `/simple` and `{download_url}` capture bug. The
  downloader now ignores simple metadata and follows signed content URLs.
- Installed proof job `hmj_01f43d3485984d61ba2ba62059a89f6d` materialized both
  audited files:
  - PDF SHA-256
    `e5a22b52330b24428b653684a9cbe9d2c1a1accd9f817989235ddb1d767e952a`;
  - ZIP SHA-256
    `6eaab4a76ae855163e84ef38e79e2bbc674cf55a61450ee74668f4cba07c6a39`.
- Final installed proof job `hmj_b63d3d35fc554a30bd846e694a6fc23b` succeeded
  after the archive-method projection fix:
  - provider conversation:
    `6a092419-33c0-83ea-bca8-27c694312842`;
  - file:
    `Earthline - ISU Mutual Confidentiality Agreement.pdf`;
  - provider file id:
    `file_000000004a0c71f89172ec251ae22c52`;
  - materialization method:
    `chatgpt-file-tile-default-action`;
  - local path:
    `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a092419-33c0-83ea-bca8-27c694312842/files/6a092419-33c0-83ea-bca8-27c694312842-3e6c04a6-29d0-45f6-b37c-f33353965543-0-Earthline - ISU Mutual Confidentiality Agree/Earthline - ISU Mutual Confidentiality Agreement.pdf`;
  - SHA-256:
    `e5a22b52330b24428b653684a9cbe9d2c1a1accd9f817989235ddb1d767e952a`;
  - archive item:
    `history-file:chatgpt:wsl-chrome-3:6a092419-33c0-83ea-bca8-27c694312842:6a092419-33c0-83ea-bca8-27c694312842_3e6c04a6-29d0-45f6-b37c-f33353965543_0_Earthline_-_ISU_Mutual_Confidentiality_Agreement.pdf`;
  - asset route:
    `/v1/archive/items/b64/aGlzdG9yeS1maWxlOmNoYXRncHQ6d3NsLWNocm9tZS0zOjZhMDkyNDE5LTMzYzAtODNlYS1iY2E4LTI3YzY5NDMxMjg0Mjo2YTA5MjQxOS0zM2MwLTgzZWEtYmNhOC0yN2M2OTQzMTI4NDJfM2U2YzA0YTYtMjlkMC00NWY2LWIzN2MtZjMzMzUzOTY1NTQzXzBfRWFydGhsaW5lXy1fSVNVX011dHVhbF9Db25maWRlbnRpYWxpdHlfQWdyZWVtZW50LnBkZg/asset`.
- File verification identified the PDF as `PDF document, version 1.4, 7
  page(s)`.
- Active `chatgpt/wsl-chrome-3` history-materialization jobs returned to `0`.
- The proof log window had no feature-signature, model-selector/model-control,
  SoyFuze / Chemical Composition Dossier, or static favicon hits.
