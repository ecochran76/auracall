# Git Maintenance Closeout | 0322-2026-08-29

State: OPEN
Lane: P15
Operational state: CUSTODY_FROZEN / CLEANUP_IN_PROGRESS
Branch: chore/plan0322-git-maintenance-closeout
Target: main
Integration: merge
Revision: 1 | 2026-08-29

## Stable Objective

Reconcile current AuraCall branches and linked worktrees, preserve unfinished
lanes, integrate nothing without its acceptance evidence, and close exact
merged custody that no longer needs a working ref or directory.

## Current State

- Fresh `git fetch --all --prune` completed for `origin` and the Oracle
  reference remote. Local `main` now equals `origin/main` at `989faab3`.
- Six linked worktrees were clean at census. P08 and P14 remain open and must be
  preserved. P09, P10, P13, and the reconciled provider-provenance branch are
  clean, ancestral to `origin/main`, and have no process working directory
  beneath their paths.
- P08 is equal to its published branch but remains 39 commits behind and four
  commits ahead of `origin/main`; its implementation is accepted but its
  installed proof is blocked by the plan's browser/guard hard stop.
- P14 is one source-green commit ahead of `origin/main` and has no published
  remote branch yet. Install and live acceptance remain pending.
- No open or merged GitHub pull request currently owns these branches.
- The active-lane audit's apparent P11-P13 integration ambiguity was caused by
  stale local `main`; fast-forwarding that local ref restored ancestry proof.
  Remaining audit findings are checkpoint metadata drift.

## Execution Graph

1. Publish the P14 source checkpoint and register P14 plus this maintenance lane
   on the default-branch custody projection.
2. Correct integrated-lane checkpoints to their actual branch tips without
   changing validation or integration receipts.
3. Remove only clean, process-unowned worktrees whose tips are ancestral to
   `origin/main`.
4. Delete exact local and origin branch refs already integrated into main or
   previously adjudicated as cleanup candidates; retain active, divergent,
   remote-only unknown-custody, and historical compatibility refs.
5. Close and integrate this documentation-only lane, remove its own temporary
   custody, and prove final local/remote parity plus a passing catalog audit.

## Acceptance Criteria

- `GM-R1`: refreshed evidence classifies every current worktree and local branch
  by cleanliness, ancestry, divergence, remote custody, and plan state.
- `GM-R2`: P08 and P14 remain recoverable and published; neither is merged,
  rebased, installed, or live-executed by this plan.
- `GM-R3`: every removed worktree is clean, process-unowned, and attached to an
  integrated branch.
- `GM-R4`: every deleted local or origin ref is either ancestral to main or has
  a prior source-backed semantic/patch-equivalence cleanup disposition.
- `GM-R5`: the final catalog audit passes, the remaining worktrees are clean,
  and local `main == origin/main` after integration.

## Bounds

- No force push, rebase, reset, stash, runtime install, browser/provider action,
  scheduler control, or persisted-data cleanup.
- Do not delete P08, P14, `sync/upstream-browser-reliability`, divergent
  remote-only branches, or remote-only branches with unknown custody.
- Remote deletion is limited to exact integrated/cataloged lanes and the exact
  cleanup candidates already adjudicated by Plan 0308.

## Definition Of Done

The only linked worktrees and local topic branches are active or deliberately
retained, completed branch custody is closed locally and remotely within the
frozen target list, P08/P14 remain published and unmerged, the lane catalog is
current, and `main` is clean and equal to `origin/main`.
