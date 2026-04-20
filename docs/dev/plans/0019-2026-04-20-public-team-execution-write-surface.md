# Public Team Execution Write Surface | 0019-2026-04-20

State: OPEN
Lane: P01

## Current State

- roadmap classification: next bounded checkpoint under the primary
  service/runner orchestration lane
- prerequisite service/runner ownership checkpoint is complete enough to stop
  extracting `api serve` by default:
  - local runner lifecycle mutations are owned by `ExecutionServiceHost`
  - drain serialization and startup recovery execution are owned by
    `ExecutionServiceHost`
  - stored-runtime operator controls are owned by `ExecutionServiceHost`
  - remaining `api serve` state is transport/listener scoped
- public read-only team/runtime inspection surfaces already exist:
  - `GET /v1/team-runs/inspect`
  - `GET /v1/runtime-runs/inspect`
  - `GET /status/recovery/{run_id}`
- bounded CLI team execution already exists through `auracall teams run`:
  - builds one `TaskRunSpec`
  - projects one sequential `TeamRun`
  - executes through `TeamRuntimeBridge`
  - uses one local runner/host path
- broader public team execution writes remain paused until this plan defines
  the first write contract and acceptance bar

## Scope

- define the first public HTTP write surface for one bounded team execution
- reuse the existing task/team/runtime model rather than inventing a
  route-specific execution shape
- keep the first write path sequential, fail-fast, and single-host
- preserve the existing `taskRunSpec -> teamRun -> runtimeRun` chain
- make response/readback shape deterministic enough for clients to route,
  poll, inspect, and recover the created run

## Non-Goals

- no multi-runner scheduler
- no background worker pool
- no parallel team execution
- no MCP write tool in the first implementation slice
- no public auth/audit model beyond the existing local development server
  posture
- no new provider/browser behavior
- no changes to the `responses` direct-run contract

## Contract Direction

The first HTTP write should be a bounded team-run creation endpoint under the
development server.

Candidate endpoint:

- `POST /v1/team-runs`

The request should map to the same logical assignment shape as the CLI path.

Minimum request fields:

- `teamId`
- `objective`
- optional `title`
- optional `promptAppend`
- optional `structuredContext`
- optional `responseFormat`
- optional `maxTurns`
- optional bounded `localActionPolicy`

The server should construct or accept exactly one `TaskRunSpec` for the
request, then execute through `TeamRuntimeBridge`.

Initial implementation choice:

- construct the bounded `TaskRunSpec` from request fields first
- defer accepting arbitrary prebuilt `taskRunSpec` JSON until the route has a
  stable validation and compatibility story

## Response Shape

The synchronous response should return a compact creation/execution envelope,
not a new ad hoc team result vocabulary.

Minimum response fields:

- `object = "team_run"`
- `taskRunSpec`
- `execution`
  - `taskRunSpecId`
  - `teamRunId`
  - `runtimeRunId`
  - `runtimeSourceKind`
  - `runtimeRunStatus`
  - `runtimeUpdatedAt`
  - `terminalStepCount`
  - `finalOutputSummary`
  - `sharedStateStatus`
  - `stepSummaries`
- `links`
  - team inspection URL
  - runtime inspection URL
  - response readback URL when a runtime response id is also useful

Rule:

- response fields should adapt from the same payload already produced by
  `buildTeamRunCliExecutionPayload(...)`
- do not duplicate assignment intent from `TaskRunSpec` into `TeamRun` or a
  route-only envelope

## Execution Semantics

First HTTP write semantics should match the existing bounded CLI semantics
unless a concrete reason requires divergence:

- sequential execution only
- fail-fast by default
- one selected team template
- one generated `TaskRunSpec`
- one `TeamRun`
- one persisted runtime run
- one server-owned local runner/host path

Drain behavior:

- if background drain is enabled, the route may return after persistence with
  `runtimeRunStatus = in_progress`
- if background drain is disabled, the route may perform one bounded
  synchronous host drain consistent with direct `/v1/responses`
- the exact synchronous/asynchronous choice must be documented in the
  implementation slice and covered by tests

## Surface Sequencing

1. HTTP first:
   - define and implement `POST /v1/team-runs`
   - reuse `TeamRuntimeBridge`
   - validate readback through existing inspection/recovery routes
2. MCP second:
   - add an MCP team-run tool only after the HTTP contract is stable
   - map MCP input/output to the same route-neutral service function
3. multi-runner later:
   - do not expand runner scheduling or worker topology in this checkpoint

## Acceptance Criteria

- `POST /v1/team-runs` creates exactly one bounded `TaskRunSpec`
- the route creates exactly one `TeamRun` bound to that `TaskRunSpec`
- the route creates exactly one runtime run with `sourceKind = team-run`
- the route response exposes the same core ids as CLI team execution:
  - `taskRunSpecId`
  - `teamRunId`
  - `runtimeRunId`
- existing read-only surfaces can inspect the created run:
  - `GET /v1/team-runs/inspect`
  - `GET /v1/runtime-runs/inspect`
  - `GET /status/recovery/{run_id}`
- no assignment intent is duplicated into `TeamRun` or route-only runtime
  metadata
- direct `/v1/responses` behavior is unchanged
- no MCP write surface is introduced in the first implementation slice
- no multi-runner or parallel execution behavior is introduced

## Verification Target

Minimum implementation proof:

- focused HTTP tests for successful `POST /v1/team-runs`
- focused HTTP tests for invalid request handling
- focused readback tests proving the created ids work with existing
  inspection surfaces
- focused non-regression coverage for direct `/v1/responses`
- `pnpm vitest run tests/http.responsesServer.test.ts`
- `pnpm exec tsc -p tsconfig.json --noEmit`
- `pnpm run plans:audit`
- `git diff --check`

## Definition Of Done

- the first HTTP team execution write surface is implemented or explicitly
  deferred with a concrete blocker
- the public write route reuses the existing task/team/runtime bridge
- the readback/inspection chain remains deterministic
- the MCP write surface remains deferred until the HTTP contract is stable
- roadmap, runbook, testing docs, and user-facing local API docs are updated
  when the route implementation lands
