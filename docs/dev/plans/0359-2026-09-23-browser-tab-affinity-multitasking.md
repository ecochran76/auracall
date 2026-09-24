# Browser tab affinity and provider-safe multitasking | 0359-2026-09-23

State: OPEN
Lane: P52
Branch: feat/issue-46-browser-tab-affinity
Target: main
Integration: merge
Work item: ecochran76/auracall#46
Pull request: ecochran76/auracall#47
Plan version: 5

## Stable Objective

Replace AuraCall's managed-browser-profile-wide serialization of ordinary
provider work with provider-neutral, exact-tab ownership so independent
conversations and one live-follow routine can coexist safely in the same
managed browser profile. Bind each conversation workload to one browser tab,
bind each live-follow operation to its own crawler tab, retain and extend tab
lifetime on meaningful use, retire expired tabs safely, and enforce aggregate
tenant/provider interaction limits and provider-warning stops across every tab.

ChatGPT is the first provider implementation and acceptance target. The shared
lease, scheduling, accounting, and lifecycle contracts must remain
provider-neutral.

## Current State

- The operator authorized implementation with parallel subagents and calibrated
  model choice. P52 is owned by issue 46 and branch
  `feat/issue-46-browser-tab-affinity`.
- The current implementation authority is provider-free Packet 1 contract work
  plus the bounded Packet 2 registry adapter, ordinary in-envelope validation,
  repair, documentation, commit, push, and pull-request workflow. Installation,
  browser launch, provider interaction, scheduler control, and live acceptance
  remain outside this authority.
- Packet 1's first vertical tracer is GREEN: a separate provider-neutral
  in-memory tab-lease registry allows two conversation reservations and one
  live-follow crawler on distinct exact targets while rejecting duplicate
  target and workload ownership. A paired fixture preserves evidence that the
  compatibility dispatcher still serializes those targets by managed browser
  profile plus service. No production caller uses the registry.
- The provider-neutral lifecycle tracer now also covers atomic
  reservation-to-conversation rebinding, revision-fenced meaningful-use
  heartbeat, exact-workload idle/reacquire, two-phase target retirement, and
  fail-closed lost/restart-unverified target evidence. Generic discovery can
  consume the registry's exact fenced-target list without learning lifecycle
  internals.
- The file-backed adapter stores the entire versioned registry snapshot behind
  one cross-process lock and temp-file fsync/rename transition. Concurrent
  instances enforce the same target/workload uniqueness, and a restarted
  instance reconstructs the durable lease evidence without treating it as
  independently verified target liveness.
- The first provider-neutral interaction-admission tracer is GREEN. A warning
  observed by any runtime profile freezes every reserved or started workload
  for the same tenant/provider and precedes numeric availability. Short-lived
  reservations close concurrency races; settled plus in-flight conversation
  starts drive rolling hourly admission without double-counting; passive
  observations are audited without consuming a permit.
- Browser prompt execution currently acquires an `exclusive-mutating`
  operation keyed by managed browser profile plus service. Independent ChatGPT
  tab work therefore queues behind the current profile owner and may terminate
  as busy even when a separate tab could safely perform the request.
- `BrowserService.resolveServiceTarget()` returns a service-compatible tab and
  selection evidence, but there is no durable workload-to-tab lease registry.
- ChatGPT already supports explicit `tabTargetId`, retained scoped sessions,
  and `retain`, `retain-new`, and `dispose-new` tab lifecycles. Its retained
  session affinity is not a durable conversation-to-target binding.
- Prompt execution records target URL, target ID, and a discovered conversation
  ID during one run, but that association is not an independently managed lease
  reusable by later runs.
- Account Mirror live follow already has one active-operation contract,
  provider-work serialization, cadence controls, abortable pause, interaction
  governors, rate-limit warning detection, persistent cooldown, and hard-stop
  behavior. Its provider-wide lease currently prevents safe per-tab
  coexistence and its crawler does not own a durable dedicated tab.
- ChatGPT tenant defaults already limit execution to four concurrent chats,
  120 chat starts per hour, and 240 chat starts per day. The current gate derives
  usage from stored execution leases and `step-started` events; batch limits,
  live-follow pacing, materialization, direct CLI work, media work, and
  provider-warning guards remain separate evidence/control surfaces.
- Earlier isolated-tab and retained-session work proves the lower-level CDP
  primitives exist. This plan changes their ownership model rather than
  replacing those primitives.

## Required Invariants

1. One live DevTools target may have at most one mutating tab lease.
2. One provider conversation binding may resolve to at most one live target in
   one tenant/account and managed browser profile.
3. A leased tab is never eligible for generic service-tab selection by an
   unrelated workload.
4. A new-conversation request starts in a newly reserved tab. After the
   provider assigns a conversation ID, AuraCall atomically converts that
   reservation into an exact conversation binding.
5. An existing-conversation request attaches only to its verified bound tab or
   creates a new tab and performs one exact-route navigation before binding it.
   It never borrows a generic provider tab.
6. One active live-follow operation owns one dedicated crawler tab. It may walk
   many conversations sequentially, but no conversation workload may borrow
   or mutate that crawler tab.
7. Meaningful tab use extends the idle expiry. Passive status polling does not.
8. Retirement closes only the expired, attributable target after proving there
   is no active CDP operation or unresolved provider effect.
9. Recovery never reloads, renavigates, focuses, closes, or adopts a target
   owned by another lease.
10. Browser launch, shutdown, login, cookie/bootstrap, CAPTCHA/MFA, profile
    replacement, and other browser-profile-wide operations remain exclusive
    against all tab work.
11. Numeric interaction availability never overrides a provider warning,
    CAPTCHA, identity conflict, account mismatch, or persisted cooldown.
12. Provider interaction accounting is atomic across concurrent tabs. A permit
    reservation prevents two workers from passing the same remaining limit.
13. Persisted target IDs are locators, not proof of current ownership. Restart
    recovery must verify live target, exact route, account, and lease state
    before adoption.
14. Every effect-observed or outcome-unknown submission remains non-retryable
    unless existing exact reconciliation proves that another submission is
    safe.

## Domain Model

Introduce a provider-neutral tab lease record with at least:

- `leaseId`
- `runtimeProfileId`
- `managedBrowserProfile`
- `service`
- `tenantKey` or verified provider-account key
- `targetId`
- workload identity:
  - `conversation` plus `conversationId`
  - `new-conversation` plus reservation ID
  - `live-follow` plus completion/operation ID
  - bounded `ephemeral` operation ID where no durable affinity is needed
- lifecycle state: `active`, `idle`, `retiring`, `released`, or `lost`; target
  reservation and the initial active claim are one atomic transition, so no
  unowned persisted `reserved` state is exposed
- `acquiredAt`, `heartbeatAt`, `lastMeaningfulUseAt`, `idleExpiresAt`, and
  `absoluteExpiresAt`
- current sanitized route/target fingerprint
- owner run/operation locator and effect state
- retirement reason and final disposition

The registry needs atomic reserve, acquire, rebind, heartbeat, release, mark
lost, and retire operations. Its persisted projection must survive API service
restart without treating stale records as live authority.

## Interaction Accounting Contract

Create one append-only tenant/provider interaction ledger used by foreground
chats, direct CLI execution, response batches, live follow, Account Mirror
reads, materialization, media operations, and provider CRUD where applicable.

Each reservation/event records:

- tenant/account key, provider, AuraCall runtime profile, and managed browser
  profile;
- workload, run/operation, and tab lease IDs;
- interaction class and whether it is read-only or provider-mutating;
- reservation, start, settlement, and outcome timestamps;
- whether it starts a new conversation;
- effect state and provider-warning classification;
- sanitized failure/stop reason.

The initial interaction taxonomy must distinguish at least:

- conversation start;
- prompt continuation;
- navigation or reload;
- conversation/detail read;
- list/pagination read;
- artifact/materialization read;
- model, mode, tool, or project selection;
- provider mutation;
- passive observation that consumes no interaction permit.

Preserve the existing ChatGPT defaults of four concurrent chats, 120 chat
starts per hour, and 240 chat starts per day unless a separately reviewed
configuration change narrows them. Reuse existing per-minute interaction
governors. Do not raise any provider limit in this plan.

Any warning observed on any tab must project the tenant-wide provider guard
before another permit is issued. Live follow and foreground work must consult
the same guard and aggregate counters.

## Execution Plan

### Packet 1: Provider-free ownership contract and red fixtures

Outcome: freeze the tab-affinity state machine and demonstrate the current
profile-wide design cannot satisfy it.

Expected write surface:

- new tab-lease domain types and provider-neutral contract tests;
- dispatcher conflict-matrix fixtures;
- test helpers for fake DevTools target census and time control;
- plan/journal updates only outside that focused source/test surface.

Required fixtures:

- two simultaneous conversation workloads on different target IDs;
- one live-follow crawler coexisting with both conversations;
- duplicate acquisition of one target rejected atomically;
- generic tab discovery excluding leased targets;
- conversation reservation atomically rebound after provider ID discovery;
- heartbeat extension, idle expiry, and safe retirement;
- target disappearance and restart reconciliation;
- provider warning freezing every workload;
- exact counters for target creation, navigation, reload, focus, and close.

Terminal condition: deterministic fixtures are red for the current design and
the frozen provider-neutral ownership contract is reviewable. No production
call site uses concurrent tab mutation yet.

### Packet 2: Tab lease registry and conflict hierarchy

Outcome: implement in-memory and file-backed lease registries plus explicit
profile-control and tab-data-plane conflict rules.

Required behavior:

- browser-profile control operations conflict with every lease in that managed
  browser profile;
- independent exact-target tab operations do not conflict;
- two mutations to the same target conflict;
- browser startup remains single-flight;
- stale owner/process and stale target records fail closed until reconciled;
- file-backed transitions are atomic and replayable;
- lease/status readback contains no raw private provider content.

Terminal condition: provider-free lease, restart, conflict, cancellation, and
retirement tests pass while existing profile-wide control-plane tests remain
green. Production execution remains on serialized compatibility mode.

### Packet 3: Aggregate interaction ledger and admission gate

Outcome: replace partial execution-only accounting with an atomic shared
admission surface without removing existing guards.

Required behavior:

- short-lived reservations close concurrency races;
- settled ledger events drive hourly/daily usage;
- abandoned reservations expire without erasing history;
- existing tenant-limit status projects the new evidence basis;
- batch-local limits remain an additional narrower boundary;
- live-follow governors and persistent provider-warning cooldown feed the same
  admission decision;
- direct CLI, stored API/team execution, Account Mirror, materialization, and
  media paths cannot bypass applicable aggregate limits.

Terminal condition: concurrent fake-clock tests prove exact boundary behavior,
warning precedence, restart persistence, and no double-counting.

### Packet 4: ChatGPT conversation-tab affinity

Outcome: move ChatGPT new and existing conversation prompt execution onto exact
tab leases while retaining serialized compatibility mode as rollback.

New-conversation flow:

1. Reserve aggregate quota.
2. Create one new ChatGPT root/blank target.
3. Acquire that exact target lease.
4. Perform account, mode/model/tool, project, and composer preflight on that
   target only.
5. Submit once.
6. Observe the resulting exact conversation ID and route.
7. Atomically rebind the lease from reservation to conversation.
8. Return binding evidence and transition the tab to retained idle or bounded
   retirement according to policy.

Existing-conversation flow:

1. Resolve the conversation binding.
2. Verify live target, account, service, exact route, and conversation ID.
3. Attach without navigation when already exact.
4. When no valid binding exists, create a fresh target, navigate once to the
   exact conversation route, verify it, and bind it.
5. Never fall back to a generic service tab for mutation.

Terminal condition: provider-free ChatGPT fixtures prove two conversations can
submit and observe independently with zero cross-target navigation, reload,
focus, response capture, or cleanup.

### Packet 5: Dedicated live-follow crawler tab

Outcome: give each active live-follow operation one exact crawler lease without
weakening its existing safety controls.

Required behavior:

- one crawler tab per active provider/runtime completion operation;
- sequential traversal and scrape within that tab;
- no borrowing conversation-owned tabs;
- cadence waits release active interaction reservations while retaining only
  the bounded idle tab lease;
- pause/cancel abort active work before idle/retire transition;
- warning, CAPTCHA, identity drift, account mismatch, abort, and timeout stop
  traversal before any follow-on interaction;
- no recovery reload or navigation after a hard stop;
- materialization uses an exact conversation lease or a separate bounded
  retrieval lease, never an implicitly borrowed crawler tab.

Terminal condition: provider-free coexistence fixtures prove two conversation
tabs plus one crawler tab remain isolated and aggregate accounting is exact.

### Packet 6: Lifetime policy, reconciliation, and observability

Outcome: make tab retention bounded, explainable, and operable.

Expose read-only status for:

- conversation-to-tab bindings;
- live-follow crawler leases;
- lease state, age, last meaningful use, and remaining idle/absolute lifetime;
- aggregate reservations and settled quota usage;
- provider warning/cooldown state;
- queue/admission rejection reason;
- new-tab, navigation, reload, focus, adoption, and retirement counts;
- lost and orphaned targets requiring attention.

Retirement must be bounded, cancellation-aware, and target-specific. It may
never close the browser or another workload's tab merely to satisfy cleanup.

Terminal condition: restart/reconciliation and fake-clock lifetime suites pass,
and operator documentation explains configuration, status, and rollback.

### Packet 7: Installed and live ChatGPT acceptance

Outcome: prove the integrated provider-neutral design on ChatGPT in increasing
risk order. This packet requires separate installed/browser/provider authority
and exact account/profile selection before it begins.

Acceptance progression:

1. Install exact canonical source and prove source/runtime byte parity.
2. Verify API/service health and exact ChatGPT identity without a prompt.
3. Run one bounded two-conversation smoke with distinct markers.
4. Reconcile both exact conversation routes and responses read-only.
5. Run one bounded coexistence smoke with those two conversation leases and one
   live-follow pass.
6. Verify zero cross-tab navigation/reload/focus, bounded target creation,
   exact aggregate quota counts, and no provider warning.
7. Verify expiry/retirement only after work settles and final browser/runtime
   ownership is attributable.

Continuous live follow and wider concurrent use remain disabled until this
bounded sequence passes and its receipt is integrated.

## Parallelizable And Serialized Work

Parallelizable after Packet 1 freezes the contracts:

- lease persistence/state-machine implementation;
- interaction-ledger persistence and status projection;
- deterministic fake-CDP/fake-clock fixture expansion;
- read-only operator status/documentation design.

Critical-path serialized order:

1. ownership invariants and red fixtures;
2. lease registry/conflict hierarchy;
3. aggregate admission gate;
4. ChatGPT prompt affinity;
5. live-follow crawler adoption;
6. reconciliation/observability;
7. installed and live acceptance.

ChatGPT adapter and live-follow integration overlap shared tab acquisition,
warning, session-retention, and cleanup paths. They must not be implemented in
parallel before the common lease and admission contracts are accepted.

## Compatibility And Migration

- Keep the existing serialized managed-browser-profile path behind an explicit
  compatibility/rollback mode until ChatGPT acceptance completes.
- Existing unleased provider tabs are not silently adopted. Reconciliation may
  classify them as unbound, disposable, human-owned, or attention-required.
- Do not infer conversation affinity solely from title, sidebar position, or
  a compatible provider origin. Require exact provider conversation identity
  and account evidence.
- Do not enable concurrent mutation for Gemini or Grok merely because the
  shared registry exists. Each adapter requires its own provider-free contract
  fixtures and bounded provider acceptance.
- Preserve current no-auto-click behavior for ChatGPT `Answer now` and all
  human-verification hard stops.

## Non-Goals

- No increase to configured provider interaction, chat-start, hourly, daily,
  materialization, or live-follow limits.
- No automatic provider-warning dismissal, CAPTCHA solving, MFA completion, or
  guard clearance.
- No parallel mutation within one conversation or one tab.
- No parallel traversal inside one live-follow crawler.
- No reliance on browser focus or foreground-window state for ownership.
- No sharing of tabs, conversations, or counters across verified tenant/account
  boundaries.
- No automatic adoption of arbitrary human browser tabs.
- No Gemini or Grok live rollout in the ChatGPT acceptance packet.
- No public release, installation, service restart, scheduler resume, or live
  provider effect without the separately applicable authority and gates.

## Hard Bounds And Stop Conditions

- `max_work_unit_attempts: 2`
- `max_review_rework_cycles: 1`
- `max_hardening_checkpoints: 2`
- `max_review_discovery_passes: 1`
- `checkpoint_interval: 2 packets`
- Provider-free packets may continue within the approved implementation goal
  once a work item/lane owns the change; installed/live work is a distinct
  action-specific gate.
- Stop the affected packet on duplicate live ownership, cross-tab navigation or
  cleanup, unknown target ownership, identity/account conflict, provider
  warning, CAPTCHA/human verification, effect-unknown submission, quota-ledger
  inconsistency, or a failure to prove retirement target identity.
- Do not weaken or bypass the current profile guard, provider warning guard,
  second-Chrome protection, interaction governor, or tenant limits to make a
  concurrency test pass.
- A failed live canary receives zero automatic retry. Preserve the exact
  targets, ledger events, warning state, and receipt for diagnosis.

## Validation Strategy

Provider-free validation must cover:

- tab-lease state transitions, atomicity, persistence, TTL, cancellation, and
  restart reconciliation;
- operation conflict matrix for profile-wide and exact-target work;
- ChatGPT new/existing conversation binding and route verification;
- live-follow crawler isolation and abort cleanup;
- aggregate tenant/provider quota reservations and settled usage;
- provider-warning precedence and cooldown propagation;
- absence of spurious target creation, navigation, reload, focus, and close;
- existing browser-service, ChatGPT prompt, Account Mirror, materialization,
  response-batch, tenant-limit, and media regression suites;
- typecheck, production build, lint, formatting/diff hygiene, and planning
  audits.

Installed/live validation must separately prove source/runtime parity, exact
account identity, target-level ownership, distinct conversation responses,
live-follow coexistence, aggregate usage counts, warning absence, bounded
cleanup, and final service/browser health.

## Acceptance Criteria

- Two independent ChatGPT conversations can run concurrently in one managed
  browser profile on distinct exact tab leases.
- Each conversation remains bound to its own target across subsequent use and
  service restart reconciliation.
- One live-follow operation can coexist on a dedicated crawler tab without
  blocking or mutating either conversation tab.
- Generic service-tab selection never returns a target leased to another
  workload.
- Meaningful use extends tab lifetime; passive polling does not; expiry retires
  only the exact idle attributable target.
- No accepted flow introduces an unnecessary tab creation, refresh,
  renavigation, focus, or browser restart.
- Aggregate concurrency, per-minute interaction, hourly chat-start, and daily
  chat-start limits are enforced atomically across foreground and background
  work.
- Provider warnings and human-verification surfaces stop all applicable new
  interaction permits without automated dismissal or retry.
- Existing effect-state, uncertain-send, account-binding, second-Chrome, and
  live-follow hard-stop semantics remain intact.
- ChatGPT provider-free and bounded installed/live acceptance passes before
  compatibility serialization is disabled by default.
- Gemini and Grok remain on the safe serialized path until separately accepted.

## Definition Of Done

Canonical `main` contains the provider-neutral tab lease registry, conflict
hierarchy, aggregate interaction ledger, ChatGPT conversation affinity,
dedicated live-follow crawler ownership, bounded tab lifetime/retirement,
operator status and documentation, and regression coverage. A separately
authorized installed ChatGPT receipt proves two simultaneous conversations and
one live-follow pass coexist without cross-tab interference, unnecessary
navigation or refresh, quota-accounting drift, provider-warning bypass, or
orphaned browser ownership. Compatibility mode remains available for rollback,
and other providers remain serialized until their own acceptance plans close.

## Checkpoint Contract

At every material transition record:

- `plan_version`
- `state_transition`
- `acceptance_state`
- `progress_classification`
- `evidence`
- `material_blockers`
- `next_action_or_stop_reason`
- `delegation_status` only when delegation occurs
- `review_status` only when review occurs

Checkpoint 2026-09-24:

- `plan_version`: 2
- `state_transition`: OPEN -> OPEN; Packet 1 first tracer implemented
- `acceptance_state`: partial provider-free acceptance; 3 focused lease tests,
  11 compatibility-dispatcher tests, typecheck, and the full 3,185-test
  provider-free suite pass
- `progress_classification`: forward progress
- `evidence`: `tests/browser-service/tabLeaseRegistry.test.ts`,
  `packages/browser-service/src/service/tabLeaseRegistry.ts`, and the unchanged
  production dispatcher behavior
- `material_blockers`: none for the remaining provider-free fixtures
- `validation_notes`: the plan-library audit retains 32 pre-existing missing
  policy-target findings outside P52; Plan 0359 itself remains a KEEP candidate
- `next_action_or_stop_reason`: extend the contract with reservation rebinding,
  meaningful-use heartbeat, idle/retirement, census exclusion, and restart
  reconciliation before any production integration
- `delegation_status`: three read-only workers completed test inventory,
  contract design, and dispatcher-impact review; no worker changed files
- `review_status`: primary reconciled all three reviews into a separate registry
  seam and retained serialized compatibility behavior; PR 47 is open for
  review

The next action remains Packet 1 provider-free on issue 46 and branch
`feat/issue-46-browser-tab-affinity`. This implementation authority does not
include installed, browser, provider, scheduler, or live effects.

Checkpoint 2026-09-24, lifecycle continuation:

- `plan_version`: 3
- `state_transition`: OPEN -> OPEN; Packet 1 lifecycle contract advanced
- `acceptance_state`: partial provider-free acceptance; 8 tab-lease tests and
  11 compatibility-dispatcher tests pass, with typecheck and production build
- `progress_classification`: forward progress
- `evidence`: public `BrowserTabLeaseRegistry` lifecycle methods and
  `tests/browser-service/tabLeaseRegistry.test.ts`
- `material_blockers`: none for remaining Packet 1 fixtures
- `next_action_or_stop_reason`: add fake target-action counters and the
  provider-warning freeze/admission contract, then review Packet 1 terminal
  evidence before any file-backed registry or production caller integration
- `delegation_status`: no new workers; this continuation avoided context forks
  after the prior three reviews converged on the registry seam
- `review_status`: focused self-review retained profile-control serialization,
  exact-workload-only acquisition, revision fencing, and fail-closed lost state

Checkpoint 2026-09-24, file-backed adapter:

- `plan_version`: 4
- `state_transition`: OPEN -> OPEN; bounded Packet 2 persistence tracer GREEN
- `acceptance_state`: partial provider-free acceptance; 9 lease-registry tests
  and 11 compatibility-dispatcher tests pass with typecheck
- `progress_classification`: forward progress
- `evidence`: two file-backed instances race for one exact target, exactly one
  succeeds, and a restarted instance reads the complete versioned snapshot
- `material_blockers`: none for provider-free conflict and cancellation work
- `next_action_or_stop_reason`: freeze target-action counters and provider
  warning admission, then complete profile-control conflict and cancellation
  fixtures before production integration
- `delegation_status`: no new workers
- `review_status`: persistence remains one atomic registry transition rather
  than independent per-target files, preserving workload-rebind uniqueness

Checkpoint 2026-09-24, aggregate admission tracer:

- `plan_version`: 5
- `state_transition`: OPEN -> OPEN; bounded Packet 3 in-memory admission tracer
  GREEN
- `acceptance_state`: partial provider-free acceptance; 4 interaction-ledger,
  9 tab-lease, and 11 compatibility-dispatcher tests pass with typecheck and
  production build
- `progress_classification`: forward progress
- `evidence`: provider-warning precedence/freeze, atomic concurrency race,
  reservation expiry, rolling hourly boundary, no double-counting, append-only
  transition events, and permit-free passive observation
- `material_blockers`: none for ledger persistence or remaining conflict work
- `next_action_or_stop_reason`: persist the interaction ledger and warning
  projection atomically across restart, add exact daily-boundary and
  cancellation fixtures, then project the evidence through existing tenant
  limit status without enabling production concurrency
- `delegation_status`: no new workers
- `review_status`: admission is one tenant/provider seam across runtime/browser
  profiles; warning evidence dominates numeric limits
