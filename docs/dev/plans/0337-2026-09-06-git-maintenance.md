# Git Maintenance And Worktree Closure | 0337-2026-09-06

State: CLOSED
Lane: P30
Branch: chore/plan0337-git-maintenance
Target: main
Integration: merge
Revision: 1 | 2026-09-06

## Stable Objective

Complete Git maintenance, resolve interrupted merges, preserve unfinished work,
and close stale worktrees with verified custody and a current lane catalog.

## Current State

- Eleven stale worktrees were removed after fresh gates; four remain: active
  P08, unfinished P16, process-owned P27, and the existing main checkout.
- Browser WIP is remotely preserved at `3696f6dd3` with all seven original file
  SHA-256 values verified; P08 is clean at `2a1cd3e15`. P16 is published at
  `bd8738da9`. P18 now has stable paused custody at `317b6b37`.
- Missing P16/P24 catalog entries and checkpoint/overlap metadata are restored.
  The temporary maintenance local branch is deleted; its remote remains.
- Full fsck and commit-graph verification pass. Removal receipts record exact
  SHA, cleanliness, ancestry, generated ignored paths, and no process owners.

## Execution Graph

Owner: primary agent. Serialized mutations; independent read checks may batch.

1. Publish this plan and its roadmap/runbook/catalog wiring.
2. Snapshot all seven dirty entries on a named recovery branch, verify remote
   SHA and file content custody, and return P08 to its clean original tip.
   Publish unfinished P16 and preserve it as an active lane.
3. Reconcile catalog checkpoints, missing active lanes, and retention reasons.
4. For each frozen stale candidate, recheck clean status including untracked
   content, exact tip ancestry, remote reachability, and /proc cwd ownership.
   Remove only eligible worktrees with ordinary `git worktree remove`.
5. Keep published branch refs as inexpensive recovery custody. Retain the root
   P08 checkout, unfinished P16 checkout, process-owned P27 checkout, and one
   main checkout. Remove the temporary maintenance branch after integration
   only if it is fully represented by main; never force-delete refs.
6. Run final object integrity, worktree/conflict/custody, catalog and planning
   audits; close this plan and publish/read back clean main parity.

## Acceptance Criteria

- GM1: all 15 initial worktrees have evidence-backed final dispositions.
- GM2: no remaining worktree has an unmerged index or interrupted Git operation;
  the completed merge and all initial dirty files remain recoverable remotely.
- GM3: every removed worktree was clean, integrated and process-unowned at
  removal; active/unfinished or process-owned worktrees remain intact.
- GM4: P08 and P16 plus the browser WIP have exact verified remote custody;
  catalog metadata names active and deliberately retained work accurately.
- GM5: full fsck and commit-graph verification pass, planning/catalog audits
  pass or receive exact evidence-based disposition, remaining worktrees are
  clean, and local main equals origin/main after closeout publication.

## Bounds

No force push, rebase, reset, stash, process termination, browser/provider
operation, install/restart, scheduler action, or unaccepted source integration.
No remote ref deletion. Retain ignored non-regenerable material: inventory
ignored contents before removal and preserve anything not known generated.
Two attempts per failing maintenance unit, then reframe from evidence; one
reconciliation pass plus one verification correction. Checkpoint after each
custody transition and before destructive directory removal.

## Definition Of Done

All stale eligible worktrees are removed, retained worktrees have concrete
active/custody reasons, unfinished files are remotely recoverable, conflicts are
resolved, and the canonical maintenance receipt proves every criterion.

## Acceptance Evidence

- GM1/GM3: `docs/dev/notes/2026-09-06-plan0337-worktree-census.json` and
  `docs/dev/notes/2026-09-06-plan0337-worktree-removals.json` account for all
  15 initial directories: 11 removed, four intentionally retained.
- GM2: merge `18ce58652` and review `2a1cd3e15` are published on P08; all
  seven initial dirty files are preserved byte-for-byte at `3696f6dd3`.
- GM4: P08/P16/WIP/P18 remote tips are read back exactly. The WIP remains
  unaccepted; Git maintenance did not repair or integrate it. P27 remains
  process-owned and must not be removed until those owners independently exit.
- GM5: full fsck and commit-graph verification pass; final custody, conflict,
  planning/catalog, and parity readbacks are recorded in the closeout receipt.
