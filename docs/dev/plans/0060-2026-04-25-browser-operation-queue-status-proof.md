# Plan 0060 | Browser Operation Queue Status Proof

State: CLOSED
Lane: P01

## Purpose

Prove browser-operation queue diagnostics survive the operator status surfaces
used by API and MCP callers.

## Current State

- Plan 0059 records browser-operation queue observations and exposes them
  through browser-state diagnostics.
- Generic run status is the shared operator surface for response runs and media
  runs across API, CLI, and MCP.
- MCP `run_status` used the default live browser diagnostics probe directly,
  which made controlled status-surface verification harder than the HTTP seam.

## Scope

- Add controlled local API coverage for
  `/v1/runs/{run_id}/status?diagnostics=browser-state` preserving
  `browserOperationQueue`.
- Add controlled MCP `run_status` coverage for the same response-run queue
  diagnostics payload.
- Add an injectable MCP browser diagnostics probe seam that defaults to the
  existing live probe.

## Non-Goals

- No live provider navigation.
- No browser execution behavior changes.
- No schema expansion beyond the queue diagnostics field already added in
  Plan 0059.

## Acceptance Criteria

- HTTP generic response run status returns observed browser diagnostics with a
  latest queued browser-operation event.
- MCP `run_status` returns the same kind of queue evidence without invoking a
  live browser probe in the test.
- Existing default MCP runtime behavior remains unchanged when no probe is
  injected.

## Validation

- `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp.runStatus.test.ts --maxWorkers 1`
- `pnpm exec tsc --noEmit`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 60`
- `git diff --check`

## Definition Of Done

- The browser-operation queue diagnostics added in Plan 0059 are covered at
  the generic API and MCP status boundaries operators use during dogfooding.
