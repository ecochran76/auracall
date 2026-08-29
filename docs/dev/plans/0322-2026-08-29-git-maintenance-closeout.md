# Git Maintenance Closeout | 0322-2026-08-29

State: CLOSED
Lane: P15
Operational state: ACCEPTED / INTEGRATED
Branch: chore/plan0322-git-maintenance-closeout
Target: main
Integration: merge
Revision: 2 | 2026-08-29

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
- Four clean integrated worktrees and 12 merged local topic branches are now
  removed. Twenty-nine exact origin refs were deleted: cataloged integrated
  lanes plus the cleanup candidates previously adjudicated by Plan 0308.
- Remaining custody is intentional: P08, P14, this temporary integration lane,
  local historical compatibility ref `sync/upstream-browser-reliability`, and
  remote-only divergent or unknown-custody history. P14 is published and its
  plan metadata now declares the cataloged merge method.

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

## Integration-Ready Evidence

- `GM-R1`: fresh fetch, worktree porcelain, ancestry/divergence counts, GitHub
  PR inventory, and the catalog auditor froze the complete local population.
- `GM-R2`: P08 remains equal to its origin branch; P14 is now published and
  equal to its origin branch. Neither was merged or executed live.
- `GM-R3`: all four removed worktrees were clean, integrated, and had no exact
  `/proc/*/cwd` owner beneath their paths.
- `GM-R4`: all 12 deleted local refs were ancestral to `origin/main`. Remote
  deletion was limited to integrated catalog lanes and Plan 0308's exact prior
  cleanup adjudications; divergent and unknown-custody refs were retained.
- `GM-R5`: final main integration, catalog audit, parity, and removal of this
  temporary lane remain the last serialized closeout step.

## Closeout

- P15 merged without conflict through `16832289`. The catalog binds its exact
  feature checkpoint and merge receipt while P08 and P14 remain open, clean,
  published, and unmerged.
- Final cleanup removes the P15 worktree and local/origin branch refs, then
  verifies the catalog from `origin/main`, clean remaining worktrees, and exact
  local/remote main parity.
