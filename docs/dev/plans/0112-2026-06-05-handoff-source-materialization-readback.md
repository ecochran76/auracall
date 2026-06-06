# Handoff Source Materialization Readback Plan | 0112-2026-06-05

State: CLOSED
Lane: P01

## Purpose

Advance cross-service handoff from a standalone dry-run packet builder to a
packet builder that can consume bounded source materialization readback. The
goal is to import already-run account/history materialization evidence into
the handoff packet so source completeness reflects real materialized assets,
without enabling target upload or submit.

## Current State

- Plan 0111 is closed as **Dry-Run Handoff Packet Builder Installed**.
- `auracall handoff prepare --dry-run` writes provider-neutral handoff packets
  with source context, manifest, omissions, analysis preview, target
  submission plan, skipped submission result, and skipped readback.
- The packet builder can consume explicit source context, manifest, and
  omissions JSON inputs.
- It does not yet understand AuraCall history-materialization job readback, so
  operators must manually transform job results into a source manifest before
  preparing a handoff.

## Scope

- Add a source materialization readback import path to handoff preparation.
- Accept one or more existing materialization job readback JSON files.
- Extract materialized entries into provider-neutral handoff manifest items.
- Extract failed or skipped source entries into provider-neutral omissions
  where the job readback contains enough evidence.
- Preserve manual `--source-manifest-json` and `--source-omissions-json`
  inputs and merge them with imported materialization readback.
- Record source materialization job ids and source refs in the handoff packet
  analysis/input evidence.
- Keep target mutation impossible in this slice.

## Non-Goals

- Do not create or run materialization jobs from `handoff prepare`.
- Do not poll the local API from the handoff command.
- Do not open provider browsers.
- Do not upload files or submit prompts to the target provider.
- Do not enable broad live-follow or account-library automatic modes.

## Work Tracks

### Track 1 | Readback Import Shape

Status: completed.

- Add CLI option(s) for existing source materialization job readback JSON.
- Parse common `history_materialization_job` and
  `history_materialization_job_create_result` envelopes.
- Treat unknown readback shapes as explicit validation errors.

Acceptance evidence:

- Tests cover job readback passed as a bare job and as a create/read envelope.
- `tests/cli/handoffCommand.test.ts` covers a bare
  `history_materialization_job` and a
  `history_materialization_job_create_result` wrapper.

### Track 2 | Manifest And Omission Merge

Status: completed.

- Convert materialized job entries/assets into handoff manifest items.
- Convert failed/skipped job entries with error/reason evidence into handoff
  omissions.
- Merge imported and explicit manifest/omission inputs deterministically.

Acceptance evidence:

- A test proves imported materialized assets affect source completeness,
  analysis selection, and target preview counts.
- Imported materialized and duplicate entries now increase manifest,
  local-materialized, checksum, selected target seed, and target preview counts.
- Imported failed/skipped entries now become omissions with retryability based
  on source materialization status.

### Track 3 | Packet Evidence

Status: completed.

- Record imported source materialization job ids in analysis input evidence.
- Preserve zero-target-mutation evidence.

Acceptance evidence:

- Packet `analysis/input-index.json` references imported source
  materialization jobs while `target/submission-plan.json` still reports
  `targetMutationAllowed=false`, `uploadAttemptCount=0`, and
  `submitAttemptCount=0`.
- Focused packet tests assert imported job ids in `analysis/input-index.json`
  and zero-target-mutation evidence in `target/submission-plan.json`.

## Closeout

Closed as **Handoff Source Materialization Readback Installed**.

Implementation:

- `src/handoff/service.ts` imports existing source
  `history_materialization_job` readbacks and create-result envelopes into
  provider-neutral manifest items and omissions.
- `src/cli/handoffCommand.ts` and `bin/auracall.ts` expose repeatable
  `--source-materialization-job-json` inputs for dry-run packet preparation.
- `README.md` documents the readback import option and preview-only posture.

Validation:

- `pnpm vitest run tests/cli/handoffCommand.test.ts` passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- `pnpm exec biome lint src/handoff/service.ts src/cli/handoffCommand.ts
  tests/cli/handoffCommand.test.ts bin/auracall.ts` passed.
- `pnpm run plans:audit -- --keep 112` passed with zero validation errors.
- `git diff --check` passed.
- `pnpm tsx bin/auracall.ts handoff prepare --help` showed the repeatable
  `--source-materialization-job-json` option.
- `pnpm run build` passed.

## Exit Criteria

- Close when `auracall handoff prepare --dry-run` can merge at least one
  source materialization job readback JSON file into the packet manifest and
  omissions, with focused tests and docs updated.
