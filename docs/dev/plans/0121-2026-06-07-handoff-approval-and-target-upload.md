# Handoff Approval And Target Upload Plan | 0121-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after Plan 0120
installed schema-validated analysis and target package preview. The handoff
packet can now prove which files should be portable, stage selected local files,
and compute a stable target package digest. The next gap is a host-owned
approval gate and replayable target upload result contract.

This slice installs phases 8-9 of Plan 0114: approval gate and target upload.
Submit and readback remain out of scope.

## Current State

- Plan 0114 remains the active end-to-end cross-service handoff blueprint.
- Plan 0120 writes `target/package.json`, `target/upload-manifest.json`,
  staged `target/selected-files/`, `target/submission-plan.json`, stable
  package digest, and status readback.
- `auracall handoff approve-upload <id>` now records upload approval under
  `approvals/upload.json`, updates the ledger approval event, and rejects
  mismatched package digests.
- `auracall handoff upload <id>` now requires current approval, writes
  `target/upload-result.json`, updates `target/submission-result.json`, records
  deterministic provider file ids for staged files, and keeps submit attempts
  at `0`.
- `handoff status` reports upload approval, approval digest, upload status,
  uploaded file count, upload failures, upload attempts, and submit attempts.

## Scope

- Add a handoff upload approval artifact and ledger event contract:
  - approval actor;
  - approval time;
  - run id;
  - target endpoint identity;
  - package digest;
  - upload manifest ref;
  - selected file count and byte count.
- Add a CLI command that records upload approval for an existing packet without
  uploading:
  - validates packet existence;
  - validates target package digest;
  - refuses stale approval for mismatched digest;
  - leaves submit approval absent.
- Add a CLI command that performs deterministic target upload simulation from
  the approved package:
  - requires valid upload approval for the current package digest;
  - reads `target/upload-manifest.json`;
  - writes upload result rows with source manifest id, packet path, checksum,
    size, target provider, target runtime profile, and deterministic preview
    provider file id;
  - records upload attempt count;
  - keeps submit attempt count `0`.
- Extend `handoff status` with approval presence, approval digest, uploaded
  file count, upload failure count, upload status, and submit attempt count.
- Preserve provider neutrality; the upload adapter remains deterministic
  preview/simulation in this slice unless a target adapter contract is already
  available and can be invoked without submit.

## Non-Goals

- Do not submit target primer/context.
- Do not read target responses.
- Do not create or scrape target conversations.
- Do not call live provider upload APIs by default.
- Do not introduce noninteractive approval policies beyond explicit CLI
  approval.
- Do not make ChatGPT-specific upload behavior part of the general handoff
  contract.

## Work Tracks

### Track 1 | Approval Ledger

Status: completed.

- Define `auracall.handoff-approval.v1` for upload approval.
- Persist approval under `approvals/upload.json`.
- Append or rebuild ledger approval events with package digest and target
  endpoint identity.

Acceptance evidence:

- tests reject upload when no approval exists;
- tests reject stale upload approval when the package digest differs;
- status reports upload approval presence and digest.

### Track 2 | Target Upload Result

Status: completed.

- Define deterministic upload result rows for the current package.
- Simulate provider file ids from package digest plus item checksum/id.
- Preserve `submitAttemptCount=0`.
- Keep package omissions explicit and non-uploaded.

Acceptance evidence:

- tests prove approved upload writes rows for staged selected files;
- tests prove package omissions do not produce upload attempts;
- tests prove repeated upload with the same package is stable and idempotent.

### Track 3 | CLI, Docs, And Validation

Status: completed.

- Add CLI subcommands for approval and upload.
- Update README, ROADMAP, RUNBOOK, dev journal, and fixes log.
- Validate with focused handoff tests, typecheck, focused lint, command help,
  plan audit, diff check, and build.

Acceptance evidence:

- `auracall handoff approve-upload <id>` help passes.
- `auracall handoff upload <id>` help passes.
- `handoff status <id> --json` reports approval and upload metrics while
  submit attempts remain `0`.

## Definition Of Done

- Plan 0121 closes as **Handoff Approval And Target Upload Installed** when an
  existing dry-run packet can record upload approval, reject stale approval,
  produce deterministic target upload result rows for staged files, report
  upload metrics in status, and prove no submit was attempted.
- If a live provider upload adapter is not ready, close with deterministic
  preview upload only; target submit remains disabled either way.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, and handoff tests
- `pnpm tsx bin/auracall.ts handoff approve-upload --help`
- `pnpm tsx bin/auracall.ts handoff upload --help`
- `pnpm tsx bin/auracall.ts handoff status --help`
- `pnpm run plans:audit -- --keep 121`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Approval And Target Upload Installed**. Approval-gated
target upload is replayable from packet state, digest-guarded against stale
approval, visible in status, and still incapable of submitting a target
message.
