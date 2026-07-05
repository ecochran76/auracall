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

- shared enum/contract for completion, scheduler, status, and dashboard use;
- docs update explaining the difference between metadata freshness and local
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

- artifact-rich chats stop re-entering detail inventory after complete context
  and remote references are persisted;
- missing local assets remain visible as materialization backlog with counts,
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

## Non-Goals

- Do not tune rate-limit thresholds as a substitute for fixing scrape shape.
- Do not require one cycle to walk rails, projects, project conversations,
  account library, and full chat detail.
- Do not auto-click provider confirmation or human-verification surfaces.
- Do not mark remote-only assets as locally materialized.
- Do not let background live follow outrank explicit operator requests.

## Acceptance Criteria

- [ ] A documented live-follow state contract exists and is used by scheduler,
  completion, status, and operator surfaces.
- [ ] Backfill progress is persisted per account and resumes from the correct
  phase across API restarts.
- [ ] Steady-follow chooses the next phase from current evidence instead of
  restarting at root rails.
- [ ] `metadata_only` freshness can complete for chats with persisted context
  and remote references while keeping local materialization backlog visible.
- [ ] Provider-polite scrape telemetry distinguishes passive parsing from
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
