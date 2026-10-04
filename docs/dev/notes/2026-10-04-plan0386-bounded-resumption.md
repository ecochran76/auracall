# Plan0386 bounded resumption | 2026-10-04

Authority: user resumed at 21:21 UTC with 500000 tokens, one hour ending
22:21:31 UTC, Q2 full recovery/normal-refresh/automatic-runner acceptance, and
at most five live passes. Issue #165 remains open. Historic paused handoff is
preserved; this note records new evidence only. Other five operator pauses stay
unchanged. No prompt submission, Answer now click, CAPTCHA bypass or broad cleanup.

## Source and installation checkpoint

- Base PR193: `42d0b7c730b507cb77f537bad30c37598d070d3f`.
- Owned branch/worktree: `fix/issue165-follow-continuation` at
  `/home/ecochran76/workspace.local/auracall-follow-continuation`.
- PR194: https://github.com/ecochran76/auracall/pull/194; source commit
  `ce8ddf5cf4125c8af75aac59e732c797dbebde01`; merged canonical SHA
  `549ee0eaeffd092b1573bb564c38924ca3c218fa`.
- Real HTTP regression failed before change (zero refresh calls after explicit
  resume), passed after guarded configured reconciliation was added. Five
  focused startup/resume tests passed. Combined HTTP/completion/reconciler run:
  303 passed, one unrelated background-drain timing assertion failed. Unchanged
  PR193 base reproduced that identical failure (221 passed, one failed), and
  isolated background-drain rerun passed. Typecheck and build passed; touched-file
  lint: zero errors, 21 pre-existing warnings outside changed hunks.
- Serial Standards review: no accepted blocking finding; same guarded reconciler,
  existing capability flags, no new ownership/identity bypass. Serial Spec review:
  no accepted blocking finding for the source repair; full installed acceptance
  is still pending and is not inferred from runner creation.
- Canonical clean detached worktree built the exact merge SHA; installed user
  runtime matches SHA256 for HTTP server, configured affinity, crawler
  coordinator and native absence proof. API restarted durably paused, PID65103.
  Full hashes are in the derived acceptance receipt; installation log is private
  ephemeral `/tmp/auracall-plan0386-pr194-install.log`.

## Live-pass ledger

1. Conservatively counted inherited cadence, started 21:19:09.985 UTC;
   settled 21:34:45.228 UTC `refresh-blocked`, crawler heartbeat `stale-claim`.
   The previous PR193 refresh at 20:55 had matched identity but timed out on a
   conversation context read. Lease `d8aeb6dc-d049-469e-a7a1-827f2db8983d`
   was retired/closed at 21:34:44.238, revision9. Scheduler durably paused;
   no active fenced leases remained before installation.
2. Explicit resume at 21:42:49–21:42:52 UTC on installed PR194 created successor
   `acctmirror_completion_328f88a8-56b9-4274-bbe0-bb20f3aea435` and launched
   a real runner. Metrics: six active, one running, five paused. Cadence contained
   again by 21:42:54.969 UTC. Result pending.

Strict native census at 21:41:39.464 UTC proved the exact wsl-chrome-3 managed
browser absent after service stop. This does not replace PR193's earlier
same-workload absence/release proof or claim that PR194 released an idle lease.

Memory disposition remains pending until substantive closeout.

## Demonstrated startup blocker | 21:47 UTC

Pass2 cold launch restored 25 pages. No crawler lease was created. Passive exact
endpoint inspection proved the new blank target responds to Page.enable and
Runtime.evaluate, while the retained blank target times out on both. Native
browser exists and browser transport/window queries respond. The generic login
helper selects the last matching blank and awaits Page.enable without a deadline,
although live-follow cold launch only needs the endpoint and later creates its
own governed crawler. A provider-free real-helper regression is next; no further
live pass is authorized without a bounded repair.
