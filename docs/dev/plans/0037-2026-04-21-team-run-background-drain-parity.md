# Team-Run Background Drain Parity | 0037-2026-04-21

State: CLOSED
Lane: P01

## Scope

Align HTTP `POST /v1/team-runs` with the direct response create path when
`api serve` background drain is enabled.

Today, direct `/v1/responses` can persist a run and let the server-owned
background drain advance it, while `/v1/team-runs` still creates and drains the
team runtime synchronously inside the request path.

## Current State

- `TeamRuntimeBridge` always drains after creating the runtime run.
- HTTP `POST /v1/team-runs` therefore executes synchronously even when
  `backgroundDrainIntervalMs > 0`.
- `api serve` already has a server-owned background drain loop and an injected
  `ExecutionServiceHost`.
- Direct `/v1/responses` already uses `drainAfterCreate = false` under the
  HTTP server and schedules background drain.

## Decision

- Add a bridge-level no-drain creation mode.
- Use no-drain mode for HTTP team-run create when background drain is enabled.
- Schedule the existing background drain after team-run creation, matching the
  direct response create path.
- Keep synchronous behavior when background drain is disabled.

## Non-Goals

- no new public team-run input shape
- no scheduler mutation
- no multi-runner assignment
- no parallel team execution
- no new HTTP route

## Acceptance Criteria

- `TeamRuntimeBridge` can create a team runtime without draining it.
- Existing CLI/MCP/default bridge behavior remains synchronous by default.
- `POST /v1/team-runs` with background drain enabled returns after persistence
  without executing the stored step inline.
- The existing background drain advances that team run afterward.
- `POST /v1/team-runs` with background drain disabled keeps the current
  synchronous one-request behavior.
- Docs record the parity with direct `/v1/responses`.

## Validation

- `pnpm vitest run tests/teams.runtimeBridge.test.ts --testNamePattern "without draining" --maxWorkers 1`
- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "team-run create before execution|bounded team run over HTTP" --maxWorkers 1`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 37`
- `git diff --check`

## Next Slice

Run broader HTTP/team-runtime validation, then reassess whether the remaining
service/runner orchestration lane has another concrete non-scheduler ownership
gap or should pause for a roadmap checkpoint.
