# Account-Mirror Changed-Frontier Reconciliation | 0381-2026-09-29

State: OPEN
Lane: P81
Work item: ecochran76/auracall#139
Source base: `origin/main` at `71aa56a30`
Branch: `plan/issue-139-change-frontier`
Target: `main`
Integration: merge

## Stable Objective

Make steady account-mirror reconciliation proportional to the changed or
genuinely incomplete frontier: acquire one lightweight provider-index epoch,
visit each selected conversation at most once in that epoch, reuse the visit's
detail and artifact evidence through materialization, and preserve enough
durable state to skip complete work and defer guarded or failed work.

## Fresh ChatGPT Interface Survey

The plan is grounded in a bounded read-only survey of the current installed
ChatGPT surface on 2026-09-29 rather than the historical sidebar model.

- Installed AuraCall `0.1.1` was attached to the already-running
  `wsl-chrome-3` ChatGPT managed browser profile at its existing DevTools
  endpoint. Chrome reported `153.0.8010.52`; the account-mirror scheduler
  remained operator-paused.
- The endpoint retained ten ready ChatGPT root targets: one visible and nine
  hidden. No target was opened, focused, navigated, reloaded, clicked, closed,
  or used to submit a prompt.
- The current root UI exposes `Chat` and `Work`, plus `Pinned`, `Projects`, and
  `Recents`; the visible root contained ten conversation links. This is a
  collection-oriented service surface, not just a legacy sidebar traversal.
- Existing `PerformanceResourceTiming` entries showed sanitized request shapes
  for global conversations, pins, pages, spaces, automations, task/usage data,
  and per-project conversation collections. These were historical entries from
  the existing root load, not requests caused by the passive inspection and
  not proof of which request could trigger provider throttling.
- No visible rate-limit warning was present and the provider guard contained no
  active cooldown. The survey did not trigger or dismiss a warning.

Survey interaction record, in order: read the local scheduler and guard state;
read the existing DevTools version/target list; enumerate matching targets;
inspect the selected target's accessibility/DOM projection; perform one bounded
read-only DOM and performance-timing evaluation. Physical provider actions:
zero. The implementation must preserve this distinction between an inspection
operation and provider traffic already represented in page-local timing data.

## Current Architecture Evidence

- `createChatgptAccountMirrorMetadataCollector` independently gathers session,
  project index, root rail, project conversations, then selected conversation
  details under separate budgets.
- `applyConversationFreshnessFrontier` already models cached summaries,
  fingerprints, incomplete rows, freshness state, and full-sweep versus
  steady-follow selection. The repair should evolve this seam, not replace it.
- `AccountMirrorConversationFreshness` already distinguishes fresh, stale,
  partial, missing-assets, terminal-unavailable, guarded, and unknown states,
  and retains detail/manifest/materialization timestamps and completeness.
- History materialization currently may materialize, refresh the conversation
  snapshot, and materialize again. That split allows duplicate route work even
  when retained visit evidence already contains the required artifact refs.
- The materialization service already has snapshot reuse inputs and a shared
  interaction governor, but selection and failure state are not yet one
  authoritative per-conversation work contract.
- Plan 0380 / Issue #138 established the mandatory provider-traffic governor;
  this plan consumes it and does not create a competing pacing or accounting
  path.

## Architecture Contract

1. A `ProviderIndexEpoch` represents one shared, sanitized root/project
   collection snapshot for a provider/account/runtime scope. It records
   coverage and stable fingerprints without retaining provider content.
2. Durable per-conversation work state records the index fingerprint, detail
   epoch/fingerprint, known artifact references, local materialization
   evidence, completeness, routeability, terminal/deferred reason, retry-not-
   before, and resumable checkpoint.
3. One pure planner maps the index epoch and retained state to exactly one of
   `skip`, `visit_once`, `materialize_retained`, or `defer`. An unchanged,
   complete row selects `skip`; a known missing local artifact can select
   `materialize_retained` without route work.
4. One governed conversation visit returns a `ConversationVisitBundle`
   containing detail evidence, artifact refs, route evidence, freshness epoch,
   and one physical-visit receipt. Downstream materialization consumes that
   bundle directly and cannot independently refresh the same snapshot unless
   the planner records why retained evidence is invalid or expired.
5. Checkpoint each terminal row outcome transactionally. Resume uses an epoch-
   scoped stable key/cursor and retained row state, not an array position that
   restarts already-complete work.
6. Admission budgets bind selected rows to governed physical actions before
   execution. Expected steady-state work is `O(index rows + changed rows +
   missing local assets)`; unchanged complete rows perform zero conversation
   visits, refreshes, or artifact resolution attempts.
7. Retained root-target reuse may be improved only through exact governed
   ownership. This plan does not close arbitrary existing tabs or assume that
   every retained target belongs to the account-mirror operation.

## Rate-Limit Signature And Interaction Ledger

Every provider-facing reconciliation action must append a sanitized record to
the authoritative interaction ledger with timestamp, operation/workload,
runtime and managed browser profile, exact lease generation, action class,
sanitized route shape, index epoch, conversation-work pseudokey, outcome,
warning state before/after, and cumulative pass counters. It must not retain
URLs, query strings, account data, provider content, cookies, headers, or raw
stable provider identifiers.

If the visible `Too many requests` warning or an equivalent provider classifier
appears, the operation must stop without dismissal, navigation, reload, or
retry. Persist a warning signature containing the classifier/version, sanitized
visible summary, source target class, first-observed time, cooldown/retry
horizon, open-target count, and the bounded preceding interaction window with
inter-action deltas and cumulative counts. Also record a sanitized summary of
available resource-path classes when already observable. This evidence supports
temporal correlation only; it must not claim which browser or network request
caused throttling. Full CDP network metering remains deferred.

## Execution Graph

The critical path remains single-owner because the planner, visit bundle, and
checkpoint schema converge on shared account-mirror types.

1. **P0 — Baseline fixtures.** Capture the current collection-oriented
   ChatGPT interface as provider-free fixtures and prove redundant
   visit/refresh/materialization behavior. Terminal condition: RED fixtures
   identify exact amplification without live provider work.
2. **P1 — Durable state.** Add versioned index-epoch and conversation-work
   state with migration/default behavior for existing caches. Terminal
   condition: old caches load safely and round-trip the new states.
3. **P2 — Pure frontier planner.** Implement deterministic action selection,
   retry horizons, stable dedupe, and resumable keyset checkpoints. Terminal
   condition: table-driven provider-free tests cover every action/state edge.
4. **P3 — Once-per-epoch visit bundle.** Have the ChatGPT collector produce
   detail plus artifact refs in one governed route visit and preserve current
   routeability, identity, lease, and warning contracts. Terminal condition:
   one selected row yields at most one physical visit receipt.
5. **P4 — Retained-evidence materialization.** Consume visit bundles or retained
   refs without a second snapshot refresh; persist terminal/deferred outcomes
   after every row. Terminal condition: timeout resume continues after retained
   complete work.
6. **P5 — Amplification and incident evidence.** Publish sanitized counters and
   bounded warning-signature context through the existing governor/ledger.
   Terminal condition: fixtures reconstruct the likely preceding behavior
   without provider identifiers or content.
7. **P6 — Integration proof and docs.** Run focused and adjacent provider-free
   suites, typecheck, lint/build as affected, structural and planning audits,
   and update user/operator contracts. A live canary, installed adoption, or
   scheduler resume requires a separate exact authority and is not acceptance
   for this source lane.

P0 fixture capture and P1 schema design can be investigated independently, but
P1 must land before P2. P3 and P5 may proceed after the planner contract is
frozen; P4 joins P3 and the durable state. P6 is serialized after all joins.

## Acceptance Criteria

- [ ] Provider-free fixtures represent the surveyed current collection model
      and demonstrate the redundant existing behavior.
- [ ] One lightweight shared index epoch precedes route selection; unchanged
      complete conversations perform zero route visits, snapshot refreshes,
      and artifact resolution attempts.
- [ ] A changed conversation is visited no more than once per freshness epoch,
      and one visit supplies both detail and artifact references.
- [ ] Retained, already-materialized, or duplicate assets do not cause
      conversation navigation or snapshot refresh.
- [ ] Guarded, failed, deferred, and terminal rows persist explicit eligibility;
      no row re-enters before its retry horizon.
- [ ] Resume after interruption continues after durably completed rows without
      resetting the changed frontier.
- [ ] Per-pass metrics expose index rows, selected actions, physical visits,
      reloads, snapshot refreshes, artifact resolutions/downloads, duplicates,
      deferred rows, and amplification ratios without sensitive identifiers.
- [ ] A provider-free warning fixture freezes work and persists the bounded
      sanitized warning signature plus preceding interaction timeline.
- [ ] Existing cache identity, routeability, integrity, traffic-governor,
      lease-generation, and `Answer now` prohibitions remain green.
- [ ] The source checkpoint passes targeted and adjacent tests, typecheck,
      affected lint/build, diff hygiene, CodeGraph, and planning/lane audits.

## Non-goals

- No HTTPS interception proxy, full CDP network meter, request-body capture, or
  causal attribution from performance timing.
- No scheduler resume, installed-runtime update, live provider acceptance,
  prompt submission, warning dismissal, or automated retry.
- No optimization tied only to volatile DOM selectors or the superseded
  assumption that ChatGPT is a single sidebar collection.
- No closure of arbitrary retained ChatGPT tabs.

## Stop Rules

- Stop provider work immediately on a warning, verification page, CAPTCHA,
  uncertain effect, missing exact lease, or unreadable authoritative guard.
- Stop rather than refreshing a conversation twice in one epoch; persist the
  incomplete reason and defer it.
- Stop before schema rollout if old cache migration cannot preserve current
  completeness, cursor, identity, and artifact-integrity evidence.
- Keep the account-mirror scheduler operator-paused throughout this plan-only
  and provider-free implementation lane.

## Current State

Issue #138's provider-traffic governor is integrated. The bounded current-
interface survey and source-flow analysis are complete, no warning was
triggered, and no physical provider action was performed. This planning packet
integrated through PR 142 at canonical merge receipt `fcf388fe8c9ffc56279d5952beff9a31abc22219`.
Issue #139 and this plan remain open for implementation, provider-free
acceptance, installation, and any separately authorized live canary.

## Current Next Action

Implement P0 as provider-free fixtures that encode the current shared
collection epoch and reproduce duplicate conversation refresh/materialization
without contacting ChatGPT.
