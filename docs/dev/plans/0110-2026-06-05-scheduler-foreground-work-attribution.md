# Scheduler Foreground-Work Attribution Plan | 0110-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Fix the foreground-work attribution blocker that made Plan 0109 abort before
the capped ChatGPT account-library automatic-mode smoke. The goal is to make
account-mirror scheduler diagnostics distinguish real foreground pressure from
an idle background-drain cadence timer, without weakening protection for active
API work, explicit response-drain reservations, or drains already entering
scheduled/running state.

## Current State

- Plan 0109 is closed as **Automatic Account-Library Smoke No-Go**.
- The installed service reports scheduler `posture=waiting` with
  `backpressureReason=foreground-work`.
- Full installed status shows `foregroundWork.active=true` only because
  `backgroundDrainScheduled=true` while `activeRequestCount=0`,
  `drainReservations=0`, and `backgroundDrainState=idle`.
- A future background-drain cadence timer is normal service posture; it should
  not by itself block account-mirror scheduler passes.
- Account-library automatic mode remains `preview_only`; this plan must not
  mutate `~/.auracall/config.json` or resume legacy Gemini live follow.

## Scope

- Preserve foreground pressure for:
  - active foreground AuraCall provider/API work;
  - explicit response-drain reservations;
  - background drain state `scheduled` or `running`.
- Stop treating an idle future background-drain cadence timer as active
  foreground pressure.
- Add regression coverage for the installed shape:
  `backgroundDrainScheduled=true`, `backgroundDrainState=idle`, and no active
  foreground requests or drain reservations.
- Reinstall/restart the user runtime service and prove installed diagnostics no
  longer report foreground-work waiting solely because the cadence timer is
  scheduled.

## Non-Goals

- Do not run the Plan 0109 automatic-mode smoke.
- Do not change account-library mode, caps, or provider work timeouts.
- Do not change background-drain cadence behavior or response execution.
- Do not resume or replace the legacy Gemini completion.

## Work Tracks

### Track 1 | Attribution Diagnosis

Status: completed.

- Compare scheduler diagnostics with full status foreground-work counters.
- Identify which foreground-work source is active.

Acceptance evidence:

- Installed status shows `activeRequestCount=0`, `drainReservations=0`,
  `backgroundDrainScheduled=true`, and `backgroundDrainState=idle`.

### Track 2 | Guard Semantics

Status: completed.

- Update foreground-pressure calculation so an idle cadence timer remains
  observable but does not make `foregroundWork.active=true`.
- Keep scheduled/running drain state and explicit drain reservations as
  pressure.

Acceptance evidence:

- Focused test covers the idle cadence timer shape and expects scheduler
  posture `healthy`, `backpressureReason=none`, and `foregroundWork.active=false`.

### Track 3 | Installed Readback

Status: completed.

- Run focused tests, typecheck/build as needed for the touched HTTP surface.
- Install/restart the user runtime service.
- Re-run installed `auracall api status --json` and
  `auracall api scheduler-diagnostics --provider chatgpt --runtime-profile wsl-chrome-3 --json`.

Acceptance evidence:

- Installed readback proves an idle scheduled background-drain timer is no
  longer surfaced as foreground-work waiting.
- Account-library mode remains `preview_only`, active account-library jobs stay
  at `0`, and legacy Gemini remains paused.

## Exit Criteria

- Close as **Scheduler Foreground Attribution Fixed** when tests pass and
  installed readbacks show the scheduler is no longer blocked solely by an idle
  background-drain cadence timer.
- Close as **Scheduler Foreground Attribution Still Blocked** if installed
  readbacks show another real foreground pressure source remains.

## Closeout

Closed as **Scheduler Foreground Attribution Fixed**.

- Installed status before the fix reported `foregroundWork.active=true` solely
  because `backgroundDrainScheduled=true` while `activeRequestCount=0`,
  `drainReservations=0`, and `backgroundDrainState=idle`.
- `src/http/responsesServer.ts` now excludes the idle cadence timer from
  `hasForegroundAuraCallExecutionPressure`, while preserving pressure for
  active foreground work, explicit drain reservations, and drain state
  `scheduled`/`running`.
- Regression coverage in `tests/http.responsesServer.test.ts` proves
  `backgroundDrainScheduled=true` plus `backgroundDrainState=idle` reports
  `foregroundWork.active=false`, scheduler posture `healthy`, and
  `backpressureReason=none`.
- Installed runtime was rebuilt and `auracall-api.service` restarted on PID
  `81296`.
- Installed `auracall api status --json --timeout-ms 20000` showed scheduler
  `state=scheduled`, `posture=scheduled`, `backpressureReason=null`, and
  `foregroundWork={active:false, activeRequestCount:0, drainReservations:0,
  backgroundDrainScheduled:true, backgroundDrainState:"idle"}`.
- Installed scheduler diagnostics for `chatgpt/wsl-chrome-3` showed
  `posture=scheduled` with reason
  `account mirror scheduler has a pass queued on its cadence timer`, not
  foreground-work waiting.
- Removing the false block allowed ordinary `chatgpt/wsl-chrome-3` live-follow
  provider work to run; account-library automatic mode still remained
  `preview_only`.
- Active account-library reconciliation materialization jobs for
  `chatgpt/wsl-chrome-3` returned `0`.
- User-scoped config still reports
  `profiles.wsl-chrome-3.services.chatgpt.liveFollow.accountLibrary.mode` as
  `preview_only`.
- Legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remained
  `paused`, `nextAttemptAt=null`, with
  `error.code=gemini_live_follow_resume_blocked`.

Validation:

- `pnpm vitest run tests/http.responsesServer.test.ts -t "idle background drain cadence timer|dry-run lazy account mirror scheduler"`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run plans:audit -- --keep 110`
- `git diff --check`
- `pnpm run install:user-runtime-service`
