# ChatGPT Account-Library Automatic Mode Isolation Plan | 0107-2026-06-04

State: CLOSED
Lane: P01

## Purpose

Prove whether ChatGPT account-library live-follow catch-up can move from
`preview_only` to a narrow automatic eligible mode without reintroducing
unattributed browser activity, duplicate downloads, or stuck account-library
jobs. Plans 0100 through 0102 made the account-library lane observable and
manual/operator reliable, while Plan 0106 made the old Gemini live-follow
completion inert. The next decision needs an isolation proof, not a broader
cap raise.

## Current State

- Plan 0100 closed with account-library live-follow scheduling represented
  separately from conversation-history materialization.
- Plan 0102 closed with `chatgpt/wsl-chrome-3` account-library live follow
  still in `preview_only`.
- Manual/operator account-library materialization is proven for capped ChatGPT
  Library files, including duplicate active-source reuse and terminal replay
  advancing to a new unarchived family.
- Plan 0102 did not attempt the automatic smoke because operator observation
  reported unexplained Gemini `/app` page launching/refreshing during the
  continuation.
- Plan 0106 now blocks unsafe legacy Gemini automatic and operator resume.
  The legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` should remain
  paused with `error.code=gemini_live_follow_resume_blocked`.
- Most recent pre-plan diagnostics on 2026-06-03 showed
  `chatgpt/wsl-chrome-3` with active completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84` in
  `idle_waiting`, and the scheduler waiting on foreground-work backpressure.
  Execution must refresh those readbacks before any automatic-mode smoke.

## Scope

- Refresh installed runtime status for:
  - `auracall-api.service`;
  - `chatgpt/wsl-chrome-3` account-library catch-up;
  - the legacy Gemini completion;
  - managed browser process inventory.
- Add or tighten readback needed to attribute browser activity during a narrow
  automatic account-library pass.
- Run exactly one narrow automatic-mode smoke only after preflight is clean:
  - provider `chatgpt`;
  - runtime profile `wsl-chrome-3`;
  - account-library only;
  - asset kinds `files`;
  - `maxItems=1`;
  - `force=false`;
  - one active account-library job maximum.
- Prove the smoke either:
  - safely materializes or skips one account-library candidate and drains back
    to `activeJobCount=0`; or
  - refuses to start with an exact status reason that keeps `preview_only`.
- Update roadmap, runbook, dev journal, and fixes log with the final
  enablement decision.

## Non-Goals

- Do not run broad multi-tenant account-library catch-up.
- Do not raise account-library or conversation-history materialization caps.
- Do not route account-library rows through conversation-history recovery.
- Do not resume the legacy indefinite Gemini live-follow completion.
- Do not reopen broad Gemini automatic live follow.
- Do not use ChatGPT model selectors, feature-signature probing, or unrelated
  provider controls as part of account-library proof.
- Do not enable automatic account-library queueing by default for other
  runtime profiles in this plan.

## Work Tracks

### Track 1 | Isolation Preflight

Status: completed.

Critical path owner: main operator.

- Read installed API service state and confirm the active installed runtime.
- Read `chatgpt/wsl-chrome-3` scheduler diagnostics and account-library
  catch-up status.
- Read legacy Gemini completion status and confirm it remains paused with
  `gemini_live_follow_resume_blocked`.
- Scan managed browser processes before the smoke and record whether any
  Gemini or unrelated ChatGPT browser process is already present.
- If foreground-work backpressure or active account-library jobs are present,
  record the exact blocker and stop before enabling automatic mode.

Acceptance evidence:

- Preflight readback records service PID, scheduler posture, active completion
  ids, active account-library job count, browser health, and Gemini inert
  status.
- No browser launch occurs during preflight.

Result:

- `auracall-api.service` was active with `MainPID=74408`.
- `auracall api scheduler-diagnostics --provider chatgpt
  --runtime-profile wsl-chrome-3 --json --timeout-ms 20000` captured
  `scheduler.state=scheduled`, `posture=waiting`, reason
  `Foreground AuraCall API or service work is pending; live follow will retry
  later.`, and active completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`.
- `auracall api mirror-completion-status
  acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84 --json
  --timeout-ms 20000` showed that completion still `status=idle_waiting`,
  `mode=live_follow`, `sweepMode=full_sweep`, `passCount=87`, and
  `liveFollow.accountLibrary.mode=preview_only`.
- `auracall api mirror-completions --provider chatgpt --runtime-profile
  wsl-chrome-3 --status active --json --timeout-ms 20000` returned only the
  same active completion and showed `liveFollow.accountLibrary.enabled=false`.
- `auracall api history-materialization-jobs --provider chatgpt
  --runtime-profile wsl-chrome-3 --source-type
  account_library_reconciliation --status active --json --timeout-ms 20000`
  returned `metrics.active=0`.
- Process scan showed an existing managed ChatGPT Chrome process tree for
  `/home/ecochran76/.auracall/browser-profiles/wsl-chrome-3/chatgpt` on
  DevTools port `45015`, launched by the installed API process with
  `about:blank`.
- Gemini readback stayed inert:
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remained
  `status=paused`, `nextAttemptAt=null`, `passCount=10`, with
  `error.code=gemini_live_follow_resume_blocked`; Gemini scheduler diagnostics
  reported `browserMutations=null`.
- Full `/status`, `/v1/account-mirrors/status`, and `/v1/browser/processes`
  reads timed out after 20 seconds, so browser-health attribution was not
  clean enough to run an automatic-mode smoke.

### Track 2 | Attribution And Guard Readback

Status: completed with no code change.

- Verify existing scheduler diagnostics can distinguish:
  - account-library provider work;
  - conversation-history live follow;
  - unrelated provider/browser activity;
  - duplicate same-route navigation attempts.
- If current readback cannot attribute automatic account-library work
  cleanly, add the smallest diagnostic field or status projection needed
  before running the smoke.
- Keep added diagnostics read-only unless a later track explicitly enables the
  one-pass automatic smoke.

Acceptance evidence:

- Focused tests cover any added readback or status projection.
- Installed diagnostics before the smoke show the account-library proof target
  and no unrelated Gemini browser mutations.

Result:

- Existing narrow readbacks were sufficient to block enablement:
  scheduler diagnostics identified foreground-work backpressure and the active
  `wsl-chrome-3` completion, completion readback showed account-library
  remained `preview_only`, active account-library materialization jobs were
  `0`, and Gemini remained paused.
- Existing readbacks were not sufficient to run the automatic smoke because
  full status and browser-process inspection timed out. No diagnostic code was
  added in this slice because Plan 0107's preflight guard already required
  stopping before any mode change.

### Track 3 | Narrow Automatic Smoke

Status: skipped by preflight guard.

- Temporarily move only `chatgpt/wsl-chrome-3` account-library catch-up into
  the narrow eligible mode required for this proof.
- Trigger or wait for one account-library-only automatic pass.
- Require the pass to select at most one file candidate and to keep
  `force=false`.
- Read the job immediately after create/queue, while running if possible, and
  after terminal state.
- Revert to `preview_only` if the smoke fails, stalls, launches unrelated
  provider work, or cannot be attributed.

Acceptance evidence:

- Account-library job readback shows queued/running/terminal scheduler state
  with source-key attribution.
- Final status reports `activeJobCount=0`.
- Terminal replay semantics still skip already archived families before budget
  spend.
- Process scan shows no managed Gemini browser process caused by this pass.

Result:

- The smoke was not run.
- Reason: preflight was not clean. Scheduler diagnostics reported
  foreground-work backpressure, `wsl-chrome-3` had an active idle-waiting
  live-follow completion, a managed ChatGPT browser process was already
  present, and browser-health readback timed out.
- Final operating mode remains `preview_only`.

### Track 4 | Enablement Decision

Status: completed.

- Decide one of:
  - keep `preview_only`;
  - enable narrow eligible mode only for `chatgpt/wsl-chrome-3`
    account-library files with the same cap and guard settings proven here;
  - revert to disabled if provider/browser instability appears.
- Record the decision in `ROADMAP.md`, `RUNBOOK.md`,
  `docs/dev/dev-journal.md`, `docs/dev-fixes-log.md`, and this plan's
  closeout.

Acceptance evidence:

- Final docs state the exact operating mode and why.
- If eligible mode is enabled, installed status proves the configured target,
  cap, cooldown, active-job max, and browser-health guard.
- If `preview_only` remains, installed status proves automatic queueing is not
  active and the exact blocker is recorded.

Result:

- Final decision: keep `chatgpt/wsl-chrome-3` account-library live follow in
  `preview_only`.
- Automatic account-library queueing remains disabled for this target because
  the installed runtime did not satisfy the preflight isolation gates.
- The exact blockers were foreground-work backpressure, an active
  `wsl-chrome-3` live-follow completion, an existing managed ChatGPT browser
  process, and timeout of full status/browser-process readback.

## Exit Criteria

- The plan is closed only after the installed runtime proves the final
  account-library operating mode.
- Legacy Gemini live follow remains inert throughout the plan.
- No broad account-library or Gemini automatic behavior is enabled without a
  separate plan.
- Validation includes focused unit tests for changed readback surfaces, plus
  installed CLI/API readback for the final mode.

## Closeout

Closed as **ChatGPT Account-Library Automatic Mode Remains Preview-Only**.

Implemented:

- No code changes were required.
- The plan executed the required preflight and refused to run the automatic
  smoke because the installed runtime was not isolated enough for a safe mode
  change.

Validation:

- `auracall api scheduler-diagnostics --provider chatgpt --runtime-profile
  wsl-chrome-3 --json --timeout-ms 20000` passed and showed
  foreground-work backpressure plus active completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`.
- `auracall api mirror-completion-status
  acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84 --json
  --timeout-ms 20000` passed and showed
  `liveFollow.accountLibrary.mode=preview_only`.
- `auracall api mirror-completions --provider chatgpt --runtime-profile
  wsl-chrome-3 --status active --json --timeout-ms 20000` passed and returned
  the same active completion with `liveFollow.accountLibrary.enabled=false`.
- `auracall api history-materialization-jobs --provider chatgpt
  --runtime-profile wsl-chrome-3 --source-type
  account_library_reconciliation --status active --json --timeout-ms 20000`
  passed with `metrics.active=0`.
- `auracall api mirror-completion-status
  acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402 --json
  --timeout-ms 20000` passed and showed Gemini remained paused with
  `gemini_live_follow_resume_blocked`.
- `auracall api scheduler-diagnostics --provider gemini --runtime-profile
  auracall-gemini-pro --json --timeout-ms 20000` passed with Gemini completion
  paused and `browserMutations=null`.
- Process scan showed an existing managed ChatGPT browser process for
  `wsl-chrome-3/chatgpt`; no managed Gemini browser process was observed.
- `curl --max-time 20 /status`, `/v1/account-mirrors/status`, and
  `/v1/browser/processes` timed out, which confirmed browser-health readback
  was not clean enough for automatic mode.
