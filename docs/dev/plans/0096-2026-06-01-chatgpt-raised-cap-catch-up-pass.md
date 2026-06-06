# ChatGPT Raised-Cap Catch-Up Pass Plan | 0096-2026-06-01

State: CLOSED
Lane: P01

## Purpose

Run one installed `chatgpt/wsl-chrome-3` catch-up pass with a modestly raised
materialization cap after Plan 0095 proved the existing capped policy healthy.
This plan raises the cap from `3` to `5` for one pass only, keeps
`force=false`, and audits whether the wider pass still avoids the previous
loop and false-positive failure classes.

## Current State

- Latest completed plan:
  `docs/dev/plans/0095-2026-06-01-chatgpt-live-follow-post-file-fetch-observation.md`.
- Plan 0095 observed active completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84` and recent job
  `hmj_ff2d7546059f42d38ebc7f6d89ad183b`.
- That job used `maxItems=3`, `force=false`, materialized one ChatGPT
  conversation file, left active history-materialization jobs at `0`, and
  showed no SoyFuze, model-selector, static-favicon, or JSON-stub regressions.
- Recovery readback still reported `121` remote-known missing local assets:
  `50` artifacts and `71` files.

## Scope

- Collect a fresh installed baseline for `chatgpt/wsl-chrome-3`.
- Queue exactly one history-materialization reconciliation job:
  - provider: `chatgpt`;
  - runtime profile: `wsl-chrome-3`;
  - browser profile: `wsl-chrome-3`;
  - asset kinds: `all`;
  - `maxItems=5`;
  - `force=false`;
  - refresh snapshot enabled.
- Wait for the job to reach a terminal state.
- Audit every terminal entry and any archive items created.
- Confirm active history-materialization jobs return to `0`.
- Scan the service log window for the known regression classes.

## Non-Goals

- Do not change the installed live-follow policy permanently.
- Do not run broad multi-tenant catch-up.
- Do not force-refresh already materialized local assets.
- Do not raise the cap beyond `5` in this slice.
- Do not touch the retired frontend.
- Do not add new provider retrieval code unless the pass exposes a blocker
  that needs a separate fix plan.

## Acceptance Criteria

- Plan 0096 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Fresh baseline records active jobs, live-follow target state, and recovery
  counts before the pass.
- Exactly one raised-cap pass is queued with `maxItems=5` and `force=false`.
- The job reaches a terminal state.
- Every materialized asset has title, kind, local path, MIME/file type, size,
  SHA-256, archive item id, and asset route evidence.
- Skipped/failed entries, if any, have precise reasons and do not indicate a
  repeated-download loop.
- Active history-materialization jobs return to `0`.
- The log window has no SoyFuze / Chemical Composition Dossier duplicate loop,
  feature-signature/model-selector/model-control hit, static favicon fetch,
  `/simple` metadata-stub save, or JSON `download_url` stub-save regression.

## Validation Plan

- Baseline:
  - API status;
  - active completion status;
  - history-materialization jobs;
  - recovery candidates.
- Proof:
  - one installed `history-materialization-create` reconciliation job with
    `maxItems=5`, `assetKinds=[all]`, and `force=false`.
- Evidence:
  - job status/result JSON;
  - archive readback for new rows;
  - `file`, byte size, and `sha256sum` for new local files;
  - service-log regression scan.
- Documentation gates:
  - `pnpm run plans:audit -- --keep 96`;
  - `git diff --check`.

## Definition Of Done

- The raised-cap pass either completes cleanly or exposes a specific blocker
  with job id, row evidence, and regression class.
- If clean, the next scale recommendation is based on the observed
  `maxItems=5` behavior rather than the earlier `maxItems=3` proof.

## Execution Summary

- Pre-pass baseline:
  - active `chatgpt/wsl-chrome-3` history-materialization jobs: `0`;
  - latest prior job:
    `hmj_d3580b4484dc40e18565d65470a1aa73`;
  - prior job status: `succeeded`;
  - prior job message:
    `History reconciliation materialized 2 assets from 3 conversations.`;
  - active completion:
    `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`;
  - active completion state: `idle_waiting`, `backfill_history`, pass count
    `20`;
  - recovery count: `121` remote-known missing local assets:
    `50` artifacts and `71` files.
- Raised-cap job:
  - job id: `hmj_afb9cc1b8d7441f28215350ce034a66b`;
  - request: `reconcile=true`, `assetKinds=[artifacts, files, media]`,
    `maxItems=5`, `force=false`, `refreshSnapshot=true`;
  - status: `succeeded`;
  - result: `conversations=3`, `materialized=5`, `skipped=0`, `failed=0`;
  - active history-materialization jobs returned to `0`.
- Materialized entries:
  - `2026-05-27-cochran-full-cv.pdf`, file row,
    `chatgpt-file-tile-default-action`, PDF version 1.5, size `404596`,
    SHA-256
    `89db8cc12b32f813f6b058eb3d4967ebfbe2d8f3f4098401d31811efba920e89`,
    archive item and asset route present.
  - `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf`,
    artifact row, PDF version 1.4, 2 pages, size `154914`, SHA-256
    `7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767`,
    archive item and asset route present.
  - `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut.pdf`, artifact
    row, PDF version 1.4, 2 pages, size `154914`, SHA-256
    `7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767`,
    archive item missing and asset route missing.
  - `Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_revised_MYAP.pdf`,
    artifact row, PDF version 1.4, 2 pages, size `240115`, SHA-256
    `2af143990726fe561aa02a36756f180738c2bc706c466361943801cb9a1f4221`,
    archive item and asset route present.
  - `_AHS 2026-2027 Application for Acceleration (for courses at AHS) .pdf`,
    file row, `chatgpt-file-tile-default-action`, PDF version 1.4, 3 pages,
    size `152683`, SHA-256
    `4dce14d2273a7d295d6ff5280dfacbde769761ec4a3e422ee2a8f925d89eef86`,
    archive item and asset route present.
- Post-pass recovery:
  - recovery count moved from `121` to `120` remote-known missing local assets;
  - files moved from `71` missing to `70` missing;
  - local materialized files moved from `13` to `14`;
  - artifact missing count stayed at `50`;
  - local materialized artifact count stayed at `26`.
- Regression log scan from the pre-pass byte offset found no
  feature-signature/model-selector/model-control hits, no SoyFuze /
  Chemical Composition Dossier hits, no static favicon hits, and no `/simple`
  or `download_url` metadata-stub hits.

## Closeout Decision

Plan 0096 completed the requested raised-cap pass, but the pass is not clean
enough to raise the cap again. The wider `maxItems=5` window exposed a
same-content artifact duplicate:
`Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut_clean_2page.pdf` and
`Mason_Cochran_AHS_Acceleration_Form_PreCalculus_TestOut.pdf` resolved to the
same remote content and SHA-256
`7275c5d08508b22855a8ad36bc06d7cc6e3476f5ab84620814381b09b037e767`. One of
those entries spent materialization budget but did not receive an archive item
or asset route. The next bounded plan should fix same-content/same-source
artifact deduplication before candidate budgeting and ensure materialized
terminal entries cannot report success without durable archive linkage.
