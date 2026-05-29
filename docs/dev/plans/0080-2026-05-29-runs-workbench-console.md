# Runs Workbench Console Plan | 0080-2026-05-29

State: CLOSED
Lane: P01

## Purpose

Complete the next greenfield AuraCall product-console milestone after Plans
0077, 0078, and 0079: a Runs workbench in `/console`.

The workbench should answer the operator's run-level questions: what work is
active, what is waiting, what failed, what can be inspected, and what recovery
action is safe. It must present response runs, response batches, team runs,
runtime runs, and live-follow operations as one coherent product workflow
without extending the retired frontend.

## Current State

- Plan 0077 is closed and delivered the greenfield Agents workflow in
  `ux/console`.
- Plan 0078 is closed and delivered Providers and Projects workflows in
  `ux/console`.
- Plan 0079 is closed and delivered the Overview and Health command center in
  `ux/console`.
- The legacy `/dashboard`, `/agents`, `/config`, and `/ops/browser` pages remain
  frozen as legacy/diagnostic surfaces.
- Existing API surfaces already expose run and recovery readback:
  - `/status` for service, background drain, runner, scheduler, and
    live-follow posture.
  - `/status?recovery=true&sourceKind=all` for recovery/local-claim posture.
  - `/v1/runtime-runs/recent` for recent runtime-run lists.
  - `/v1/runtime-runs/inspect` for runtime-run detail.
  - `/v1/team-runs/inspect` for team-run detail.
  - `/v1/runs/{run_id}/status` and `/v1/responses/{response_id}` for response
    run status/readback.
  - `/v1/account-mirrors/completions` for live-follow completion operations.
- Operators still have to move across raw status output, legacy diagnostics,
  CLI/MCP helpers, and id-specific inspection endpoints to understand one piece
  of work.
- Plan 0080 is implemented in `ux/console`: `/console?view=runs` renders a
  read-only Runs workbench from existing recovery status, runtime-run readback,
  runtime/team inspection, generic run status, and live-follow completion
  APIs.

## Scope

- Add `/console?view=runs` as a first-class greenfield console workflow.
- Load the existing run/recovery readback needed for a read-only workbench.
- Present active, waiting, failed, cancelled, and completed work in one dense
  table.
- Support filters for run kind, state, provider/service, agent/team, source,
  and attention state when the readback contains those fields.
- Add row detail that summarizes timeline, owner, agent/team, provider account,
  runtime run id, team run id, response id, batch id, live-follow operation id,
  current step, output summary, artifacts/evidence links, and recovery hints
  when available.
- Show recovery/local-claim posture and runner topology in operator language.
- Link related records across runtime runs, team runs, responses, archive items,
  live-follow operations, Agents, Providers, Projects, Search, Overview, and
  Diagnostics.
- Keep technical payloads, route templates, raw ids, lease internals, and raw
  JSON behind inspectors or Diagnostics links.
- Preserve the existing Overview, Agents, Providers, and Projects workflows.

## Non-Goals

- Do not change, restyle, or extend the retired frontend pages.
- Do not add provider browser automation.
- Do not add new job launch surfaces in the first implementation slice.
- Do not add broad retry, cancel, resume, or drain controls until the read-only
  workbench proves the contracts and state mapping.
- Do not invent a new run store if existing runtime, response, team-run,
  archive, and live-follow readback can support the workflow.
- Do not expose raw status JSON as the primary product experience.

## Product Contract

Primary labels should use operator language:

- Active work
- Waiting
- Needs attention
- Completed
- Failed
- Cancelled
- Response run
- Team run
- Batch
- Live follow
- Runtime
- Queue
- Runner
- Timeline
- Evidence
- Recovery

Technical values may appear only in inspectors or technical-detail disclosure:

- raw route templates
- lease ids
- runner ids
- runtime run ids
- team run ids
- response ids
- batch ids
- operation ids
- tenant keys
- binding keys
- raw status JSON

## Readback Contract

The workbench should prefer existing same-origin APIs:

1. `/status?recovery=true&sourceKind=all`
   - recovery counts
   - local-claim posture
   - runner topology
   - background drain and scheduler state
2. `/v1/runtime-runs/recent`
   - recent stored runtime runs
   - source kind, status, timestamps, agent/team metadata, and links when
     available
3. `/v1/runtime-runs/inspect`
   - selected runtime-run detail
   - timeline, recovery, diagnostics, handoff, and related ids
4. `/v1/team-runs/inspect`
   - selected team-run detail when a runtime run is team-backed
5. `/v1/runs/{run_id}/status` and `/v1/responses/{response_id}`
   - response-run status and output summary when the selected record is a
     response run
6. `/v1/account-mirrors/completions`
   - live-follow operation rows for the same workbench table or a linked
     operations section

If those surfaces are missing fields required for the first slice, add the
smallest backend projection needed for the workbench and record the contract in
this plan before implementation closes.

## Implementation Slices

### Slice 1 | Route And Read-Only Workbench

Status: complete.

- Add `runs` to console route parsing and navigation.
- Load `/status?recovery=true&sourceKind=all` and `/v1/runtime-runs/recent`.
- Render a dense read-only table with kind, state, title/summary, provider or
  agent, source, started/updated time, and attention hint.
- Add empty, loading, error, and stale-readback states.
- Keep all mutation controls absent or disabled with clear unavailable state.

Implemented evidence:

- `runs` is part of console route parsing and top navigation.
- Console refresh now loads recovery-enabled `/status`, recent runtime runs,
  and live-follow completion operations alongside the existing console
  readback.
- The Runs page renders a dense filtered table for response/team/runtime rows
  and live-follow operations.
- Mutation controls are not exposed in the first implemented slice.

### Slice 2 | Unified Detail Inspector

Status: complete.

- Add a selected-row inspector for runtime-run detail.
- Fetch `/v1/runtime-runs/inspect` for selected runtime rows.
- Fetch `/v1/team-runs/inspect` when a team-run id is present.
- Fetch response/run status only when the selected row has a response id or
  compatible run id.
- Summarize timeline, output, current step, related records, evidence, and
  recovery hints before raw detail disclosure.
- Preserve URL-addressable selection for handoff links.

Implemented evidence:

- Selecting a runtime row fetches `/v1/runtime-runs/inspect`.
- Team-backed rows also fetch `/v1/team-runs/inspect`.
- Compatible rows attempt `/v1/runs/{run_id}/status`; unavailable status
  readback is shown as a nonblocking inspector issue.
- The inspector summarizes timeline, output, related records, queue context,
  and recovery posture before technical detail disclosure.
- Selected run state is URL-addressable with the `run` query parameter.

### Slice 3 | Live-Follow Operations And Queue Posture

Status: complete.

- Join live-follow completion operations into the Runs workbench without
  hiding their account-mirror identity.
- Surface active, queued, paused, idle-waiting, failed, and cancelled
  operations in the same operator vocabulary used by Overview.
- Show background drain, scheduler, and runner-topology cards as compact
  context for why work is waiting.
- Link live-follow operations to Providers, Projects, Search, and Diagnostics
  where those workflows already own the next action.

Implemented evidence:

- Live-follow completion operations from `/v1/account-mirrors/completions` are
  included in the workbench table as `Live follow` rows.
- Active, waiting, attention, completed, and cancelled state groups are derived
  from runtime-run and live-follow statuses.
- Queue context summarizes background drain, local claim, runner topology, and
  live-follow posture in the selected-run inspector.
- Live-follow rows link to provider review and Diagnostics without starting
  provider browser work.

### Slice 4 | Safe Controls Readiness

Status: complete.

- Audit existing control APIs for state-specific safety and idempotence.
- Identify which controls can be exposed as row actions without adding browser
  work or ambiguous ownership.
- Prefer read-only handoff links until pause/resume/cancel/retry/drain controls
  have explicit state gates, confirmation copy, and deterministic tests.
- If a control is implemented in this plan, limit it to one proven operation
  family and one state transition class.

Implemented evidence:

- No launch, retry, cancel, resume, pause, or drain controls were added.
- The implemented workbench is read-only and uses links/inspectors for
  handoff.
- Safe control exposure remains a future bounded plan or follow-up slice after
  state-specific contracts are proven.

### Slice 5 | Validation And Handoff

Status: complete.

- Add HTTP route coverage for `/console?view=runs`.
- Add focused unit or server tests for any new backend projection.
- Verify desktop and 375px mobile rendering with no page-level horizontal
  overflow.
- Verify raw technical details are hidden by default.
- Update `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md` if behavior changes.
- Close this plan only after the Runs workbench is implemented, validated, and
  installed-runtime route readback is recorded.

Implemented evidence:

- HTTP route coverage includes `/console?view=runs`.
- Desktop and 375px mobile browser checks verified the Runs route, active nav,
  table, inspector, recovery text, hidden raw details, no horizontal overflow,
  and no browser console errors.
- Installed runtime route readback verified `/console?view=runs` serves the
  current console bundle locally, and the external URL preserves the Runs route
  through Authelia.

## Acceptance Criteria

- `/console?view=runs` renders a Runs workbench in the greenfield console.
- The Runs nav item is active for the route.
- The page lists recent runtime runs from existing readback without starting
  provider browser work.
- Active, waiting, failed, cancelled, and completed work are visually distinct.
- A selected run opens a readable detail inspector before raw technical detail.
- Related runtime run, team run, response, live-follow, archive/evidence, agent,
  provider, and project links appear when available.
- Recovery/local-claim and runner-topology posture are visible in operator
  language.
- Mutation controls are absent until their contracts are explicitly proven, or
  are limited to the single state-gated operation family implemented in this
  plan.
- Legacy frontend pages remain unchanged.
- The page works at 375px width without horizontal page scroll.
- Existing Overview, Agents, Providers, and Projects routes continue to work.

## Validation Plan

Validation run:

- `pnpm run console:build`
- targeted HTTP route tests for greenfield console routes, including
  `/console?view=runs`
- `pnpm run typecheck`
- browser render checks for `/console?view=runs` at desktop and 375px mobile
  widths
- `pnpm run build`
- `pnpm run install:user-runtime-service`
- installed local and external route checks for `/console?view=runs`
- `pnpm run plans:audit -- --keep 80`
- `git diff --check`

Evidence:

- `pnpm run console:build`
- `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "greenfield console"`
- `pnpm run typecheck`
- `pnpm run build`
- `agent-browser` desktop render at `/console?view=runs`:
  `h1=Runs`, active nav `Runs`, Runs table visible, Runs inspector visible,
  Recovery text visible, raw technical details hidden, `scrollWidth=1350`,
  `clientWidth=1350`, screenshot
  `/tmp/auracall-console-runs-desktop.png`
- `agent-browser` mobile render at 375px:
  `h1=Runs`, active nav `Runs`, Runs table visible, Runs inspector visible,
  Recovery text visible, raw technical details hidden, `scrollWidth=360`,
  `clientWidth=360`, screenshot
  `/tmp/auracall-console-runs-mobile.png`
- `agent-browser errors --clear` reported no browser console errors.
- `pnpm run install:user-runtime-service`
- installed local route check:
  `http://127.0.0.1:18095/console?view=runs` returns HTTP 200 and serves
  `/console/assets/index-BQ0SVAK7.js`
- external route check:
  `https://auracall.ecochran.dyndns.org/console?view=runs` redirects to
  Authelia with the Runs route preserved.

## Definition Of Done

- Plan 0080 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- Runs workbench is implemented in `ux/console` without changing legacy pages.
- The first implemented slice is read-only unless a single safe control family
  is explicitly proven.
- Workbench rows and inspectors are derived from existing run/recovery readback
  or from a documented minimal projection.
- Relevant automated and browser validation passes.
- Installed runtime serves the workbench route.
- The plan is updated with implemented evidence and closed.
