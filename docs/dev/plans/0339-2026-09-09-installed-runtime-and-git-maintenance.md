# Installed Runtime And Git Maintenance | 0339-2026-09-09

State: CLOSED
Lane: P32
Branch: chore/plan0339-runtime-git-maintenance
Target: main
Integration: merge
Revision: 2 | 2026-09-09

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
- Four worktrees entered review. Integrated P27 passed every closure gate and
  its worktree was removed; its equal local/remote branch remains fully
  ancestral to main because P28 uses that branch as its historical integration
  target. Three worktrees remain: active/process-owned
  P08, unfinished/divergent P16, and this checkout. P16 retains eight commits
  not on main and has nine current content conflicts.

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

## Acceptance Evidence

- IR1/IR3: source commit `a5f777895` passed 53 affected tests and typecheck
  before installation. Metadata records installation at
  `2026-09-09T13:22:54.473Z` from this checkout; CLI/API report `0.1.1`; the
  current and installed 522-file `dist` inventories both hash to
  `61ba93eae16d60a4a1796afea0e9141c0a7771a19921d4084f2632c436ad3e82`.
- IR2: the configured `127.0.0.1:18095/status` endpoint reports healthy API PID
  `3183`, scheduled/no-foreground state, idle background drain, six paused
  completions, and zero queued/running completions. Systemd reports active,
  running, and zero restarts.
- GM1/GM2: P27 closure removed only generated ignored `dist/` and
  `node_modules/`; its clean local/remote tip was `f55e398f3`, it was ancestral
  to main, and `/proc` found no cwd owner. The local pointer was restored at the
  exact remote SHA when its removal made P28 integration verification
  nondeterministic. P08 is retained clean at its equal
  remote tip `9860b9d49` with 15 cwd owners. P16 is retained clean at its equal
  remote tip `bd8738da9`, eight branch-only commits, and nine content conflicts.
  P18/P29 and the named browser recovery ref remain intact.
- GM3: the durable machine-readable receipt is
  `docs/dev/notes/2026-09-09-plan0339-runtime-git-maintenance.json`. Final Git
  integrity, catalog, plan-library, clean-tree, push, and remote readback gates
  are recorded there and in Turn 575.
