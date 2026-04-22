# Prebuilt TaskRunSpec Acceptance | 0025-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Plan 0024 selected the live flattened `TaskRunSpec` schema as the first
  public full-spec compatibility target.
- Compact HTTP and MCP team-run create requests remain live and unchanged.
- Prebuilt full-spec input is now accepted by public HTTP and MCP team-run
  write surfaces.

## Scope

- Accept an optional prebuilt `taskRunSpec` on:
  - HTTP `POST /v1/team-runs`
  - MCP `team_run`
- Validate prebuilt specs with `TaskRunSpecSchema`.
- Keep compact create behavior unchanged.
- Reject mixed compact assignment fields that conflict with a provided
  `taskRunSpec`.
- Preserve prebuilt-spec assignment fields, ids, policies, trigger, and
  requester provenance unless a compact request path is being used.

## Non-Goals

- no sectioned public envelope
- no multi-runner scheduler
- no background worker pool
- no parallel team execution
- no provider/browser behavior changes

## Acceptance Criteria

- [x] HTTP accepts `{ taskRunSpec }` using the live flattened schema.
- [x] MCP `team_run` accepts `{ taskRunSpec }` using the live flattened schema.
- [x] top-level `teamId` may accompany `taskRunSpec` only when it matches
  `taskRunSpec.teamId`.
- [x] compact assignment fields cannot be mixed with `taskRunSpec`.
- [x] compact HTTP/MCP create behavior remains unchanged.
- [x] prebuilt-spec execution still flows through
  `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun`.

## Verification Target

- `pnpm vitest run tests/http.responsesServer.test.ts tests/mcp/teamRun.test.ts tests/cli/teamRunCommand.test.ts tests/teams.schema.test.ts --maxWorkers 1`
- `pnpm run check`
- `pnpm run plans:audit`
- `git diff --check`

## Definition Of Done

- [x] HTTP and MCP prebuilt-spec inputs validate with `TaskRunSpecSchema`.
- [x] compact assignment requests are still supported unchanged.
- [x] mixed compact/prebuilt assignment requests fail fast.
- [x] docs and plan wiring reflect that prebuilt flattened specs are live.
