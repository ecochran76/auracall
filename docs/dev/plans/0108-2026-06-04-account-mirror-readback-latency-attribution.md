# Account-Mirror Readback Latency And Attribution Plan | 0108-2026-06-04

State: CLOSED
Lane: P01

## Purpose

Fix the readback blocker that kept Plan 0107 from running a safe
account-library automatic-mode smoke. Plan 0107 correctly left
`chatgpt/wsl-chrome-3` account-library live follow in `preview_only` because
full `/status`, `/v1/account-mirrors/status`, and `/v1/browser/processes`
timed out during preflight. The next slice is to make the narrow preflight
readbacks responsive and attributable without enabling automatic
account-library queueing.

## Current State

- Plan 0107 is closed as **ChatGPT Account-Library Automatic Mode Remains
  Preview-Only**.
- Narrow completion and job readbacks are responsive:
  - `mirror-completions` shows the `wsl-chrome-3` active completion with
    `liveFollow.accountLibrary.mode=preview_only` and enabled false;
  - `history-materialization-jobs` shows active account-library jobs at `0`.
- Broad status readbacks are not responsive enough for the preflight:
  - `/status` timed out after 20 seconds;
  - `/v1/account-mirrors/status?provider=chatgpt&runtimeProfile=wsl-chrome-3`
    timed out after 20 seconds;
  - `/v1/browser/processes` timed out after 20 seconds.
- The automatic-mode smoke must remain disabled until those readbacks can
  prove browser-health attribution without launching unrelated provider work.

## Scope

- Diagnose why account-mirror status and browser-process readbacks hang or
  exceed the preflight timeout.
- Add the smallest readback-only fix that keeps provider/browser inspection
  bounded for preflight.
- Prefer target-scoped readbacks over full-corpus scans when provider and
  runtime profile filters are supplied.
- Preserve existing broad status behavior unless the broad path itself is the
  cause of the timeout.
- Validate the fix with focused tests and installed CLI/API readbacks.
- Update roadmap, runbook, dev journal, fixes log, and this plan with the
  final proof.

## Non-Goals

- Do not enable account-library automatic mode.
- Do not run the Plan 0107 automatic smoke in this slice.
- Do not raise account-library caps.
- Do not resume the legacy Gemini live-follow completion.
- Do not change browser automation behavior beyond read-only inspection.
- Do not hide provider/browser health failures; make them bounded and
  attributable.

## Work Tracks

### Track 1 | Timeout Diagnosis

Status: completed.

- Inspect `/status`, `/v1/account-mirrors/status`, and
  `/v1/browser/processes` handlers.
- Identify whether the timeout comes from account-mirror cache hydration,
  browser process inspection, DevTools probing, or broad target enumeration.
- Record which readbacks are already responsive enough and should not be
  changed.

Acceptance evidence:

- A code-level diagnosis points to the exact slow branch.
- Existing responsive readbacks remain unchanged.

### Track 2 | Bounded Preflight Readback

Status: completed.

- Add or tighten a bounded readback path for the Plan 0107 preflight target:
  `provider=chatgpt`, `runtimeProfile=wsl-chrome-3`.
- Ensure the readback can report:
  - account-library mode and enabled flag;
  - active account-library job count;
  - relevant active completion id/status;
  - browser process/health status or exact bounded failure reason.
- Make any timeout/failure explicit in JSON instead of hanging the whole
  endpoint.

Acceptance evidence:

- Focused tests cover the bounded readback behavior and timeout/failure
  projection.
- The installed endpoint returns within the requested timeout.

### Track 3 | Installed Proof

Status: completed.

- Rebuild/reinstall the user runtime if code changes.
- Read installed target-scoped account-mirror status.
- Read installed browser-process or browser-health status.
- Confirm Gemini remains paused with
  `gemini_live_follow_resume_blocked`.
- Confirm account-library automatic mode remains `preview_only`.

Acceptance evidence:

- Installed readbacks complete within 20 seconds.
- No automatic account-library job is created.
- No managed Gemini browser process appears.

## Exit Criteria

- Plan 0108 closes only when the Plan 0107 preflight readbacks are responsive
  or return explicit bounded failure JSON.
- The account-library target remains `preview_only`.
- Legacy Gemini remains inert.
- Validation includes focused tests plus installed readback proof.

## Closeout

Closed as **Account-Mirror Readback Latency Bounded**.

- `refreshPersistentState` now accepts provider/runtime-profile scope, and the
  `/status`, `/v1/account-mirrors/status`, and `/v1/browser/processes`
  readbacks apply that scope before state hydration.
- Browser process target enumeration now has a bounded DevTools target-list
  read, so a responsive probe cannot be followed by an unbounded `CDP.List`.
- `/status` no longer runs account-library reconciliation preview work. It
  reports account-library mode, active job state, cooldown, and browser health
  as readback-only evidence; provider-backed preview counts remain absent
  (`preview=null`) unless populated by explicit job/readback surfaces.
- Installed proof on the user service PID `71949`:
  - `/status?provider=chatgpt&runtimeProfile=wsl-chrome-3` returned within 20
    seconds with one eligible target, `accountLibrary.mode=preview_only`,
    `enabled=false`, `preview=null`, and browser health `status=idle`.
  - `/v1/account-mirrors/status?provider=chatgpt&runtimeProfile=wsl-chrome-3`
    returned one eligible target with account-library `preview_only`.
  - `/v1/browser/processes?provider=chatgpt&runtimeProfile=wsl-chrome-3`
    returned one scoped target, `processAlive=false`, and no blank pages.
  - active account-library materialization jobs for `chatgpt/wsl-chrome-3`
    returned `0`.
  - legacy Gemini completion
    `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remained
    `paused` with `error.code=gemini_live_follow_resume_blocked`, and no
    managed Gemini browser process was present.
- Account-library automatic mode was not enabled, and the Plan 0107 automatic
  smoke was not run in this slice.

Validation:

- `pnpm vitest run tests/accountMirror/statusRegistry.test.ts`
- `pnpm vitest run tests/http.responsesServer.test.ts -t "account-library|browser process diagnostics"`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run install:user-runtime-service`
