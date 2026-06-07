# Handoff Repair Resume Export Plan | 0124-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after Plan 0123
installed approval-gated deterministic submit and cached readback. The next
gap is resumability and manual operator completion when a handoff packet is
partial, stale, or blocked from live provider automation.

This slice installs the first repair/resume/operator UX contract as local
deterministic packet artifacts and CLI commands. Console UI and live provider
repair remain follow-on work.

## Current State

- Plan 0123 writes submit approval, deterministic submit result, and cached
  readback.
- `handoff status` can already report package, upload, submit, and readback
  state.
- The packet still needs a durable next-action plan, repair report, and manual
  export bundle that an operator can use without relying on chat history.

## Scope

- Add `auracall handoff resume <id>` to inspect packet state and write
  `target/resume-plan.json`.
- Add `auracall handoff repair <id>` to restore missing derived
  `target/submission-result.json` or `target/readback.json` when the packet
  contains enough state, then write `repair/report.json`.
- Add `auracall handoff export <id>` to write
  `target/manual-handoff-export.json` for manual target completion.
- Keep resume decisions provider-neutral and derived from the same state as
  `handoff status`.

## Non-Goals

- Do not add console UI panels in this slice.
- Do not call live provider APIs.
- Do not auto-resubmit target prompts during repair.
- Do not repair missing source cache/materialization artifacts.

## Work Tracks

### Track 1 | Resume Plan

Status: completed.

- Classify packet state into `approve_upload`, `upload`, `approve_submit`,
  `submit`, `complete`, or `repair_required`.
- Write `target/resume-plan.json` with the next command and packet refs.

Acceptance evidence:

- tests prove resume advances from package ready to submit approval to complete.

### Track 2 | Repair Report

Status: completed.

- Recreate missing skipped submission/readback artifacts for preview packets.
- Recreate cached readback from an existing submitted result.
- Write `repair/report.json` plus an updated resume plan.

Acceptance evidence:

- tests delete `target/readback.json`, run repair, and verify repaired readback
  plus complete resume state.

### Track 3 | Manual Export

Status: completed.

- Write a manual handoff bundle with primer, compact context, selected files,
  uploaded provider ids, target refs, and operator instructions.
- Keep this export local and deterministic.

Acceptance evidence:

- tests verify `target/manual-handoff-export.json` contains selected file refs,
  uploaded provider ids, primer text, and operator instructions.

## Definition Of Done

Plan 0124 closes as **Handoff Repair Resume Export Installed** when an operator
can ask a packet what to do next, repair missing derived state, and export a
manual handoff bundle without browser or provider mutation.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, tests, and bin entry
- `pnpm tsx bin/auracall.ts handoff resume --help`
- `pnpm tsx bin/auracall.ts handoff repair --help`
- `pnpm tsx bin/auracall.ts handoff export --help`
- `pnpm run plans:audit -- --keep 124`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Repair Resume Export Installed**. The packet now carries a
deterministic next-action plan, repair report, and manual export bundle. Console
surfaces and live provider recovery remain the next bounded operator UX slice.
