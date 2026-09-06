# Remaining browser edits review | 2026-09-06

Baseline: `18ce58652099873b4c9ea7911a522b0962cc8cbc`.
Scope: the four unstaged browser/adapter/test files; review only.

## Spec

- **R1 / P1 / blocking:** `chatgptComposerTool.ts:608-617` accepts a hidden
  form as the active composer. The fallback at lines 281-286 then returns
  `ready` with no local-file row. Plan 0276 requires missing or ambiguous
  attachment surfaces to fail closed. A same-form editor and trigger do not
  establish visibility or bind that form to the current attachment popover.
- Reproduced through `prepareChatgptWorkbenchLocalAttachment` by executing its
  actual inventory expression in a Node VM: one visible empty popover, one
  unrestricted multiple `upload-files` input in a zero-size hidden form,
  a hidden contenteditable child, and a hidden trigger labelled
  `Add files and more`. Result: `rows: []`, `composerLocal: true`, and
  `status: ready`. No browser or provider ran. This proves a false-positive
  upload readiness decision; no real upload consequence is claimed.
- Remediation: bind fallback evidence to the active visible composer and its
  trigger/popover; test the actual inventory expression with inactive-form
  and active-form fixtures. File inputs themselves may legitimately be hidden.
- No direct correctness defect found in the null-selector handoff change.
  No originating specification for that new default was located; full intent
  conformance remains unverified. Neither source edit changes Chat/Work mode
  detection or resolves the September 5 smoke failure.

## Standards

- **R2 / P2 / blocking:** `chatgptService.test.ts:163,241-245` replaces the
  explicit semantic-selector handoff case with the null-selector case.
  Preserve both cases so handoff propagation of desired model, thinking time,
  and `select` strategy remains protected. This follows policy 0029's retained
  risk requirement for changed tests.
- Operator-facing documentation for the new handoff default and upload fallback
  is absent from this patch; add it with remediation per policy 0009.
- `docs/agents/issue-tracker.md` is absent. The review used repo-native plan
  evidence; `/setup-matt-pocock-skills` can restore issue-tracker routing.

## Validation and disposition

- `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptService.test.ts tests/browser/chatgptToolApproval.test.ts`:
  38 tests passed, three files, focused tier, no retry.
- `pnpm run typecheck`: passed.
- Exact hidden-form reproduction: false-positive confirmed despite green tests.
- Standards: one accepted blocking coverage finding plus documentation debt.
  Spec: one accepted blocking correctness finding; new handoff default lacks
  a located originating specification. Keep source edits uncommitted pending
  bounded remediation. No live or installed-runtime validation was attempted.
