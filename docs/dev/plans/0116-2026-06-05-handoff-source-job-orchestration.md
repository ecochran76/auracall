# Handoff Source Job Orchestration Plan | 0116-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Execute the source orchestration slice under Plan 0114. Handoff preview can
already import materialization job JSON files, but operators still have to
manually gather or create source jobs before preparing the packet. This slice
adds a bounded source-job orchestration path to `auracall handoff prepare`
while preserving preview-only target behavior.

## Current State

- Plan 0114 is open as the end-to-end handoff blueprint.
- Plan 0115 closed with a handoff-specific ledger/status surface.
- Plan 0112 lets `handoff prepare` import existing source materialization job
  JSON files.
- Existing local API helpers can create and read durable
  account-history-backed materialization jobs.
- `handoff prepare` does not yet read existing source job ids or explicitly
  create a bounded source job.

## Scope

- Let `handoff prepare` read one or more existing source materialization job
  ids from the local API and import their readbacks.
- Let `handoff prepare` explicitly create one bounded source materialization
  job when requested by flag.
- Import explicit JSON readbacks and read job ids before considering create.
- Skip create when prior source job evidence was supplied, unless a later plan
  explicitly introduces force semantics.
- Persist source job orchestration evidence in the packet and status readback.
- Keep target upload/submit impossible.

## Non-Goals

- Do not poll newly-created jobs to terminal state.
- Do not implement approval, upload, submit, target readback, repair, or
  resume.
- Do not bypass provider guard/captcha behavior in source materialization.
- Do not add broad automatic live-follow/account-library scheduling.
- Do not require source job creation for ordinary dry-run packet preparation.

## Work Tracks

### Track 1 | CLI Orchestration Inputs

Status: completed.

- Add repeatable `--source-materialization-job-id`.
- Add explicit `--source-materialization-create`.
- Add bounded create options for asset kind, max items, provider work timeout,
  force, API host/port, and API timeout.

Acceptance evidence:

- CLI tests can inject fake materialization read/create functions and prove
  job ids are read before create.
- `tests/cli/handoffCommand.test.ts` proves existing job ids are read through
  the injected materialization client before create and that create is skipped
  when source job evidence exists.

### Track 2 | Packet Evidence

Status: completed.

- Write `source/materialization-jobs.json`.
- Record source job ids/status/import method/reuse evidence in `ledger.json`.
- Include source job orchestration in `handoff status`.

Acceptance evidence:

- A prepared packet status reports imported/read/created source jobs and keeps
  target mutation attempts at zero.
- Prepared packets write `source/materialization-jobs.json`, ledger source job
  evidence, status source job metrics, and zero target upload/submit attempts.

### Track 3 | Docs And Validation

Status: completed.

- Update README, ROADMAP, RUNBOOK, dev journal, and fixes log.
- Close Plan 0116 only after focused tests, typecheck, lint, command help,
  plan audit, diff check, and build pass.

## Closeout

Closed as **Handoff Source Job Orchestration Installed**.

Implementation:

- `auracall handoff prepare --dry-run` accepts repeatable
  `--source-materialization-job-id` values and reads those jobs through the
  local API before considering create.
- Explicit `--source-materialization-create` can create one bounded source
  materialization job when no JSON/job-id source evidence was supplied.
- Source materialization create options include asset kind, max items,
  provider work timeout, force, API host/port, and API timeout.
- Packet/status output now includes source materialization job ids, statuses,
  import methods, reuse evidence, result availability, terminal state, and
  metrics.
- Target upload/submit remains disabled.

Validation:

- `pnpm vitest run tests/cli/handoffCommand.test.ts` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm exec biome lint src/handoff/service.ts src/cli/handoffCommand.ts
  tests/cli/handoffCommand.test.ts bin/auracall.ts` passed.
- `pnpm tsx bin/auracall.ts handoff prepare --help` passed and showed source
  job orchestration options.
- `pnpm tsx bin/auracall.ts handoff status --help` passed.
- `pnpm run plans:audit -- --keep 116` passed with zero validation errors.
- `git diff --check` passed.
- `pnpm run build` passed.

## Exit Criteria

Close when `auracall handoff prepare --dry-run` can import source job JSON,
read source materialization job ids, explicitly create a bounded source job
when no prior source job evidence was supplied, persist orchestration evidence,
and expose that evidence through `auracall handoff status <id>`.
