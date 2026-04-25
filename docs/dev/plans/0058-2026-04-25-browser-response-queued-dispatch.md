# Plan 0058 | Browser Response Queued Dispatch

State: CLOSED
Lane: P01

## Purpose

Opt normal browser-backed response/chat execution into the browser-service
queued operation dispatcher so response runs and media jobs contend through the
same managed browser profile control plane.

## Current State

- Plan 0056 added `BrowserOperationDispatcher.acquireQueued(...)`.
- Plan 0057 opted browser-backed media generation into queued dispatch.
- Normal managed browser response execution already has a shared acquisition
  boundary in `acquireBrowserExecutionOperation(...)`.

## Scope

- Switch managed browser response/chat execution from immediate `acquire(...)`
  to `acquireQueued(...)`.
- Preserve the same dispatcher key and `browser-execution` operation kind.
- Log a bounded queue message when another operation owns the same browser
  profile.
- Keep login/setup/human-verification flows fail-fast.

## Non-Goals

- No live browser response run.
- No provider adapter changes.
- No cross-host scheduling or FIFO guarantee.
- No new public API field.

## Acceptance Criteria

- Browser response execution waits behind an active same-profile operation and
  then acquires after release.
- Queue timeout still returns the structured browser busy error.
- Existing browser execution acquisition release semantics remain unchanged.

## Validation

- `pnpm vitest run tests/browser/browserModeExports.test.ts tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 58`
- `git diff --check`

## Definition Of Done

- Normal browser-backed response/chat execution and browser-backed media
  generation both route through queued browser-service operation dispatch.
- Human/login hard-stop flows remain fail-fast.
- Roadmap, runbook, journal, fixes log, and operator docs record the behavior.
