# Plan 0059 | Browser Operation Queue Observability

State: CLOSED
Lane: P01

## Purpose

Expose browser-operation queue/readiness evidence through the existing
browser-state diagnostics surface so operators can see when a browser run was
waiting on another owner without reading process logs.

## Current State

- Plan 0056 added queued acquisition to the browser-service operation
  dispatcher.
- Plan 0057 opted browser-backed media generation into queued dispatch.
- Plan 0058 opted normal browser-backed response/chat execution into queued
  dispatch.
- Browser diagnostics already expose target/document/provider evidence,
  screenshots, and recent browser mutation history.

## Scope

- Record bounded queue observations for response browser execution:
  `queued`, `acquired`, and `busy-timeout`.
- Project recent queue observations into browser-state diagnostics alongside
  browser mutation history.
- Render queue observations in CLI runtime inspection output.
- Preserve existing execution and dispatcher semantics.

## Non-Goals

- No new navigation, retry, or provider adapter behavior.
- No FIFO scheduling guarantee.
- No cross-host scheduler ownership changes.
- No live browser smoke in this slice.

## Acceptance Criteria

- A response browser run that waits behind another same-profile owner records
  both queued and acquired observations.
- A queue timeout records a bounded busy-timeout observation.
- Browser diagnostics can include the latest queue event and recent queue
  events for the selected browser service.
- Operator CLI formatting reports queue event count and latest queue event.

## Validation

- `pnpm vitest run tests/browser/browserModeExports.test.ts tests/cli/runtimeInspectionCommand.test.ts --maxWorkers 1`
- `pnpm exec tsc --noEmit`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 59`
- `git diff --check`

## Definition Of Done

- Operators using API/CLI/MCP browser-state diagnostics can see recent
  browser-operation queue/readiness events without re-invoking provider pages
  or scraping raw logs.
