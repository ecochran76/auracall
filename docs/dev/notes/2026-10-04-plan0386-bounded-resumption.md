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

Memory disposition at closeout: `unavailable` because narrow atlas discovery
supplied no qualified destination manifest; runtime is healthy but no memory
write was attempted. A machine-readable non-write receipt is preserved in the
curated acceptance JSON.

## Demonstrated startup blocker | 21:47 UTC

Pass2 cold launch restored 25 pages. No crawler lease was created. Passive exact
endpoint inspection proved the new blank target responds to Page.enable and
Runtime.evaluate, while the retained blank target times out on both. Native
browser exists and browser transport/window queries respond. The generic login
helper selects the last matching blank and awaits Page.enable without a deadline,
although live-follow cold launch only needs the endpoint and later creates its
own governed crawler. A provider-free real-helper regression is next; no further
live pass is authorized without a bounded repair.

## Second source checkpoint | 21:51 UTC

PR195 https://github.com/ecochran76/auracall/pull/195 merged source commit
`b20c907980a5417ac1707ddba74a8c1326f4d8e6` as canonical
`e747154d428b97ae25a624e9537d9ca1cb37ddf0`. Real helper regression
failed before repair and passed after; 37 focused startup/core/affinity/coordinator
tests, typecheck, lint and production build passed. Both review axes found no
accepted blocking finding for this narrow repair. It skips the login helper
only for endpoint-only about:blank; provider login URLs retain their old path.

Pass2 was explicitly paused at 21:48:24 UTC before custody or collector acceptance.
API service stop completed; its owned browser group was gone and strict exact
managed-directory absence proof returned true at 21:51:20.826. No fenced leases
remain. Next pass3 resumes only the existing wsl-chrome-3 completion; scheduler
cadence and other five paused completions remain contained.

## Installed pass3 start | 21:53 UTC

PR195 canonical runtime installed with five matching module hashes, including
manualLogin. API PID62077 started with durable scheduler pause and six paused
completions (the original five plus the packet-owned wsl-chrome-3 completion).
Explicit resume of only `328f88a8` queued its runner; no scheduler resume was used.
The runner is honoring persisted idle/backoff before physical work. This pass is
counted conservatively even while waiting. Passes4–5 are unused.

### Empty background-drain cadence containment

Pass3's runner initially deferred to foreground pressure at 21:53:10 and
21:54:10. The ordinary one-minute background drain runs at 21:54:07–21:54:10.738,
colliding with that wake; current local claim metrics select zero runs, zero
blocked and 289 not-ready, with no active foreground request or reservation.
The primary temporarily paused only that empty periodic background-drain timer
for this bounded proof, preserving foreground safeguards and scheduler pause.
Restore its original unpaused state at packet closeout. This is runtime isolation,
not a source safety-gate bypass or additional provider pass.

### Prior capture evidence verified again

At 21:57:33.697 UTC, read-only current cache/archive validation of prior successful
job `hmj_9fa5382a07a7423ca13cdccb3b2a62fd` proved the exact positive-control PDF
still present: 183246 bytes, SHA256
`88a11545071c98f40838e2115e92524608bf11eb8dfc15e2a46436805efe0362`,
local and archive hashes match, archive HTTP200. This is present cache parity
for historical capture, not a new capture or fresh provider identity assertion.
Pass3 preserves failure-backoff until 21:58:49.608 UTC rather than bypassing it.

## Budget-limited closeout | 22:04 UTC

The goal service marked this packet `budget_limited` at 504761/500000 tokens
(2734 service-reported elapsed seconds). No new substantive work began afterward.
Three of the maximum five live passes were used; no passes4–5 were initiated.
The one-hour wall deadline was not reached. The full objective is not complete.

Pass3 proved the installed startup repair: lease
`002b46eb-cb83-4def-8c94-9d8996dd7723`, target
`1C4DB5CB52EAF320100D2E9A940A3173`, created by API PID62077 after backoff
at 21:58:49 UTC, with one creation and zero adoption/navigation/reload/focus/close
counts. Passive root reads returned ready=complete and no visible verification,
login or rate-warning indicators. No normal refresh completed, passCount stayed
zero, and no automatic materialization job was created before budget stop.

The pre-refresh guard census is a source-confirmed unbounded await risk: it probes
all compatible page DOMs outside the collector timeout. Its exact contribution
to this pass's stall is unproven. A sampled retained root was responsive, so do
not claim every restored page is frozen or identify a definite blocking target.
The late passive network observation counted two Fetch requests (GET1/POST1),
zero document requests and zero observed HTTP/loading failures. Coverage excludes
startup/prior requests; this is not total-traffic or zero-prompt proof.

Containment: explicitly paused the packet-owned completion and confirmed all
six completions paused, including the original five. Stopped the API-owned
browser group to settle unbounded in-flight work. Strict exact-directory native
census proved browser absent at 22:04:35.579 UTC. API restarted with durable
scheduler pause; the temporary background-drain pause was restored to its
original unpaused state. No restored page was individually adopted or removed;
no prompt or Answer now action was issued. Root and repair-worktree pre-existing
dirty files remain untouched. API PID80665 final readback reports scheduler paused, zero completion runners,
six paused records, background drain unpaused, and one idle lease. That retained
lease is fenced; let the normal same-workload absence recovery reconcile it on
a later authorized resume.

Next bounded packet: first locate the actual pre-collector blocking await with a
red provider-free guard-census/cache-preflight regression, preserve unknown and
warning fail-closed behavior, then resume only `328f88a8` under new budget/live
bounds. Do not equate runner creation, old cache parity or prior identity evidence
with completed normal refresh or automatic materialization acceptance.
