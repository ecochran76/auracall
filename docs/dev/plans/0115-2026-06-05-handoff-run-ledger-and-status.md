# Handoff Run Ledger And Status Plan | 0115-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Execute the first implementation slice under Plan 0114 by making handoff runs
addressable from durable ledger state. `auracall handoff prepare --dry-run`
already writes a packet, but later source orchestration, approvals, upload,
submit, readback, and repair all need a stable run registry before provider
actions can be safely owned and replayed.

## Current State

- Plan 0114 is open as the end-to-end cross-service handoff blueprint.
- Plan 0111 installed the dry-run packet builder.
- Plan 0112 installed source materialization readback import.
- `prepareCrossServiceHandoffPacket(...)` writes `run.json` and
  `events.jsonl` inside a packet directory, but there is no first-class
  status/readback command for a handoff run.
- Operators can inspect packet files manually, but later automation cannot yet
  rely on one canonical status surface.

## Scope

- Add a handoff ledger/status read path rooted in user-scoped handoff runtime
  storage.
- Make `prepare` write enough registry evidence for status/readback to answer
  from the packet and event ledger.
- Add `auracall handoff status <id> --json`.
- Add CLI helper/formatter coverage for human-readable status.
- Preserve the preview-only target mutation boundary.

## Non-Goals

- Do not create or run source materialization jobs.
- Do not add target upload, submit, or approval commands.
- Do not add repair/resume yet.
- Do not move tenant-private payloads into tracked repo files.
- Do not replace existing generic `auracall run status`; this is a
  handoff-specific packet/ledger surface.

## Work Tracks

### Track 1 | Ledger Contract

Status: completed.

- Define the status object returned by handoff status.
- Read `run.json`, `events.jsonl`, source manifest/omissions, analysis
  decision, submission plan, submission result, and target readback when
  present.
- Compute packet digest and event count for replay evidence.

Acceptance evidence:

- A prepared packet can be read back by id without passing its full path.
- Missing packet ids return `null` through the helper and a clear CLI error.
- `tests/cli/handoffCommand.test.ts` covers prepared packet status readback
  by id, event count, packet digest, source completeness, target zero-mutation
  attempts, and missing-id `null` behavior.

### Track 2 | CLI Status Surface

Status: completed.

- Add `readHandoffStatusForCli(...)` and
  `formatHandoffStatusCliSummary(...)`.
- Register `auracall handoff status <id> --json`.
- Support `--output-dir` so fixture and alternate packet roots are readable.

Acceptance evidence:

- Tests cover JSON/status helper output and human-readable summary.
- `auracall handoff status --help` shows the command and options.
- `pnpm tsx bin/auracall.ts handoff status --help` showed the registered
  status command and `--output-dir` / `--json` options.

### Track 3 | Docs And Closeout

Status: completed.

- Update README, ROADMAP, RUNBOOK, dev journal, and fixes log.
- Keep Plan 0114 active and make Plan 0115 the current implementation slice.

Acceptance evidence:

- `pnpm run plans:audit -- --keep 115` passes.
- `git diff --check` passes.

## Closeout

Closed as **Handoff Run Ledger And Status Installed**.

Implementation:

- `auracall handoff prepare --dry-run` now writes `ledger.json` alongside
  `run.json` and `events.jsonl`.
- `src/handoff/service.ts` exposes `readHandoffStatus(...)` and returns a
  handoff-specific status result with run, ledger, event count, packet digest,
  source completeness, analysis, target submission plan, skipped submission
  result, and skipped target readback.
- `src/cli/handoffCommand.ts` exposes `readHandoffStatusForCli(...)` and
  `formatHandoffStatusCliSummary(...)`.
- `bin/auracall.ts` registers `auracall handoff status <id>`.
- README, ROADMAP, RUNBOOK, dev journal, and fixes log document the installed
  status surface and preview-only boundary.

Validation:

- `pnpm vitest run tests/cli/handoffCommand.test.ts` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm exec biome lint src/handoff/service.ts src/cli/handoffCommand.ts
  tests/cli/handoffCommand.test.ts bin/auracall.ts` passed.
- `pnpm tsx bin/auracall.ts handoff status --help` passed.
- `pnpm tsx bin/auracall.ts handoff prepare --help` passed.
- `pnpm run plans:audit -- --keep 115` passed with zero validation errors.
- `git diff --check` passed.
- `pnpm run build` passed.

## Exit Criteria

Close when `auracall handoff prepare --dry-run` writes packet/ledger evidence
that `auracall handoff status <id>` can read back by id, with focused tests,
docs, and validation complete.
