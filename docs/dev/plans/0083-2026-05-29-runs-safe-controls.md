# Runs Safe Controls Plan | 0083-2026-05-29

State: CLOSED
Lane: P01

## Purpose

Add the first safe, state-gated mutation controls to the greenfield
`/console?view=runs` workbench without reopening the retired frontend or adding
new provider launch surfaces.

The goal is to let an operator pause, resume, cancel, or drain existing work
only when the backend can prove the target state, ownership, and expected
effect. Controls must be explicit, reviewable, idempotent where possible, and
backed by deterministic readback.

## Current State

- Plan 0080 is closed and delivered a read-only Runs workbench in `/console`.
- Plan 0081 closed the roadmap reconciliation and explicitly deferred launch,
  retry, cancel, resume, pause, drain, and other mutation controls to a safe
  controls plan.
- Plan 0082 is closed and installed-runtime readback is healthy enough for the
  next AuraCall lane.
- Existing backend surfaces already expose some reviewed control operations:
  - background drain pause/resume and targeted drain through `/status`;
  - account-mirror/live-follow completion pause/resume/cancel controls;
  - local-action resolution and human-escalation resume through `/status`;
  - recovery/local-claim readback through `/status?recovery=true`.
- Before this plan, `/console?view=runs` showed run rows and inspectors, but
  exposed no mutation buttons.
- `/dashboard`, `/agents`, `/config`, and `/ops/browser` remain frozen
  legacy/diagnostic pages and are not product UX targets.
- Implemented result:
  - `/status` now emits a read-only `controlReadiness` projection with action
    ids, route/method, payload, eligibility, blocked reason, confirmation copy,
    expected readback evidence, provider-browser effect flags, and persistent
    write flags.
  - `/console?view=runs` consumes that projection for selected-row controls and
    queue-context background-drain controls.
  - Control requests stay same-origin through `POST /status`, then refresh the
    Runs workbench readback and show the returned control event or backend
    error.

## Scope

- Add a control-readiness projection for Runs rows that says which actions are
  available, unavailable, or blocked, and why.
- Expose the first bounded set of controls in `/console?view=runs`:
  - pause/resume/cancel for live-follow completion operations when supported;
  - background drain pause/resume from the queue posture area;
  - one reviewed targeted-drain action only when the selected work is owned by
    the local runner and the backend readback says it is eligible.
- Add confirmation copy that names the target id, current state, expected
  transition, and whether provider browser work may continue or stop.
- After each control action, refresh the same readback used by the workbench and
  show the resulting state, control event, or backend error.
- Keep all control requests same-origin and auth-compatible with the existing
  local API posture.
- Update docs and tests for the state gates and operator workflow.

## Non-Goals

- Do not change, restyle, or extend retired legacy pages.
- Do not add new run launch controls in this plan.
- Do not add broad retry controls in this plan.
- Do not add provider-specific browser automation.
- Do not add controls for rows whose owner, state, or backend route cannot be
  proven from current readback.
- Do not make hidden automatic control decisions from App Intelligence,
  account mirroring, or downstream clients.
- Do not add external multi-runner control unless the selected action is proven
  local-runner owned.

## Product Contract

The Runs workbench should make controls explicit and boring:

- A row action appears only when the selected row has a supported action.
- A blocked action explains the missing condition in operator language.
- A confirmation panel appears before every mutating action.
- The action response is shown next to refreshed readback.
- Raw ids may appear in the confirmation and inspector, but the primary label
  should use operator language such as `Pause`, `Resume`, `Cancel`, and
  `Drain now`.

No control should imply that provider browser work will stop unless the backend
contract actually stops it. If a control only pauses future scheduling, the UI
must say that.

## Safety Contract

Every exposed control must define:

- eligible source kinds;
- allowed current states;
- required id fields;
- backend route and method;
- confirmation copy;
- expected success state or readback evidence;
- blocked-state message;
- whether the action can start provider browser work;
- whether the action can stop provider browser work;
- whether the action writes persistent state.

Controls that cannot satisfy this contract stay hidden or read-only.

## Implementation Tracks

### Track 1 | Control Inventory And Contract

Status: closed.

- Audited existing control APIs used by `/status`, account-mirror completions,
  local-action resolution, human-resume, and targeted drain.
- Classified controls into:
  - safe for this plan;
  - read-only handoff only;
  - blocked until a later plan.
- Defined the Runs workbench action metadata shape in `/status.controlReadiness`.
- Recorded the final control matrix in this plan.

### Track 2 | Backend Readiness Projection

Status: closed.

- Added the smallest backend projection needed for row-level control
  eligibility.
- Included blocked reasons when an action is not available.
- Kept the projection read-only.
- Added focused tests for supported and blocked states.

### Track 3 | Console Control UX

Status: closed.

- Added state-gated controls to `/console?view=runs`.
- Render unavailable controls as disabled with a clear reason,
  depending on density and accessibility.
- Added confirmation and result states for each mutating action.
- Refresh Runs readback after each action.
- Verified mobile and desktop layouts for page-level horizontal overflow.

### Track 4 | First Control Family

Status: closed.

- Implemented live-follow completion pause/resume/cancel controls when backend
  readback proves the target operation and state.
- Implemented background drain pause/resume as a queue-context control.
- Implemented one targeted-drain action only for local-runner-owned eligible
  work.
- Deferred launch and retry to a later plan.

### Track 5 | Validation And Handoff

Status: closed.

- Added focused tests for control eligibility projection.
- Browser checks covered desktop and 375px mobile Runs controls.
- Installed-runtime readback covered `/console?view=runs`.
- Updated `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md` when the implemented control contract is known.

## Control Matrix

| Surface | Eligible source | Allowed states | Route | Persistent write | Browser effect |
| --- | --- | --- | --- | --- | --- |
| Live-follow Pause | account-mirror completion | `queued`, `running`, `idle_waiting` | `POST /status` with `accountMirrorCompletion` | yes | stops future live-follow browser work after checkpoint |
| Live-follow Resume | account-mirror completion | `paused` | `POST /status` with `accountMirrorCompletion` | yes | may start provider browser work on the next pass |
| Live-follow Cancel | account-mirror completion | `queued`, `running`, `idle_waiting`, `paused` | `POST /status` with `accountMirrorCompletion` | yes | stops this live-follow operation |
| Background Drain Pause | server queue context | enabled and not paused | `POST /status` with `backgroundDrain` | no | does not stop already-running browser work; stops future background scheduling |
| Background Drain Resume | server queue context | enabled and paused | `POST /status` with `backgroundDrain` | no | may start eligible queued provider browser work |
| Targeted Drain | runtime run | local-claim status `eligible` or selected by the server-local runner | `POST /status` with `runControl.drain-run` | yes | may start provider browser work for exactly that run |

Blocked actions carry `blockedReason` in `/status.controlReadiness`. The
greenfield Runs UI disables those actions and shows that reason next to the
button. All actions use confirmation copy from the backend projection.

## Acceptance Criteria

- Plan 0083 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- `/console?view=runs` remains the only product UX target for Runs controls.
- Legacy frontend pages remain unchanged.
- Each exposed action has a documented state gate and blocked-state reason.
- The first implemented controls do not include launch or broad retry.
- The UI requires explicit operator confirmation before every mutation.
- Control responses refresh the Runs workbench readback and show the new state
  or backend error.
- Targeted drain is exposed only for local-runner-owned eligible work.
- Tests cover eligible and blocked states.
- Desktop and mobile browser checks prove controls render without page-level
  horizontal overflow.

## Validation Plan

- `env -u OPENAI_API_KEY pnpm vitest run tests/http.responsesServer.test.ts -t "control readiness|controls account mirror completions|pauses and resumes background drain"`
- `pnpm run console:build`
- `pnpm run typecheck`
- `pnpm run build`
- Browser render checks for `/console?view=runs` at desktop and 375px mobile.
- Installed local route check for `http://127.0.0.1:18095/console?view=runs`.
- `pnpm run plans:audit -- --keep 83`
- `git diff --check`

## Definition Of Done

- The control matrix is recorded in this plan.
- The implemented control family is available in the greenfield Runs workbench
  with state gates, confirmation, result readback, and tests.
- Launch and broad retry remain deferred unless a later plan selects them.
- Required validation passes.
- Installed-runtime route/readback evidence is recorded.
- Plan 0083 is updated with implemented evidence and closed.
