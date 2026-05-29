# Roadmap Priority Reconciliation Plan | 0081-2026-05-29

State: OPEN
Lane: P01

## Purpose

Reconcile `ROADMAP.md` after the greenfield console sequence closed Plans
0077 through 0080. The roadmap should be usable as the current priority map,
not only as a history ledger.

This is a documentation and planning slice. It does not change product code,
provider automation, runtime behavior, or the frozen legacy frontend pages.

## Current State

- Plan 0077 is closed for the greenfield Agents workflow in `/console`.
- Plan 0078 is closed for the greenfield Providers and Projects workflows.
- Plan 0079 is closed for the greenfield Overview and Health command center.
- Plan 0080 is closed for the read-only Runs workbench.
- `/dashboard`, `/agents`, `/config`, and `/ops/browser` remain frozen
  legacy/diagnostic surfaces.
- `ROADMAP.md` is structurally valid, and `plans:audit` passes, but review
  found semantic drift:
  - the top execution board is less specific than `P02 Now`;
  - the product UX milestone ladder still reads like some completed console
    milestones are future work;
  - the Runs workbench milestone does not clearly separate completed read-only
    visibility from deferred safe controls;
  - active priority guidance is buried below long historical detail;
  - `P02 Soon` is too generic after the console milestone sequence.

## Scope

- Add a short current-priority snapshot near the top of `ROADMAP.md`.
- Align the Current Execution Board with `P02 Now`.
- Mark the greenfield console sequence state clearly:
  - Agents complete;
  - Providers and Projects complete;
  - Overview and Health complete;
  - Runs complete as read-only.
- Rewrite the Runs milestone so retry, cancel, resume, pause, drain, and launch
  controls are deferred to a future safe-controls plan.
- Clarify the next primary lane:
  - immediate follow-through is the downstream `transcribe-audio` App
    Intelligence integration lane;
  - AuraCall safe run controls, Search/archive, and API Access remain later
    second-order AuraCall lanes unless explicitly selected.
- Keep history/proof detail durable, but reduce its interference with the
  current-priority read path.
- Update `RUNBOOK.md`, `docs/dev/dev-journal.md`, and `docs/dev-fixes-log.md`
  with the planning result and validation evidence.

## Non-Goals

- Do not implement the `transcribe-audio` integration in this plan.
- Do not open or implement a safe run-control surface in this plan.
- Do not change, restyle, or extend `/dashboard`, `/agents`, `/config`, or
  `/ops/browser`.
- Do not reorganize the whole roadmap or rename established lanes.
- Do not delete historical evidence for closed plans.
- Do not change runtime, API, browser, MCP, or console behavior.

## Work Tracks

### Track 1 | Current Priority Snapshot

Status: open.

- Add a compact snapshot near the top of `ROADMAP.md` that names:
  - active plan 0081;
  - the next primary implementation lane after reconciliation;
  - the closed greenfield console milestone sequence;
  - deferred second-order AuraCall lanes.
- Keep the snapshot short enough to scan before the historical initiative
  ledger.

### Track 2 | Product UX Milestone Reconciliation

Status: open.

- Rewrite the high-level product UX milestones so completed work is marked as
  completed, not future-tense.
- Keep the UX guide as the review standard.
- Preserve the hard boundary that product UX work belongs in the greenfield
  `/console` surface and not in the frozen legacy frontend pages.
- Clarify that Runs control actions need a later state-gated safety plan.

### Track 3 | Now/Soon/Later Cleanup

Status: open.

- Make `P02 Now` and the Current Execution Board say the same thing.
- Move the downstream `transcribe-audio` App Intelligence lane into the
  immediate next-action slot after this plan closes.
- Tighten `P02 Soon` so it names realistic next AuraCall lanes instead of
  generic categories.

### Track 4 | Validation And Handoff

Status: open.

- Run roadmap plan validation after edits.
- Run whitespace/diff validation for Markdown changes.
- Record the result in `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md`.
- Close this plan only after the roadmap reads coherently from top-level
  priority through `Now/Soon/Later`.

## Acceptance Criteria

- `ROADMAP.md` has a short current-priority snapshot near the top.
- The Current Execution Board and `P02 Now` agree on the active plan and the
  next implementation lane.
- The greenfield console sequence is represented as completed through Plan
  0080.
- The Runs workbench is described as complete for read-only inspection, with
  launch/retry/cancel/resume/pause/drain controls explicitly deferred.
- `P02 Soon` identifies specific follow-up lanes instead of generic buckets.
- Legacy frontend pages remain frozen and are not used as targets for new
  product UX work.
- Historical plan evidence remains durable.
- `RUNBOOK.md`, `docs/dev/dev-journal.md`, and `docs/dev-fixes-log.md` record
  the planning reconciliation.

## Validation Plan

- `pnpm run plans:audit -- --keep 81`
- `git diff --check`
- Manual review of:
  - `ROADMAP.md` top execution board;
  - product UX milestone ladder;
  - `P02 Now`;
  - `P02 Soon`.

## Definition Of Done

- Plan 0081 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- The roadmap has one coherent current-priority read path.
- Completed greenfield console milestones no longer read as unstarted work.
- Deferred safe-control, Search/archive, and API Access lanes are named without
  pretending they are complete.
- Validation evidence is recorded.
- Plan 0081 is updated with implemented evidence and closed.
