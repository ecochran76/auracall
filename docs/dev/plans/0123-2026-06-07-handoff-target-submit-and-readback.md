# Handoff Target Submit And Readback Plan | 0123-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after Plan 0121
installed digest-guarded upload approval and deterministic target upload
readback. The next gap is a separate submit approval gate plus replayable
target submit/readback evidence that proves the handoff can be delivered
without allowing unapproved target mutation.

Plan serial `0122` is already occupied by the live-follow stale materialization
recovery lane, so this handoff slice uses `0123`.

## Current State

- Plan 0114 remains the active end-to-end cross-service handoff blueprint.
- Plan 0121 writes upload approval, upload result rows, and status upload
  metrics while preserving `submitAttemptCount=0`.
- This slice installs phases 10-11 of Plan 0114 in deterministic preview form:
  submit approval, submit result, and cached target readback.

## Scope

- Add a separate `target_submit` approval artifact under `approvals/submit.json`
  with actor, time, run id, target endpoint, package digest, primer digest,
  compact-context digest, and uploaded-file-set digest.
- Add stale submit approval rejection when package, primer, compact context, or
  uploaded file set changes after approval.
- Add `auracall handoff approve-submit <id>` to record submit approval only
  after a current target upload result exists.
- Add `auracall handoff submit <id>` to write deterministic
  `target/submission-result.json` and `target/readback.json` records.
- Extend `handoff status` with submit approval, submit status, readback status,
  target conversation ref, provider message id, and submit attempt count.

## Non-Goals

- Do not call live provider submit APIs by default.
- Do not scrape or mutate live target conversations.
- Do not merge upload and submit approvals.
- Do not add repair/resume commands in this slice.

## Work Tracks

### Track 1 | Submit Approval

Status: completed.

- Define `target_submit` approval on the existing approval schema.
- Bind approval to package, primer, compact context, and upload set digests.
- Require an existing current upload result before approval.

Acceptance evidence:

- tests reject submit without submit approval;
- tests reject submit approval package digest mismatches;
- tests reject submit after the primer changes post-approval.

### Track 2 | Deterministic Submit And Readback

Status: completed.

- Write `target/submission-result.json` with prompt digest, submit attempt
  count, target conversation ref, provider message id, readback ref, and
  uploaded provider file ids.
- Write `target/readback.json` with cached readback status, summary, excerpt,
  target conversation ref, provider message id, and packet refs.
- Keep provider mutation simulated and host-owned.

Acceptance evidence:

- tests prove deterministic provider message ids and target readback records;
- status reports `submitted` and `readback_cached`.

### Track 3 | CLI, Docs, And Validation

Status: completed.

- Add CLI subcommands for submit approval and submit/readback.
- Update README, ROADMAP, RUNBOOK, dev journal, fixes log, and Plan 0114 slice
  numbering.
- Validate with focused handoff tests, typecheck, focused lint, command help,
  plan audit, diff check, and build.

## Definition Of Done

Plan 0123 closes as **Handoff Target Submit And Readback Installed** when an
approved uploaded handoff packet can record submit approval, reject stale
approval, write deterministic submit/readback artifacts, and surface the result
through `handoff status`.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, tests, and bin entry
- `pnpm tsx bin/auracall.ts handoff approve-submit --help`
- `pnpm tsx bin/auracall.ts handoff submit --help`
- `pnpm tsx bin/auracall.ts handoff status --help`
- `pnpm run plans:audit -- --keep 123`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Target Submit And Readback Installed**. The handoff target
path now has separate approval gates for upload and submit, deterministic
submit/readback artifacts, stale approval rejection, and status readback for
the target conversation evidence. Repair/resume remains the next bounded
handoff slice.
