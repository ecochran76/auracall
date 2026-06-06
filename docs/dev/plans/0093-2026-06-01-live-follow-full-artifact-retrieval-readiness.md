# Live Follow Full Artifact Retrieval Readiness Plan | 0093-2026-06-01

State: CLOSED
Lane: P01

## Purpose

Make live follow trustworthy for artifact catch-up by proving the installed
`chatgpt/wsl-chrome-3` target can finish a live-follow/backfill pass and, when
configured for full missing-asset retrieval, queue or run only eligible
materialization work. Plan 0092 made materialization selection safer; this plan
decides whether live follow itself is ready to drive catch-up, or what must be
fixed before it can.

## Current State

- Latest completed plan:
  `docs/dev/plans/0092-2026-05-31-chatgpt-catalog-hygiene-and-asset-eligibility.md`.
- Installed API status on 2026-06-01 showed:
  - live follow severity `attention-needed`;
  - scheduler posture `waiting`;
  - `5` active completions;
  - `0` active history-materialization jobs;
  - `chatgpt/wsl-chrome-3` active completion
    `acctmirror_completion_72225192-3e7c-4f64-bb2e-fa20b1f7a300`;
  - `chatgpt/wsl-chrome-3` status `idle_waiting` with
    `statusReason=failure-backoff`;
  - latest `chatgpt/wsl-chrome-3` failure:
    `Account mirror metadata collector timed out for chatgpt/wsl-chrome-3`;
  - `chatgpt/wsl-chrome-3` metadata counts: `30` conversations, `76`
    artifacts, `82` files, `0` media;
  - `chatgpt/wsl-chrome-3` asset inventory state `in_progress` because detail
    inventory was truncated;
  - `materializationOutcome=null` for the active live-follow target.
- Plan 0092 reduced materialization risk by skipping known static-image false
  positives, unsupported conversation-file rows, and stale duplicate Deep
  Research families, but it did not prove live follow can complete a pass or
  automatically drain retrievable artifacts.

## Scope

- Audit installed live-follow target configuration for `chatgpt/wsl-chrome-3`:
  - completion mode and phase;
  - materialization policy;
  - materialization asset kinds;
  - materialization max items;
  - refresh-snapshot and force flags;
  - backoff, cursor, and retry state.
- Diagnose why recent ChatGPT live-follow completions time out before pass
  completion.
- Decide whether the timeout is caused by collector runtime bounds, browser
  state, target size, provider navigation, scheduler backpressure, or
  materialization-policy interaction.
- If configuration is still metadata-only, change only the scoped
  `chatgpt/wsl-chrome-3` live-follow target to a bounded full-retrieval policy.
- If code behavior blocks completion or materialization queueing, fix the
  narrow installed-runtime path and prove it with a bounded smoke.
- Verify that live follow queues or executes eligible materialization work
  without reintroducing Plan 0091/0092 failures:
  - no repeated SoyFuze duplicate-family downloads;
  - no static favicon/generated-image false positives;
  - no unsupported ChatGPT conversation-file retrieval attempts;
  - no model-selector / feature-signature browser interaction during read or
    materialization passes.

## Non-Goals

- Do not run broad multi-tenant catch-up.
- Do not enable full retrieval for every live-follow target.
- Do not touch `chatgpt/wsl-chrome-2` while it is identity-mismatched.
- Do not treat unsupported ChatGPT conversation-file rows as materialized.
- Do not loosen Plan 0091 Deep Research OOPIF scoping or Plan 0092 eligibility
  guards.
- Do not change retired frontend behavior.

## Architecture Boundaries

- Live-follow scheduling, completion policy, and materialization policy should
  remain explicit operator/runtime configuration, not implicit behavior from
  ordinary metadata-only follow.
- Materialization work must remain durable and inspectable through existing
  history-materialization job surfaces.
- Eligibility classification belongs in catalog/materialization planning; the
  live-follow layer should consume that classification rather than duplicate
  provider heuristics.
- Installed-runtime proof is required before claiming live follow can fill
  missing artifacts.

## Implementation Tracks

### Track 1 | Installed Baseline And Policy Audit

Status: complete.

- Capture current installed API status, active completions, live-follow target
  state, scheduler posture, and active materialization jobs.
- Read the installed target config for `chatgpt/wsl-chrome-3`.
- Record whether the target is configured for:
  - metadata-only follow;
  - `recent_missing_assets`;
  - `full_missing_assets`;
  - bounded `materializationMaxItems`.
- Capture current recovery/candidate counts after Plan 0092 eligibility
  filtering.

Evidence:

- Installed `chatgpt/wsl-chrome-3` live-follow config was already bounded full
  retrieval capable:
  - `mode: metadata-first`;
  - `sweepMode: full_sweep`;
  - `materializationPolicy: full_missing_assets`;
  - `materializationAssetKinds: [all]`;
  - `materializationMaxItems: 3`;
  - `materializationRefreshSnapshot: true`;
  - `materializationForce: false`.
- Recovery readback remained one eligible target with
  `133` remote-known missing local assets after refresh:
  `50` artifacts, `83` files, and `0` media.
- Active history-materialization jobs were `0` before the installed proof.

### Track 2 | Timeout Root Cause

Status: complete.

- Inspect recent `chatgpt/wsl-chrome-3` completion failures and service logs.
- Identify the collector phase that times out:
  - project scan;
  - conversation list;
  - detail hydration;
  - artifact/file inventory;
  - scheduler/yield/backpressure wait.
- Fix the narrow cause if it is in AuraCall behavior, or document the exact
  browser/operator unblocker if provider state is blocking progress.
- Acceptance for this track is a live-follow/backfill pass that reaches a
  non-timeout terminal or idle state with clear cursor/backoff evidence.

Evidence:

- Root cause: ChatGPT full-sweep completion collector timeout was still
  `300_000` ms while full-sweep ChatGPT backfill with detail inventory can
  exceed five minutes before materialization queueing.
- Fix: ChatGPT full-sweep completions now use the wider `900_000` ms collector
  timeout, matching the already-expanded full-sweep budget used for Gemini.
- Installed proof after the fix advanced past the metadata collector, completed
  one pass, and queued a history-materialization job instead of timing out.

### Track 3 | Bounded Full Retrieval Policy

Status: complete.

- If `chatgpt/wsl-chrome-3` is not already configured for bounded full
  retrieval, update the installed scoped target to:
  - `materializationPolicy: full_missing_assets`;
  - `materializationAssetKinds: [artifacts]` first;
  - a small `materializationMaxItems` such as `1` to `3`;
  - `materializationRefreshSnapshot: true`;
  - `materializationForce: false`.
- Preserve broader live-follow defaults and other tenants.
- Verify the configured policy is visible through API/CLI status readback.

Evidence:

- No config mutation was required. The installed scoped target already had
  `full_missing_assets`, `[all]`, `materializationMaxItems=3`,
  `materializationRefreshSnapshot=true`, and `materializationForce=false`.

### Track 4 | Queue And Materialization Proof

Status: complete.

- Let or trigger one bounded `chatgpt/wsl-chrome-3` live-follow/backfill pass
  under the scoped full-retrieval policy.
- Prove one of:
  - live follow queues a history-materialization job for an eligible
    retrievable asset;
  - live follow directly records a bounded materialization outcome;
  - live follow terminally classifies the next eligible candidate before
    provider/browser work.
- Record:
  - completion id;
  - materialization job id if any;
  - selected conversation/provider ids;
  - local path/checksum when materialized;
  - terminal reason when skipped;
  - before/after active jobs;
  - before/after missing-local or eligibility counts.

Evidence:

- First post-timeout installed proof job
  `hmj_2f9320b49ae540e6be719170719d0126` showed the next bug: refreshed
  `image-dom:*` manifest rows could use `artifactId` plus Google favicon
  `uri` values and still spend fetch budget.
- Fix: static-image false-positive detection now recognizes `artifactId`, and
  ChatGPT artifact materialization skips static favicon rows before provider
  fetch work.
- Second installed proof job
  `hmj_5819d4a047a1481aa3877e9e107fac5a` reached terminal `skipped` with
  `failed=0`, proving favicon rows no longer fail the job, but exposed a
  download duplicate ordering bug: a same-title `sandbox:/mnt/data/*.docx`
  artifact could consume the small `maxItems` budget before the actionable DOM
  `chatgpt://download-button/...` row.
- Fix: ChatGPT artifact selection now prefers same-title DOM download-button
  artifacts over sandbox download duplicates before applying `maxItems`.
- Final installed proof job
  `hmj_13c5108693104ae0833942a49fac3993` reached terminal `succeeded`:
  - result status `materialized`;
  - conversations attempted `3`;
  - materialized `1`;
  - skipped `2`;
  - failed `0`;
  - provider id
    `download-dom:485b1113-c7d9-4b6d-a9fc-3461ca4493e4:0`;
  - title `Download the revised DOCX`;
  - local path
    `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/conversation-attachments/6a092419-33c0-83ea-bca8-27c694312842/files/download-dom-485b1113-c7d9-4b6d-a9fc-3461ca4493e4-0/Earthline_PCG_Mutual_Confidentiality_Agreement_revised.docx`;
  - SHA-256
    `7a7f8de11b1ca3f537f694397018db3112d9e490d0f718db55146f9de65f1c71`;
  - archive item
    `history-generated-artifact:chatgpt:eric.cochran_soylei.com:6a092419-33c0-83ea-bca8-27c694312842:download-dom_485b1113-c7d9-4b6d-a9fc-3461ca4493e4_0`.
- Active history-materialization jobs returned to `0`.
- A stale duplicate live-follow completion
  `acctmirror_completion_72225192-3e7c-4f64-bb2e-fa20b1f7a300` was cancelled;
  one active `chatgpt/wsl-chrome-3` live-follow completion remains:
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`,
  `passCount=1`, `full_missing_assets`, `[all]`, `materializationMaxItems=3`.

### Track 5 | Regression Guard Checks

Status: complete.

- Confirm the live-follow-driven path does not select:
  - `image-dom:*` static favicon rows;
  - unsupported ChatGPT conversation-file rows;
  - stale SoyFuze duplicate-family rows already covered by complete catalog
    evidence.
- Scan the service log window for:
  - `feature-signature`;
  - model selector/control/picker;
  - repeated SoyFuze / Deep Research duplicate exports.
- Run targeted tests for any touched code and the plan/doc audit gate.

Evidence:

- Service-log scan from byte offset `1157773` after the final proof found no
  `feature-signature`, model-selector/control/picker, SoyFuze, Deep Research,
  or `Chemical Composition Dossier` hits.
- File scan after `2026-05-31 21:34:16` found no new SoyFuze or Chemical
  Composition Dossier files.
- Active history-materialization jobs returned to `0`.

## Acceptance Criteria

- Plan 0093 is wired into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Installed `chatgpt/wsl-chrome-3` live-follow configuration is explicitly
  classified as metadata-only or bounded full-retrieval capable.
- The current `chatgpt/wsl-chrome-3` completion timeout has a concrete root
  cause, code fix, or operator unblocker.
- A bounded installed proof shows live follow can complete enough work to queue,
  run, or terminally classify eligible missing-asset materialization work.
- Active history-materialization jobs return to `0` after proof, or any
  remaining active job has an exact id and expected next action.
- No Plan 0091/0092 regression signals appear: repeated SoyFuze downloads,
  static-image false-positive selection, unsupported conversation-file fetch,
  or model-selector / feature-signature browser interaction.

## Validation Plan

- Read-only baseline:
  - API status;
  - active completions;
  - active history-materialization jobs;
  - recovery/candidate readback for `chatgpt/wsl-chrome-3`.
- Config/readback validation for the scoped live-follow materialization policy.
- Bounded installed live-follow or completion proof.
- Targeted tests for touched code.
- Documentation gates:
  - `pnpm run plans:audit -- --keep 93`;
  - `git diff --check`.

## Definition Of Done

- We can say, with installed-runtime evidence, that `chatgpt/wsl-chrome-3`
  live follow is bounded full-retrieval capable for eligible retrievable
  artifacts.
- The target has bounded full-retrieval policy and installed proof that the
  same durable materialization lane can queue, run, skip unsupported rows, and
  materialize a retrievable ChatGPT DOCX artifact without static-image,
  SoyFuze duplicate, or model-selector regressions.
- Remaining caveat: ChatGPT conversation-file rows are still intentionally
  unsupported and remain visible as missing-local metadata until a separate
  provider file-fetch implementation exists.
