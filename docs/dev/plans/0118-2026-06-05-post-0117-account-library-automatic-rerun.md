# Post-0117 Account-Library Automatic Rerun Plan | 0118-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Rerun the Plan 0109 ChatGPT account-library automatic-mode smoke after Plan
0117 installed completion-owned account-library queue/skip evidence. This run
must prove that a clean, temporary `eligible` window for
`chatgpt/wsl-chrome-3` either creates/reuses a capped account-library file
reconciliation job and drains it terminally, or produces explicit
`accountLibraryCursor` blocker evidence.

## Current State

- Plan 0117 is closed as **Account-Library Scheduler No-Op Explained**.
- Installed diagnostics for `chatgpt/wsl-chrome-3` currently show no active
  completion selected by the scheduler; the prior completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84` is not in the
  current filtered installed completion list.
- `wsl-chrome-3` account-library config is restored to `preview_only` with
  `maxItems=3`, `failureCooldownMs=900000`, `maxActiveJobs=1`, and
  `providerWorkTimeoutMs=120000`.
- Active history materialization jobs are `0`.
- Runtime is not isolated: retained managed browsers exist for
  `default/chatgpt`, `default/grok`, `wsl-chrome-3/chatgpt`, and
  `wsl-chrome-4/chatgpt`; non-target live-follow config remains enabled.
- Legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remains paused
  with `gemini_live_follow_resume_blocked`.

## Scope

- Snapshot `~/.auracall/config.json` before mutation.
- Temporarily disable all non-target live-follow profiles that can relaunch
  managed browser work during the smoke.
- Restart `auracall-api.service` after the temporary config change.
- Terminate retained managed browser processes for non-target profiles and
  stale target browser state before the target smoke.
- Verify preflight:
  - API active;
  - `wsl-chrome-3` account-library mode is still `preview_only`;
  - active account-library/history materialization jobs are `0`;
  - no managed browser process is live or responsive;
  - legacy Gemini remains paused.
- Temporarily flip only
  `profiles.wsl-chrome-3.services.chatgpt.liveFollow.accountLibrary.mode` to
  `eligible`, restart the API, and start one bounded target completion using:
  - `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --max-passes 1 --sweep-mode steady_follow --materialization-policy metadata_only --json`;
  - no normal history materialization policy, so any materialization job must
    come from account-library catch-up.
- Observe until one of these terminal outcomes:
  - `accountLibraryCursor.status` is `queued` or `reused`, the referenced
    `account_library_reconciliation` job drains terminally, and final active
    jobs are `0`;
  - `accountLibraryCursor.status=skipped` with an explicit blocker reason.
- Restore the original user-scoped config in all terminal paths, restart the
  API, and prove `wsl-chrome-3` is back to `preview_only`.

## Non-Goals

- Do not leave account-library automatic mode enabled.
- Do not raise account-library caps or provider work timeout.
- Do not resume legacy Gemini live-follow.
- Do not run broad provider/browser smokes.
- Do not use ordinary history materialization as a substitute for
  account-library file reconciliation proof.

## Work Tracks

### Track 1 | Runtime Isolation

Status: completed.

- Backup config, disable non-target live-follow, restart API, terminate
  retained managed browsers, and clear stale DevTools markers.

Acceptance evidence:

- Browser-process readback reports `processesAlive=0`,
  `responsiveDevTools=0`, and `openBlankPages=0` before target mutation.
- Installed preflight after terminating retained managed browsers and clearing
  `DevToolsActivePort` markers reported `processesAlive=0`,
  `responsiveDevTools=0`, `launchBlankArg=0`, `openBlankPages=0`, and
  `live=[]`.

### Track 2 | Target Eligible Smoke

Status: completed.

- Flip only `wsl-chrome-3` account-library mode to `eligible`.
- Start one bounded metadata-only target completion.
- Observe account-library cursor and any referenced materialization job.

Acceptance evidence:

- Completion readback includes `accountLibraryCursor`.
- If a job is queued/reused, it is `account_library_reconciliation` with
  `assetSource=account-library` and reaches terminal status.
- Target completion
  `acctmirror_completion_d7bd7cbd-4ae4-4ac4-b35e-f051adfde4f5` completed one
  pass after the temporary `eligible` flip. It persisted
  `accountLibraryCursor.status=skipped`, `requestedAt=2026-06-05T14:05:22.562Z`,
  and
  `reason="account-library failure cooldown is active until 2026-06-05T14:09:00.065Z"`.
- No account-library reconciliation job was expected or created while cooldown
  was active; active materialization jobs remained `0`.

### Track 3 | Restore And Closeout

Status: completed.

- Restore original config, restart API, and record final readbacks.

Acceptance evidence:

- `wsl-chrome-3` account-library mode is `preview_only`.
- Active jobs are `0`.
- Legacy Gemini remains paused.
- Restored `/home/ecochran76/.auracall/config.json` from
  `/home/ecochran76/.auracall/config.plan0118-rerun-20260605T085617-0500.json`
  and restarted `auracall-api.service`.
- Final config readback showed non-target live-follow restored and
  `wsl-chrome-3` account-library mode back to `preview_only`.
- Final installed runtime readback reported API `active`, browser metrics
  `processesAlive=0`, `responsiveDevTools=0`, `launchBlankArg=0`,
  `openBlankPages=0`, `live=[]`, active materialization jobs `0`, and legacy
  Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` still paused
  with `error.code=gemini_live_follow_resume_blocked`.

## Exit Criteria

- Close as **Automatic Account-Library Smoke Passed** if a capped
  account-library job queues/reuses and drains terminally while config is
  restored afterward.
- Close as **Automatic Account-Library Smoke Blocked With Evidence** if the
  completion persists `accountLibraryCursor.status=skipped` with an explicit
  blocker reason.
- Close as **Automatic Account-Library Smoke No-Go** if isolation or restore
  gates fail.

## Closeout

Closed as **Automatic Account-Library Smoke Blocked With Evidence**.

The rerun killed retained managed Chrome work, including `wsl-chrome-4`, and
proved a clean browser/process preflight before mutation. The temporary target
window flipped only `chatgpt/wsl-chrome-3` from `preview_only` to `eligible`
and started one bounded metadata-only completion. The completion reached the
Plan 0117 account-library cursor path and completed with explicit cooldown
evidence:

- completion:
  `acctmirror_completion_d7bd7cbd-4ae4-4ac4-b35e-f051adfde4f5`;
- pass count: `1`;
- `accountLibraryCursor.status=skipped`;
- blocker:
  `account-library failure cooldown is active until 2026-06-05T14:09:00.065Z`;
- active materialization jobs: `0`.

The result is not a browser-process blocker and not the old Plan 0109 silent
no-op. The remaining gate for another automatic-mode smoke is the
account-library failure cooldown.
