# Plan 0056 | Browser Operation Queued Dispatch

State: CLOSED
Lane: P01

## Purpose

Add an explicit browser-service queued acquisition primitive so future
service-mode callers can route bursts of browser work through the same
operation dispatcher without creating a second DevTools control path.

## Current State

- Plan 0021 established profile-scoped operation ownership.
- Plan 0053 closed product-code mutation control-plane enforcement.
- The existing dispatcher acquired or returned a structured busy result.
- Some future service/API/MCP callers will need an opt-in wait-for-turn path
  rather than independent retry loops around the same DevTools profile.

## Scope

- Add `BrowserOperationDispatcher.acquireQueued(...)`.
- Preserve existing `acquire(...)` semantics for login, setup, doctor,
  browser-tools, and browser execution unless callers explicitly opt into queue
  behavior.
- Keep queueing inside browser-service dispatcher ownership; do not add a
  provider-local retry loop or a new public scheduler.

## Non-Goals

- No broad switch of current operator commands from fail-fast busy results to
  queued waiting.
- No cross-host browser fleet scheduler.
- No FIFO guarantee across independent OS processes beyond the existing
  file-backed lock plus bounded polling.

## Acceptance Criteria

- In-memory dispatchers can wait for an active operation to release and then
  acquire the same key.
- File-backed dispatchers can wait across dispatcher instances and then acquire
  after the lock releases.
- Queue timeout returns the last structured busy result instead of throwing or
  hiding the active owner.
- Docs describe the primitive as opt-in control-plane behavior.

## Validation

- `pnpm vitest run tests/browser-service/operationDispatcher.test.ts --maxWorkers 1`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 56`
- `git diff --check`

## Definition Of Done

- The browser-service operation dispatcher exposes an opt-in queued acquisition
  path.
- Existing immediate-acquire behavior remains available for hard-stop flows.
- The roadmap/runbook/journal/fixes docs record the control-plane lesson.
