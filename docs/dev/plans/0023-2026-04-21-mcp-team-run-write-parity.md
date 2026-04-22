# MCP Team Run Write Parity | 0023-2026-04-21

State: CLOSED
Lane: P01

## Current State

- `POST /v1/team-runs` is live and closed under Plan 0019.
- The HTTP contract proved stable enough for the next bounded parity slice:
  expose one MCP team-run write tool without changing the task/team/runtime
  execution model.
- The new MCP tool is implemented as `team_run`.

## Scope

- Add one MCP tool for bounded team execution.
- Reuse the existing configured team-run execution path:
  `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun`.
- Preserve the same compact input shape as the HTTP team-run create route:
  `teamId`, `objective`, optional prompt shaping fields, response format,
  output contract, max turns, and bounded local-action policy.
- Stamp MCP-created runs with explicit MCP provenance:
  - `trigger = "mcp"`
  - `requestedBy.kind = "mcp"`
  - command/context label `auracall-mcp team_run`

## Non-Goals

- no arbitrary prebuilt `taskRunSpec` JSON
- no multi-runner scheduler
- no background worker pool
- no parallel team execution
- no new provider/browser behavior
- no changes to the existing `consult` or `sessions` MCP tools

## Acceptance Criteria

- [x] `auracall-mcp` registers a `team_run` tool.
- [x] `team_run` validates the bounded team-run input shape.
- [x] `team_run` executes through the existing configured team-run executor.
- [x] MCP-created task specs carry MCP provenance instead of CLI or HTTP
  provenance.
- [x] the tool returns `object = "team_run"` with `taskRunSpec` and
  deterministic `execution` ids/status.
- [x] the built MCP entrypoint can start with the configured executor import
  path by shipping the bundled service registry under `dist/configs`.
- [x] direct HTTP `/v1/team-runs` behavior is unchanged.
- [x] no multi-runner, parallel execution, or arbitrary prebuilt
  `taskRunSpec` behavior is introduced.

## Verification

- `pnpm vitest run tests/mcp/teamRun.test.ts tests/cli/teamRunCommand.test.ts tests/teams.schema.test.ts tests/mcp.schema.test.ts --maxWorkers 1`
- `pnpm run check`
- `pnpm run test:mcp`

## Definition Of Done

- [x] MCP team-run write parity is implemented.
- [x] MCP provenance is represented in team/task schemas.
- [x] MCP docs and roadmap/runbook state are updated.
- [x] targeted tests and typecheck pass.
