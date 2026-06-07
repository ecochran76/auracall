# Live-Follow Stale Materialization Recovery Plan | 0122-2026-06-06

State: CLOSED
Lane: P01

## Purpose

Repair the live-follow lane failure where ordinary ChatGPT history
reconciliation can remain `running` for many hours, keep ownership of the
`wsl-chrome-3` managed browser, and still report scheduler `stale=false`.

## Current State

- Plan 0119 proved automatic ChatGPT account-library queueing after cooldown
  cleared.
- `chatgpt/wsl-chrome-3` account-library mode is restored to `preview_only`.
- Installed runtime currently has active job
  `hmj_69d02e4bdc9f48e1ad91c412d6a4e39f`, a normal `reconciliation` job with
  `assetSource=null`, `startedAt=2026-06-06T00:45:12.379Z`, and
  `runAgeMs` over 84 million milliseconds.
- That job owns the `wsl-chrome-3` managed browser, but scheduler diagnostics
  report `stale=false` because running timeout recovery only applies to
  account-library reconciliation jobs with an explicit provider timeout.

## Scope

- Generalize running-job stale detection for history materialization jobs.
- Keep explicit account-library provider-timeout wording when
  `providerWorkTimeoutMs` is set.
- Add a conservative default running stale threshold for jobs that do not carry
  a provider timeout.
- Ensure readback recovery marks stale running jobs terminal and releases
  managed browser ownership in the installed service.
- Prove the currently stuck job is recovered and browser/process state is no
  longer owned by that job.

## Non-Goals

- Do not change account-library automatic mode from `preview_only`.
- Do not enable broad automatic account-library queueing.
- Do not touch the handoff feature lane.
- Do not refactor the history materialization scheduler beyond stale-running
  recovery.

## Acceptance

- Unit coverage proves ordinary running reconciliation jobs become failed on
  readback after the default running threshold.
- Existing account-library timeout coverage remains intact.
- Installed readback converts
  `hmj_69d02e4bdc9f48e1ad91c412d6a4e39f` to terminal failed state or proves it
  already drained.
- Final active materialization jobs are `0`, and no managed browser process is
  still owned by `hmj_69d02e4bdc9f48e1ad91c412d6a4e39f`.

## Closeout

Closed as **Live-Follow Stale Materialization Recovery and Rerun Passed**.

- `src/runtime/historyMaterializationService.ts` now applies stale-running
  readback recovery to all running history materialization jobs.
- Jobs with explicit account-library `providerWorkTimeoutMs` keep the existing
  account-library timeout wording; ordinary running jobs without an explicit
  provider timeout use a conservative 30-minute running stale threshold.
- Readback recovery now also invokes browser-backed cleanup in the installed
  service path, so a recovered stale job releases its managed browser process.
- Regression coverage in `tests/runtime.historyMaterializationService.test.ts`
  proves an ordinary `reconciliation` job becomes terminal `failed` after the
  default threshold, while the existing account-library timeout behavior still
  passes.
- After rebuild/install/restart, installed readback converted stuck job
  `hmj_69d02e4bdc9f48e1ad91c412d6a4e39f` from `running` to `failed` with
  `History materialization job exceeded running stale threshold (1800000ms).`
  at `2026-06-07T01:41:40.214Z`.
- Installed `history-materialization-jobs` readback then reported active jobs
  `0` for `chatgpt/wsl-chrome-3`, and process scan found no remaining
  `wsl-chrome-3` or `wsl-chrome-4` managed Chrome processes.
- The guarded Plan 0109-style rerun was executed after recovery:
  `hmj_2b8b215db3794a5980181f3a455e4e6f` queued as
  `account_library_reconciliation`, ran under `providerWorkTimeoutMs=120000`,
  and succeeded at `2026-06-07T01:46:45.226Z` with
  `materialized=3`, `skipped=0`, and `failed=0`.
- `~/.auracall/config.json` was restored from
  `~/.auracall/config.plan0109-live-follow-rerun-20260606T204330-0500.json`;
  final readback showed `wsl-chrome-3` account-library mode back at
  `preview_only`, active jobs `0`, and no managed Chrome processes for
  `default`, `wsl-chrome-3`, `wsl-chrome-4`, or `gemini-stealthcdp`.

Validation:

- `pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t "stale running"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome lint src/runtime/historyMaterializationService.ts tests/runtime.historyMaterializationService.test.ts`
- `pnpm run build`
- `pnpm run install:user-runtime-service`
- `auracall api history-materialization-jobs --json --timeout-ms 30000`
- `auracall api history-materialization-create --provider chatgpt --runtime-profile wsl-chrome-3 --reconcile --asset-source account-library --asset-kind files --max-items 3 --provider-work-timeout-ms 120000 --json --timeout-ms 30000`
