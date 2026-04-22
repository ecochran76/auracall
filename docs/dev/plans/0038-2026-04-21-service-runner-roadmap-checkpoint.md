# Service/Runner Roadmap Checkpoint | 0038-2026-04-21

State: CLOSED
Lane: P01

## Scope

Reassess the service/runner orchestration lane after scheduler local-control
closeout and team-run background-drain parity.

This checkpoint decides whether to open another service/runner implementation
slice immediately or pause for integration hygiene.

## Current State

- Scheduler local-control work is closed through Plan 0036:
  - read-only scheduler authority is visible through runtime and CLI
    inspection
  - `schedulerControl.action = "claim-local-run"` is explicit operator
    control
  - targeted `runControl.action = "drain-run"` can execute runs already leased
    by the configured server-local runner
- Team-run HTTP create parity is closed through Plan 0037:
  - `POST /v1/team-runs` returns after persistence when background drain is
    enabled
  - the existing server-owned background drain advances the run afterward
  - synchronous one-request behavior remains available when background drain
    is disabled
- A source scan found no fresh route-neutral runtime mutation still owned
  directly by HTTP:
  - HTTP owns listener lifecycle, request parsing, background-drain timer state,
    pause/resume transport control, and response projection
  - `ExecutionServiceHost` owns route-neutral runner lifecycle, queued drain,
    recovery, operator controls, scheduler-local claim, and targeted drain
  - `TeamRuntimeBridge` owns team-runtime creation and optional synchronous
    bridge drain

## Decision

Do not open another service/runner architecture implementation slice now.

The lane has reached a coherent checkpoint for the current single-host model:

- public team-run writes exist on HTTP and MCP
- HTTP and direct response creation share the same background-drain posture
- route-neutral runtime mutations are under `ExecutionServiceHost`
- scheduler mutation remains explicit local operator control
- browser-backed execution remains routed through the browser-service
  dispatcher

The next action should be integration hygiene: run the broad affected
validation set, keep the plan audit green, inspect the accumulated dirty
worktree, and prepare the current batch for review/commit before selecting a
new primary implementation lane.

## Non-Goals

- no fleet scheduler
- no background worker pool
- no non-local assignment or automatic reassignment loop
- no parallel team execution
- no compound `claim-and-drain-local-run` control
- no browser-service dispatcher redesign
- no new public input shape or route

## Acceptance Criteria

- roadmap and execution owner record that service/runner implementation is
  paused at this checkpoint
- next action is explicit and actionable
- no runtime behavior changes are introduced
- plan audit remains green
- `git diff --check` remains clean

## Validation

- source scan of HTTP/runtime/team ownership boundaries
- `pnpm run plans:audit -- --keep 38`
- `git diff --check`

## Next Slice

Run an integration-hygiene pass over the accumulated worktree:

- validate the broad affected test surface
- inspect unstaged/untracked files by lane
- decide the review/commit boundary
- only then choose the next implementation lane
