# ChatGPT Account-Library Automatic-Mode Capped Smoke Plan | 0109-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Run the first tightly capped ChatGPT account-library automatic-mode smoke after
Plan 0108 made the required preflight readbacks bounded. This slice decides
whether `chatgpt/wsl-chrome-3` can temporarily leave `preview_only` for one
account-library file catch-up attempt, while preserving a fast no-go path if
runtime attribution is not clean.

## Current State

- Plan 0108 is closed as **Account-Mirror Readback Latency Bounded**.
- Target-scoped `/status`, `/v1/account-mirrors/status`, and
  `/v1/browser/processes` now return within the 20-second preflight window for
  `chatgpt/wsl-chrome-3`.
- `~/.auracall/config.json` currently keeps
  `runtimeProfiles.wsl-chrome-3.services.chatgpt.liveFollow.accountLibrary.mode`
  at `preview_only` with `maxItems=3`, `maxActiveJobs=1`,
  `failureCooldownMs=900000`, and `providerWorkTimeoutMs=120000`.
- The target has active account-library jobs at `0` and no managed ChatGPT or
  Gemini browser process in the clean baseline.
- The persisted `chatgpt/wsl-chrome-3` live-follow completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84` is
  `idle_waiting` with `passCount=87`; this is not provider work, but it is a
  required attribution signal for the smoke.
- Legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remains paused
  with `gemini_live_follow_resume_blocked` and must stay inert.

## Scope

- Snapshot the user-scoped runtime config before any mutation.
- Re-run the installed preflight immediately before any mode change:
  - API service active and healthy;
  - target-scoped `/status` returns within 20 seconds;
  - account-library mode is `preview_only` and enabled false;
  - browser health is idle or observed without blank pages;
  - active account-library jobs are `0`;
  - no managed Gemini browser process exists;
  - no unrelated provider/browser work is active.
- If gates pass, temporarily change only
  `chatgpt/wsl-chrome-3` account-library mode to `eligible`, restart/reload the
  installed API service, and let one capped scheduler/completion pass attempt
  automatic account-library catch-up.
- Observe one bounded outcome:
  - one account-library materialization job is queued/running then drains to a
    terminal status, or
  - status reports an explicit bounded blocker without creating jobs.
- Restore account-library mode to `preview_only` regardless of outcome and
  prove the restored state from installed readbacks.

## Non-Goals

- Do not broaden beyond `chatgpt/wsl-chrome-3`.
- Do not raise `maxItems`, `maxActiveJobs`, or provider work timeout caps.
- Do not enable account-library automatic mode permanently.
- Do not resume or replace the legacy Gemini completion.
- Do not run unrelated materialization, reconciliation, or browser smokes.
- Do not treat a status read as permission to launch provider preview work.

## Work Tracks

### Track 1 | Guarded Plan Wiring

Status: completed.

- Wire this plan into `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Record the runtime-state boundary: config mutation is user-scoped and must be
  restored.

Acceptance evidence:

- Plan 0109 is the active P01 plan.
- Docs state the preflight and restore gates before runtime mutation.

### Track 2 | Preflight Gate

Status: completed.

- Run installed preflight readbacks against `chatgpt/wsl-chrome-3`.
- Abort before mutation if foreground work, blank browser pages, active jobs,
  Gemini process activity, or ambiguous attribution is present.

Acceptance evidence:

- Either all gates pass, or the plan closes as no-go with exact readback
  evidence and no config mutation.

### Track 3 | Capped Automatic-Mode Smoke

Status: cancelled.

- Snapshot `~/.auracall/config.json`.
- Temporarily set the target account-library mode to `eligible` only if Track 2
  passes.
- Restart/reload `auracall-api.service` and observe one capped automatic pass.
- Restore `preview_only` in all terminal paths.

Acceptance evidence:

- Installed readbacks show either a terminal account-library job outcome or an
  explicit bounded blocker.
- Final installed readback shows `mode=preview_only`, enabled false, active
  jobs `0`, and no managed Gemini process.

## Exit Criteria

- Close as **Automatic Account-Library Smoke Passed** only if one capped
  automatic job drains terminally and final state is restored to `preview_only`.
- Close as **Automatic Account-Library Smoke No-Go** if preflight or bounded
  smoke attribution is not clean.
- In all closeout states, prove account-library mode is restored to
  `preview_only`, active account-library jobs are `0`, and legacy Gemini remains
  inert.

## Closeout

Closed as **Automatic Account-Library Smoke No-Go**.

- Plan 0109 opened and wired the capped automatic-mode smoke, but the preflight
  gate failed before any config mutation.
- `auracall-api.service` was active on PID `71949`.
- Scheduler diagnostics for `chatgpt/wsl-chrome-3` returned `state=scheduled`,
  `posture=waiting`, and reason
  `Foreground AuraCall API or service work is pending; live follow will retry later.`
  after a retry window.
- Scoped `/status?provider=chatgpt&runtimeProfile=wsl-chrome-3` returned
  within 20 seconds with one eligible target, active completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`,
  `actualStatus=idle_waiting`, account-library `mode=preview_only`,
  `enabled=false`, and browser health `status=idle`.
- Active account-library materialization jobs for `chatgpt/wsl-chrome-3`
  returned `0`.
- `/v1/browser/processes?provider=chatgpt&runtimeProfile=wsl-chrome-3`
  returned one scoped target with `processAlive=false` and `openBlankPageCount=0`.
- Process scan found no managed ChatGPT or Gemini browser process.
- Legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remained
  `paused`, `nextAttemptAt=null`, with
  `error.code=gemini_live_follow_resume_blocked`.
- User-scoped config was not mutated; `~/.auracall/config.json` still reports
  `profiles.wsl-chrome-3.services.chatgpt.liveFollow.accountLibrary.mode` as
  `preview_only`.

Validation:

- Installed preflight readbacks listed above.
- `git diff --check`.

## Rerun Closeout | 2026-06-05

Closed as **Automatic Account-Library Smoke No-Go After Attribution Fix**.

- Plan 0110 fixed the original false foreground-work blocker: installed
  `/status` reported `foregroundWork.active=false` with
  `activeRequestCount=0`, `drainReservations=0`,
  `backgroundDrainScheduled=true`, and `backgroundDrainState=idle`.
- `chatgpt/wsl-chrome-3` stayed `idle_waiting`, account-library
  `mode=preview_only`, `enabled=false`, browser health `status=idle`,
  `processAlive=false`, and active account-library jobs `0`.
- The rerun did not mutate `~/.auracall/config.json` because process isolation
  was still not clean. A bounded wait let the unrelated `wsl-chrome-4` running
  completion drain, but managed browser processes for `default/chatgpt`,
  `wsl-chrome-4/chatgpt`, and `gemini-stealthcdp/gemini` remained alive.
- Final validation saw ordinary `chatgpt/wsl-chrome-3` live-follow provider
  work start on scheduler cadence, with `foregroundWork.active=true` and
  `backgroundDrainState=running`; account-library mode still read
  `preview_only`, and active account-library materialization jobs remained `0`.
- Legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remained
  paused with `gemini_live_follow_resume_blocked`.

Validation:

- `auracall api status --json --timeout-ms 20000`.
- `auracall api scheduler-diagnostics --provider chatgpt --runtime-profile wsl-chrome-3 --json --timeout-ms 20000`.
- `auracall api history-materialization-jobs --status active --provider chatgpt --runtime-profile wsl-chrome-3 --json --timeout-ms 20000`.
- managed-browser process scan with `pgrep -af 'chrome|chromium'`.

## Second Rerun Closeout | 2026-06-05

Closed as **Automatic Account-Library Smoke No-Go: Scheduler Advanced Without Launch**.

- Process isolation was made clean before mutation:
  - the unrelated `wsl-chrome-4/chatgpt` completion
    `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` was paused;
  - non-target live-follow profiles were temporarily disabled in
    `~/.auracall/config.json`;
  - retained `default/chatgpt` and `wsl-chrome-4/chatgpt` managed browser
    processes were terminated;
  - stale `DevToolsActivePort` files were removed;
  - authenticated `/v1/browser/processes` then reported
    `processesAlive=0`, `responsiveDevTools=0`, `launchBlankArg=0`, and
    `openBlankPages=0`.
- Preflight for `chatgpt/wsl-chrome-3` passed with account-library mode still
  `preview_only`, active history materialization jobs `0`, no live managed
  browser process, and legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` still paused
  with `gemini_live_follow_resume_blocked`.
- The runtime config was backed up at
  `~/.auracall/config.plan0109-rerun-20260604T224206-0500.json`, then only
  `profiles.wsl-chrome-3.services.chatgpt.liveFollow.accountLibrary.mode` was
  temporarily changed to `eligible`.
- After API restart, bounded polling crossed the completion retry boundary:
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84` remained
  `idle_waiting` with `passCount=99`, but `nextAttemptAt` advanced from
  `2026-06-05T03:47:08.775Z` to `2026-06-05T03:55:55.547Z`.
- No account-library/history materialization job was queued, no managed browser
  launched, and `/v1/browser/processes` remained fully idle during the rerun.
- Because the scheduler advanced without either launching the capped
  account-library path or surfacing an explicit bounded blocker, the smoke did
  not satisfy the Plan 0109 pass criteria.
- The original user-scoped config was restored from the backup and the API was
  restarted. Final readbacks showed `wsl-chrome-3` account-library mode back at
  `preview_only`, active jobs `0`, no live managed browser process, and the API
  service active.

Validation:

- `auracall api scheduler-diagnostics --provider chatgpt --runtime-profile wsl-chrome-3 --json --timeout-ms 30000`.
- `auracall api history-materialization-jobs --json --timeout-ms 30000`.
- authenticated `GET /v1/browser/processes`.
- `systemctl --user restart auracall-api.service && systemctl --user is-active auracall-api.service`.
