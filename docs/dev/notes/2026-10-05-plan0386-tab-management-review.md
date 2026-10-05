# Plan 0386: tab-management algorithm review

Status: historical review complete; successor tab-lifecycle repair accepted in Plan0390. Broader asset acceptance OPEN.

The user requested algorithm review after excessive restored tabs and a cleanup
that removed saved session state. Cleanup does not prove lifecycle correctness.
The installed `ask-matt` skill was not found; the available Matt diagnosing-bugs
workflow supplied the provider-free reproduction discipline. No live pass ran.

## Confirmed findings

1. **Blocking: owned cold startup bypasses physical census.**
   `prepareColdStartTarget` in `src/accountMirror/liveFollowTabCoordinator.ts`
   returns null immediately for `coldStartTargetPolicy: "create"`. Production
   live-follow selects that policy. It creates a tracked crawler while restored
   pages remain untracked. The existing test explicitly expects restored tabs
   to remain open and only one registry entry: lease count is not tab count.
   Installed session quarantine prevents the observed endpoint-only cold
   restoration case, but the coordinator does not validate its postcondition.

2. **Blocking against a literal one-tab-per-process requirement: uniqueness is
   per workload, not process.** `reserve` in the tab lease registry rejects the
   same target or same workload; it does not reject a different workload owned
   by the same PID. Live-follow keys include completion operation IDs;
   ephemeral keys include utility/job operation IDs. A second completion in the
   same process can create another tab. This is current architecture, not proof
   of the intended process-level invariant. Do not silently impose one global
   API-process tab across unrelated accounts.

3. **Lifecycle risk: settlement retains tabs.** Live-follow settlement records
   meaningful use and idles its lease with a 15-minute TTL. Utility settlement
   does the same with a five-minute TTL and passes `tabLifecycle: "retain"`.
   Retirement closes eligible tracked idle tabs and verifies disappearance.
   Completed work therefore does not imply immediate physical tab closure.

4. **Blocking reconciliation gap: unleased pages are counted, not retired.**
   Configured maintenance reports `unleasedLiveTargetCount`; its close paths
   operate on known leases. Restored target IDs not in the registry are outside
   that retirement mechanism. Route-mismatched known targets are preserved.
   Preservation protects ambiguous custody but cannot count as clean lifecycle
   acceptance. Ordinary visible-login startup is also outside the installed
   endpoint-only quarantine condition.

## Provider-free reproduction and validation

Executed `pnpm tsx /tmp/auracall-tab-management-review.ts` against current source.
The fixture invokes the real live-follow coordinator and in-memory registry,
with browser I/O substituted by a mutable 32-page inventory. First cold
acquisition leaves 33 pages; second completion acquisition leaves 34. There are
two leases, both owned by the same PID, and zero target-census calls. The
at-most-one-physical-tab assertion exits 1. This proves the coordinator gap;
it does not simulate actual Chromium restoration or infer original tab provenance.

Existing coordinator, production utility-affinity, ChatGPT provisioner, and
tab-retirement suites all pass: 25 tests across four files. Green tests include
the explicit preservation behavior above, so they do not establish the user's
physical-tab invariant.

## Cleanup evidence and next repair

Native browser absence was verified at 2026-10-05T10:54:13.553Z. The current
Default/Sessions entry was renamed into a reversible managed-directory
quarantine. Remaining known tab-restore entries: zero. Preferences, cookies,
and login-data fingerprints were unchanged. Private contents were not logged.
Receipt: `/tmp/auracall-managed-session-cleanup-2026-10-05.json`.

Next repair should enforce correspondence between permitted physical pages and
workload ownership before provider navigation, bound terminal-job retention,
and validate cleanup across cold start, warm reuse, completion-to-child handoff,
expiry, cancellation, and restart. Tests must assert physical inventory as well
as lease records. Keep unrelated account scopes isolated, retain custody checks,
and preserve authentication. Do not spend the remaining live journey merely to
rediscover the provider-free failure.

## Successor acceptance

The Ask Matt router was subsequently located and used for Plan 0390. PRs 211
and 212 repair the source findings above. Installed actual-browser acceptance
is recorded in `2026-10-05-plan0390-installed-acceptance.md`; the broader asset
acceptance in Plan 0386 remains open. The original review evidence is retained.
