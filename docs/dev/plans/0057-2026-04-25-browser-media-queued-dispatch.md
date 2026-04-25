# Plan 0057 | Browser Media Queued Dispatch

State: CLOSED
Lane: P01

## Purpose

Opt browser-backed media generation into the browser-service queued operation
dispatcher so async API/MCP media calls wait for the same browser profile turn
instead of racing the DevTools profile directly.

## Current State

- Plan 0056 added `BrowserOperationDispatcher.acquireQueued(...)`.
- Browser media generation already runs as a durable async-capable resource
  with status polling through API and MCP.
- Gemini/Grok browser provider adapters already use no-post-submit-navigation
  readback, mutation audit, and status timelines.

## Scope

- Wrap Gemini/Grok browser media execution at `createBrowserMediaGenerationExecutor`.
- Use the managed browser profile dispatcher key for normal browser media
  requests.
- Use the raw DevTools dispatcher key for explicit Grok video readback probes
  that carry `grokVideoReadbackDevtoolsPort`.
- Record queue/acquire events in the media-generation timeline.
- Keep Gemini API transport outside browser dispatch.

## Non-Goals

- No live media generation.
- No automatic queueing for login/setup/human-verification flows.
- No provider-specific selector or readback changes.
- No new public API fields beyond timeline events and optional metadata queue
  timeout/poll tuning.

## Acceptance Criteria

- Browser media jobs wait behind an active same-profile operation and then run
  through the provider executor after release.
- Queue timeout fails before provider prompt submission with a structured
  `browser_operation_busy` media failure.
- Explicit Grok video readback probes use a raw DevTools operation key.
- Status/readback surfaces can report `browser_operation_queued` and
  `browser_operation_acquired` through the existing media timeline.

## Validation

- `pnpm vitest run tests/mediaBrowserExecutor.test.ts tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 57`
- `git diff --check`

## Definition Of Done

- Browser-backed media generation is the first product path opted into queued
  browser operation dispatch.
- Existing fail-fast dispatcher behavior remains available for hard-stop flows.
- Roadmap, runbook, journal, fixes log, and operator docs record the behavior.
