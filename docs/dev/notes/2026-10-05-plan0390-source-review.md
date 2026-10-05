# Plan 0390 serial source review

Reviewed by primary, without delegation. Fixed point:
35f3d5750fdabcb1e2a16c70084283dbe6dcd296. Frozen source:
5d494e1cd. Diff: `git diff 35f3d5750...5d494e1cd`; commit:
`fix(browser): reuse process tabs and expire unmanaged pages (#165)`.
Spec: Plan 0390 and live-follow operating-model contract. Standards: AGENTS.md,
architecture guardrails 0008, validation 0018, testing 0029, plus Matt's smell
baseline. PR 210 is a separately reconciled historical documentation snapshot.

## Standards

No accepted hard violation. Generic ownership, acquisition and deadline rules
remain in browser-service; ChatGPT route/warning classification remains in its
adapters. Revision fencing, file-backed locks and positive native absence
remain the mutation boundaries. No new provider endpoint or polling loop.
Possible data-clump concern is rejected: the existing TabLeaseScope supplies
the shared identity and the new acquisition helper consumes it directly.
Existing hostname-only coordinator route matching is nonblocking_backlog: it
predates this change, whereas prompt-process reuse checks exact origin. Its
origin-hardening can be reviewed separately without expanding this repair.

## Spec

Registry uniqueness is current OS PID within managed-browser/account scope.
The pre-I/O gate prevents the observed two-target creation race. Follow, child
utility and conversation paths all opt into process binding. Shared ownership
revisions change on each handoff; living foreign process ownership is refused.
Repeated physical census persists finite deadlines without refreshing them.
Blank/external pages are included. Retained follow survives TTL; lost follow
returns to TTL retirement. Both visible and endpoint-only managed cold launches
quarantine saved restoration inputs after native absence proof.

Installed parity, actual target reuse and elapsed-time expiry are needs_evidence
and remain blocking acceptance gates, not source defects. The selected broad
lane passes 1781 tests across 164 files with one skipped; typecheck/build pass.
The excluded prompt-structure file reproduces the same failure on clean PR 208;
no changed implementation is hidden by the exclusion.

Native HTTP 429 evidence uses the existing ledger's `visibleSummary` field. The
reason states HTTP 429 explicitly; classifier naming is nonblocking_backlog
because the existing version name refers to visible surfaces. Do not describe
that receipt as a visible UI warning.

Accepted findings: Standards zero blocking and one nonblocking backlog; Spec
zero source-blocking, two installed acceptance gates awaiting proof and one
nonblocking evidence naming concern.

## Closed-world restart remediation

Accepted Spec blocking candidate: an idle follow owner that stopped could retain
its exemption forever, and an active retained follow with a fresh heartbeat
could be marked lost solely by its old absolute deadline. Two reproductions on
PR 211 fail, then pass after the generic reconciler checks idle process liveness
and retained-follow absolute exemption. This is a bounded correction of the
restart/retention criterion. Standards: shared rule remains in browser-service;
no provider heuristic added. Forty-four focused checks, build and typecheck pass.
Final installed parity and physical proof remain the acceptance gate.

## Final acceptance disposition

Both installed needs_evidence gates are resolved by final-source parity and the
actual elapsed-time physical proof on 3e58471b2. The two restart blocking cases
are resolved by observed red/green checks and final installed identity. Accepted
source blocking findings remaining: zero on both axes. Nonblocking historical
origin/classifier naming concerns remain documented above. Broader provider asset
acceptance is outside this tab-lifecycle achievement.
