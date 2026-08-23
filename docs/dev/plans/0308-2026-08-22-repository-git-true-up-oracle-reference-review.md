# Repository Git True-Up And Oracle Reference Review | 0308-2026-08-22

State: OPEN
Lane: P01
Operational state: EXECUTION ACTIVE / PHASE 0 CHECKPOINT
Revision: 3 | 2026-08-23

## Stable Objective

Reconcile AuraCall's local branches, linked worktrees, and remote branch
custody into one current, auditable state without losing unpublished work.
Maintain the separate Oracle project as a non-authoritative research source for
narrow fixes worth cherry-picking and ideas worth adapting to AuraCall's own
purpose and architecture.

## Current State

The audit establishes this evidence baseline and one governance gap.

- Fresh `git fetch --no-tags origin` and `git fetch --no-tags upstream` both
  succeeded on 2026-08-22. `main`, `origin/main`, and local `HEAD` are exact at
  `68da5063cdeed6dfc1d40e3e46dbc66344634d06`; divergence is `0/0`.
- The repository has 18 local branches: `main`, 14 topic branches already
  ancestral to `main`, and three non-ancestral topic branches.
- The repository has seven linked worktrees. All seven have clean porcelain.
  Four non-main worktree branches are already ancestral to `main`; two clean
  worktrees retain non-ancestral selector branches.
- `fix/chatgpt-app-refresh` is clean, ancestral to `main`, and has no configured
  remote-tracking branch. Every other linked topic worktree is equal to its
  configured `origin/*` tip.
- The three non-ancestral branches require different adjudication:
  - `fix/chatgpt-advanced-effort-selector` is 125 commits behind
    `origin/main` and has two patch-unique commits.
  - `fix/chatgpt-advanced-effort-selector-main-refresh` is 123 commits behind
    `origin/main` and has three patch-unique commits.
  - `runtime-service-foundation` is 1,346 commits behind `origin/main` and has
    three non-ancestral commits, but `git cherry main` classifies all three as
    patch-equivalent to work already represented on `main`.
- The Git remote named `upstream` points to the Oracle project. Its historical
  common base with AuraCall is
  `2408811f7e395925e68f521faf3fd559c40fbfcd` from 2026-01-05.
  `upstream/main` is `083bba7e61f487ad3d99b42039d9f603f61dc4ff`
  from 2026-08-14. The histories differ by 517 Oracle-only commits and 1,784
  AuraCall-only commits across 428 Oracle-changed files.
- Operator clarification on 2026-08-23 establishes that Oracle and AuraCall now
  serve entirely different purposes. Oracle divergence is therefore not Git
  drift, a synchronization deficit, or a true-up completion gate. The legacy
  upstream-sync plan is historical context only.
- Oracle remains useful as a research source. A candidate can be accepted only
  as either a narrowly compatible patch worth cherry-picking or a concept worth
  reimplementing through AuraCall's current architecture and acceptance gates.
- The active planning audit passes with seven exact baseline findings accepted.
  The active-lane audit fails because `docs/dev/active-lanes.yaml` does not
  exist on `origin/main`, despite the adopted active-lane coordination policy.
- This audit refreshed refs and wrote planning documentation only. It did not
  merge, rebase, cherry-pick, push, delete a branch, remove a worktree, install
  code, or affect a runtime/provider.
- Execution began on 2026-08-23 after another no-tag fetch left
  `main == origin/main` at divergence `0/0` and the Oracle research snapshot at
  `517 Oracle-only / 1,784 AuraCall-only`. The dedicated branch is
  `chore/plan0308-repository-true-up`; the initial planning checkpoint precedes
  catalog publication, branch adjudication, or cleanup.

## Planning Metadata

These boundaries define ownership, write scope, and execution order.

- Parent: repository-state review requested 2026-08-22 and operator semantic
  correction on 2026-08-23. The former selective-sync plan at
  `docs/dev/plans/legacy-archive/0001-2026-04-08-upstream-sync-plan.md`
  remains historical evidence, not current authority.
- Critical-path owner/lane: `/root` / `p0308_repository_true_up`.
- Planning branch: `main` at audit start; execution should begin from a fresh
  `origin/main` checkpoint on a dedicated short-lived true-up branch/worktree.
- Target: `main`, only through the repository's normal validated integration
  path.
- Expected planning write set: this plan, `ROADMAP.md`, `RUNBOOK.md`, and
  `docs/dev/dev-journal.md`.
- Expected execution write set: `docs/dev/active-lanes.yaml`, bounded
  reconciliation and Oracle-review receipts under `docs/dev/notes/`, and only
  the source/tests/docs required for an individually accepted cherry-pick or
  AuraCall-native adaptation.
- Parallelizable tracks after the custody ledger is frozen:
  - branch/worktree custody and archival candidates;
  - bounded Oracle reference review by release and topic.
- Serialized critical path: snapshot -> custody ledger -> selector-branch
  adjudication -> catalog publication -> cleanup decisions -> optional Oracle
  candidate packets -> integration and final readback.

## Required Work

Execute the true-up in four bounded phases.

### Phase 0 | Freeze A Recoverable Evidence Baseline

Capture current evidence before changing repository custody.

1. Re-fetch `origin` without pruning for AuraCall custody. Fetch the Git remote
   named `upstream` only to refresh the Oracle research snapshot. Record exact
   local, remote, merge-base, tracking-branch, worktree, and porcelain evidence
   in a bounded note.
2. Record the 18 local branches, 30 actual `origin/*` branch tips plus its
   symbolic default ref, seven linked worktrees, and three non-ancestral local
   branches as the closed-world population for this packet.
3. Stop if any worktree becomes dirty, any tracked tip moves unexpectedly, or
   branch custody cannot be attributed. Preserve the evidence and replan; do
   not clean, stash, reset, rebase, or delete through ambiguity.

### Phase 1 | Reconcile Branch And Worktree Custody

Classify every local branch and linked worktree before proposing cleanup.

1. Create `docs/dev/active-lanes.yaml` from verified Git evidence. Register only
   branches that remain active or intentionally paused; record archival
   candidates separately in the reconciliation receipt rather than falsely
   labeling them active.
2. For the 14 local topic branches already ancestral to `main`, prove remote-tip
   equality or exact remote absence, plan disposition, and lack of unique work.
   Classify each as `ARCHIVED`, retained compatibility ref, or cleanup candidate.
3. For the four clean, merged, non-main linked worktrees, prove no process or
   operator workflow depends on the path before proposing removal. Worktree
   removal is a distinct cleanup action, not a consequence of merge ancestry.
4. Treat `fix/chatgpt-advanced-effort-selector` and
   `fix/chatgpt-advanced-effort-selector-main-refresh` as one competing selector
   family. Compare their five patch-unique commits against current selector
   behavior, Plan 0273/0274 acceptance, and focused tests. Preserve or port only
   behavior not already superseded by current `main`; never merge both branches
   mechanically.
5. Map the three `runtime-service-foundation` commits to their patch-equivalent
   `main` commits and retain that mapping in the receipt before classifying the
   branch as archival.
6. Obtain action-specific operator authority before deleting any local branch,
   remote branch, or linked worktree. Execute only exact named targets after a
   final clean/ancestry/readback check.

### Phase 2 | Study Oracle As A Separate Reference Project

Use Oracle only to discover concrete improvements relevant to AuraCall.

1. Record `083bba7e` as this review's Oracle research snapshot. Treat the 517
   Oracle-only commits as discovery input, not as a backlog AuraCall must
   integrate or classify exhaustively.
2. Review Oracle by recent release and high-value topic. Prioritize fixes or
   ideas relevant to AuraCall's browser reliability, model/API correctness,
   dependency safety, developer tooling, and tests. Ignore product-direction
   work that serves Oracle's bridge, offload, or MCP purpose without a concrete
   AuraCall use case.
3. Record only material candidates in a bounded ledger. For each candidate,
   capture the Oracle SHA or release, the problem it solves, the corresponding
   AuraCall surface, and one disposition:
   - `cherry-pick-candidate`: narrow patch with compatible semantics and history;
   - `adapt-candidate`: useful idea that must be implemented in AuraCall's own
     architecture;
   - `already-present`: AuraCall already has equivalent or stronger behavior;
   - `not-applicable`: tied to Oracle's different purpose;
   - `defer`: potentially useful, but no current AuraCall need justifies work.
4. Require a concrete AuraCall problem, acceptance criterion, and bounded write
   surface before promoting any research candidate into implementation.
   Interesting Oracle code alone does not create an AuraCall work item.
5. Open one short-lived branch/worktree for each accepted candidate packet.
   Cherry-pick only when the patch is genuinely narrow and compatible; otherwise
   implement the idea natively without importing Oracle's architecture.

### Phase 3 | Validate, Integrate, And Close

Validate each accepted outcome against its own authority boundary.

1. Validate catalog-only active-lane reconciliation against fresh
   `origin/main`. Missing, unequal, duplicate, or contradictory custody remains
   fail-closed.
2. For branch/worktree-only cleanup, verify exact porcelain, ancestry,
   patch-equivalence where used, remote existence, and remaining worktree/ref
   inventory before and after every authorized action.
3. For each accepted Oracle patch or adaptation, run focused tests first, then
   typecheck, touched-file zero-warning lint, build, relevant affected tests,
   and the proportional broader provider-free gate. Use CodeGraph for source
   impact and current indexed readback when source changes begin.
4. Integrate only green, coherent batches. Push the accepted checkpoint before
   changing lanes. Re-fetch and prove final `main == origin/main` after each
   integration.
5. Close this plan when the active-lane catalog is current, every local
   branch/worktree has an explicit retained or archived disposition, authorized
   cleanup has exact receipts, and the initial Oracle reference review records
   its bounded material candidates. Unreviewed Oracle commits do not block
   AuraCall Git true-up.

## Non-Goals

The plan excludes synchronization with Oracle and unapproved cleanup.

- No attempt to synchronize AuraCall with Oracle, despite the historical Git
  remote name `upstream`.
- No requirement to classify, merge, rebase, or otherwise consume all 517
  Oracle-only commits.
- No assumption that a clean or merged branch is disposable.
- No branch, remote-ref, or worktree deletion without exact operator authority.
- No forced push, history rewrite, `git reset`, or unbounded pruning.
- No provider, browser, installed-runtime, scheduler, completion, connector,
  or tenant-data effect.
- No reopening closed feature plans merely because their branch refs remain.

## Acceptance Criteria

The plan is complete only when these evidence requirements pass.

- `TU-R1`: fresh evidence proves `main == origin/main` at the execution
  checkpoint and enumerates the exact closed-world branch/worktree population.
- `TU-R2`: all worktrees are clean or the plan stops with exact dirty-path
  ownership; no work is discarded or hidden.
- `TU-R3`: the active-lane audit passes against the published default-ref
  catalog, and every retained non-main lane has one unambiguous custody owner.
- `TU-R4`: all 14 currently merged topic branches, both selector branches, and
  `runtime-service-foundation` have evidence-backed retained/archive/cleanup
  dispositions.
- `TU-R5`: selector-family adjudication proves whether each of the five
  patch-unique commits is already superseded, still required, or rejected; no
  mechanical dual-branch merge occurs.
- `TU-R6`: runtime-foundation archival evidence maps all three non-ancestral
  commits to patch-equivalent `main` work before any deletion proposal.
- `TU-R7`: one bounded Oracle reference review at `083bba7e` records only
  material cherry-pick/adaptation candidates and explicitly treats the rest as
  outside AuraCall's synchronization obligations.
- `TU-R8`: every implemented Oracle-derived candidate passes focused and
  proportional provider-free validation, and final fresh readback proves
  `main == origin/main`. Zero implemented candidates is acceptable when the
  review finds no concrete AuraCall benefit.

## Bounds And Stops

These limits prevent research or cleanup from silently expanding the task.

- The initial execution packet may publish the evidence ledger and active-lane
  catalog, but may not delete refs/worktrees or implement Oracle-derived work.
- One semantic review pass is allowed for the competing selector branches. If
  current evidence remains ambiguous, retain both refs and record the blocker.
- Oracle research is bounded to the snapshot and topics named in its review
  packet. Later Oracle movement is optional future research, not AuraCall drift.
- A candidate packet may touch one primary architecture surface and its tests/docs.
  Cross-surface conflict or validation failure ends that batch and triggers a
  bounded replan.
- Any destructive cleanup, force push, release, publish, install, or live effect
  remains separately gated.

## Definition Of Done

AuraCall has a published, passing active-lane catalog; every local branch and
worktree has a current evidence-backed disposition; authorized cleanup leaves
no orphaned custody; Oracle is documented as a separate, non-authoritative
research source with only material candidates recorded; any accepted
cherry-pick or native adaptation is green and integrated; and fresh final
evidence proves local `main` exactly equals `origin/main`.
