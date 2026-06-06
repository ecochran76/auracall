# Account-Library Cooldown-Clear Rerun Plan | 0119-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Rerun the Plan 0118 automatic account-library smoke after the observed
cooldown cleared. This slice keeps the same bounded proof contract and avoids
permanent cooldown/config changes.

## Current State

- Plan 0118 proved browser isolation and the Plan 0117 cursor path, but the
  target completion skipped account-library queueing because cooldown was
  active until `2026-06-05T14:09:00.065Z`.
- Current wall clock is past that cooldown.
- `chatgpt/wsl-chrome-3` is restored to `preview_only` with
  `failureCooldownMs=900000`.
- Active materialization jobs are `0`.
- Restored non-target live-follow has relaunched retained managed browsers for
  `default/chatgpt`, `default/grok`, and `wsl-chrome-4/chatgpt`.

## Scope

- Backup the current user-scoped config.
- Temporarily disable non-target live-follow.
- Restart the API, kill retained managed browser processes, and clear stale
  DevTools markers.
- Verify clean preflight: API active, active materialization jobs `0`, no live
  managed browser processes, and `wsl-chrome-3` still `preview_only`.
- Temporarily flip only `chatgpt/wsl-chrome-3` account-library mode to
  `eligible`.
- Start one bounded metadata-only completion with:
  `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --max-passes 1 --sweep-mode steady_follow --materialization-policy metadata_only --json`.
- Observe the completion and any referenced account-library materialization job
  until terminal.
- Restore the original config and restart the API.

## Non-Goals

- Do not permanently lower `failureCooldownMs`.
- Do not use explicit manual `history-materialization-create` as a substitute
  for automatic completion-owned queue proof.
- Do not resume legacy Gemini.

## Acceptance

- If automatic queueing works, the completion records
  `accountLibraryCursor.status=queued` or `reused` with an
  `account_library_reconciliation` job using `assetSource=account-library`,
  `assetKinds=["files"]`, `maxItems=3`, and terminal job status.
- If automatic queueing still skips, the completion records the exact
  `accountLibraryCursor` reason.
- Final config is restored to `preview_only`, active materialization jobs are
  `0`, and legacy Gemini remains paused.

## Closeout

Closed as **Automatic Account-Library Queue Proven**.

The first cooldown-clear attempt,
`acctmirror_completion_1ed1c4dd-6b00-4c15-b693-cc7bc4dff6b6`, was blocked by
ordinary target work, not cooldown: an existing/new history reconciliation job
`hmj_d2c0f30e71bc466bb5a0c03a631e60e7` owned the managed browser and completed
as `skipped` at `2026-06-05T20:07:16.220Z`.

After that ordinary reconciliation job drained and browser state returned to
idle, the second bounded completion,
`acctmirror_completion_7c75c623-d260-4a91-9abc-09d8e8017899`, completed one
pass and recorded:

- `accountLibraryCursor.status=queued`;
- `accountLibraryCursor.jobId=hmj_9d67f1345a7d4c909c82455caebadd73`;
- request `assetSource=account-library`;
- request `assetKinds=["files"]`;
- request `maxItems=3`;
- request `providerWorkTimeoutMs=120000`.

The referenced materialization job
`hmj_9d67f1345a7d4c909c82455caebadd73` ran as
`source.type=account_library_reconciliation`, `provider=chatgpt`,
`runtimeProfile=wsl-chrome-3`, `assetSource=account-library`,
`assetKinds=["files"]`, `maxItems=3`, and completed `succeeded` at
`2026-06-05T20:12:31.595Z`.

The original user config was restored from
`/home/ecochran76/.auracall/config.plan0119-rerun-20260605T150313-0500.json`.
Final readback showed `wsl-chrome-3` account-library mode back to
`preview_only`, active materialization jobs `0`, browser metrics
`processesAlive=0`, `responsiveDevTools=0`, and the legacy Gemini completion
still paused with `gemini_live_follow_resume_blocked`.
