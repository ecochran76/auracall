# Account-Library Scheduler No-Op Observability Plan | 0117-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Close the Plan 0109 second-rerun gap where `chatgpt/wsl-chrome-3`
account-library mode was temporarily `eligible`, the live-follow completion
crossed its due retry boundary, and `nextAttemptAt` advanced without launching
a managed browser, queueing an account-library materialization job, or reporting
an explicit bounded blocker.

## Current State

- Plan 0109 remains closed as no-go after the isolated rerun.
- Browser/process isolation is no longer the blocker: the rerun proved
  `processesAlive=0`, `responsiveDevTools=0`, active jobs `0`, and restored
  `preview_only` after the smoke window.
- The active target completion
  `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84` advanced
  `nextAttemptAt` from `2026-06-05T03:47:08.775Z` to
  `2026-06-05T03:55:55.547Z` while staying `idle_waiting` with `passCount=99`.
- `completionService` already owns post-refresh history materialization
  dispatch, but account-library catch-up is currently only summarized in
  `/status` and is not persisted as a completion lifecycle decision.

## Scope

- Add a completion-owned account-library catch-up decision after successful
  live-follow refreshes.
- When `liveFollow.accountLibrary.mode` is `eligible`, the target is not in
  cooldown, and an account-library job service is available, queue or reuse one
  capped `account_library_reconciliation` job with:
  - `assetSource=account-library`;
  - `assetKinds=["files"]`;
  - runtime/provider/browser profile from the selected AuraCall runtime
    profile;
  - configured `maxItems` and `providerWorkTimeoutMs`.
- Persist a lifecycle event when account-library catch-up is skipped, including
  the reason (`preview_only`, `disabled`, cooldown, missing service, missing
  target entry, duplicate pass, or job queued/reused).
- Keep normal history materialization policy behavior unchanged.
- Keep Gemini live-follow resume safety unchanged.
- Restore Plan 0109 runtime posture after installed validation:
  `wsl-chrome-3` account-library mode `preview_only`, active jobs `0`, and no
  live managed browser process.

## Non-Goals

- Do not enable account-library automatic mode permanently.
- Do not rerun the full Plan 0109 smoke until this diagnostic/fix is installed.
- Do not change account-library caps or provider work timeout defaults.
- Do not broaden account-library catch-up beyond ChatGPT file reconciliation.
- Do not resume or replace the legacy Gemini completion.

## Work Tracks

### Track 1 | Completion Decision Semantics

Status: completed.

- Add a post-refresh account-library catch-up decision inside
  `completionService`.
- Ensure one pass cannot queue duplicate account-library jobs for the same
  completion pass.

Acceptance evidence:

- Focused completion-service tests cover queue, reuse/duplicate-pass skip, and
  preview-only skip lifecycle evidence.
- The completion-service suite now includes explicit queue, reuse, duplicate
  same-pass skip, and preview-only skip cases.

### Track 2 | Installed Readback

Status: completed.

- Rebuild/install the user runtime service and restart the API.
- Prove the installed completion service exposes the new lifecycle evidence
  without leaving account-library automatic mode enabled.

Acceptance evidence:

- Installed API is active.
- `wsl-chrome-3` account-library mode is restored to `preview_only`.
- Active history materialization jobs are `0`.
- Browser-process readback has no live managed browser process.

## Exit Criteria

- Close as **Account-Library Scheduler No-Op Explained** if focused tests and
  installed readbacks prove that an eligible post-refresh pass must either
  queue/reuse account-library reconciliation or persist a skip reason.
- Close as **Account-Library Scheduler Still Silent** if a due eligible pass can
  still advance without job dispatch or lifecycle evidence.

## Closeout

Closed as **Account-Library Scheduler No-Op Explained**.

- `completionService` now evaluates configured account-library catch-up after
  each successful completion refresh.
- If `liveFollow.accountLibrary.mode=eligible`, it queues or reuses one capped
  `account_library_reconciliation` job with `assetSource=account-library`,
  `assetKinds=["files"]`, target provider/runtime/browser profile, configured
  `maxItems`, and configured `providerWorkTimeoutMs`.
- If account-library catch-up is not runnable, the completion stores
  `accountLibraryCursor.status=skipped` with a reason and appends
  `account_library_catchup_skipped` lifecycle evidence. Preview-only targets no
  longer silently advance through a pass.
- `completionStore` round-trips `accountLibraryCursor` and the new lifecycle
  event types so persisted completions keep the evidence after API restart.
- Scheduler diagnostics now includes compact
  `completion.accountLibraryCursor`, so the Plan 0109 diagnostic path exposes
  the account-library decision directly.
- Operator resume now relaunches a queued completion after an older active
  runner exits, fixing the pause/resume race exposed by the new post-refresh
  bookkeeping.
- Installed proof after rebuild/install/restart:
  - `wsl-chrome-3` account-library config remained `preview_only`;
  - completion `acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84`
    advanced to `passCount=101` and `nextAttemptAt=2026-06-05T04:20:34.044Z`;
  - the completion persisted
    `accountLibraryCursor={status:"skipped", reason:"liveFollow.accountLibrary.mode is preview_only", passCount:101}`;
  - lifecycle evidence included `account_library_catchup_skipped` with the same
    reason;
  - active history materialization jobs returned `0`.
- Residual unrelated posture: restored config allowed `default/chatgpt`
  live-follow completion `acctmirror_completion_10f5fa29-f920-4e37-892e-f2ff4a59de0d`
  to start and retain a managed browser after the target proof. It was not
  paused because it is unrelated default-profile live-follow work, but future
  Plan 0109 isolation reruns should disable or pause non-target live-follow
  before the smoke window.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts` passed with
  32 tests.
- `pnpm vitest run tests/http.responsesServer.test.ts -t "returns scheduler diagnostics bundles through the API surface"`.
- `pnpm exec tsc --noEmit --pretty false`.
- `pnpm exec biome lint src/accountMirror/completionService.ts src/accountMirror/completionStore.ts src/http/responsesServer.ts tests/accountMirror/completionService.test.ts`.
- `pnpm run build`.
- `pnpm run install:user-runtime-service`.
- `systemctl --user restart auracall-api.service && systemctl --user is-active auracall-api.service`.
- Installed `auracall api mirror-completion-status acctmirror_completion_dde169ad-2899-4858-a89c-f689a5aa9b84 --json --timeout-ms 30000`.
- Installed `auracall api scheduler-diagnostics --provider chatgpt --runtime-profile wsl-chrome-3 --json --timeout-ms 30000`.
- Installed `auracall api history-materialization-jobs --json --timeout-ms 30000`.
