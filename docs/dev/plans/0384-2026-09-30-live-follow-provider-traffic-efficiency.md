# Live-Follow Provider-Traffic Efficiency | 0384-2026-09-30

State: CANCELLED
Lane: P84
Work item: ecochran76/auracall#151
Source base: `origin/main` at `aa385d2e1`
Branch: `plan/issue-151-live-follow-traffic-efficiency`
Target: `main`
Integration: merge
Successor: `docs/dev/plans/0385-2026-09-30-live-follow-provider-traffic-closeout.md`

## Disposition

Superseded on 2026-09-30 by Plan 0385 after P0 through P3 and the first P4
budget primitive were implemented. The stable objective, Issue #151 authority,
accepted evidence, branch custody, retry history, and live-safety constraints
carry forward unchanged. This is a control-plan replacement, not abandonment of
the objective and not authorization to resume the scheduler.

## Stable Objective

Make one bounded `wsl-chrome-3` steady-follow pass perform only locally
selected actionable provider work, with every controllable route visit and
navigation attributed to an admitted phase and bounded before execution, so a
future scheduler-resume decision is based on efficient physical behavior
rather than logical work counts alone.

## Current State

Plans 0380 through 0383 established the provider-traffic governor, changed-
frontier planning, cold-start affinity bootstrap, and exact post-shutdown lease
retirement. Their source repairs are integrated and installed. The account-
mirror scheduler is operator-paused and its unit is inactive.

The single bounded installed canary after Issue #146 completed without a
visible rate-limit warning and used all six admitted interactions. Direct CDP
observation nevertheless recorded 2,146 requests, including 2,133 to ChatGPT,
11 document requests, four explicit `Page.navigate` commands, and 56 frame-
navigation events including subframes. Metadata work loaded four chats while
merging 30 observed conversations with 285 retained conversations. One
materialization candidate was then selected but skipped with zero actionable
assets. Browser and listener cleanup succeeded, and Plan 0383 reconciled both
idle leases. The unresolved gate is traffic amplification, not lease cleanup.

Issue #151 is the governing work item. Live follow remains paused while this
plan proceeds provider-free. The final installed direct-CDP canary is a
separate gated slice and is limited to one attempt after all source gates pass.

P0 is source-complete. The accepted canary is preserved as a sanitized
provider-free fixture, and a typed reconciliation contract distinguishes
controllable navigations/top-level documents from subframes and hydration.
Unattributed controllable effects and phase-budget overages fail closed. P1 is
in progress: browser-service mutation receipts now preserve immutable traffic
phase and privacy-bounded work-key context, and the metadata collector binds
`bootstrap`, `index`, and `detail` contexts before adapter work. Completed
governor actions now reconcile with phase-attributed CDP effects without
retaining action IDs, routes, or source strings, and utility-affinity history
materialization binds its own phase before provider work. P1 is source-complete.

P2 is source-complete. Implicit steady-follow materialization now requires
positive local `retrievableMissing` evidence. A missing backlog reader, an
unreadable backlog, or `unknownOrDeferred` evidence alone cannot create that
job and therefore cannot open a provider route. Explicit `full_sweep` requests
retain their existing operator-requested fallback when no reader is configured.

P3 was revalidated against the integrated once-per-epoch visit bundle and
retained-snapshot path. One row fails closed above one navigation, current-pass
and retained conversation IDs are passed into materialization, and the history
service skips snapshot refresh for those exact IDs. Together with P2's no-job
gate, a zero-action candidate performs no provider route work. P3 is complete.

P4 is in progress. A provider-free budget wrapper now reserves controllable
phase actions before delegating to the shared governor, rolls back a failed
admission, and rejects over-budget work before the underlying action can begin.
Production pass-plan construction and warning/cooldown receipt integration
remain.

## Problem Boundary

Logical governor permits do not describe browser page hydration. One admitted
navigation can fan out into hundreds of provider requests, and phase-local
collectors can independently revisit or rehydrate a route even when retained
state already proves that no material action is available. Raw subrequest
counts are important observation evidence, but they cannot replace budgets on
the browser actions AuraCall directly controls.

This plan therefore governs both layers:

1. controllable actions: top-level route visits, `Page.navigate`, target
   creation/reuse, detail loads, snapshot refreshes, and artifact-resolution or
   download attempts;
2. observed effects: top-level documents, subresources, frames, warning state,
   and the phase in which each effect occurred.

## Architecture Contract

1. All AuraCall-initiated provider-browser actions continue through the shared
   browser-service traffic governor. Account-mirror code may add phase and work
   intent, but may not create another pacing or accounting seam.
2. A pass constructs a sanitized `ProviderTrafficPlan` before route work. The
   plan admits root/index, conversation-detail, and materialization actions by
   stable local work keys and rejects unplanned actions.
3. Actionability is decided from durable frontier, visit-bundle, manifest,
   library, and local materialization evidence before a provider route opens.
   A materialization row with no actionable asset produces zero provider route
   visits and zero artifact-resolution attempts.
4. One pass owns one route-use record per selected conversation. Metadata and
   materialization consume the same current-pass visit bundle or retained
   evidence. A second visit requires an explicit recovery reason, a fresh
   admission, and a receipt tied to the original route-use record.
5. The shared instrumentation seam attributes each controllable action and
   observed physical effect to `bootstrap`, `index`, `detail`,
   `materialization`, `cleanup`, or `unattributed`. Any top-level document or
   `Page.navigate` left `unattributed` fails acceptance.
6. Budgets bind to controllable actions before execution. Raw network requests
   are recorded and compared to the baseline, but variable provider hydration
   cannot silently consume or redefine the logical interaction budget.
7. The exact visible rate-limit classifier and bounded preceding interaction
   timeline remain authoritative. A warning freezes work without dismissal,
   navigation, reload, or retry and preserves its sanitized signature.
8. Receipts exclude provider content, cookies, headers, query strings, account
   identity, raw conversation identifiers, and response bodies.

## Execution Plan

The critical path is serialized under lane P84 because planning, route reuse,
and traffic accounting converge on the same account-mirror execution path.
The slices are individually bounded implementation packets; completing one
does not authorize the next live effect.

### P0 - Baseline and attribution contract

Status: COMPLETE (provider-free source)

- Outcome: encode the accepted 2,146-request canary as a sanitized provider-
  free fixture and define reconciliation between logical actions, CDP
  commands, top-level documents, frames, and subrequests.
- Expected write surface: account-mirror traffic metrics/receipt types,
  provider-traffic fixtures and tests, testing documentation.
- Required inputs: the Issue #151 evidence and existing Plan 0381 warning and
  amplification contracts.
- Validation: red fixtures demonstrate duplicate/unattributed route activity
  and distinguish top-level documents from subframes.
- Terminal condition: every baseline event is classified or explicitly marked
  `unattributed`; no provider or browser process is launched.

### P1 - Deep phase-aware traffic instrumentation

Status: COMPLETE (provider-free source)

- Outcome: extend the existing browser-service governor/ledger so callers
  attach a closed-vocabulary phase and local work key before each physical
  action, and observed CDP counters reconcile to those admissions.
- Expected write surface: provider-traffic governor and ledger, configured
  live-follow affinity, change-frontier metrics, focused browser-service and
  account-mirror tests.
- Required inputs: accepted P0 taxonomy and privacy contract.
- Validation: fixtures cover target reuse/creation, `Page.navigate`, document,
  frame, subresource, cleanup, and unattributed-event failure paths.
- Terminal condition: one receipt reconstructs phase totals without sensitive
  provider identifiers or a second instrumentation seam.

### P2 - Local actionability gate

Status: COMPLETE (provider-free source)

- Outcome: filter detail and materialization work from durable local evidence
  before any provider route action is admitted.
- Expected write surface: change-frontier planner/state, artifact recovery
  planner, conversation freshness/visit bundle, completion and materialization
  orchestration, provider-free tests.
- Required inputs: P1 admission contract and existing cache migration rules.
- Validation: table-driven fixtures cover complete, retained, missing,
  deferred, terminal, guarded, and zero-action materialization rows.
- Terminal condition: a locally nonactionable row produces zero route visits,
  navigations, snapshot refreshes, and artifact-resolution attempts.

### P3 - One-pass route reuse

Status: COMPLETE (provider-free source and revalidated integrated behavior)

- Outcome: make metadata, detail, and materialization share one current-pass
  route-use record and visit bundle, falling back to retained evidence without
  rehydrating the same conversation.
- Expected write surface: metadata collector, completion service, visit bundle,
  live-follow reconciler/coordinator, focused production-path tests.
- Required inputs: P2 actionability decisions and P1 receipts.
- Validation: changed, retained, retryable, and interruption/resume fixtures;
  one selected conversation has at most one ordinary route visit.
- Terminal condition: any second visit is rejected unless its explicit
  recovery admission and causal receipt are present.

### P4 - Deterministic budgets and warning correlation

Status: IN PROGRESS

- Outcome: bind phase budgets to the precomputed traffic plan, yield or stop
  before excess work, and correlate a detected warning with the exact bounded
  preceding action/effect window.
- Expected write surface: provider-work coordinator, polite policy, provider
  guard control, scheduler ledger/diagnostics, operator documentation and
  tests.
- Required inputs: P1 counters and P3 route-use semantics.
- Validation: budget exhaustion, cancellation, delayed warning, cooldown,
  restart, and unattributed-document fixtures.
- Terminal condition: no controllable action can occur without remaining
  phase authority; a warning persists its signature and stops the pass once.

### P5 - Integration and one installed acceptance

- Outcome: integrate, install the exact canonical merge, and—only after all
  provider-free gates are green—run one bounded direct-CDP canary with the
  scheduler still paused.
- Expected write surface: plan, active-lane record, dev journal, fixes log,
  testing/operator docs, and a sanitized acceptance note; source changes only
  for defects exposed before the live gate.
- Required inputs: focused and adjacent tests, typecheck, build, affected lint,
  diff hygiene, CodeGraph, planning/lane audits, exact install parity, and a
  clean zero-browser/zero-active-lease preflight.
- Validation: one canary, no automatic retry, continuous warning probe, exact
  CDP traffic capture, post-run process/listener/lease census.
- Terminal condition: acceptance criteria below pass, or the plan remains open
  with preserved evidence and no scheduler resume.

## Acceptance Criteria

- [ ] A no-action materialization fixture performs zero provider route visits,
      navigations, snapshot refreshes, and artifact-resolution attempts.
- [ ] One selected conversation is visited at most once per pass unless one
      explicit recovery action is separately admitted and receipted.
- [ ] Every top-level document request and `Page.navigate` reconciles to the
      precomputed route plan; any unexplained controllable activity fails.
- [ ] Phase counters and the direct-CDP observer agree for controllable actions,
      while subframe and subresource effects remain separately visible.
- [ ] Provider-free tests cover phase attribution, local filtering, route
      reuse, budget exhaustion, cancellation, warning correlation, and resume.
- [ ] Existing identity, lease-generation, traffic-governor, cooldown, privacy,
      cleanup, and `Answer now` prohibitions remain green.
- [ ] Focused and adjacent tests, typecheck, production build, affected lint,
      diff hygiene, CodeGraph, and active-plan/lane audits pass.
- [ ] The exact canonical merge is installed byte-identically before live
      acceptance.
- [ ] The sole final canary performs no more than equivalent one-pass work,
      records fewer than four `Page.navigate` commands and fewer than 2,146
      total requests, produces no unexplained top-level document, shows no
      visible rate-limit warning, and leaves no active/bad lease, owned browser
      process, or DevTools listener.
- [ ] The scheduler and scheduler unit remain paused until the operator makes a
      separate post-acceptance resume decision.

## Non-goals

- No HTTPS interception proxy, request/response-body capture, or generalized
  network meter. Those remain deferred until this deeper action seam proves
  insufficient.
- No scheduler resume, prompt submission, warning dismissal, or automated live
  retry.
- No arbitrary closing, focusing, reloading, or adopting unrelated ChatGPT
  tabs.
- No provider-specific pacing fork outside the shared browser-service
  governor.

## Stop Rules

- Stop live work immediately on a visible rate-limit warning, CAPTCHA, human-
  verification page, uncertain effect, identity drift, missing exact lease,
  unreadable guard, unattributed top-level document, or exhausted budget.
- Preserve the warning signature and interaction timeline without clicking
  `Got it`, navigating, reloading, or retrying.
- Stop before P5 if source/install identity, scheduler posture, browser census,
  lease census, or CDP observer coverage is ambiguous.
- A failed live canary is terminal for this plan turn: record it, clean up only
  exact owned state, and replan provider-free.

## Definition of Done

Issue #151 may close only after all acceptance criteria are checked with
source, integration, installed-runtime, and live evidence recorded in the plan
or linked acceptance note. Closing the issue does not resume the scheduler.
