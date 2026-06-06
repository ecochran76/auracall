# Handoff Analysis Package Preview Plan | 0120-2026-06-06

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after source job
orchestration. Handoff preview already creates a replayable packet, imports or
creates source materialization evidence, and keeps target mutation disabled.
The remaining immediate gap is that the "analysis" and target package are still
deterministic placeholders rather than a schema-validated App Intelligence
decision plus a target-ready preview package.

This slice installs the preview-safe contract for phases 4-7 of Plan 0114:
analysis input assembly, schema-backed analysis decision validation, target
discovery preview, and target package assembly. It must still perform zero
target upload and zero target submit.

## Current State

- Plan 0114 remains the active end-to-end cross-service handoff blueprint.
- Plan 0115 installed `ledger.json`, `events.jsonl`, and `handoff status`.
- Plan 0116 installed source materialization job import/read/create evidence.
- Plan 0120 installed the preview-safe analysis/package contract for phases
  4-7.
- `auracall handoff prepare --dry-run` now writes:
  - source context, manifest, omissions, and materialization job evidence;
  - `analysis/input.json` with packet-relative refs and budgets;
  - schema-validated `auracall.handoff-analysis-decision.v2`;
  - `analysis/validation-report.json`;
  - `target/package.json`, `target/upload-manifest.json`,
    `target/submission-plan.json`, `target/primer.md`,
    `target/compact-context.json`, and staged `target/selected-files/` where
    selected local files exist.
- Missing selected local files are recorded as package omissions, not upload
  attempts.
- `handoff status` reports analysis schema validity, target package digest,
  selected file count/bytes, and zero upload/submit counters.

## Scope

- Add `auracall.handoff-analysis-input.v1` assembled from packet-relative
  source context, manifest, omissions, source job evidence, target endpoint,
  target capability limits, and operator budgets.
- Add `auracall.handoff-analysis-decision.v2` validation with host-owned rules:
  - selected manifest item ids must exist;
  - selected ids must reference local files or be explicitly omitted;
  - omission warnings must correspond to actual omissions or policy limits;
  - estimated prompt tokens and selected file bytes must fit configured budgets;
  - `approvalRecommendation` must be one of the allowed preview-safe values.
- Keep model execution stubbed or deterministic in this slice unless an
  explicit local App Intelligence worker contract is already available; the
  important deliverable is the host-owned schema, validation, and replayable
  decision artifact.
- Write target package preview artifacts:
  - `target/package.json`;
  - `target/upload-manifest.json`;
  - `target/submission-plan.json`;
  - `target/primer.md`;
  - `target/compact-context.json`;
  - `target/selected-files/` entries copied or linked from selected local
    files where available.
- Compute a stable package digest from target package metadata, primer, compact
  context, upload manifest, and selected file checksums.
- Extend `handoff status` to report analysis schema validity, selected item
  count, package digest, package file count, selected bytes, and target mutation
  counters.
- Keep `targetMutationAllowed=false`, upload attempt count `0`, and submit
  attempt count `0`.

## Non-Goals

- Do not add target upload, target submit, target readback, approvals, repair,
  or resume.
- Do not call provider target adapters.
- Do not create or scrape target conversations.
- Do not require a live App Intelligence model call to close this slice.
- Do not move tenant-private packet payloads into tracked repo files.
- Do not make ChatGPT-specific context or account-library behavior part of the
  general handoff schema.

## Work Tracks

### Track 1 | Analysis Input And Decision Schema

Status: completed.

- Define typed analysis input and v2 decision structures in the handoff service
  layer.
- Add deterministic validation helpers and validation error reporting.
- Keep model output as data: no validated decision may directly mutate target
  state.

Acceptance evidence:

- Unit tests reject invalid selected ids, missing local selected files without
  an omission, malformed `approvalRecommendation`, budget overflow, and
  omission warnings that reference no omission.
- Unit tests accept a valid v2 decision and write a validation report into the
  packet.

### Track 2 | Target Package Preview

Status: completed.

- Build target package artifacts from the validated decision.
- Stage selected local files under `target/selected-files/` or record explicit
  omissions when local paths are unavailable.
- Write upload manifest rows with packet-relative paths, filenames, mime types,
  sizes, checksums, and source manifest ids.
- Compute and persist a stable package digest.

Acceptance evidence:

- CLI tests prove package digest stability across repeated dry-run preparation
  with the same inputs.
- CLI tests prove missing selected local files become package omissions rather
  than target upload attempts.

### Track 3 | Status, Docs, And Validation

Status: completed.

- Extend `handoff status` summary and JSON readback with analysis validation
  and package metrics.
- Update README, ROADMAP, RUNBOOK, dev journal, and fixes log.
- Validate with focused handoff tests, typecheck, focused lint, command help,
  plan audit, diff check, and build.

Acceptance evidence:

- `handoff status <id> --json` reports `analysis.schemaValid=true`,
  `target.packageDigest`, package selected file metrics, and upload/submit
  attempts at `0`.
- `auracall handoff prepare --dry-run` and `handoff status` help remain valid.

## Definition Of Done

- Plan 0120 closes as **Handoff Analysis Package Preview Installed** when
  preview packets contain schema-validated analysis input/decision artifacts,
  target package preview artifacts, stable package digest, status readback, and
  zero target mutation evidence.
- If schema validation cannot be made deterministic in this slice, close only
  as **Handoff Analysis Package Preview Blocked** with exact missing contract
  evidence and leave target package assembly disabled.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, and handoff tests
- `pnpm tsx bin/auracall.ts handoff prepare --help`
- `pnpm tsx bin/auracall.ts handoff status --help`
- `pnpm run plans:audit -- --keep 120`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Analysis Package Preview Installed**. Current code prepares
a provider-neutral dry-run handoff packet whose analysis decision is
v2-schema-validated, whose target package is digest-addressed and replayable,
and whose status readback proves no target upload or submit was attempted.
