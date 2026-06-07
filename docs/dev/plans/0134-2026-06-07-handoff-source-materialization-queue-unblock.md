# Handoff Source Materialization Queue Unblock Plan | 0134-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Close the generic source-materialization recovery gap exposed during Plan 0133:
a readback can mark a stale running history materialization job terminal while
the original in-process provider promise still owns the serialized provider
work queue. That can leave follow-up handoff source materialization jobs
`queued` even though storage shows the previous job as `failed`.

## Current State

- Plan 0133 completed the original ChatGPT Business to SoyLei ChatGPT Pro
  target handoff, but source completeness remained partial.
- The next source-depth work still needs ChatGPT project `Sources` tab
  materialization.
- The generic queue recovery issue no longer needs operator restart as the
  first repair: stale-running readback now detaches the process-local queue
  slot for the stale job, and late provider completions cannot overwrite the
  stale terminal record.
- Refresh-only stale conversation candidates are retained through
  reconciliation when `refreshSnapshot=true`, even if they have no current
  asset-family signatures. That keeps source recovery probes alive for changed
  conversations whose asset counts are stale or missing.

## Scope

- Keep recovery provider-neutral in `historyMaterializationService`.
- Preserve the existing serialized queue for normal provider work.
- When a scheduled in-process running job crosses the stale threshold, mark it
  terminal and detach that queue slot so later queued jobs can run.
- Prevent late provider promise success/failure from clobbering a terminal job
  written by stale recovery.
- Keep startup interrupted-job recovery deterministic and separate from
  readback stale-timeout recovery.
- Preserve refresh-only stale conversation selection for source recovery.

## Non-Goals

- Do not implement ChatGPT project `Sources` tab file extraction in this slice.
- Do not add browser abort/cancellation primitives.
- Do not alter target handoff approval, upload, submit, or readback semantics.

## Definition Of Done

Plan 0134 closes when stale-running readback no longer requires an API restart
to unblock a later queued provider-materialization job, and tests prove that a
late provider completion cannot overwrite the stale terminal job record.

## Validation Plan

- `pnpm vitest run tests/runtime.historyMaterializationService.test.ts`
- `pnpm vitest run tests/cli/handoffCommand.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome lint src/runtime/historyMaterializationService.ts tests/runtime.historyMaterializationService.test.ts`
- `pnpm run build`
- `pnpm run plans:audit -- --keep 134`
- `git diff --check`

## Exit Criteria

Closed as **Handoff Source Materialization Queue Unblock Installed**.

Completion evidence:

- focused history materialization suite passed with `52` tests;
- regression coverage proves a stale in-process provider promise can be
  recovered to terminal `failed`, a second queued job can run immediately, and
  the late first completion leaves the failed record intact;
- startup recovery still re-dispatches queued jobs and marks interrupted
  running jobs failed without pre-scanning readback stale timeouts;
- refresh-only stale conversation rows remain eligible during
  `refreshSnapshot=true` reconciliation.

## Next Repair Slice

- Add ChatGPT project `Sources` tab file materialization so source-level
  uploads can be selected directly, not only represented by a generated project
  index or conversation-file inventory.
