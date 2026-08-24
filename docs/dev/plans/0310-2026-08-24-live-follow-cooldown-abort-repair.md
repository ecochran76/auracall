# Live-Follow Cooldown Abort Repair | 0310-2026-08-24

State: OPEN
Lane: P03
Operational state: INTEGRATION_READY / PROVIDER-FREE
Branch: fix/plan0310-live-follow-cooldown-abort
Target: main
Integration: merge
Revision: 2 | 2026-08-24

## Stable Objective

Repair the live-follow history-materialization defect that combines a
conversation-context deadline with an equal renavigation cooldown, then leaves
the cooldown alive after the caller times out. Preserve deliberate provider
pacing while making cancellation cooperative and preventing a timed-out target
from mutating shared pacing state or delaying the next target.

## Current State

- Installed materialization job `hmj_6173bac8f6ea4c39bbdc0aea13963c36`
  succeeded once in 19.101 seconds, then four reads timed out after
  108.979-109.482 seconds with last stage
  `provider:chatgpt.skipSameRouteNavigation` and pending operation
  `provider:chatgpt.readConversationPayload`.
- The job request configured both the context deadline and renavigation
  cooldown at 120 seconds. Source and installed `0.1.1` both retain the
  independent 9-second in-page fetch abort and 10-second CDP evaluation bound.
- History materialization creates one shared interaction governor with a
  custom `sleep: (ms) => sleep(ms)` and no abort signal. The outer context read
  can therefore fail while the cooldown continues and later advances shared
  pacing state.
- Existing provider-free tests prove payload-evaluation settlement, sequential
  listener cleanup, and shared governor pacing. They do not reproduce aborting
  a cooldown that exceeds the remaining caller budget.
- The exact RED demonstrated that the context-read abort did not settle the
  shared governor's custom sleep. A second structural audit found that direct
  artifact/file materialization also retained the unexpanded 120-second
  context deadline even after snapshot refresh was corrected.
- Provider-free repair is accepted: exact and affected validation passes
  `329/329`; typecheck, scoped lint, build, CodeGraph, plan/goal audits, and
  diff hygiene pass. The broad suite passed 3,000 tests with 65 expected skips;
  its one unrelated native-download fixture failure passed on exact rerun and
  in two complete adapter runs.

## Planning Metadata

- Critical-path owner: `/root`.
- Expected source write set:
  `src/runtime/historyMaterializationService.ts`,
  `src/browser/llmService/llmService.ts`,
  `src/browser/providers/chatgptAdapter.ts`, and
  `packages/browser-service/src/service/interactionGovernor.ts`.
- Expected test write set:
  `tests/runtime.historyMaterializationService.test.ts` and the shared governor
  suite only if its public behavior changes.
- Expected documentation write set: this plan, roadmap, runbook, dev journal,
  fixes log, and active-lane catalog.
- Parallel work: none. RED, repair, lifecycle hardening, and acceptance are one
  serialized timing-sensitive path.
- Critical path: freeze plan -> exact RED -> abort-safe GREEN -> late-state
  regression -> affected/broad validation -> integration decision.

## Required Work

### Phase 1 | Exact Provider-Free RED

1. Exercise history materialization through its public service API with one
   shared governor, a cooldown longer than the remaining caller budget, and a
   deterministic abort signal.
2. Assert that the first timed-out target does not leave a sleeping provider
   operation alive and that a subsequent target is not delayed by a late
   timestamp update.

### Phase 2 | Cooperative Lifecycle Repair

1. Preserve the abort signal through the history-materialization governor and
   its injected deterministic sleep seam.
2. Preserve the default context acquisition budget in addition to the maximum
   configured pacing allowance for snapshot and direct materialization reads.
3. Keep normal configured spacing unchanged when no abort occurs.
4. Ensure an aborted admission never publishes a new interaction timestamp.

### Phase 3 | Validation And Reconciliation

1. Run the exact RED/GREEN, shared-governor tests, context/payload timeout
   regressions, affected runtime/browser suites, typecheck, scoped lint, build,
   planning/goal/lane audits, CodeGraph status, and diff hygiene.
2. Run the proportional broad provider-free gate before source acceptance.
3. Reconcile plan, roadmap, runbook, journal, fixes log, and lane custody with
   exact evidence.

## Non-Goals

- No weakening or removal of configured provider cooldowns.
- No automatic retry, scheduler-wide resume, broad completion control, or
  provider interaction during source repair.
- No ChatGPT selector, payload extraction, account binding, CAPTCHA, managed
  browser ownership, or archive availability change.
- No installed runtime update, API restart, browser launch, or live canary
  before provider-free acceptance and a separately recorded effect packet.

## Acceptance Criteria

- `LFCA-R1`: one deterministic provider-free test fails on the current source
  with the exact cooldown-outliving-caller symptom.
- `LFCA-R2`: aborting a history-materialization governor wait settles promptly
  through the caller's abort reason and does not wait for the configured
  cooldown.
- `LFCA-R3`: an aborted wait does not advance shared governor state; the next
  eligible target is admitted without inheriting a detached cooldown.
- `LFCA-R4`: non-aborted shared snapshot/materialization pacing still observes
  configured global and class cooldowns.
- `LFCA-R5`: source, tests, docs, planning, CodeGraph, Git, and proportional
  provider-free validation pass with no provider or installed-runtime effect.
- `LFCA-R6`: snapshot, artifact, and file context reads retain the default
  120-second acquisition budget after the maximum configured pacing allowance;
  the observed 120-second policy therefore receives a 240-second deadline.

## Bounds And Stops

- Maximum repair attempts: 2. Reframe the seam if the exact RED is not green
  after two materially distinct repairs.
- Maximum review/rework cycles: 1 closed-world pass against accepted findings.
- Hard stop on any live/provider effect until provider-free source acceptance
  is recorded.
- Hard stop if the repair requires reducing configured cooldown duration or
  weakening caller deadlines rather than fixing cooperative lifecycle state.

## Definition Of Done

- All six acceptance criteria have current authoritative evidence.
- The exact regression is green and would fail if abort propagation or
  no-late-state semantics regressed.
- No detached provider work, managed browser, debug instrumentation, or
  temporary fixture remains.
- Plan and custody state match the validated Git state.
