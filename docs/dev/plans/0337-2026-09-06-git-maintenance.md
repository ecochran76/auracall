# Git Maintenance And Worktree Closure | 0337-2026-09-06

State: OPEN
Lane: P30
Branch: chore/plan0337-git-maintenance
Target: main
Integration: merge
Revision: 1 | 2026-09-06

## Stable Objective

Complete Git maintenance, resolve interrupted merges, preserve unfinished work,
and close stale worktrees with verified custody and a current lane catalog.

## Current State

- Initial census: 15 worktrees. P08 has seven dirty entries; P16 is clean but
  lacks a remote branch. Twelve other worktrees are clean, integrated into
  origin/main, and have no process cwd owners; one of these is reused for this
  maintenance lane. P27 is integrated but retains live process cwd owners.
- Earlier thread work completed the interrupted P17-into-P08 merge at
  `18ce58652` and published its review follow-up at `2a1cd3e15`.
- Object maintenance and full fsck passed. Local main was fast-forwarded from
  `4767e79a` to verified origin/main `d942e80d` before ancestry classification.
- Browser edits have review findings and must be retained as unaccepted WIP;
  repairing or deploying that browser behavior is outside Git maintenance.

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
