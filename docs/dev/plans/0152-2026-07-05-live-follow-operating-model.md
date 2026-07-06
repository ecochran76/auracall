# Live-Follow Operating Model | 0152-2026-07-05

State: OPEN
Lane: P01

## Goal

Converge AuraCall live follow into a sane background routine that faithfully
backfills and keeps subscribed provider accounts current while staying polite to
provider UIs and yielding immediately to foreground operator work.

The target operating model is not "one pass does everything." It is a durable
cycle that remembers unfinished work, advances the highest-value next phase,
avoids repeating completed scrape work, and makes every pause, defer, or guard
visible to operators.

The convergence goal is staged: AuraCall should not broadly resume live follow
until one subscribed ChatGPT account can complete an initial backfill, transition
to steady-follow, keep itself current across at least one restart boundary, and
yield to foreground operator/API/browser work without provider-warning churn.

## Current State

- Account mirror refreshes can persist catalog, context, file, artifact, media,
  and completion evidence.
- Reverse-mtime frontier selection exists for bounded steady-follow passes.
- Live-follow cycle phase persistence exists and can carry
  `detail-inventory` across wake boundaries.
- ChatGPT targeted detail inventory can skip root/project rails and preserve
  cached per-conversation file and attachment evidence.
- The current blocker is semantic: artifact-rich chats with completed context
  still look unfinished because `metadata_only` freshness conflates "detail
  scrape complete" with "every remote context asset locally materialized."
- Operator preemption exists in pieces, but live follow still needs one explicit
  priority model for foreground runs, manual materialization, reconciliation,
  browser jobs, and account-mirror background work.

## Progress

### 2026-07-05 | M0 Shared State Contract

- Added `src/accountMirror/liveFollowOperatingModel.ts` as the shared
  live-follow operating vocabulary for collector phases, routine phases,
  routine phase statuses, routine decision states, and materialization backlog
  states.
- Account-mirror status persistence, refresh requested-phase guards,
  live-follow cycle decisions, status interfaces, and CLI/API normalization now
  consume the shared contract instead of local string unions.
- Added `docs/dev/live-follow-operating-model-contract.md` to document
  metadata freshness versus local materialization states for operators and
  future implementation slices.

Validation:

- `pnpm vitest run tests/accountMirror/liveFollowOperatingModel.test.ts tests/status/liveFollowHealth.test.ts tests/cli/apiStatusCommand.test.ts --testNamePattern "live follow operating model|materialization|routineDecision|deferred asset|proof scope"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/liveFollowOperatingModel.ts src/accountMirror/statusRegistry.ts src/accountMirror/liveFollowCycleDecision.ts src/accountMirror/completionStore.ts src/accountMirror/refreshService.ts src/status/liveFollowHealth.ts src/cli/apiStatusCommand.ts tests/accountMirror/liveFollowOperatingModel.test.ts --max-diagnostics 40`

### 2026-07-05 | M5 Metadata-Only Split

- `metadata_only` now treats completed chat context and remote asset references
  as metadata-current even when local asset bytes are still missing.
- Missing local bytes remain visible through `assetCompleteness=partial` and
  `missingLocalCount`, so operator/materialization surfaces can still expose the
  backlog.
- `recent_missing_assets` and `full_missing_assets` preserve the prior behavior:
  missing local bytes still select the row for follow-up work.
- Completion-driven refreshes now pass the materialization policy through
  refresh, cached freshness hydration, and collector frontier selection.

### 2026-07-05 | M7 Materialization Backlog Readback

- Live-follow target accounts now expose a structured
  `materializationBacklog` readback alongside raw asset inventory.
- The readback distinguishes `metadata_current_backlog` from
  `materialization_required`, carrying policy, metadata-current status,
  local-required status, and local/remote/unknown asset counts.
- `/status` and CLI-normalized API status keep the field so operators can see
  that a target is metadata-current while local asset bytes remain a separate
  backlog.

Validation:

- `pnpm vitest run tests/status/liveFollowHealth.test.ts tests/http.responsesServer.test.ts --testNamePattern "materialization|effective live-follow wake"`
- `pnpm exec tsc --noEmit --pretty false`

### 2026-07-05 | M2/M7 Routine Decision Readback

- Live-follow target accounts now expose `routineDecision`, a compact
  operator decision record with `state`, `nextPhase`, `why`, `eligibleAt`,
  `lastProgressAt`, remaining detail/materialization/account-library work,
  guard/preemption placeholders, and the active cycle ledger when present.
- Active completion state has precedence over backlog-only states, so a running
  pass reports the phase it is actually advancing while still carrying
  materialization backlog counts.
- CLI-normalized API status preserves the same decision object for downstream
  operator tooling.

Validation:

- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "effective live-follow wake"`
- `pnpm vitest run tests/cli/apiStatusCommand.test.ts --testNamePattern "proof scope|deferred asset"`
- `pnpm exec tsc --noEmit --pretty false`

### 2026-07-05 | M4/M6 Foreground Preemption Decision Evidence

- Live-follow target account `routineDecision` now consumes the scheduler
  foreground/backpressure readback instead of leaving preemption as an empty
  placeholder.
- A scheduler pass that yields to `foreground-work` now marks the selected
  live-follow target as `operator_preempted`, preserves the next routine phase,
  and reports the foreground-yield reason in the target-level decision.
- Active completion state still wins over global scheduler preemption, so
  running/queued/paused work remains visible while idle eligible targets can
  explain why the scheduler backed away.

Validation:

- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "foreground scheduler preemption|does not treat an idle background drain cadence timer"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/http/responsesServer.ts --max-diagnostics 20`
- `pnpm run plans:audit -- --keep 152`

### 2026-07-05 | M2/M6 Scheduler Phase Decision Evidence

- Scheduler-selected live-follow targets now carry an additive
  `requestedPhase` plus `phaseDecision` record, derived from the same
  live-follow phase chooser used by completion cycles.
- Execute scheduler passes pass `sweepMode`, materialization policy, and the
  chosen `requestedPhase` into `requestRefresh`, so an account with pending
  detail inventory asks the collector for `detail-inventory` instead of
  implicitly restarting at identity/root rails.
- Idle target `routineDecision` readback now uses the same status evidence, so
  `/status` shows pending detail inventory as the next phase even before an
  active completion ledger exists.

Validation:

- `pnpm vitest run tests/accountMirror/schedulerService.test.ts tests/http.responsesServer.test.ts --testNamePattern "selected live-follow phase|pending detail inventory|effective live-follow wake|foreground scheduler preemption"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/schedulerService.ts src/accountMirror/liveFollowCycleDecision.ts src/http/responsesServer.ts tests/accountMirror/schedulerService.test.ts --max-diagnostics 20`
- `pnpm run plans:audit -- --keep 152`

### 2026-07-05 | M6 Ledger-Backed Scheduler Fairness

- Scheduler live-follow target selection now reads persisted scheduler pass
  history before choosing the next eligible account.
- Within the same completeness priority, the least-recently selected
  live-follow target wins before backlog size, so one artifact-heavy account
  cannot monopolize repeated scheduler cycles.
- The HTTP server wires the default scheduler pass service to the persisted
  scheduler ledger, so target fairness survives API restarts.

Validation:

- `pnpm vitest run tests/accountMirror/schedulerService.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/schedulerService.ts src/http/responsesServer.ts tests/accountMirror/schedulerService.test.ts --max-diagnostics 20`
- `pnpm run plans:audit -- --keep 152`

### 2026-07-05 | M1 Account Backfill Ledger Foundation

- Account mirror status now carries a typed per-account `backfillLedger`
  alongside mirror completeness.
- Completed refreshes derive and persist the ledger into the existing
  account-mirror status state, so `refreshPersistentState()` hydrates backfill
  progress across API restarts before a new completion operation starts.
- The ledger preserves M1 cursor slots for project index, root rail, project
  conversations, newest-first detail, account-library catchup, and
  materialization/recovery. The current refresh path populates the evidence it
  already owns and carries account-library/materialization cursor state forward
  for the producers that own those jobs.

Validation:

- `pnpm vitest run tests/accountMirror/backfillLedger.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/cachePersistence.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/artifactRecoveryPlanner.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/backfillLedger.ts src/accountMirror/statusRegistry.ts src/accountMirror/cachePersistence.ts src/accountMirror/refreshService.ts tests/accountMirror/backfillLedger.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/cachePersistence.test.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/artifactRecoveryPlanner.test.ts --max-diagnostics 30`

### 2026-07-05 | M1 Producer-Owned Backfill Cursor Updates

- The account-mirror status registry now exposes an optional write-through hook
  for persisted status state updates that originate outside refresh
  completion.
- Account-library and materialization producers update the account-level
  `backfillLedger` when they queue, reuse, skip, or hydrate terminal job
  outcomes.
- Status hydration can now show producer-owned account-library and
  materialization cursor outcomes as pending, complete, or skipped across API
  restart, instead of relying only on the active completion operation.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/backfillLedger.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/cachePersistence.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/backfillLedger.ts src/accountMirror/statusRegistry.ts src/accountMirror/completionService.ts src/http/responsesServer.ts tests/accountMirror/completionService.test.ts tests/accountMirror/backfillLedger.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/cachePersistence.test.ts --max-diagnostics 40`

### 2026-07-05 | M2/M7 Backfill-Ledger Phase Decisions

- The shared live-follow phase chooser now accepts the account-level
  `backfillLedger` and treats its `nextEligiblePhase` plus cursor reason as
  authoritative before falling back to latest refresh evidence.
- Scheduler execute passes now request the ledger-selected collector phase, so
  an API restart can continue a pending project-conversations/detail phase
  instead of restarting rails.
- Idle `/status` routine decisions now surface ledger-selected phases as
  `backfilling`, `account_library_catchup`, or `materialization_pending` before
  reporting a complete mirror as caught up.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/schedulerService.test.ts tests/http.responsesServer.test.ts --testNamePattern "backfill ledger|selected live-follow phase|pending detail inventory|effective live-follow wake|foreground scheduler preemption"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/liveFollowCycleDecision.ts src/accountMirror/schedulerService.ts src/http/responsesServer.ts tests/accountMirror/completionService.test.ts tests/accountMirror/schedulerService.test.ts --max-diagnostics 40`
- `pnpm exec biome check --write tests/http.responsesServer.test.ts --max-diagnostics 5`

### 2026-07-05 | M2 Bounded Completion Phase Selection

- Manual/bounded `mirror-complete` operations now refresh persisted status
  state before each collector pass and choose their requested collector phase
  from the same account-level backfill ledger used by live-follow scheduler
  target selection.
- A one-pass bounded completion with pending `detail-inventory` now asks the
  collector for `detail-inventory` instead of defaulting back to broad
  identity/project/root rail work.
- Installed dogfood on `chatgpt/wsl-chrome-3` proved completion
  `acctmirror_completion_de84d37f-a509-4450-a03a-ab37132ca2d4` ran
  `identity` plus `detail-inventory`, completed one pass in 78s, scanned four
  conversation detail surfaces, used zero project-index/root-rail active
  reads, reported `llmServiceRequests=0`, `cdpMethodCalls=9`, and stayed under
  the provider-interaction budget at `5/6`.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts --testNamePattern "bounded refresh|persisted phase ledger|requested live-follow phase"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/completionService.ts tests/accountMirror/completionService.test.ts`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`

### 2026-07-05 | M3 Passive Telemetry Accounting

- Scrape-budget passive counters now use browser/provider telemetry as evidence,
  not only final artifact/file-bearing progress arrays.
- ChatGPT visible-DOM reads such as `chatgpt.readVisibleConversationFiles`,
  artifact/canvas probe reads, and context/app-state reads such as
  `chatgpt.readConversationMessages` or `llmService.getConversationContext`
  raise the passive parse/read counters even when the pass finds no new
  artifacts or files.
- This fixes the misleading `passive.total=0` shape from empty or chunked
  detail-inventory passes: a loaded chat that was parsed but produced no new
  materialized objects is no longer reported as purely active UI work.
- Installed dogfood on `chatgpt/wsl-chrome-3` proved completion
  `acctmirror_completion_10a35365-d10a-464c-abfa-4371f3dead2c` completed one
  bounded metadata-only detail pass with `classification=passive_dominant`,
  passive `6`, active `5`, `llmServiceRequests=0`, `cdpMethodCalls=9`, provider
  interactions `5/6`, no provider guard, and `detail-inventory` still selected
  as the next ledger phase.

Validation:

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts --testNamePattern "requested detail-inventory|passive telemetry"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`

## North-Star Routine

For each subscribed account, live follow should run as a low-priority,
stateful, restart-safe background worker:

1. Verify identity without mutating provider state.
2. Read the newest rail/catalog slice until the freshness frontier proves the
   visible account state is current.
3. Continue any unfinished phase from the previous cycle instead of restarting
   at root rails.
4. For selected chats, parse the already-loaded DOM/app state once, persist the
   context and available download references, and stop reselecting that chat
   once metadata obligations are complete.
5. Queue local materialization/recovery as a separate, bounded obligation when
   policy requires files, artifacts, or media to be local.
6. Back away on provider guards, suspicious CAPTCHA/sorry pages, or foreground
   operator demand.
7. Expose one compact operator status line plus drilldown evidence for the
   exact next phase, delay, blocker, and remaining work.

## Convergence Milestones

These gates define the path from the current repaired slices to a routine that
is safe to resume broadly.

### Gate A | Contracted State And Progress

Live follow has one shared state/phase vocabulary, and every subscribed account
status row can answer:

- what phase is next;
- why that phase was selected;
- what remains in backfill, steady metadata, account library catch-up, and
  local materialization;
- whether a guard, cadence delay, or operator preemption is blocking progress.

Exit evidence:

- scheduler, completion, status, CLI/API, and operator readback consume the same
  contract;
- status after API restart preserves the same per-account next phase instead of
  falling back to root rail walking.

### Gate B | Bounded Backfill Cycle

One subscribed account can run bounded cycles that advance historical catch-up
without attempting to walk rails, projects, project conversations, account
library, and full chat detail in one pass.

Exit evidence:

- each cycle starts from the persisted backfill ledger;
- completed phases are not repeated unless their freshness evidence expires;
- interruption or service restart resumes from the ledger-selected phase.

### Gate C | Steady-Follow Cycle

An account that is backfilled can run newest-first maintenance without becoming
a hidden full backfill.

Exit evidence:

- rail/catalog freshness frontier decides whether new detail inventory is due;
- artifact-rich chats with complete context and remote references do not
  re-enter detail scraping solely because local bytes are missing;
- materialization backlog is queued or exposed under policy, not treated as
  metadata staleness.

### Gate D | Provider-Polite Budget Proof

Live follow can prove whether a pass is mostly passive DOM/app-state parsing or
active provider interaction.

Exit evidence:

- single-chat detail passes expose passive counters, active counters,
  LLM-service request count, CDP method counts, and provider guard correlation;
- avoidable provider warnings are treated as scrape-shape defects until the
  evidence proves a provider-wide cooldown/guard.

### Gate E | Foreground Preemption Proof

Foreground operator work outranks background live follow without losing routine
position.

Exit evidence:

- a queued foreground browser-backed request causes live follow to yield before
  acquiring the browser lease or at a safe checkpoint;
- status reports `operator_preempted` with the blocking work class and retry
  time;
- the later live-follow pass resumes from the same ledger-selected phase.

### Gate F | Installed Resume Decision

Broad live-follow resume is allowed only after installed dogfood proves a full
backfill-to-steady transition and one steady keep-current loop.

Exit evidence:

- installed service evidence includes completion ids, status snapshots, phase
  ledger readback, scrape-budget counters, provider guard state, and foreground
  preemption/yield evidence;
- no normal-cadence pass produces avoidable rate-limit warnings;
- any remaining backlog is classified as backfill, steady metadata,
  account-library catch-up, or materialization, with the next bounded action
  visible to operators.

## Milestones

### M0 | Terminology And State Contract

Define one vocabulary for live-follow state:

- `backfill`: broad catch-up for an account that lacks complete historical
  metadata.
- `steady-follow`: routine newest-first freshness maintenance.
- `metadata_complete`: rail/chat/context metadata obligations are satisfied.
- `local_materialization_pending`: remote assets are known but local bytes are
  not required for the current metadata-only objective or are queued elsewhere.
- `operator_preempted`: foreground user/API/browser work has priority.
- `provider_guarded`: provider rate-limit/CAPTCHA/sorry state requires delay or
  human clearance.

Deliverables:

- [x] shared enum/contract for completion, scheduler, status, and dashboard
  use;
- [x] docs update explaining the difference between metadata freshness and local
  asset materialization.

Acceptance:

- a row with complete chat context and remote-only assets can be reported as
  metadata-current without falsely claiming local files exist;
- a row that truly needs local bytes remains actionable as materialization
  work, not detail-scrape work.

### M1 | Account Backfill Ledger

Persist a per-account ledger of historical catch-up obligations:

- root rail cursor;
- project cursor;
- project conversation cursor;
- newest-first detail cursor;
- account library cursor;
- materialization/recovery cursor;
- last completed phase and next eligible phase.

Acceptance:

- restarting the API does not cause a backfill cycle to restart at the same
  rail every time;
- broad backfill can be paused and resumed without losing position;
- status distinguishes "backfill incomplete" from "steady-follow stale."

### M2 | Steady-Follow Decision Tree

Make the live-follow next-phase decision deterministic:

1. If provider guard or human verification is active, pause/delay.
2. If foreground operator work exists for the same browser profile/account,
   yield.
3. If account lacks initial backfill metadata, advance the backfill ledger.
4. If newest rail freshness frontier is stale, read newest rail/catalog rows.
5. If selected chats need metadata detail, run bounded detail inventory.
6. If only local bytes are missing, enqueue or expose materialization work
   according to policy.
7. If nothing is due, sleep until cadence/jitter says the account is eligible.

Acceptance:

- live follow never starts a cycle by reflexively walking root rails when a
  later unfinished phase is pending;
- pass evidence names exactly which branch selected the next phase.

### M3 | Provider-Polite Scrape Budget

Replace broad pacing guesses with action-aware scrape accounting:

- count identity reads, rail reads, chat loads, DOM parses, app-state reads,
  download-link enumeration, and actual downloads separately;
- define per-provider budgets for passive DOM/app-state parsing versus active
  UI interactions;
- require a pass to yield before it burns through a provider-warning boundary;
- treat repeated warnings as scrape-shape defects until evidence proves a
  provider-wide guard.

Acceptance:

- a single artifact-rich chat detail pass should mostly consume passive
  DOM/app-state parse budget, not repeated LLM-service or UI interaction budget;
- rate-limit warnings result in clear guard evidence and a cooldown, not blind
  retry loops.

### M4 | Operator Preemption And Browser Lease Priority

Make foreground work authoritative over background live follow:

- live operator requests, manual API calls, archive/materialization jobs, and
  browser-control commands have priority over live follow;
- live follow yields before acquiring a browser lease when foreground work is
  queued;
- live follow yields during a pass at safe checkpoints when a higher-priority
  request appears;
- status shows `operator_preempted` with the blocking work class and retry time.

Acceptance:

- a foreground browser-backed request is not delayed behind routine live follow;
- the live-follow pass resumes from the same phase after preemption.

### M5 | Metadata-Only Versus Materialization Policy

Separate "what must be known" from "what must be local":

- `metadata_only`: keep rails, chats, context, remote asset references, and
  routeability current; do not repeatedly detail-scrape solely because local
  bytes are missing.
- `recover_missing_assets`: queue bounded materialization jobs for missing
  local bytes after metadata is current.
- `full_sweep`: explicitly spends broader provider work to close both metadata
  and local materialization obligations.

Acceptance:

- [x] artifact-rich chats stop re-entering detail inventory after complete context
  and remote references are persisted;
- [x] missing local assets remain visible as materialization backlog with counts,
  ids, and policy reason.

### M6 | Backpressure And Cadence Model

Define one cadence model across accounts:

- per-account minimum interval and jitter;
- per-provider concurrent browser/account limit;
- provider-guard cooldown;
- foreground-work cooldown/yield windows;
- backlog-aware catch-up cadence that slows when warnings appear and speeds up
  when work is passive and safe.

Acceptance:

- subscribed accounts all receive progress without one artifact-rich account
  monopolizing the loop;
- operator status can explain whether an account is eligible, delayed,
  guarded, preempted, caught up, or backfilling.

### M7 | Operator Observability And Controls

Expose the operating model in the API, CLI, MCP, and dashboard:

- compact target row: `state`, `nextPhase`, `why`, `eligibleAt`,
  `lastProgressAt`, `remainingWork`, `guard`, `preemption`;
- drilldown: phase ledger, frontier evidence, scrape budget, materialization
  backlog, last yield cause;
- controls: pause, resume, force one bounded pass, clear provider guard,
  prioritize account, defer account.

Acceptance:

- operators can answer "what is live follow doing and why?" without raw JSON;
- force/resume controls preserve the same safety gates unless explicitly
  overridden with auditable evidence.

### M8 | Installed Dogfood Proof

Prove the routine on installed services, not only local tests:

- one initial/backfill account;
- one steady-follow account that is already mostly current;
- one artifact-rich ChatGPT account;
- one provider-guard or preemption scenario;
- one API restart/resume boundary.

Acceptance:

- passes advance different phases across cycles instead of restarting at the
  same place;
- no avoidable provider warnings during normal cadence;
- foreground operator work preempts live follow;
- completion/status evidence proves accounts are current or explains the exact
  remaining backlog.

## Execution Order

Critical path:

1. M0 state contract.
2. M2 decision tree.
3. M5 metadata/materialization policy.
4. M4 preemption.
5. M8 installed proof.

Parallelizable tracks:

- M1 backfill ledger can proceed while M5 policy is implemented if interfaces
  are kept narrow.
- M3 scrape-budget telemetry can proceed alongside M2 as instrumentation first.
- M7 operator observability can start with read-only projections and fill in
  controls after M2/M4 settle.
- M6 cadence can be refined after M3/M4 produce real evidence.

## Progress

### 2026-07-05 | M3 Scrape-Budget Evidence Projection

- Account-mirror metadata evidence now carries `scrapeBudget` with separate
  passive counters for DOM parses, app-state reads, download-link enumeration,
  and cached-file carries, plus active counters for identity reads, project
  index reads, root rail reads, project conversation reads, chat loads,
  account-library reads, and downloads.
- The ChatGPT requested `detail-inventory` path now reports a single-chat
  artifact scrape shape as `passive_dominant`: one chat load plus one identity
  read, no root rail/project index reads, no account-library read, and zero
  LLM-service requests at the account-mirror collector boundary.
- `/status` live-follow target rows and CLI-normalized status preserve the
  scrape-budget evidence so operators can inspect provider-interaction budget
  usage, passive/active totals, LLM-service request count, and CDP-method
  traffic once browser telemetry is attached.

Validation:

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts tests/http.responsesServer.test.ts --testNamePattern "requested detail-inventory|pending detail inventory"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check --write src/accountMirror/statusRegistry.ts src/cli/apiStatusCommand.ts src/accountMirror/chatgptMetadataCollector.ts src/status/liveFollowHealth.ts src/http/responsesServer.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/http.responsesServer.test.ts --max-diagnostics 40`

### 2026-07-05 | M3 CDP Method Telemetry

- Account-mirror collection now attaches the existing browser scrape telemetry
  recorder to its shared provider `listOptions`, then snapshots the recorder
  into `scrapeBudget` after detail inventory.
- `scrapeBudget` now includes aggregate `cdpMethodCalls`, exact `cdpMethods`
  counts by CDP method, and exact `providerActions` counts by provider/LLM
  service action, while continuing to report `llmServiceRequests: 0` for the
  account-mirror collector boundary.
- Focused tests prove the requested `detail-inventory` path propagates
  provider telemetry into account-mirror evidence and that `/status` preserves
  the method/action breakdown for operator inspection.

Validation:

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts tests/http.responsesServer.test.ts --testNamePattern "requested detail-inventory|pending detail inventory"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check --write src/accountMirror/statusRegistry.ts src/accountMirror/chatgptMetadataCollector.ts src/status/liveFollowHealth.ts src/cli/apiStatusCommand.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/http.responsesServer.test.ts --max-diagnostics 40`

### 2026-07-05 | M3 Provider-Guard Correlation

- `scrapeBudget` now carries `providerGuardCorrelation` so a completed scrape
  can distinguish "no provider warning seen" from "scrape completed but a
  provider cooldown/guard was active immediately afterward".
- The collector still emits a stable `state: "none"` default; guard ownership
  remains in the refresh/status layer. After a successful refresh,
  `readAccountMirrorProviderCooldown` enriches the just-produced scrape budget
  with guard state, summary, detected/cooldown timestamps, action, and whether
  the scrape also yielded to foreground work.
- `/status` and CLI-normalized status preserve this correlation alongside CDP
  method/action counts, so operators can compare scrape shape, live operator
  preemption, and ChatGPT cooldown evidence without assuming rate-limit guards
  caused the scrape behavior.

Validation:

- `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/http.responsesServer.test.ts --testNamePattern "active ChatGPT rate-limit guard|requested detail-inventory|pending detail inventory"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/statusRegistry.ts src/accountMirror/chatgptMetadataCollector.ts src/accountMirror/refreshService.ts src/status/liveFollowHealth.ts src/cli/apiStatusCommand.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/http.responsesServer.test.ts --max-diagnostics=24`
  - reports only pre-existing non-null assertion warnings in
    `tests/http.responsesServer.test.ts`.

Remaining M3 work:

- installed dogfood pass proving the new guard correlation against real
  ChatGPT warning/yield evidence.

### 2026-07-05 | M2/M3/M8 Requested-Phase Installed Readback

- `AccountMirrorRefreshResult` now carries the normalized `requestedPhase` that
  was sent into the metadata collector, so completion readback can prove which
  branch actually ran instead of inferring it from lifecycle messages alone.
- Focused tests cover bounded completion phase readback, scheduler fixtures,
  refresh-service results, MCP refresh fixtures, and HTTP refresh mocks.
- Installed dogfood on `chatgpt/wsl-chrome-3` proved bounded metadata-only
  completion `acctmirror_completion_512abfb3-d0e5-49db-a9e7-070c06e2140d`
  completed one pass after API reinstall/restart with
  `lastRefresh.requestedPhase=detail-inventory`, scanned four conversation
  detail surfaces, selected five newest conversation rows, stopped at a
  three-row freshness frontier, and left 90 detail surfaces remaining.
- The same installed pass reported `classification=passive_dominant`, passive
  `6`, active `5`, provider interactions `5/6`, `llmServiceRequests=0`,
  `cdpMethodCalls=9`, CDP methods
  `Target.createTarget=2`, `Target.attachToTarget=2`, `Page.enable=2`,
  `Runtime.enable=2`, `Runtime.evaluate=1`, and
  `providerGuardCorrelation.state=none`.
- Installed status still showed the live-follow target paused, with
  `routineDecision.nextPhase=detail-inventory`; this was a bounded proof pass,
  not a broad live-follow resume.

Validation:

- `pnpm vitest run tests/accountMirror/refreshService.test.ts tests/accountMirror/completionService.test.ts tests/accountMirror/schedulerService.test.ts tests/http.responsesServer.test.ts tests/mcp.accountMirrorRefresh.test.ts --testNamePattern "requested phase|persisted phase ledger|bounded refresh|selected live-follow phase|starts nonblocking|foreground scheduler preemption|requests one explicit refresh"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/refreshService.ts tests/accountMirror/refreshService.test.ts tests/accountMirror/completionService.test.ts tests/accountMirror/schedulerService.test.ts scripts/smoke-account-mirror-scheduler-history.ts scripts/smoke-live-follow-health-parity.ts tests/mcp.accountMirrorRefresh.test.ts --max-diagnostics 40`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_512abfb3-d0e5-49db-a9e7-070c06e2140d --json --timeout-ms 30000`

## Non-Goals

- Do not tune rate-limit thresholds as a substitute for fixing scrape shape.
- Do not require one cycle to walk rails, projects, project conversations,
  account library, and full chat detail.
- Do not auto-click provider confirmation or human-verification surfaces.
- Do not mark remote-only assets as locally materialized.
- Do not let background live follow outrank explicit operator requests.

## Acceptance Criteria

- [x] A documented live-follow state contract exists and is used by scheduler,
  completion, status, and operator surfaces.
- [ ] Backfill progress is persisted per account and resumes from the correct
  phase across API restarts.
- [ ] Steady-follow chooses the next phase from current evidence instead of
  restarting at root rails.
- [x] `metadata_only` freshness can complete for chats with persisted context
  and remote references while keeping local materialization backlog visible.
- [x] Provider-polite scrape telemetry distinguishes passive parsing from
  active UI/provider interactions.
- [ ] Foreground operator work preempts or defers live follow with explicit
  status evidence.
- [ ] Installed dogfood proves at least one full backfill-to-steady transition
  and one steady-follow keep-current loop without avoidable rate-limit warnings.

## Definition Of Done

This plan closes when installed AuraCall live follow behaves as a durable,
polite, operator-preemptible background routine for subscribed accounts, with
status evidence that explains each account's current phase, remaining backlog,
next wake, and safety posture.
