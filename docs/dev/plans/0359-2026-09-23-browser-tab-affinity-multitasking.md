# Browser tab affinity and provider-safe multitasking | 0359-2026-09-23

State: OPEN
Lane: P52
Branch: feat/issue-46-browser-tab-affinity
Target: main
Integration: merge
Work item: ecochran76/auracall#46
Pull request: ecochran76/auracall#47
Plan version: 35

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
- The file-backed interaction-ledger adapter now places quota evaluation,
  warning evaluation, and reservation creation in one cross-process atomic
  transition. Settled usage, append-only events, and provider warnings survive
  restart; concurrent instances cannot both consume the final permit.
- Profile-control claims now share the tab-registry transaction. Browser
  startup and other profile-wide control cannot begin while any fenced tab
  lease exists, and tab reservation cannot begin while profile control is
  active, including across file-backed instances. Confirmed pre-effect
  interaction cancellation remains durable evidence without consuming a
  conversation-start quota slot.
- Exact target-action counters now live on each lease and update only through
  its revision-fenced claim. Target creation, adoption, navigation, reload,
  focus, and attributable retirement close remain target-specific; action use
  extends idle lifetime without extending absolute lifetime. Rolling daily
  admission has explicit inclusive-boundary coverage.
- Existing tenant-limit status now accepts the provider-neutral ledger as an
  optional evidence source and labels that projection
  `aggregate-interaction-ledger`. Legacy runtime-evidence projection remains
  unchanged when no ledger is supplied, so this checkpoint adds status
  compatibility without changing production admission or tab concurrency.
- Provider-free ChatGPT prompt affinity now validates one active conversation
  or new-conversation lease, requires its exact DevTools endpoint, fixes the
  provider call to the leased target with retained/no-navigation semantics,
  and rejects crawler leases, operation-owner drift, and mismatched provider
  target or conversation readback. Explicit `tab-affinity` production callers
  now construct this seam; serialized mode remains the default rollback path.
- A provider-neutral live-follow traversal seam now accepts only the active
  crawler lease for the exact completion operation, walks conversation IDs
  sequentially on that one target, and checks cancellation before every next
  visit. Conversation-owned tabs are rejected before collector work begins.
- A guarded ChatGPT execution coordinator now makes serialized compatibility
  and tab-affinity explicit modes. The affinity branch requires the aggregate
  ledger, exact lease claim, registry, endpoint, policy, and provider runner;
  it admits and starts once, executes once, validates provider readback,
  rebinds new conversations, idles the exact lease, and settles success or
  outcome-unknown failure. No current production caller selects this branch.
- The aggregate ledger can now bind one tab lease to a reservation after
  admission, with a durable `tab-lease-bound` event and fail-closed rejection
  of a different second binding. The outer ChatGPT coordinator uses that
  transition to reserve aggregate capacity before target provisioning.
- A provider-free ChatGPT provisioner now reuses an already verified managed
  browser endpoint or obtains registry-owned profile startup control only while
  starting an absent browser. It then creates one exact target, immediately
  reserves the matching workload lease, records target creation and the one
  existing-conversation navigation, and closes only that just-created target
  if reservation conflicts. BrowserService construction does not use it yet.
- Browser configuration resolves provider-neutral `browser.tabConcurrencyMode`
  to `serialized` by default. Explicit `tab-affinity` constructs one shared
  file-backed registry and interaction ledger under the AuraCall home and now
  routes `BrowserAutomationClient.runPrompt()` plus ChatGPT handoff submission
  through admission-before-provisioning exact-tab coordination.
- Existing-conversation affinity now reacquires its idle binding only after a
  successful live target census confirms the exact conversation route. A
  proven-missing target is recorded lost and released before one replacement
  target is created; a live mismatched route is retained as a lost conflict and
  fails closed. Serialized mode retains the existing profile dispatcher.
- ChatGPT Account Mirror live-follow completions now acquire one exact crawler
  lease, retain that target across their sequential traversal, and use a
  ledger-backed interaction governor. Foreground affinity prompts and
  live-follow reads consult the same tenant/provider warning state and rolling
  per-minute counter; direct/manual Account Mirror refreshes and other
  providers retain serialized compatibility behavior.
- The legacy `runBrowserMode()` ChatGPT path now enters the same admission and
  provisioning coordinator when explicit affinity includes full
  profile-resolved configuration. Its established response waiting, runtime
  heartbeats, tool/deep-research behavior, and recovery remain intact, but the
  engine attaches only to the exact leased target, skips a redundant exact-route
  navigation, and does not close the retained target. Stored responses,
  interactive/detached sessions, TUI, and MCP consultation carry that authority.
- Production expiry retirement runs opportunistically before ChatGPT foreground and
  live-follow affinity acquisition: only expired idle settled leases advance,
  and the exact target must match and disappear after close. The long-running
  API now also owns a non-overlapping 60-second maintenance cadence for explicit
  affinity configurations. It never launches an absent browser, isolates
  failures per AuraCall runtime profile, and stops with the API. Active leases
  now persist process-generation ownership; maintenance marks dead or legacy
  owners restart-unverified and releases only those whose exact target is
  proven absent. Live or identity-mismatched targets remain fenced.
- Read-only runtime status now reports sanitized aggregate lease-state and
  workload counts, expired-idle and outcome-unknown attention counts, exact
  target-action totals, and retirement dispositions. It does not expose target,
  operation, tenant, or conversation identifiers. It also reports sanitized
  per-binding age and idle/absolute lifetime remaining without binding IDs.
- Generic ChatGPT service project/conversation listing, provider identity
  reads, and conversation rename/delete now use one reusable exact utility tab
  per service instance in explicit affinity mode. Every adapter interaction is
  admitted and settled through the shared ledger. Mutations execute once; an
  uncertain mutation leaves both ledger and tab evidence outcome-unknown, and
  the registry now forbids reacquiring any outcome-unknown idle lease. Inherited
  project/account/conversation file reads, conversation context, artifact/file
  materialization, account/project downloads, and active-media materialization
  now reuse that same exact utility tab without nested lease acquisition.
  Affinity-owned scoped provider sessions retain the aggregate interaction
  governor across transfers. Project/account file upload and delete now also
  execute once on that exact tab and refresh their cache without reacquiring
  the lease. Project create/rename/clone/instruction operations and their public
  project-UI substeps now use the same exact utility ownership and zero-retry
  provider-mutation marker. ChatGPT Skill and Developer App adapters now enter
  the utility coordinator, attach DevTools only by the exact leased endpoint and
  target, consume the aggregate governor, and close before the lease idles.
  Developer App prompt submission retains the separate conversation-affinity
  execution path.
- Account Mirror live follow retains its one-active-operation, cadence,
  cancellation, warning, cooldown, and hard-stop contracts while explicit
  ChatGPT affinity gives each completion operation one exact durable crawler
  lease. Foreground and crawler work share the aggregate ledger and per-minute
  governor; serialized mode remains unchanged.
- ChatGPT tenant defaults remain four concurrent chats, 120 chat starts per
  hour, and 240 chat starts per day. Explicit affinity admits foreground,
  crawler, materialization, direct management, and provider CRUD interactions
  through the shared ledger/governor surfaces without weakening narrower batch
  or legacy guards.
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

Checkpoint 2026-09-24, durable aggregate admission:

- `plan_version`: 6
- `state_transition`: OPEN -> OPEN; Packet 3 durable admission tracer GREEN
- `acceptance_state`: partial provider-free acceptance; 5 interaction-ledger,
  9 tab-lease, and 11 compatibility-dispatcher tests pass with typecheck
- `progress_classification`: forward progress
- `evidence`: a restarted ledger preserves settled rolling usage, event history,
  and indefinite verification warning; two instances racing for one remaining
  permit yield one admission and one concurrency denial
- `material_blockers`: none for remaining provider-free fixtures
- `next_action_or_stop_reason`: add exact daily-boundary, cancellation, and
  target-action counter fixtures; then project ledger evidence through tenant
  status and implement profile-control-versus-tab conflict hierarchy without
  enabling production concurrent mutation
- `delegation_status`: no new workers
- `review_status`: quota check and reservation write share one locked snapshot;
  warning precedence remains tenant/provider-wide across profiles

Checkpoint 2026-09-24, conflict hierarchy and cancellation:

- `plan_version`: 7
- `state_transition`: OPEN -> OPEN; Packet 2 control-plane hierarchy and Packet
  3 cancellation tracer GREEN
- `acceptance_state`: partial provider-free acceptance; 6 interaction-ledger,
  10 tab-lease, and 11 compatibility-dispatcher tests pass with typecheck
- `progress_classification`: forward progress
- `evidence`: profile control is denied by fenced target IDs; active profile
  control denies new tab reservation across registry instances; revision-fenced
  release restores eligibility; pre-effect cancellation is retained but not
  charged as a conversation start
- `material_blockers`: none for remaining provider-free fixtures
- `next_action_or_stop_reason`: add exact daily-boundary and target-action
  counter fixtures, then project ledger evidence through existing tenant-limit
  status without enabling production tab concurrency
- `delegation_status`: no new workers
- `review_status`: profile and tab exclusion share one registry transaction;
  cancellation accounting follows effect evidence rather than terminal label

Checkpoint 2026-09-24, action accounting and daily boundary:

- `plan_version`: 8
- `state_transition`: OPEN -> OPEN; Packet 1 action counters and Packet 3 daily
  boundary tracer GREEN
- `acceptance_state`: partial provider-free acceptance; 7 interaction-ledger,
  11 tab-lease, and 11 compatibility-dispatcher tests pass with typecheck
- `progress_classification`: forward progress
- `evidence`: exact claim-fenced target creation/adoption/navigation/reload/focus
  counters, close settlement count, bounded lifetime extension, and inclusive
  24-hour rolling-limit boundary
- `material_blockers`: none for status projection or provider integration work
- `next_action_or_stop_reason`: project the new durable ledger evidence through
  existing tenant-limit status, add provider-free ChatGPT exact-target fixtures,
  and keep production execution serialized until the integration seam is fully
  guarded
- `delegation_status`: no new workers
- `review_status`: action evidence is attributable to one target lease and
  quota release follows exact timestamp/effect evidence

Checkpoint 2026-09-24, tenant status projection:

- `plan_version`: 9
- `state_transition`: OPEN -> OPEN; Packet 3 compatibility projection GREEN
- `acceptance_state`: partial provider-free acceptance; 34 focused tests,
  typecheck, and production build pass
- `progress_classification`: forward progress
- `evidence`: tenant status reports ledger-derived active/hour/day counts and
  explicit `aggregate-interaction-ledger` basis when injected; existing status
  tests remain green on `runtime-evidence`
- `material_blockers`: production construction does not yet supply the ledger,
  intentionally preserving the compatibility path
- `next_action_or_stop_reason`: add provider-free ChatGPT exact-target fixture
  and dedicated live-follow crawler fixture, then introduce guarded production
  construction behind serialized rollback rather than switching behavior
- `delegation_status`: no new workers
- `review_status`: the projection seam is optional and backward-compatible;
  status evidence is not treated as execution authority
- `validation_notes`: the full provider-free suite reached 3,200 passing tests
  with one background-drain timing failure in
  `tests/http.responsesServer.test.ts`; the exact failed test passed on its
  immediate isolated rerun. This is retained as flaky-suite evidence rather
  than reported as a clean full-suite pass.

Checkpoint 2026-09-24, exact-target provider fixtures:

- `plan_version`: 10
- `state_transition`: OPEN -> OPEN; Packet 4 and Packet 5 exact-target fixture
  seams GREEN, production compatibility path unchanged
- `acceptance_state`: partial provider-free acceptance; 65 focused tests,
  typecheck, scoped formatting/lint, diff hygiene, and production build pass
- `progress_classification`: forward progress
- `evidence`: two independent ChatGPT conversation calls retain distinct exact
  target IDs and endpoints; untrusted caller tab overrides cannot escape the
  lease; a new-conversation reservation returns binding evidence; a crawler
  lease cannot submit a prompt; live follow walks one crawler target
  sequentially and aborts before the next interaction
- `material_blockers`: neither seam is constructed by the production executor
  or Account Mirror refresh path yet, and lease/ledger lifecycle settlement
  still has to surround provider effects
- `next_action_or_stop_reason`: add one guarded production construction layer
  that owns lease acquisition, aggregate admission, ChatGPT execution,
  reservation rebinding, effect-aware settlement, and serialized rollback;
  keep it disabled by default until its provider-free state-machine fixtures
  pass
- `delegation_status`: no new workers
- `review_status`: exact endpoint plus target ownership is explicit and
  provider readback fails closed; fixtures do not imply installed or live
  acceptance

Checkpoint 2026-09-24, guarded ChatGPT affinity coordinator:

- `plan_version`: 11
- `state_transition`: OPEN -> OPEN; Packet 4 inner execution coordinator GREEN,
  serialized production behavior unchanged
- `acceptance_state`: partial provider-free acceptance; 69 focused tests,
  typecheck, scoped Biome checks, diff hygiene, production build, and fresh
  CodeGraph status pass
- `progress_classification`: forward progress
- `evidence`: explicit serialized rollback has no registry/ledger dependency;
  affinity mode denies on aggregate warning before provider execution, executes
  one admitted prompt, rebinds and idles a new conversation, settles exact
  usage, and preserves provider failure as outcome-unknown without retry
- `material_blockers`: this inner coordinator receives an already-created
  target lease, so the outer admission-before-target-creation transaction,
  reservation-to-lease association, warning classification during execution,
  and production factory wiring remain incomplete
- `next_action_or_stop_reason`: add a reservation-to-lease association
  transition to the durable ledger and an outer coordinator that reserves
  aggregate capacity before target creation; then connect warning
  classification before any production caller can enable tab affinity
- `delegation_status`: no new workers
- `review_status`: compatibility remains the only constructed production path;
  provider-free coordinator success is not activation authority

Checkpoint 2026-09-24, admission-before-provisioning construction:

- `plan_version`: 12
- `state_transition`: OPEN -> OPEN; Packet 3 reservation association and
  Packet 4 outer provisioning transaction GREEN
- `acceptance_state`: partial provider-free acceptance; 76 focused tests,
  typecheck, scoped Biome checks, diff hygiene, and production build pass
- `progress_classification`: forward progress
- `evidence`: aggregate warning denial invokes neither target provisioning nor
  provider execution; an allowed reservation is started before target creation,
  then durably bound to the exact lease; live endpoint reuse avoids profile
  control, absent-browser startup holds profile control until ready, and a
  reservation conflict closes only the newly created target
- `material_blockers`: BrowserAutomationClient/BrowserService factory wiring,
  runtime configuration and rollback status, exact current-route verification,
  and Account Mirror adoption remain incomplete
- `next_action_or_stop_reason`: add a disabled-by-default runtime construction
  factory using file-backed registry/ledger paths, verified BrowserService
  endpoint resolution, exact ChatGPT target creation/close, and read-only mode
  status; do not switch prompt callers until provider-free construction tests
  prove serialized default and explicit affinity opt-in
- `delegation_status`: no new workers
- `review_status`: provider warning classification is required by the outer
  coordinator and freezes the aggregate ledger before another workload can be
  admitted; no live/provider authority was exercised

Checkpoint 2026-09-24, runtime construction and serialized default:

- `plan_version`: 13
- `state_transition`: OPEN -> OPEN; runtime factory and read-only status GREEN,
  prompt and crawler callers remain serialized
- `acceptance_state`: partial provider-free acceptance; 89 focused tests,
  typecheck, scoped Biome checks, diff hygiene, and production build pass
- `progress_classification`: forward progress
- `evidence`: absent configuration resolves to `serialized` and creates no
  coordination storage; explicit `tab-affinity` constructs shared durable
  stores, survives real file-backed writes, and publishes exact lease,
  interaction, active, fenced, and warning-event counts through the production
  browser client factory
- `material_blockers`: `BrowserAutomationClient.runPrompt` and Account Mirror
  do not yet invoke the affinity coordinators; configured service-account
  identity and exact managed browser profile must be resolved before activation
- `next_action_or_stop_reason`: wire explicit ChatGPT `tab-affinity` prompt
  execution through the outer coordinator using configured tenant identity,
  resolved tenant limits, exact managed browser profile, BrowserService
  endpoint resolution, and exact target create/close; preserve the current
  `serialized` branch byte-for-byte
- `delegation_status`: no new workers
- `review_status`: configuration is provider-neutral and default-off; status
  construction is not represented as active concurrent execution

Checkpoint 2026-09-24, guarded prompt activation and binding reuse:

- `plan_version`: 14
- `state_transition`: OPEN -> OPEN; explicit ChatGPT prompt affinity is now
  constructed by the browser client and handoff adapter
- `acceptance_state`: partial provider-free acceptance; 103 focused tests,
  typecheck, scoped Biome checks, diff hygiene, and production build pass
- `progress_classification`: forward progress
- `evidence`: explicit affinity resolves configured tenant identity and exact
  managed browser profile, reserves aggregate capacity before target creation,
  executes only on its leased target, reuses a verified idle conversation
  binding without navigation, and replaces only a census-proven missing target;
  the handoff adapter no longer enters the compatibility profile queue in
  affinity mode
- `material_blockers`: legacy direct `runBrowserMode()` and Account Mirror live
  follow do not yet use the coordinator; installed/live acceptance remains
  separately gated
- `next_action_or_stop_reason`: migrate Account Mirror's active completion to
  one dedicated crawler lease and the shared interaction ledger, then reconcile
  the legacy direct browser entry point so explicit affinity cannot silently
  bypass ownership or accounting
- `delegation_status`: no new workers
- `review_status`: completion audit caught and repaired a create-on-every-call
  defect before checkpoint; persisted target IDs are reused only after live
  exact-route verification

Checkpoint 2026-09-24, Account Mirror crawler activation:

- `plan_version`: 15
- `state_transition`: OPEN -> OPEN; explicit ChatGPT live-follow completions
  now use Packet 5 crawler ownership and aggregate per-minute admission
- `acceptance_state`: partial provider-free acceptance; 177 focused tests,
  typecheck, scoped Biome checks, diff hygiene, and production build pass
- `progress_classification`: forward progress
- `evidence`: commit `b29351b0e764378f38a81fc4568abf61ef61e3d4`
  gives each active ChatGPT live-follow completion an exact crawler lease,
  verifies an idle crawler before reuse, replaces a proven-missing target,
  fails closed on route mismatch, retains the exact target through sequential
  collection, and settles every governed read into the shared ledger
- `material_blockers`: the legacy direct `runBrowserMode()` path and several
  non-prompt provider surfaces can still bypass lease ownership and aggregate
  accounting; lifetime retirement is modeled but no production sweeper yet
  closes attributable expired targets
- `next_action_or_stop_reason`: reconcile `runBrowserMode()` and its direct,
  stored-response, and batch callers with the affinity coordinator without
  weakening serialized rollback, then add target-specific retirement and
  restart reconciliation before any installed/live acceptance
- `delegation_status`: no new workers
- `review_status`: ordinary direct refresh and Gemini/Grok stay serialized;
  the affinity collector uses `retain`, preserves the active tab, disables
  whole-browser cleanup, and projects structured provider guards before new
  permits

Checkpoint 2026-09-24, legacy response and session coordination:

- `plan_version`: 16
- `state_transition`: OPEN -> OPEN; ChatGPT legacy response execution and its
  stored/interactive session callers now enter Packet 4 affinity coordination
- `acceptance_state`: partial provider-free acceptance; 102 focused legacy and
  coordinator tests plus 125 focused session tests pass with typecheck, scoped
  lint/diff hygiene, and production builds
- `progress_classification`: forward progress
- `evidence`: commits `51b52ff16` and
  `74468d13435cf93aab6454183020bbb4ea167375` preserve the full legacy response
  lifecycle while admitting before provisioning, selecting one exact leased
  target without generic fallback, retaining it after execution, and carrying
  profile-resolved affinity through stored responses, interactive and detached
  sessions, TUI, and MCP consultation
- `material_blockers`: production lifetime sweeping/reconciliation and
  non-prompt materialization, media, and provider CRUD accounting remain; live
  acceptance is separately gated
- `next_action_or_stop_reason`: implement target-specific expired-lease
  retirement with exact live-target verification and unresolved-effect stops,
  then audit remaining non-prompt provider interactions against the aggregate
  ledger
- `delegation_status`: no new workers
- `review_status`: direct ChatGPT browser execution cannot silently select a
  generic tab in affinity mode; absent full resolved authority fails closed,
  and Gemini/Grok remain serialized

Checkpoint 2026-09-24, attributable expiry retirement:

- `plan_version`: 17
- `state_transition`: OPEN -> OPEN; Packet 6 target-specific retirement is
  active at foreground and live-follow acquisition boundaries
- `acceptance_state`: partial provider-free acceptance; 53 focused retirement,
  registry, prompt, live-follow, legacy, session, and configured-executor tests
  pass with typecheck, scoped Biome checks, diff hygiene, and production build
- `progress_classification`: forward progress
- `evidence`: `9f9135fdbcc8acb29f000d1f641956d332d60944`
  begins retirement only for expired idle settled leases, verifies the exact
  target against provider/workload identity, closes that target only, confirms
  disappearance, and records `closed`; missing targets are released as
  already missing, mismatches are preserved/lost, unavailable endpoints are
  deferred, and outcome-unknown leases are untouched
- `material_blockers`: expiry sweeping is acquisition-driven rather than a
  persistent periodic maintenance loop; remaining orphan/restart status and
  non-prompt materialization, media, and CRUD accounting are incomplete
- `next_action_or_stop_reason`: add a bounded periodic maintenance owner for
  configured affinity scopes, expose retirement/lost attention in operator
  status, then classify and integrate remaining non-prompt interactions
- `delegation_status`: no new workers
- `review_status`: retirement never closes a browser or a generic/provider-only
  match; close success requires an exact post-close absence observation

Checkpoint 2026-09-24, sanitized affinity observability:

- `plan_version`: 18
- `state_transition`: OPEN -> OPEN; Packet 6 aggregate operator status advanced
- `acceptance_state`: partial provider-free acceptance; 4 focused runtime-status
  tests, typecheck, production build, scoped formatting, diff hygiene, and
  repository lint pass; lint retains the existing 207-warning baseline
- `progress_classification`: forward progress
- `evidence`: commit `28f8b6cae7cd9fc62e662f1fc4d631b575b58c09`
  exposes aggregate active, idle, retiring, released, and lost lease states;
  conversation, new-conversation, live-follow, and ephemeral workloads;
  expired-idle and outcome-unknown attention; target actions; and retirement
  dispositions without publishing conversation IDs or other lease locators
- `material_blockers`: status does not yet expose sanitized per-binding age or
  remaining lifetime; sweeping remains acquisition-driven; broader orphan and
  restart reconciliation plus non-prompt interaction integration remain open
- `next_action_or_stop_reason`: add a bounded persistent maintenance owner and
  restart/orphan reconciliation, then classify and integrate materialization,
  media, and provider CRUD interactions without widening live authority
- `delegation_status`: no new workers
- `review_status`: status reads a single injected clock instant and derives only
  counts from durable registry evidence; serialized mode still creates no
  coordination storage

Checkpoint 2026-09-24, persistent API maintenance owner:

- `plan_version`: 19
- `state_transition`: OPEN -> OPEN; Packet 6 periodic expiry ownership active
  in the long-running API
- `acceptance_state`: partial provider-free acceptance; 11 focused maintenance,
  retirement, and status tests plus the API ownership test pass with typecheck,
  production build, diff hygiene, and repository lint; lint retains the
  existing 207-warning baseline
- `progress_classification`: forward progress
- `evidence`: commit `2eb79d430ae90da0b05376972211d3d07bc8a206`
  schedules one non-overlapping pass every 60 seconds only when explicit
  affinity is configured, resolves each configured ChatGPT scope without
  browser launch, reuses exact retirement verification, isolates scope errors,
  and clears/awaits maintenance during API shutdown
- `material_blockers`: restart reconciliation does not yet classify live
  unleased/orphan targets or verify persisted leases before general status;
  per-binding lifetime status and non-prompt interaction integration remain open
- `next_action_or_stop_reason`: implement read-only restart/orphan
  reconciliation and status projection, then classify and integrate
  materialization, media, and provider CRUD interactions
- `delegation_status`: no new workers
- `review_status`: proof-scoped server runs suppress the cadence; serialized
  mode schedules nothing; an absent endpoint defers leases without launching a
  browser or transitioning ownership

Checkpoint 2026-09-24, ChatGPT utility-tab coordination:

- `plan_version`: 20
- `state_transition`: OPEN -> OPEN; first non-prompt ChatGPT CRUD/read bypasses
  now enter exact-tab ownership and aggregate admission
- `acceptance_state`: partial provider-free acceptance; 100 focused service,
  context, file, prompt, utility, registry, and dedicated-tab tests pass with
  typecheck, production build, diff hygiene, and repository lint; lint retains
  the existing 207-warning baseline
- `progress_classification`: forward progress
- `evidence`: commit `22ed9d8751cd7e25114c28e52b8d7b214d9e358e`
  gives each ChatGPT service instance one reusable five-minute-idle utility tab
  for project/conversation listing, identity reads, rename, and delete; exact
  target options prevent generic-tab selection, adapter interaction governors
  reserve the shared ledger, and provider mutations are not retried in the
  affinity branch
- `material_blockers`: project/file CRUD inherited from the wider LLM service,
  history/artifact materialization, and some specialized ChatGPT management
  adapters still bypass utility affinity; restart/orphan reconciliation and
  per-binding lifetime status remain open
- `next_action_or_stop_reason`: extend the utility-operation wrapper across
  remaining ChatGPT project/file and materialization reads, then finish
  restart/orphan reconciliation and provider-free completion audit
- `delegation_status`: no new workers
- `review_status`: successful utility work idles and reuses the exact target;
  failed reads settle without mutation evidence, failed mutations become
  outcome-unknown, and outcome-unknown idle leases cannot be reacquired

Checkpoint 2026-09-24, inherited ChatGPT read and materialization affinity:

- `plan_version`: 21
- `state_transition`: OPEN -> OPEN; inherited read and materialization surfaces
  now remain on the service-owned exact utility target
- `acceptance_state`: partial provider-free acceptance; 60 focused ChatGPT
  service, utility coordinator, and LLM file/materialization tests pass with
  typecheck and scoped source formatting; no live effect ran
- `progress_classification`: forward progress
- `evidence`: commit `3eb0f2b1e39593c186df614df7702c67c0479d1d`
  adds a re-entrant exact-target wrapper to inherited project/account/
  conversation file reads, conversation context, artifact and file
  materialization, downloads, and active-media materialization; an already
  exact nested call bypasses acquisition, while scoped transfers preserve the
  affinity ledger governor instead of removing it
- `material_blockers`: inherited project/file mutations and specialized
  ChatGPT management adapters remain outside utility affinity; restart/orphan
  reconciliation and sanitized per-binding lifetime status remain open
- `next_action_or_stop_reason`: integrate provider-mutating project/file
  methods with one-attempt outcome-unknown semantics, then finish restart/orphan
  reconciliation and the provider-free completion audit
- `delegation_status`: no new workers
- `review_status`: all covered read/materialization operations retain one exact
  target and one aggregate governor across nested and scoped-session calls;
  legacy scoped-session callers retain their prior governor-bypass behavior

Checkpoint 2026-09-24, ChatGPT file-mutation affinity:

- `plan_version`: 22
- `state_transition`: OPEN -> OPEN; project/account file upload and delete now
  enter exact utility ownership with one-attempt mutation semantics
- `acceptance_state`: partial provider-free acceptance; 13 focused service and
  utility-coordinator tests pass with typecheck, scoped formatting, and diff
  hygiene; no live effect ran
- `progress_classification`: forward progress
- `evidence`: commit `a33a3def950fc9cf98098c831b97f6aabbee3532`
  coordinates project/account upload and deletion on the reusable utility tab,
  performs the provider mutation once, and performs post-mutation cache refresh
  through an already exact nested read on the same target
- `material_blockers`: project create/rename/clone/instruction mutations and
  specialized ChatGPT management adapters remain outside utility affinity;
  restart/orphan reconciliation and per-binding lifetime status remain open
- `next_action_or_stop_reason`: integrate remaining project mutations with
  explicit no-retry semantics, then finish restart/orphan reconciliation and
  the provider-free completion audit
- `delegation_status`: no new workers
- `review_status`: a provider failure is not retried and prevents cache refresh;
  an outer coordinator records the uncertain mutation outcome and makes its
  idle lease ineligible for reacquisition

Checkpoint 2026-09-24, project mutation and restart ownership:

- `plan_version`: 23
- `state_transition`: OPEN -> OPEN; remaining LLM-service project mutations are
  affinity-owned, sanitized lifetime readback is present, and stale active
  ownership is reconciled after process restart
- `acceptance_state`: partial provider-free acceptance; 78 focused project,
  utility, file, and context tests plus 21 registry, restart-maintenance, and
  status tests pass with typecheck, production build, scoped formatting, and
  diff hygiene; no live effect ran
- `progress_classification`: forward progress
- `evidence`: commits `bf86ba12ce5831334d4187028f8590f801da849c`
  and `c341b3c1809bb3a70c5d8f0ef9ec037a60e6a5ab` route project create,
  rename, clone, instructions, validation, creation substeps, project menus,
  sidebar/history controls, and chat-area selection through the reusable exact
  utility tab with explicit zero-retry mutation options; commit
  `100d7cbff9a80d0402b14396f7fe5252cef48f25` adds sanitized per-binding
  age and remaining idle/absolute lifetime; commit
  `e65bb5d152c68cdeaadeca5c2ace8d36d4a50fd8` records process-generation
  ownership and reconciles dead or legacy active owners as restart-unverified
- `material_blockers`: live matching restart-unverified targets intentionally
  remain fenced because their provider effect cannot be proven settled;
  unleased live-target classification and specialized ChatGPT callers outside
  the LLM service still require audit; installed/live acceptance remains gated
- `next_action_or_stop_reason`: audit direct ChatGPT adapter callers for any
  remaining generic-tab bypass, add safe unleased-target classification without
  adopting or closing it, then run the provider-free completion audit
- `delegation_status`: no new workers
- `review_status`: maintenance never launches an absent browser; a stale active
  lease is released only after exact target absence proof, while a live or
  mismatched target remains fenced for operator-visible reconciliation

Checkpoint 2026-09-24, specialized adapters and unleased-target census:

- `plan_version`: 24
- `state_transition`: OPEN -> OPEN; the remaining known direct ChatGPT
  management adapters now use exact utility ownership, and maintenance reports
  unleased live ChatGPT targets without touching them
- `acceptance_state`: partial provider-free acceptance; 123 focused Skill,
  Developer App, exact DevTools, utility, and ChatGPT service tests plus four
  maintenance tests pass with typecheck, scoped formatting, and diff hygiene;
  no live effect ran
- `progress_classification`: forward progress
- `evidence`: commit `ffccd431575394e3380639fa93081cc462d8ec32`
  adds a provider-neutral utility-operation seam, exact-target DevTools
  attachment, and Skill/Developer App wrappers that consume the shared governor
  and close before lease settlement; commit
  `9b9f6f05c20a412f14808e9e42c375096432eebd` classifies aggregate live,
  fenced, and unleased ChatGPT targets and emits content-free operator attention
  without adopting, navigating, focusing, refreshing, or closing them
- `material_blockers`: installed/live acceptance and merge to canonical `main`
  remain separately gated; the provider-free completion audit and broad
  regression suite remain to be completed
- `next_action_or_stop_reason`: execute the plan-wide provider-free regression
  matrix and requirement-by-requirement audit, repair any failures, then stop at
  the installed/live authority boundary
- `delegation_status`: no new workers
- `review_status`: direct ChatGPT adapter search found and migrated Skills and
  Developer Apps; exact DevTools attachment rejects partial endpoint authority,
  and unleased targets remain observation-only

Checkpoint 2026-09-24, provider-free completion audit:

- `plan_version`: 25
- `state_transition`: OPEN -> OPEN; Packets 1 through 6 are provider-free
  complete, while Packet 7 and canonical-main integration remain open
- `acceptance_state`: provider-free accepted; the complete non-live suite passes
  with 354 files and 3,269 tests, 65 explicitly opt-in/live tests are skipped,
  production build and lint pass, and diff hygiene is clean
- `progress_classification`: forward progress
- `evidence`: lease-registry, conflict, ledger, ChatGPT executor/runtime,
  configured live-follow, retirement/restart, maintenance, status, LLM-service,
  Skill, and Developer App suites cover the Packet 1-6 terminal conditions;
  commits `ffccd431575394e3380639fa93081cc462d8ec32` and
  `9b9f6f05c20a412f14808e9e42c375096432eebd` close the last identified direct
  adapter and unleased-target gaps
- `material_blockers`: Packet 7 requires separately authorized installation,
  exact account/profile selection, browser/provider interaction, and live
  acceptance; compatibility serialization therefore remains the default
- `validation_notes`: repository lint exits zero with the existing 207 warnings
  and 13 infos; the plan-library audit retains Plan 0359 as KEEP but exits one
  solely for 32 pre-existing nonexistent duplicate policy references in
  `AGENTS.md` (`0035` through `0066`)
- `next_action_or_stop_reason`: stop at the live-authority boundary; after exact
  authority is granted, execute Packet 7 in its stated bounded order, integrate
  the receipt, then merge to canonical `main`
- `delegation_status`: no new workers
- `review_status`: every provider-free acceptance criterion has direct source
  and deterministic-suite evidence; installed/live coexistence, runtime byte
  parity, real provider warning absence, and attributable final browser state
  remain deliberately unclaimed

Checkpoint 2026-09-24, post-effect settlement fencing:

- `plan_version`: 26
- `state_transition`: OPEN -> OPEN; provider-free acceptance retained with a
  newly repaired post-effect ledger-failure interlock
- `acceptance_state`: provider-free accepted; a successful provider result can
  no longer leave its exact tab reusable when durable interaction settlement
  fails
- `progress_classification`: forward progress
- `evidence`: commit `45df398acf25ac0f8ede745f0c47c9d8427123e0`
  moves successful ledger settlement before the lease becomes idle and adds a
  regression proving settlement failure marks the exact lease outcome-unknown
  and prevents reacquisition
- `material_blockers`: Packet 7 remains outside the issue's explicit
  provider-free authority
- `validation_notes`: 14 focused executor/runtime/handoff tests, typecheck,
  production build, scoped Biome, lint, and diff hygiene pass. Two broad runs
  reached 3,268/3,269 passing tests but encountered unrelated wall-clock and
  background-drain flakes; all three failing cases passed immediately in exact
  isolation, while the parent checkpoint retains a clean 3,269-test run
- `next_action_or_stop_reason`: continue read-only pre-live review and
  provider-free repair; do not begin Packet 7 without separate authority
- `delegation_status`: no new workers
- `review_status`: utility and live-follow paths already settle their
  ledger-backed governor before idling; only the foreground prompt executor had
  the unsafe ordering

Checkpoint 2026-09-24, cross-runtime ownership domain:

- `plan_version`: 27
- `state_transition`: OPEN -> OPEN; provider-free acceptance retained with
  browser/account ownership enforced across AuraCall runtime profiles
- `acceptance_state`: provider-free accepted; two runtime profiles mapped to
  one managed browser can no longer lease the same target or independently bind
  the same account conversation
- `progress_classification`: forward progress
- `evidence`: commit `2e656c722d475c67e12fe2987f18e5da1c35389e`
  makes target exclusion browser/service-wide, conversation uniqueness
  browser/service/account-wide, and profile control browser/service-wide;
  safe idle reacquisition transfers runtime attribution to the new owner
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: 26 focused registry, provisioner, runtime, and maintenance
  tests pass; the reduced-concurrency complete suite passes 354 files and 3,271
  tests with 65 opt-in/live tests skipped; typecheck, production build, scoped
  Biome, lint, and diff hygiene pass
- `next_action_or_stop_reason`: continue provider-free/read-only review, while
  leaving installation and live acceptance untouched
- `delegation_status`: no new workers
- `review_status`: runtime profile is attribution and configuration context,
  not a namespace that may duplicate physical target or provider-conversation
  ownership inside one managed browser/account

Checkpoint 2026-09-24, provisioning-accounting rollback:

- `plan_version`: 28
- `state_transition`: OPEN -> OPEN; provider-free acceptance retained with
  bounded cleanup for post-reservation accounting failure
- `acceptance_state`: provider-free accepted; a newly created prompt, crawler,
  or utility target cannot remain indefinitely active when target-action
  accounting fails immediately after lease reservation
- `progress_classification`: forward progress
- `evidence`: commit `791fc9c3c01b5377634be60b92b3e8cd4283c240`
  marks the exact created lease lost before closing its target and releases the
  lease only after close succeeds; uncertain close retains the lost fence
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: 14 focused provisioner, crawler, runtime, and configured
  live-follow tests pass with typecheck, scoped Biome, and diff hygiene
- `next_action_or_stop_reason`: continue the bounded provider-free failure-path
  audit without starting a browser or provider interaction
- `delegation_status`: no new workers
- `review_status`: reservation failure already closed the unleased newly
  created target; this repair covers the later state where reservation succeeded
  but action accounting did not

Checkpoint 2026-09-24, rollback attribution:

- `plan_version`: 29
- `state_transition`: OPEN -> OPEN; provisioning rollback evidence now states
  the actual cause and disposition
- `acceptance_state`: provider-free accepted; successful rollback closes are
  included in exact target-action and retirement totals rather than appearing
  as already-missing identity conflicts
- `progress_classification`: forward progress
- `evidence`: commit `52b9198604b2ac1d6dade8a58d9560b3fa5c28b6`
  adds `provisioning-failed` loss evidence and permits a lost exact target to be
  released with `closed`, incrementing only that lease's close count
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: 28 focused registry, retirement, provisioner, crawler,
  and status tests pass with typecheck, scoped Biome, and diff hygiene
- `next_action_or_stop_reason`: continue bounded provider-free failure-path
  audit; preserve the live gate
- `delegation_status`: no new workers
- `review_status`: target-missing remains `already-missing`, route mismatch
  remains `identity-conflict`, and post-reservation rollback now has distinct
  attributable evidence

Checkpoint 2026-09-24, shared-browser census deduplication:

- `plan_version`: 30
- `state_transition`: OPEN -> OPEN; maintenance observability now follows the
  physical browser ownership domain across runtime profiles
- `acceptance_state`: provider-free accepted; multiple AuraCall runtime
  profiles mapped to one DevTools endpoint no longer multiply live, fenced, or
  unleased ChatGPT target counts
- `progress_classification`: forward progress
- `evidence`: commit `f7c98d2f4872cbd38466575e868406880d8fe546`
  deduplicates each successful target census by managed browser and exact
  endpoint while retaining per-runtime lease retirement/restart reconciliation
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: nine selected maintenance/API tests pass (218 unrelated
  cases excluded by test name), with typecheck, scoped Biome, and diff hygiene
- `next_action_or_stop_reason`: continue bounded provider-free observability
  and failure-path audit; preserve the live gate
- `delegation_status`: no new workers
- `review_status`: a failed census is not memoized, allowing another mapped
  runtime profile to retry observation without granting mutation authority

Checkpoint 2026-09-24, aggregate warning operator recovery:

- `plan_version`: 31
- `state_transition`: OPEN -> OPEN; operator guard clearance now reaches the
  aggregate affinity ledger as well as legacy/browser and Account Mirror state
- `acceptance_state`: provider-free accepted; an indefinite human-verification
  warning remains fail-closed until explicit operator clear, then becomes the
  existing bounded quiet cooldown instead of blocking forever or resuming
  immediately
- `progress_classification`: forward progress
- `evidence`: commit `53989df41befb6c19e7ba04757457ec8ecd1ffec`
  adds an append-only provider-warning-clear event and routes HTTP plus MCP
  operator-clear surfaces through one configured aggregate-ledger helper
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: 12 full focused ledger/configured-clear/MCP tests plus the
  selected HTTP clear regression pass with typecheck, production build, scoped
  Biome, lint, and diff hygiene
- `next_action_or_stop_reason`: continue bounded provider-free recovery and
  status audit; preserve the live gate
- `delegation_status`: no new workers
- `review_status`: clearance is provider/account aggregate even when initiated
  through one runtime profile; historical frozen interactions remain immutable
  evidence while future permits stay denied through the cooldown boundary

Checkpoint 2026-09-24, active provider-guard status:

- `plan_version`: 32
- `state_transition`: OPEN -> OPEN; read-only status now distinguishes active
  provider guards from append-only warning history
- `acceptance_state`: provider-free accepted; operators can see active,
  indefinite, and bounded-cooldown guard counts, classifications, and maximum
  remaining cooldown without receiving tenant keys, reasons, or provider content
- `progress_classification`: forward progress
- `evidence`: commit `c9449ea48155249b00c86be3dbb7fa07d11f06b0`
  adds active-warning reads to the shared ledger and a sanitized aggregate
  projection to tab-concurrency status
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: 14 focused ledger/status tests, typecheck, production
  build, lint, scoped Biome, and diff hygiene pass. The immediately preceding
  complete reduced-concurrency non-live suite passed 355 files and 3,276 tests,
  with 65 opt-in/live tests skipped
- `next_action_or_stop_reason`: continue bounded provider-free acceptance
  audit; preserve the live gate
- `delegation_status`: no new workers
- `review_status`: expired cooldowns are absent from active counts while
  historical warning-event counts remain unchanged and attributable

Checkpoint 2026-09-24, admission-rejection status:

- `plan_version`: 33
- `state_transition`: OPEN -> OPEN; failed admission decisions are now durable
  and explainable through sanitized read-only status
- `acceptance_state`: provider-free accepted; provider-warning, concurrency,
  per-minute, hourly, and daily rejections are append-only evidence with total,
  latest-reason, and reason-count projections
- `progress_classification`: forward progress
- `evidence`: commit `87b57958bd04259e8d1eaec2ef77e602ad18c260`
  records denial events without allocating reservations or changing the
  admission decision
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: 29 focused affinity/ledger/status tests, typecheck,
  production build, lint, scoped Biome, and diff hygiene pass
- `next_action_or_stop_reason`: continue bounded provider-free acceptance
  audit; preserve the live gate
- `delegation_status`: no new workers
- `review_status`: status omits rejected workload, operation, tab, tenant, and
  warning-reason values while the internal audit event remains attributable

Checkpoint 2026-09-24, aggregate rolling-usage status:

- `plan_version`: 34
- `state_transition`: OPEN -> OPEN; operator status now projects the same
  active/minute/hour/day accounting windows used for admission
- `acceptance_state`: provider-free accepted; aggregate active workloads,
  interactions in the last minute, and conversation starts in the last hour
  and day are visible without tenant identifiers
- `progress_classification`: forward progress
- `evidence`: commit `c10ac52a4994f53600c820e13088929f8651ac9c`
  adds cross-tenant usage summarization while keeping equal workload IDs in
  distinct tenant scopes separate
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: 30 focused affinity/ledger/status tests, typecheck,
  production build, lint, scoped Biome, and diff hygiene pass
- `next_action_or_stop_reason`: perform the final provider-free requirement
  audit and preserve the live gate
- `delegation_status`: no new workers
- `review_status`: rolling usage is derived from durable ledger records at one
  captured status timestamp; status contains no tenant or workload identity

Checkpoint 2026-09-24, meaningful-use status:

- `plan_version`: 35
- `state_transition`: OPEN -> OPEN; per-binding status now exposes elapsed time
  since the exact lease's last meaningful use
- `acceptance_state`: provider-free accepted; age, last meaningful use, and
  idle/absolute lifetime posture are all visible without publishing target or
  conversation identity
- `progress_classification`: forward progress
- `evidence`: commit `73ea18f565c500a4f9ea0f062e47d75a60adcb87`
- `material_blockers`: Packet 7 remains outside provider-free authority
- `validation_notes`: focused status tests, typecheck, scoped Biome, and diff
  hygiene pass
- `next_action_or_stop_reason`: complete the final provider-free requirement
  audit and preserve the live gate
- `delegation_status`: no new workers
- `review_status`: target-action accounting advanced meaningful-use time in the
  fixture, producing a distinct value from total binding age
