# Installed Runtime And Git Maintenance | 0339-2026-09-09

State: OPEN
Lane: P32
Branch: chore/plan0339-runtime-git-maintenance
Target: main
Integration: merge
Revision: 1 | 2026-09-09

## Stable Objective

Confirm that the installed AuraCall user runtime is built from current
published `main`, then reconcile local Git and worktree custody without merging
unfinished lanes or discarding recoverable work.

## Current State

- Local `main` and `origin/main` are equal at `a5f777895` and the tracked
  worktree is clean.
- The supported user-runtime installer refreshed package `0.1.1` from this
  checkout. The managed API is healthy on its configured loopback port with a
  new process and zero restarts; all 522 installed `dist` files match the
  current build's aggregate SHA-256 inventory.
- Four worktrees entered review: active P08, unfinished P16, integrated P27,
  and this main checkout. P27's former process interlock is gone. P16 retains
  eight commits not on main and conflicts on current source and documentation.

## Execution Graph

Owner: primary agent. Git mutations are serialized.

1. Fetch and prune remote tracking state; prove clean main/origin parity.
2. Validate the affected current-main source, run the supported installer, and
   bind installed metadata, service state, status readback, CLI version, and
   whole-`dist` hashes to the current checkout.
3. Reconcile every worktree and relevant local branch against cleanliness,
   ignored contents, ancestry, remote custody, active-lane state, and `/proc`
   cwd ownership.
4. Remove only clean, integrated, remotely recoverable, process-unowned local
   custody. Preserve active, divergent, paused, recovery, and open-plan refs.
5. Update the lane catalog, roadmap, runbook, journal, durable lessons, and a
   machine-readable receipt; rerun Git integrity, catalog, plan, runtime, and
   local/remote parity gates before closeout.

## Acceptance Criteria

- IR1: installed metadata identifies this current-main checkout and package;
  the CLI and API report the expected version.
- IR2: the managed API is active with zero restart churn, `/status` is healthy,
  no completion is queued or running, and existing paused state is preserved.
- IR3: installed and current-build `dist` inventories have identical file
  counts and aggregate SHA-256 values.
- GM1: every linked worktree has an evidence-backed retain or close decision;
  only clean, integrated, remotely recoverable, process-unowned custody closes.
- GM2: unfinished P08/P16/P18/P29 and recovery refs remain intact; P16 is not
  mislabeled as a routine merge.
- GM3: object integrity, commit graph, active-lane/catalog, planning, clean-main,
  and origin readback checks pass or carry an exact documented disposition.

## Bounds

No provider prompt, browser interaction, scheduler/completion control, force
push, rebase, reset, stash, process termination, remote-ref deletion, or
integration of divergent feature work. The runtime install/restart is limited
to the supported user-runtime service installer requested by the operator.

## Definition Of Done

Installed-current proof and a durable Git custody receipt are published on
`main`; eligible local custody is closed, every retained lane has a concrete
reason, and local `main` equals `origin/main`.
