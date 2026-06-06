# ChatGPT Live-Follow Post File-Fetch Observation Plan | 0095-2026-06-01

State: CLOSED
Lane: P01

## Purpose

Prove the installed `chatgpt/wsl-chrome-3` live-follow and recovery path after
Plan 0094 without starting broad catch-up. Plans 0093 and 0094 established
bounded retrieval for eligible generated artifacts and retrievable ChatGPT
conversation files. This plan decides, with current installed evidence, whether
the live-follow system is now healthy enough to continue filling missing local
assets under the existing bounded policy.

## Current State

- Latest completed plan:
  `docs/dev/plans/0094-2026-06-01-chatgpt-conversation-file-fetch.md`.
- `chatgpt/wsl-chrome-3` has installed proof for generated artifact retrieval:
  - Plan 0093 job `hmj_13c5108693104ae0833942a49fac3993` materialized
    `Earthline_PCG_Mutual_Confidentiality_Agreement_revised.docx`;
  - SHA-256:
    `7a7f8de11b1ca3f537f694397018db3112d9e490d0f718db55146f9de65f1c71`.
- `chatgpt/wsl-chrome-3` has installed proof for conversation-file retrieval:
  - Plan 0094 job `hmj_01f43d3485984d61ba2ba62059a89f6d` materialized both
    audited file rows from conversation
    `6a092419-33c0-83ea-bca8-27c694312842`;
  - final Plan 0094 job `hmj_b63d3d35fc554a30bd846e694a6fc23b` confirmed
    `materializationMethod=chatgpt-file-tile-default-action` on job and
    archive metadata;
  - active history-materialization jobs returned to `0`.
- Plan 0091/0092/0093/0094 regression classes must remain guarded:
  - stale SoyFuze / Chemical Composition Dossier duplicate families;
  - static favicon/generated-image false positives;
  - feature-signature/model-selector/model-control clicks during read-only or
    materialization lanes;
  - sandbox duplicate rows crowding out actionable DOM download buttons;
  - JSON metadata stubs being mistaken for file bodies.
- Broad multi-tenant or uncapped ChatGPT catch-up remains out of scope.

## Scope

- Read the installed state for `chatgpt/wsl-chrome-3` before any provider work:
  - live-follow status;
  - active mirror completions;
  - active and recent history-materialization jobs;
  - recovery candidates and missing-local counts;
  - archive/search readback for recently materialized Plan 0093/0094 assets.
- Decide whether the next proof should be:
  - passive live-follow observation, if a relevant active completion is already
    running or queued; or
  - one explicitly capped installed catch-up/materialization job, if no useful
    live-follow event is pending.
- If a catch-up job is needed, cap it tightly:
  - provider: `chatgpt`;
  - runtime profile: `wsl-chrome-3`;
  - asset kinds: `all`;
  - `maxItems <= 3`;
  - `force=false` unless current readback proves a stale or corrupt local file
    must be refreshed.
- Record whether retrievable artifacts and retrievable conversation files are
  selected, skipped, or materialized correctly after Plan 0094.

## Non-Goals

- Do not run broad multi-tenant catch-up.
- Do not raise materialization budgets above the existing small cap.
- Do not force-refresh already healthy local assets just to prove a download.
- Do not relax duplicate-family, static-favicon, or metadata-only skip guards.
- Do not touch the retired frontend.
- Do not add new provider retrieval mechanisms unless the observation exposes a
  concrete blocker that requires a follow-up implementation plan.

## Architecture Boundaries

- Live-follow scheduling policy stays separate from provider file/artifact
  retrieval mechanics.
- This plan should use installed API/CLI readback as the authority for health,
  not source-code inference.
- Any provider browser work must flow through durable
  history-materialization jobs so results are inspectable through archive and
  search rows.
- Candidate selection remains conservative: only rows with concrete
  retrievable evidence may spend materialization budget.

## Implementation Tracks

### Track 1 | Installed Baseline

Status: completed.

- Read API status and live-follow health for `chatgpt/wsl-chrome-3`.
- List active mirror completions and identify the current
  `chatgpt/wsl-chrome-3` completion, if any.
- List active/recent history-materialization jobs and confirm no stale running
  jobs remain from Plan 0094.
- Read recovery candidates and current missing-local counts.
- Read archive/search evidence for the Plan 0093 DOCX and Plan 0094 PDF/ZIP
  assets.

### Track 2 | Observation Or Capped Proof Decision

Status: completed.

- If a relevant live-follow completion is active, observe it through one
  bounded status/log window rather than enqueueing duplicate work.
- If no useful live-follow completion is active, queue one capped installed
  proof for `chatgpt/wsl-chrome-3`.
- Preserve before/after counts:
  - active completions;
  - active history-materialization jobs;
  - missing-local recovery count;
  - materialized archive/search asset count.

### Track 3 | Candidate And Result Audit

Status: completed.

- For every selected or terminal asset in the proof window, classify it as:
  - retrievable generated artifact;
  - retrievable conversation file;
  - already materialized;
  - unsupported metadata-only file;
  - duplicate family;
  - static false positive;
  - provider route/download failure.
- Verify selected rows have durable source evidence such as
  `chatgpt://download-button/...`, `chatgpt://file/<providerFileId>`, valid
  provider file id, or verified cache evidence.
- Verify skipped rows carry precise reasons and do not consume repeated
  browser interactions in later passes.

### Track 4 | Regression Guard Window

Status: completed.

- Scan the service log window for:
  - feature-signature/model-selector/model-control hits;
  - SoyFuze / Chemical Composition Dossier repeated downloads;
  - Google favicon/static-image fetch attempts;
  - JSON metadata stubs saved as files;
  - unexpected broad provider navigation.
- Confirm active history-materialization jobs return to `0`.
- Confirm any new local files have a real file type, non-trivial size, and
  SHA-256 evidence.

### Track 5 | Closeout Decision

Status: completed.

- If the observation/proof cleanly materializes or skips the next bounded
  assets, close this plan and recommend the next capped batch size.
- If it exposes a bug, stop after recording the exact failing row, job id,
  source evidence, local path if any, and regression class.
- If no useful work is pending and no missing retrievable rows remain in the
  bounded readback, close this plan as a health confirmation rather than
  forcing provider work.

## Acceptance Criteria

- Plan 0095 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Installed baseline captures current `chatgpt/wsl-chrome-3` live-follow,
  recovery, history-materialization, and archive/search state.
- The plan either observes an active live-follow event or runs one capped proof
  with `maxItems <= 3`; it does not run broad catch-up.
- Any materialized asset has local path, file type, size, SHA-256, archive item
  id, and asset route evidence.
- Unsupported, duplicate, static false-positive, or already-materialized rows
  remain explicit terminal states and do not loop.
- Active history-materialization jobs return to `0`.
- The proof/observation log window has no Plan 0091/0092/0093/0094
  regressions.

## Validation Plan

- Read-only baseline commands:
  - API status;
  - mirror completions;
  - history-materialization jobs;
  - recovery candidates;
  - archive/search readback for Plan 0093/0094 assets.
- Optional installed proof:
  - one capped `chatgpt/wsl-chrome-3` history-materialization or
    live-follow-driven catch-up with `maxItems <= 3`.
- Evidence checks:
  - job status/result JSON;
  - archive item and asset route readback;
  - `file` and `sha256sum` for new local files;
  - service-log regression scan.
- Documentation gates:
  - `pnpm run plans:audit -- --keep 95`;
  - `git diff --check`.

## Definition Of Done

- We can say whether the installed `chatgpt/wsl-chrome-3` live-follow/recovery
  lane is healthy after file-fetch support landed.
- If healthy, the next scale step is grounded in current counts and one bounded
  proof window.
- If not healthy, the exact blocker is captured as a new bounded fix plan
  rather than hidden inside broad catch-up.

## Execution Summary

- Installed baseline readback showed overall live-follow severity
  `attention-needed` because of other targets, but the scoped
  `chatgpt/wsl-chrome-3` target was healthy:
  - active completion:
    `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`;
  - status: `idle_waiting`;
  - phase: `backfill_history`;
  - pass count: `19`;
  - target attention: false;
  - latest failure: none;
  - next attempt:
    `2026-06-01T11:55:47.686Z`.
- Recovery readback for `chatgpt/wsl-chrome-3` remained eligible under
  `full_missing_assets`:
  - action: `start_materialization_policy_completion`;
  - remote-known missing local assets: `121`;
  - missing artifacts: `50`;
  - missing files: `71`;
  - missing media: `0`;
  - local materialized assets: `39`;
  - local materialized artifacts: `26`;
  - local materialized files: `13`.
- No duplicate provider work was enqueued during this plan. The active
  live-follow completion already had a recent capped materialization outcome
  using the intended policy:
  - job: `hmj_ff2d7546059f42d38ebc7f6d89ad183b`;
  - request: `reconcile=true`, `assetKinds=[artifacts, files, media]`,
    `maxItems=3`, `force=false`;
  - status: `succeeded`;
  - result: `conversations=3`, `materialized=1`, `skipped=0`, `failed=0`;
  - message:
    `History reconciliation materialized 1 asset from 3 conversations.`
- The materialized row was a retrievable ChatGPT conversation file, proving the
  Plan 0094 file-fetch lane is now active in live-follow-driven recovery:
  - title:
    `resp_dc3501c9c2b4412db047ed54995f33bb_step_1-auracall-request.txt`;
  - provider file id:
    `file_0000000022c8720c8e43e32bdc51da70`;
  - remote URL:
    `chatgpt://file/file_0000000022c8720c8e43e32bdc51da70`;
  - materialization method:
    `chatgpt-file-tile-default-action`;
  - provider conversation:
    `6a05033e-f560-83ea-8f1e-c36a1d9c439c`;
  - local path:
    `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a05033e-f560-83ea-8f1e-c36a1d9c439c/files/6a05033e-f560-83ea-8f1e-c36a1d9c439c-da47a38a-497b-46d7-87d6-38b9df9f1335-0-resp_dc3501c9c2b4412db047ed54995f33bb_step_1/resp_dc3501c9c2b4412db047ed54995f33bb_step_1-auracall-request.txt`;
  - file type: `ASCII text, with very long lines`;
  - size: `138994` bytes;
  - SHA-256:
    `c6d811db58b23658e0100ce091f72dd7b69c356c035e18ab5ccccb32718157f0`;
  - archive item:
    `history-file:chatgpt:eric.cochran_soylei.com:6a05033e-f560-83ea-8f1e-c36a1d9c439c:6a05033e-f560-83ea-8f1e-c36a1d9c439c_da47a38a-497b-46d7-87d6-38b9df9f1335_0_resp_dc3501c9c2b4412db047ed54995f33bb_step_1-auracall-request.tx`;
  - asset route:
    `/v1/archive/items/b64/aGlzdG9yeS1maWxlOmNoYXRncHQ6ZXJpYy5jb2NocmFuX3NveWxlaS5jb206NmEwNTAzM2UtZjU2MC04M2VhLThmMWUtYzM2YTFkOWM0MzljOjZhMDUwMzNlLWY1NjAtODNlYS04ZjFlLWMzNmExZDljNDM5Y19kYTQ3YTM4YS00OTdiLTQ2ZDctODdkNi0zOGI5ZGY5ZjEzMzVfMF9yZXNwX2RjMzUwMWM5YzJiNDQxMmRiMDQ3ZWQ1NDk5NWYzM2JiX3N0ZXBfMS1hdXJhY2FsbC1yZXF1ZXN0LnR4/asset`.
- Archive readback also confirmed the Plan 0093 generated DOCX and Plan 0094
  PDF remain available:
  - Plan 0093 DOCX SHA-256:
    `7a7f8de11b1ca3f537f694397018db3112d9e490d0f718db55146f9de65f1c71`;
  - Plan 0093 materialization method:
    `captured-anchor-fetch`;
  - Plan 0094 PDF SHA-256:
    `e5a22b52330b24428b653684a9cbe9d2c1a1accd9f817989235ddb1d767e952a`;
  - Plan 0094 provider file id:
    `file_000000004a0c71f89172ec251ae22c52`;
  - Plan 0094 materialization method:
    `chatgpt-file-tile-default-action`.
- Active `chatgpt/wsl-chrome-3` history-materialization jobs were `0`.
- The regression log window scan found no feature-signature,
  model-selector/model-control, SoyFuze / Chemical Composition Dossier, static
  favicon, `/simple` metadata-stub, or `download_url` stub-saving hits.

## Closeout Decision

Plan 0095 is closed as healthy for the scoped
`chatgpt/wsl-chrome-3` live-follow/recovery lane. The next scale step can be
another capped observation/catch-up batch at the existing `maxItems=3` policy.
Do not move to broad multi-tenant catch-up until several capped windows show
the same no-loop/no-regression behavior and the remaining `121` missing-local
count is reclassified into retrievable, already-materialized, duplicate,
static false-positive, and unsupported metadata-only buckets.
