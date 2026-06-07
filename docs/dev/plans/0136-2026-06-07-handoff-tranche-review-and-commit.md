# Handoff Tranche Review And Commit Plan | 0136-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Convert the recently completed inter-tenant handoff work from a large dirty
worktree into one coherent, reviewable local commit. This slice is centered on
Plans 0133, 0134, and 0135: original source cache proof, source
materialization queue unblock, and ChatGPT project `Sources` materialization.

The target outcome is not more feature scope. It is a disciplined cleanup,
review, validation, and commit pass over the code/docs already claimed complete
end-to-end.

## Current State

- Plan 0133 closed the original ChatGPT Business to SoyLei ChatGPT Pro source
  cache/import proof and completed live target submit/readback.
- Plan 0134 closed the stale in-process provider-work queue unblock so later
  source materialization jobs no longer need an API restart after stale
  readback recovery.
- Plan 0135 closed ChatGPT project `Sources` materialization, imported the
  project-source readback into a refreshed handoff packet, and completed cached
  target readback for the refreshed packet.
- The worktree is dirty with the Plan 0133-0135 code/docs plus the supporting
  Plan 0122 file still untracked.
- Current diff size before cleanup is concentrated in formatter-heavy files:
  `src/browser/providers/chatgptAdapter.ts` is `6923` insertions and `5988`
  deletions, and `tests/browser/chatgptAdapter.test.ts` is `1982`
  insertions and `1928` deletions.
- `git diff --check` is currently clean.

## Scope

- Review the active diff by file and classify each file as:
  - Plan 0133 source cache/import proof;
  - Plan 0134 queue/stale-recovery repair;
  - Plan 0135 project-source materialization;
  - shared docs/governance evidence;
  - accidental or avoidable formatter churn.
- Reduce formatter churn where it materially improves reviewability without
  risking semantic regression or fighting the repo formatter.
- Keep the handoff tranche coherent: do not split Plan 0133-0135 into
  unrelated commits unless review finds unrelated changes mixed into the diff.
- Re-run targeted validation for the touched handoff, ChatGPT adapter, browser
  file, history materialization, API/CLI/MCP, typecheck, lint, build, plan
  audit, and diff hygiene surfaces.
- Update closeout docs with the final review/validation/commit evidence.
- Create one truthful local commit for the coherent handoff tranche after the
  validation gate passes.

## Non-Goals

- Do not expand inter-tenant handoff behavior beyond Plans 0133-0135.
- Do not re-run broad live provider mutation unless local review finds stale
  evidence that cannot be validated from recorded artifacts and cached
  readback.
- Do not rewrite unrelated roadmap or runbook history.
- Do not remove completed plan artifacts or collapse Plans 0133-0135 into this
  plan.
- Do not chase warning-free lint beyond the repo's current release gate unless
  the cleanup itself creates new warnings.

## Work Tracks

- Diff audit:
  - inspect `git diff --stat`, `git diff --name-status`, and focused file
    diffs for the dirty worktree;
  - verify every modified source/test/doc file belongs to the handoff tranche
    or the already-recorded live-follow stale recovery support slice.
- Formatter churn reduction:
  - focus first on `src/browser/providers/chatgptAdapter.ts` and
    `tests/browser/chatgptAdapter.test.ts`;
  - prefer leaving formatter output intact when reverting churn would be more
    dangerous than helpful;
  - record before/after diff size if churn is reduced materially.
- Semantic review:
  - confirm Plan 0133 source omission classification, digest-aware stale target
    result filtering, and selected-file dedupe are represented in tests;
  - confirm Plan 0134 stale queue-slot detachment and late-completion guard are
    represented in history materialization tests;
  - confirm Plan 0135 `project_sources` API/CLI/MCP filters, ChatGPT provider
    id handling, project file manifests, and handoff import behavior are
    represented in tests.
- Validation and commit:
  - run the targeted validation gate below;
  - update docs with final evidence;
  - commit the tranche with a subject that names the installed handoff source
    materialization and target completion work.

## Validation Plan

- `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts tests/runtime.historyMaterializationService.test.ts tests/cli/handoffCommand.test.ts tests/cli/apiHistoryMaterializationCommand.test.ts tests/mcp.historyMaterialization.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- Focused `pnpm exec biome lint` on changed source and test files.
- `pnpm run build`
- `pnpm run plans:audit -- --keep 136`
- `git diff --check`
- `git status --short`

## Acceptance Criteria

- Dirty worktree contents are explained by the handoff tranche and supporting
  stale-recovery plan, with no unrelated source/doc edits hidden in the commit.
- Formatter churn is either reduced or explicitly retained because the local
  formatter owns the changed layout and reverting it would increase risk.
- Targeted tests, typecheck, focused lint, build, plan audit, and diff hygiene
  pass after cleanup.
- Roadmap, runbook, dev journal, fixes log, and plan files contain enough
  evidence for another operator to understand what landed without chat history.
- One local commit contains the Plan 0133-0135 code/docs handoff tranche.

## Definition Of Done

Plan 0136 closes as **Handoff Tranche Reviewed And Committed** when the active
diff has been reviewed, optional formatter churn cleanup has been resolved,
validation evidence has been recorded, and the Plan 0133-0135 tranche is
committed as one coherent local commit.

## Exit Criteria

Closed as **Handoff Tranche Reviewed And Committed**.

Completion evidence:

- Diff audit found the requested handoff tranche in the Plan 0133-0135 source,
  test, plan, roadmap, runbook, journal, and fixes-log surfaces.
- Separate Plan 0137 account-mirror/status work is present in the dirty
  worktree and remains outside this handoff commit.
- Formatter churn in `src/browser/providers/chatgptAdapter.ts` and
  `tests/browser/chatgptAdapter.test.ts` was retained because it is broad
  formatter-owned import/order/quote/indent normalization; manually unwinding
  it would increase review and validation risk.
- Focused Vitest gate passed:
  `pnpm vitest run tests/browser/chatgptAdapter.test.ts tests/browser/llmServiceFiles.test.ts tests/runtime.historyMaterializationService.test.ts tests/cli/handoffCommand.test.ts tests/cli/apiHistoryMaterializationCommand.test.ts tests/mcp.historyMaterialization.test.ts`
  with `6` files and `220` tests passed.
- `pnpm exec tsc --noEmit --pretty false` passed.
- Focused Biome lint passed on the changed handoff/history materialization
  source and test files.
- `pnpm run build` passed.
- `pnpm run plans:audit -- --keep 136` passed with `Validation errors: 0`.
- `git diff --check` passed.
- The handoff tranche was committed locally as one coherent checkpoint.
