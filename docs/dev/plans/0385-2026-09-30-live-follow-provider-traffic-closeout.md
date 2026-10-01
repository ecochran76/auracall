# Live-Follow Provider-Traffic Closeout | 0385-2026-09-30

State: OPEN
Lane: P84
Work item: ecochran76/auracall#151
Predecessor: `docs/dev/plans/0384-2026-09-30-live-follow-provider-traffic-efficiency.md`
Source base: `origin/main` at `3912b3cb1bbaaf4ba8663a4508fe7cd4d5106f53`
Implementation checkpoint: `f1db89bb1061922848f6ceb6fa2d09ca7a6381d8`
Branch: `plan/issue-151-live-follow-traffic-efficiency`
Target: `main`
Integration: merge

## Stable Objective

Complete Issue #151 as one governed outcome: make an installed bounded
`wsl-chrome-3` steady-follow pass execute only preplanned actionable provider
work, account for every controllable browser effect, stop and preserve evidence
on a visible rate-limit warning, and prove the result with one final direct-CDP
canary while the scheduler remains paused.

## Current State

The branch is published through the Plan 0385 control checkpoint `f43eede84`.
Plan 0384's
P0 through P3 outcomes are provider-free complete, and its first P4 primitive
can reject over-budget actions before delegating to the shared governor. The
Gate A is in progress: the real refresh path now creates a staged controller,
freezes bootstrap/index authority before collection, freezes detail authority
after frontier selection, and yields after one planned detail read rather than
attempting a second navigation. In-page actions are no longer mislabeled as
route visits. Materialization-path budgeting, exact per-row work keys, and
recovery admission still remain before Gate A can close. The remaining work is
the single end-to-end chain defined by Gates A through F:
production pass-plan enforcement, warning/cooldown correlation, canonical
integration, exact installation, one live canary, and issue reconciliation.

The scheduler remains operator-paused and its unit inactive. No live provider
attempt has been used by this successor.

## Why This Successor Exists

Plan 0384 correctly found and repaired separate defects, but its remaining P4
and P5 work was being driven as successive implementation slices. That made
local code progress easier to see than the end-to-end contract. This successor
replaces that packet sequence with one completion plan. A checkpoint may
preserve recoverability, but it does not redefine completion or create a new
approval gate.

The accepted Plan 0384 evidence is inherited rather than repeated or reopened:

- the 2,146-request direct-CDP baseline and its sanitized fixture;
- phase and privacy-bounded work-key attribution in shared governor receipts;
- local materialization actionability requiring positive
  `retrievableMissing` evidence for implicit steady follow;
- once-per-pass conversation route-use and retained-snapshot reuse behavior;
- provider-free traffic observation and pre-delegate budget rejection;
- the current focused 180-test, typecheck, build, and active-plan audit passes;
- zero provider/browser activity during source implementation;
- paused scheduler and inactive scheduler unit as the required operating
  posture.

## Remaining Outcome Gap

The source has the primitives but not yet the production proof chain. The live
collector and materializer must consume one deterministic pass plan before
route work; budget exhaustion and warning/cooldown evidence must converge in
one receipt; the canonical merge must be installed exactly; and one installed
canary must demonstrate less physical provider traffic without lease, process,
listener, attribution, or warning regressions.

No intermediate test count, commit, pull request, install, or clean canary
alone closes the issue. Every gate below must have current evidence.

## Controlling Design

### One pass-plan authority

The completion path constructs one sanitized provider-traffic plan from local
state before the corresponding physical work begins. It owns the admitted
phase, stable privacy-bounded work key, effect kind, and maximum count. The
shared browser-service governor remains the sole execution seam; account-mirror
code supplies intent and may not introduce a parallel pacing or accounting
system.

Planning may be staged only where provider discovery is itself required to
identify later exact work:

1. bootstrap and index authority is frozen before bootstrap/index work;
2. the deterministic local frontier freezes exact detail authority before any
   detail route opens;
3. positive local materialization evidence freezes exact materialization
   authority before any materialization route opens.

Staging cannot retroactively authorize an effect, widen a consumed budget, or
turn an unplanned action into an attributed action.

### One observation and stop receipt

Completed governor mutations and direct-CDP observations reconcile into one
sanitized receipt. It keeps top-level documents, explicit `Page.navigate`,
target creation/reuse, in-page actions, subframes, and hydration requests
semantically distinct. It stores neither provider content nor raw account,
conversation, route, query, header, cookie, response-body, or action-ID data.

The visible warning classifier remains authoritative. Detection atomically
freezes new admissions and records the warning signature, phase totals,
budget state, and bounded preceding interaction/effect window. Automation must
not dismiss, reload, navigate, retry, or continue after detection.

### One completion controller

This plan is the controller for the remaining loop. There are no independent
P4/P5 implementation campaigns. Work proceeds through the gates below in
order, repairing discovered defects provider-free and rerunning the affected
gate. The final live gate has one attempt and no automated retry.

## Completion Gates

### Gate A - Production enforcement

Wire deterministic staged pass-plan construction into the real metadata and
materialization paths. Every controllable provider action must reserve matching
phase authority before the underlying governor begins. Preserve exact
conversation route reuse, explicit full-sweep semantics, cancellation, cleanup,
and rollback when delegate admission fails.

Evidence required:

- a production-path test rejects unplanned or over-budget work before the
  underlying governor is invoked;
- a no-action materialization pass records zero route visits, navigations,
  snapshot refreshes, and artifact-resolution attempts;
- one selected conversation has at most one ordinary route visit;
- explicit recovery requires a separate causal admission and receipt;
- in-page actions are not misclassified as route visits;
- cancellation and failed delegate admission cannot leak reserved capacity.

### Gate B - Warning and cooldown correlation

Join budget state, phase counters, warning classification, and cooldown/stop
state in the installed-runtime receipt path. A warning observed during or after
the last admitted action must remain attributable to the bounded preceding
window and terminate the pass once.

Evidence required:

- provider-free fixtures cover immediate and delayed warning detection,
  cancellation, cooldown persistence, restart/readback, and an unattributed
  top-level document;
- a warning blocks all subsequent provider admissions without clicking
  `Got it`, reload, navigation, or retry;
- the preserved signature and interaction timeline remain privacy-safe;
- scheduler diagnostics can distinguish budget exhaustion, warning stop, clean
  completion, and cleanup failure.

### Gate C - Source and integration acceptance

Validate the complete production path rather than only new helpers. Run focused
and adjacent tests, affected tests, typecheck, production build, affected lint,
diff hygiene, CodeGraph sync/impact review, plan audit, and active-lane audit.
Any failure caused by the change is repaired before review; unrelated failures
are recorded with evidence and do not become silent exclusions.

Create the implementation pull request from the published checkpoint, review
the actual diff against this plan, merge through the repository workflow, and
record the canonical merge SHA. The merged source—not the topic-branch build—is
the only install candidate.

### Gate D - Exact install and inert preflight

Build and install the canonical merge, then prove byte or artifact identity for
the touched runtime surfaces. Before any provider work, read back:

- installed identity and service health;
- scheduler posture and unit inactivity;
- zero owned `wsl-chrome-3` browser processes;
- zero DevTools listeners for the exact runtime;
- zero active, bad, retiring, or otherwise unreconciled exact-scope leases;
- direct-CDP observer readiness and visible-warning probe coverage.

Ambiguity fails closed. Cleanup may touch only exact owned state and must be
followed by a fresh process, listener, and lease census.

### Gate E - Single installed direct-CDP acceptance

With the scheduler still paused, run one bounded real AuraCall pass under
continuous direct-CDP observation. Do not perform a preparatory provider
refresh, manual route walk, automated retry, or unrelated tab adoption. If a
warning, CAPTCHA, human-verification page, identity drift, unreadable guard,
missing lease, exhausted budget, or unattributed controllable effect appears,
stop immediately and preserve evidence.

The canary passes only if it:

- performs no more than equivalent one-pass logical work;
- records fewer than four explicit `Page.navigate` commands;
- records fewer than 2,146 total requests;
- reconciles every top-level document and explicit navigation to the frozen
  plan;
- keeps subframes and subresources separately observable;
- shows no visible rate-limit warning;
- leaves no active/bad lease, owned browser process, or DevTools listener after
  exact cleanup.

The live attempt limit is one. A failed or ambiguous attempt ends live work,
keeps the scheduler paused, records the signature and timeline, and returns the
defect to provider-free diagnosis under this same objective. It does not
authorize a second canary.

### Gate F - Reconciliation and issue disposition

Update this plan, the active lane, dev journal, fixes log, testing/operator
documentation, and a durable sanitized acceptance receipt with the canonical
merge, installed identity, commands, counters, stop state, and post-run census.
Reconcile the issue and pull request to those artifacts.

Close Issue #151 and this plan only when every acceptance item is evidenced.
Issue closure does not resume the scheduler. Scheduler resume is a separate
operator decision after acceptance.

## Acceptance Ledger

- [ ] Production metadata and materialization paths enforce a frozen staged
      traffic plan before each controllable action.
- [ ] No-action materialization produces zero provider work.
- [ ] One selected conversation is visited at most once absent separately
      admitted and receipted recovery.
- [ ] Every top-level document and explicit navigation reconciles; unexplained
      controllable activity fails closed.
- [ ] Phase counters agree with direct-CDP controllable effects while frames
      and hydration remain distinct.
- [ ] Warning correlation freezes admissions and persists a privacy-safe
      signature plus bounded preceding interaction/effect window.
- [ ] Provider-free coverage proves budget exhaustion, rollback, cancellation,
      delayed warning, cooldown, restart, and unattributed-document behavior.
- [ ] Existing identity, lease-generation, traffic-governor, cleanup, privacy,
      cooldown, and `Answer now` prohibitions remain green.
- [ ] Source, integration, plan/lane, and exact-install gates pass against the
      canonical merge.
- [ ] The one installed canary meets the navigation/request thresholds and
      leaves a clean process/listener/lease census.
- [ ] Scheduler posture and unit remain paused pending a separate operator
      decision.

## Bounds and Checkpoints

- Primary controller: the root agent executing Issue #151 on lane P84.
- Implementation attempts per failed acceptance behavior: at most two before
  local redesign or explicit blocker recording.
- Broad independent drift-discovery reviews: at most one for the inherited
  goal; closed-world verification thereafter.
- Live provider attempts: exactly one final canary, with no automatic retry.
- Durable checkpoints: after Gates B, C, D, and E, and before any context
  handoff or live effect.
- Each checkpoint records state transition, acceptance state, progress class,
  evidence, blockers, and the next action or stop reason.
- Provider-free defects may be repaired and retested within standing authority.
  A material change to objective, live-attempt bound, provider/account scope,
  privacy contract, or scheduler-resume exclusion requires a new decision.

## Non-goals

- No HTTPS interception proxy, response-body capture, or generalized network
  meter; that remains deferred unless deep action instrumentation is disproven.
- No scheduler resume, prompt submission, warning dismissal, automated live
  retry, or automatic `Answer now` click.
- No unrelated ChatGPT tab closing, focusing, reloading, or adoption.
- No provider-specific pacing fork outside the shared governor.
- No reopening accepted Plan 0384 work merely to improve tests or documents.

## Definition of Done

This plan is done only when the acceptance ledger is fully checked with current
source, canonical-integration, installed-runtime, direct-CDP, and cleanup
evidence; Issue #151 is truthfully reconciled; and the scheduler remains paused
for a separate resume decision. If the sole canary fails or any required proof
is ambiguous, the plan remains `OPEN` or becomes `BLOCKED` with the exact
unmet criterion and preserved evidence. Completed slices, commits, or elapsed
effort never substitute for that outcome.
