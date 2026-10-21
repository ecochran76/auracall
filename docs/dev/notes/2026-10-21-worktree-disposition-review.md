# Worktree disposition review — 2026-10-21

Read-only review after initial cleanup:13worktrees,5dirty,7clean unmerged checkouts
representing6distinct heads,1current clean checkout. Compare to origin/main at
8f085a542. Commands: git worktree list --porcelain; per-tree status --porcelain,
log origin/main..HEAD, diff --stat origin/main...HEAD; inspect dirty patches and
branch-specific source notes. Inventory raw receipt is private at
~/.auracall/acceptance/issue226-activation-20261021/worktree-review.json.
No pending work was discarded, merged, rebased or stashed during this review.
Initial cleanup already removed17clean merged trees and3missing registrations;
all branch refs remain. Table paths are under /home/ecochran76/workspace.local/.

| Worktree suffix (auracall...) | Verified work | Recommended handling |
| --- | --- | --- |
| root |25dirty status entries:3tracked docs plus untracked plans/evidence/.tmp |Preserve first; separate canonical instructions from chronological evidence. Reconcile journal entries against merged fixes and review untracked content before publication. Root main is behind remote; do not pull across dirty state.|
| -issue107-scope |3dirty code/test files,156insertions/3deletions; dead-owner recovery across tenant-scope drift |Highest implementation priority: snapshot into isolated branch, port onto current main, reproduce regression and retain live-owner fence. Do not merge raw old utility code over newer heartbeat/absence fixes.|
| -issue226-premium |2untracked evidence/plan paths, no tracked diff |Reconcile as historical heartbeat audit; archive/publish qualified evidence separately, then remove checkout.|
| -launch-plan |2tracked log diffs and4untracked acceptance paths |Reconcile original failed Instant and replacement success evidence separately; preserve both. Current branch HEAD already merged.|
| -live-follow-repair |1dirty historical acceptance JSON,19insertions/4deletions |Retain original plus correction as attributable history; do not overwrite old acceptance proof silently. Then retire checkout.|
| -0386-acceptance |4unmerged docs/evidence commits,7files |Preserve as latest historical messages/rate-limit diagnosis packet; reconcile into current notes without treating expired retry allowance as new execution authority.|
| -context-affinity-route |34unmerged commits,24files; PR335 OPEN DRAFT |Retain. Broad runtime/request/desktop changes overlap newer main fixes; inventory remaining unique behaviors and extract only demonstrated gaps. No wholesale merge.|
| -issue337-pr335-repro |Clean detached exact same HEAD e3ade5d3b as previous row |Checkout is redundant if no active process references it; remove checkout after preserving any ignored artifacts. Named PR335 branch retains commits.|
| -desktops-reconciliation |2unmerged documentation commits,8files |Reconcile operator decisions/publication receipts against shipped pool behavior. Preserve as historical design authority; no source implementation pending here.|
| -follow-continuation |1unmerged docs commit,3files |Archive as PREPARED NOT EXECUTING campaign recommendation. It explicitly says old budget/retry authority expired. No execution or scheduler resume implied.|
| -governance-resource-pilot |1unmerged commit,16files; PR324 OPEN DRAFT |Retain as separate governance decision. Policy changes, generators and generated context need fresh drift evaluation; do not mix with runtime fixes.|
| -issue226-readiness |2unmerged old commits; PR262 CLOSED superseded |Source/test patch ported in PR360; preserve branch/evidence, retire clean checkout after ignored-artifact/process check. Do not remerge old roadmap/runbook snapshots.|
| -issue325-attachment |Current serialized execution checkout |Retain as working lane until these closeout docs are integrated.|

## Handling order

1. Preserve dirty work with explicit snapshots/commits on appropriate branches;
   start with issue107's actual code change because it is easiest to lose and
   overlaps actively maintained utility recovery.
2. Consolidate evidence-only dirty trees without rewriting original failures.
3. Remove two redundant/superseded clean checkouts after ignored-artifact and
   active-process checks; keep refs and original evidence provenance.
4. Review PR335 for remaining unique functionality in bounded slices. Treat
   PR324 as an independent governance choice, and archive expired campaign prep.

This is a disposition review, not a security/content audit of every untracked
artifact, proof of test currency for old branches, or acceptance of their runtime
claims. Review bounds intentionally exclude executing provider/campaign work.
Memory forbidden: no explicit user request to save memory.
