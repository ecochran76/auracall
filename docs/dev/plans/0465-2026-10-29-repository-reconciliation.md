# Plan0465 — Repository, tracker and worktree reconciliation

State: CLOSED
Lane: P465
Branch: chore/reconcile-20261029
Target: main
Integration: merge
Owner: ecochran76 / Codex
Authority: operator requested repository/ticket reconciliation and removal of unneeded worktrees.

## Current State

Canonical main was984028624 before this documentation slice. The primary checkout
was clean on an integrated survey branch and352commits behind origin/main; local
main was fast-forwarded without rewriting history. All35 existing worktrees plus
one absent stale registration were inspected for tracked/untracked changes,
ancestry, patch equivalence, PR custody, ignored files, dependency symlinks and
live process references. The sole untracked file was a deferred deployment-readiness
draft; it was preserved as75a669eae and pushed on feat/deployment-readiness, not
promoted into an approved implementation plan or a new ticket.

29 clean worktree directories were removed and one absent registration pruned.
Every removed worktree's branch and exact checkpoint remain; no branch, commit or
remote ref was deleted. A verified complete Git bundle and per-worktree path/ref
map preserve rollback outside Git. Ignored content in removed directories was
limited to derived indexes/builds or node_modules links; the shared dependency
directory remains. Unique historical source or packet commits were preserved,
including the Bot409 discovery draft and414's pre-integration history. Patch
comparison is not substituted for source ancestry or installed acceptance.

Six worktrees remain: the primary checkout; two unmerged diagnostic PR checkouts;
and three integrated worktrees held by live browser/tooling/dependency references.
The three holds must not be removed until those references naturally disappear
or their owning runtime has an independently qualified migration. Cleanup does
not authorize stopping browsers or tools to free a path.

## Tracker reconciliation

| Ticket(s) | Current disposition |
| --- | --- |
|488|CLOSED as the completed TTL specification; PR482/483 and follow-through490/491/PR492 retain implementation and installed proof.|
|398|OPEN parent;409,411 and477 remain unmet.406/414 are closed.|
|409|OPEN, blocked on exact Bot resource controls; dependencies403/404/408 are closed and the native absence boundary is integrated.|
|411|OPEN, blocked on current workspace/publication qualification and a concrete approved selection;410 is closed.|
|477|OPEN, separate Instructions/Model defaults are still unqualified.|
|384|OPEN, source-qualified diagnostic repair in PR385; integration/installed qualification and provider incident attribution remain distinct.|
|377|OPEN and deferred; no approval retry or provider replay.|
|317|OPEN/needs-info; successful current selection does not reproduce the historical missing-Light defect.|
|311|OPEN/needs-info; installed collector diagnostic repair does not resolve completion timing at the historical deadline.|
|240/241/242|OPEN; integrated browser-centric neutral-desktop work is preserved, while attributed physical input/control/root acceptance remains. Purpose-specific Writing recovery is superseded.|
|11|OPEN upstream/fork reconciliation; no upstream merge or upgrade initiated.|

Tracker bodies now lead with current disposition and preserve the complete prior
specification/evidence below it. No acceptance boxes were manufactured, deferred
work reopened, labels/taxonomy changed or unresolved tickets closed.

## Open PR and branch custody

PR385 retains account-load diagnostics; PR481 retains utility-selection/wait and
structural-capture work. Their clean worktrees remain. Draft PR335 retains failed
live-follow acceptance and PR324 retains the read-only governance pilot; both
remain open in published refs, with no new live trial or pilot authority. The
paused P18 fairness canary and P53 affinity rollout refs are retained separately.
No unmerged code was silently merged or discarded during housekeeping.

## Current versus historical lane catalog

The prior106-row catalog is preserved byte-for-byte at
[historical snapshot](../lane-history/2026-10-29-pre-reconciliation.yaml).
Its pre-reconciliation audit reported126 metadata/custody problems, including
stale checkpoints, already integrated source marked active, shared umbrella-plan
aliases and absent historical branches. It is historical evidence, not an active
assignment surface, and is excluded from the current catalog audit. Moving a row
to history does not close its underlying plan, satisfy its wider acceptance or
grant resumption authority. Reconcile the original source and live gates before
resuming any historical packet.

The current ten-row catalog describes the four open PR lanes, two paused source
refs, the wider desktop acceptance lane and the three integrated/live holds.
Branch tips and remote custody are current; current planning metadata names the
actual remaining gate. Six integration/continuation plan headers are reconciled;
original execution records remain verbatim below them. The superseded Grok source
wave packet is retired in favor of Plan0458 without cancelling parent398.

## Validation and limits

Read-only GitHub preflight verified actor/target/capability; each tracker mutation
has an exact post-write readback. Every removal rechecked a clean status, expected
HEAD, retained branch and absence of live path references immediately before it.
The draft was checkpointed before cleanup and the all-ref bundle verified.
Current catalog parsing/metadata/custody, docs index and diff checks are the
relevant validation; no product code changed, so no product test rerun is claimed.
No CI, provider/browser operation, runtime install/restart, process termination,
remote branch deletion or unrelated repository work is included.

Private evidence and rollback receipts:
`~/.local/state/auracall-reconcile-20261029/`, including inventory-before,
removed-worktrees, tracker-receipts, the verified Git bundle, current/final lane
audits and final closeout. The final canonical merge and one Graphiti memory
receipt are retained there. The active CLI remains the issue374 preserved
composite; this repository reconciliation does not deploy current main.
