# Repository reconciliation — 2026-10-03

Issue #178; accountable operator ecochran76. Repository-only reconciliation.

Root moved from fix/p222-agent-browser-cdp-endpoint to main and fast-forwarded
through merged PR #177 at 9f651d766d06a570547406b5e81bf138f388fb34.
The root's untracked .tmp/ and ignored runtime/evidence files are preserved.
No installation, provider request, browser action or scheduler change ran.

## Worktree custody

Removed 32 clean worktrees whose exact HEADs are ancestors of canonical main.
Before removal, checked porcelain, ignored files and process cwd/command-line
ownership. Only dependency/build/index outputs were disposable; no additional
ignored evidence or running owner was found. Ordinary git worktree remove
succeeded without force. Eight absent detached registrations were pruned.
The adjacent JSON retains every removed path and HEAD. No local or remote
branch was deleted, so commit custody remains recoverable.

Six worktrees remain (including root):

- Root: canonical main, with pre-existing untracked .tmp/.
- auracall-issue107-cache-bypass: open PR #120, head 8a30ae34e.
- auracall-issue107-scope: three dirty files preserved exactly (lease restart
  reconciliation, configured utility affinity and production test).
- auracall-live-follow-canonical: clean detached installed-source checkpoint
  500619f6e; retained intentionally for runtime provenance.
- auracall-live-follow-repair: clean evidence/reconciliation lane.
- auracall-p222-cdp: root's three unpublished launcher commits moved to a
  dedicated clean checkout; published origin/fix/p222-agent-browser-cdp-endpoint
  at 939e7eda8ab1b4729a6a8a051e008fd204caef43. Client readiness/Plan 0222
  acceptance remains pending; source custody does not imply integration.

## Open integration opportunities

PR #120 is CONFLICTING. A non-mutating merge-tree check finds documentation
conflicts in ROADMAP.md, RUNBOOK.md, docs/dev-fixes-log.md,
docs/dev/active-lanes.yaml and docs/dev/dev-journal.md. The CLI-specific cache
bypass is absent from canonical main, so this is not a duplicate to close.
Retain it for a focused refresh, scoped tests and plan audit before merge.
No conflict resolution or source integration is claimed in this slice.

Other branches without worktrees remain retained. In particular the affinity
rollout aed59b6c8 still has the previously recorded two unpublished-to-main
commits; older recovery/operational branches require individual scope review.
Recent issue165 branch tips lacking ancestor status were squash-integrated
through PRs 171–177; absence from ancestor lists alone is not lost work.

Plan 0386 still has the archive-publication gate open. Installed ZIP/cache
success is recorded separately and does not authorize scheduler resume.
Graphiti discovery returned unrelated historical facts; current Git/forge and
canonical receipt evidence governed all decisions.

Validation: fetched remote main, exact ancestry and porcelain checks,
process/ignored-file checks, remote topic readback, merge-tree and forge
mergeability. This slice changes documentation only; no source tests required.
