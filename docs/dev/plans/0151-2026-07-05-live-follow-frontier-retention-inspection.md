# Live-Follow Frontier Retention Inspection | 0151-2026-07-05

State: CLOSED
Lane: P01

## Purpose

Inspect and execute the next bounded live-follow correctness slice after cached
conversation-file retention landed for ChatGPT detail inventory.

The immediate live proof for completion
`acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae` showed the
requested phase now resumes correctly and detail inventory can retain one cached
conversation file. It did not yet prove that the retained file evidence closes
the reverse-mtime freshness loop. Pass `6` still left the same four
frontier-selected rows pending for `detail-inventory`.

This plan treats that as an inspection-first bug: before changing code, prove
which freshness condition remains unsatisfied for each selected row and whether
the gap is data state, local materialization state, readback semantics, or code.

## Current State

- Plan 0145 is closed: steady-follow uses reverse-mtime frontier evidence and
  an installed proof previously reduced ChatGPT detail churn.
- Plan 0146 is closed: durable detail completeness must only be written after
  successful conversation-file inventory and complete context read.
- Plan 0150 is closed: live-follow cycle decisions resume later phases across
  wake boundaries instead of restarting at root rails.
- Commit `5987024b` added account-mirror cached conversation-file retention:
  - account-mirror list options carry `accountMirrorInventory=true`;
  - empty account-mirror `listConversationFiles` reads preserve cached
    conversation files;
  - refresh service passes prior per-conversation cached files into the
    collector;
  - installed pass `6` on `wsl-chrome-3` reached `detail-inventory` directly
    and observed `files=1`.
- The remaining live-readback gap is frontier closure:
  - pass `6` observed `projects=0`, `conversations=4`, `files=1`;
  - merged file count increased from `196` to `197`;
  - the live-follow cycle still chose `nextPhase=detail-inventory` because the
    frontier selected the same four conversation rows.

## Inspection Findings

- Completion
  `acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae` remained
  paused at pass `6` with `nextPhase=detail-inventory` and four selected
  conversations.
- The first three selected rows had cached complete conversation context, but
  no durable detail metadata in `conversations.json`.
- Conversation `6a3f1652-2490-83ea-add0-0a900e6d55bc` had complete detail
  metadata and a cached `handoff-attachments.zip`, but the evidence was split:
  - `conversation-files` contained a recent remote-only `FileRef`;
  - `conversation-attachments` contained the same file with `localPath` and
    `checksumSha256`;
  - cached freshness hydration only used catalog/context evidence, so it could
    still classify the row as `missing_local_assets`.
- The failed semantic boundary was cached freshness hydration, not live-follow
  scheduling or rate-limit pacing.

## Implemented Fix

- `AccountMirrorPersistence` now exposes cached conversation attachments in
  addition to cached conversation files.
- `readCachedConversationFreshnessSummaries` hydrates context, conversation
  files, and conversation attachments for each cached conversation before
  deriving freshness.
- Cached asset evidence is deduplicated by provider file id, remote URL, id, or
  turn/name identity, preferring local evidence when a remote-only row and a
  materialized attachment describe the same file.
- `readPreviousAccountMirrorFiles` now seeds the collector with cached
  conversation attachments as prior files too, so retained local evidence is
  available to detail inventory.

## Installed Proof

- Installed runtime: `/home/ecochran76/.local/bin/auracall` version `0.1.1`.
- Restarted `auracall-api.service`; systemd reported active PID `2760`.
- Resumed completion
  `acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae` for one bounded
  pass and paused it again.
- Pass `7` completed as request
  `acctmirror_f0166291-d1a0-4cce-8c3b-000c3ddfff41` from
  `2026-07-05T20:58:00.680Z` to `2026-07-05T20:59:18.140Z`.
- The pass did not restart root/project rails:
  - `collectorProgress.phase=complete`;
  - `projectsObserved=0`;
  - `conversationsObserved=4`;
  - `filesObserved=3`;
  - `attachmentInventory.scannedProjects=0`;
  - `attachmentInventory.scannedConversations=4`;
  - `attachmentInventory.yielded=false`.
- The completion is paused at pass `7` with
  `nextAttemptAt=2026-07-05T21:27:25.436Z`.

## Remaining Finding

Pass `7` still selected the same four rows for `detail-inventory`. Direct
post-pass cache hydration through the real persistence layer now produces
cached summaries for all four rows, but those summaries are not fresh:

- `6a442944-8e60-83ea-8767-766ab42a708a`: complete context exists, but cached
  context contains `28` remote-only assets.
- `6a442231-7d94-83ea-b237-fa1a4f25bca9`: complete context exists, but cached
  context is stale and contains `22` remote-only assets.
- `6a42dae5-1cd4-83ea-95d4-176cc04d08c0`: complete context exists and
  conversation-files has `2` rows, but context/file evidence expands to
  remote-only assets.
- `6a3f1652-2490-83ea-add0-0a900e6d55bc`: cached attachment hydration finds
  local evidence for `handoff-attachments.zip`, but other context assets remain
  remote-only.

The next decision-tree slice should decide how `metadata_only` live follow
distinguishes "chat detail has been scraped" from "every remote context asset
has been locally materialized." Without that distinction, full chat scraping
can keep reselecting artifact-rich chats after the DOM/context parse has
already completed.

## User-Visible Question

Does a ChatGPT detail pass that carries retained per-conversation file evidence
also persist enough freshness evidence for the frontier to stop selecting that
row on the next cycle? If not, what exact condition is still missing?

## Inspection Plan

### Step 1 | Capture Authoritative Runtime State

Commands:

- `auracall api mirror-completion-status acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae --json`
- SQLite/JSON cache probes for the four frontier-selected conversation ids:
  - `6a442944-8e60-83ea-8767-766ab42a708a`
  - `6a442231-7d94-83ea-b237-fa1a4f25bca9`
  - `6a42dae5-1cd4-83ea-95d4-176cc04d08c0`
  - `6a3f1652-2490-83ea-add0-0a900e6d55bc`

Evidence targets:

- latest completion status, pass count, next phase, and lifecycle events;
- account-mirror conversation rows and metadata for the four ids;
- conversation context cache freshness and message/chunk completeness;
- conversation-files cache counts and metadata;
- account-mirror files catalog entries bound to those conversation ids.

Decision rule:

- If the four rows already have complete detail freshness and no missing local
  assets, the bug is in frontier summary derivation or readback selection.
- If one or more rows lack detail/context/file/asset evidence, the next fix must
  target that missing evidence, not the scheduler.

### Step 2 | Build A Red-Capable Fast Loop

Command target:

- Add or use a focused test/harness that feeds current-shaped cached
  conversation rows, cached context evidence, conversation-files entries, and
  account-mirror file catalog rows through the same freshness/frontier helper
  used by refresh.

The loop must assert the exact symptom:

- before the fix, the known post-pass-6 row state still selects the same row
  for `cached_state_not_fresh` or `missing_local_assets`;
- after the fix, rows with complete context plus retained conversation-file
  evidence become cached-fresh, while rows with genuinely missing local assets
  remain selected.

Decision rule:

- Do not patch by intuition. If no focused test seam exists, record that as a
  design gap and add the narrowest helper seam first.

### Step 3 | Hypothesis Tests

Ranked hypotheses:

1. **Missing local-materialization semantics**: retained `FileRef` proves a
   remote attachment exists, but freshness still reports `missing_local_assets`
   because the file has no local materialized asset. Prediction: the selected
   row has `detailCompleteness=complete` and cached file evidence, but no local
   path/checksum/materialization binding.
2. **Conversation metadata not annotated from retained files**: the collector
   observed the retained file in pass `6`, but durable conversation metadata was
   not updated because `detailObservedConversationIds` depends on live file
   inventory success rather than retained prior file evidence. Prediction:
   `filesObserved=1` exists in pass evidence, but the conversation row still
   lacks `detailObservedAt`/`manifestObservedAt`/`detailCompleteness=complete`.
3. **Cached summary hydration misses per-conversation files**:
   `readCachedConversationFreshnessSummaries` derives summaries from cached
   context and account-mirror catalog files only, not conversation-files cache.
   Prediction: direct cache probes show `conversation-files` rows, but the
   derived summary still reports missing assets.
4. **Frontier selection is correct**: the same four rows are still legitimately
   stale because only one row had a retained file and the other three lack
   cached context or complete detail evidence. Prediction: at least one top row
   remains not fresh for a real missing context/detail reason, so the cycle
   should keep selecting detail inventory.

### Step 4 | Execute The Minimal Fix

Only after Step 1-3 identify the failed condition:

- preserve Plan 0146's guard that complete detail metadata requires successful
  conversation file inventory plus complete context read;
- treat retained per-conversation file cache evidence as successful file
  inventory only when it is scoped to the selected conversation and the context
  read completed;
- if missing local assets are expected for remote-only files under
  `metadata_only`, update freshness semantics to distinguish "remote file known"
  from "local materialization required" instead of forcing endless detail
  scraping;
- add regression coverage at the helper boundary that actually failed.

### Step 5 | Validation And Live Proof

Required local validation:

- focused account-mirror freshness/frontier tests;
- focused collector/refresh/completion tests if touched;
- `pnpm exec tsc --noEmit --pretty false`;
- scoped Biome check for touched files;
- `pnpm run plans:audit -- --keep 151`.

Installed proof:

- install user runtime only after local validation passes;
- restart `auracall-api.service`;
- resume the same live-follow completion only long enough for one bounded pass
  or inspect a newly eligible pass if the completion is waiting;
- proof must capture:
  - in-flight phase events start at `identity` then `detail-inventory`;
  - no project/root rail phase restarts when detail remains pending;
  - `conversationFreshnessFrontier` row decisions after the fix;
  - whether `rowsSelectedForDetail` drops or remains selected for a legitimate
    non-fixed reason;
  - live-follow completion is paused again before closeout.

## Non-Goals

- Do not raise rate-limit thresholds or pacing knobs as a substitute for the
  inspection.
- Do not reopen Plan 0150's phase-ledger acceptance unless evidence shows the
  scheduler restarts root/project rails.
- Do not mark remote-only generated files as locally materialized.
- Do not disable missing-local-asset catch-up globally.
- Do not resume broad live-follow indefinitely.

## Acceptance

- [x] The plan is wired into `ROADMAP.md`, `RUNBOOK.md`, and the dev journal.
- [x] Current runtime/cache state is captured for all four selected ChatGPT rows.
- [x] A red-capable local loop or documented missing seam proves the exact
  reason the rows remain selected.
- [x] Any code fix preserves Plan 0146 detail-completeness semantics.
- [x] Tests cover the failure mode that made pass `6` retain one file but keep
  the same frontier-selected rows.
- [x] Installed proof either shows reduced `rowsSelectedForDetail` after the
  corrected evidence or proves the remaining rows are legitimately selected for
  a different explicit reason.
- [x] The live-follow completion is paused at closeout.

## Definition Of Done

This plan closes when the post-retention frontier behavior is explained and
corrected where needed, with current runtime evidence, focused regression
coverage, installed proof, and durable docs showing why the live-follow cycle
does or does not continue selecting `detail-inventory`.
