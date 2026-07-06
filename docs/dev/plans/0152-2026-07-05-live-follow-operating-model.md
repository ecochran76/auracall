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

The operator-facing resume target is a milestone ladder, not one oversized
cycle. A safe routine must be able to stop after any bounded pass, preserve the
account-level ledger, and let the next cycle start at the next owed phase for
that account or another eligible subscribed account.

## Decision Tree

Live follow should choose the next action from account evidence, not from a
fixed provider traversal order:

1. If foreground operator/API/browser work is active, defer before provider
   refresh and record the preemption/defer reason.
2. If the provider has a guard/cooldown, back away and surface the guard
   rather than probing again.
3. If a subscribed target is operator-paused, legacy-blocked, disabled, or in
   identity mismatch, keep it out of automatic broad resume until an explicit
   target policy handles that state.
4. If a target has unfinished account evidence, resume the persisted next phase
   only: identity, root conversations, project conversations, selected detail
   inventory, account-library catch-up, or materialization, whichever the
   ledger says is owed.
5. If metadata is current and only local bytes are missing under
   `metadata_only`, keep metadata live follow in steady-follow and expose the
   materialization backlog separately.
6. If metadata is complete with zero selected detail surfaces, run
   steady-follow as a cheap freshness check: newest rows first, frontier stop,
   no full rail replay, no account-library read unless the target policy
   explicitly enables it.

The scheduler should rotate among eligible subscribed accounts by the next
owed phase and cadence window. It must not start every cycle by walking
conversation rails, because rail walking, project discovery, project
conversations, file-library catch-up, and full chat/detail scraping are too
large to finish safely in one routine cycle.

## Convergence Milestones

- M1: Persist and expose a per-account phase ledger that survives restarts.
- M2: Make every status/control readback hydrate current account evidence so
  operators see the real next owed phase.
- M3: Prove cheap steady-follow on complete accounts with zero detail backlog.
- M4: Prove foreground operator work preempts scheduler and completion refresh
  before provider work starts.
- M5: Separate metadata freshness from local materialization so remote asset
  references do not force broad chat re-scrapes.
- M6: Preserve cadence and guard boundaries for forced/controlled passes.
- M7: Drain an artifact-rich selected detail backlog over multiple cycles
  without replaying root/project rails.
- M8: Audit the remaining subscribed-account posture and classify each target
  as safe steady-follow, safe bounded resume, explicit operator-paused, or
  provider-specific blocked work.
- M9: Resume broad live follow only after M8 leaves no desired-enabled target
  in an ambiguous state.

## Current State

- Account mirror refreshes can persist catalog, context, file, artifact, media,
  and completion evidence.
- Reverse-mtime frontier selection exists for bounded steady-follow passes.
- Live-follow cycle phase persistence exists and can carry
  `detail-inventory` across wake boundaries.
- ChatGPT targeted detail inventory can skip root/project rails and preserve
  cached per-conversation file and attachment evidence.
- Artifact-rich chats with completed context no longer look unfinished merely
  because remote assets still need local materialization; `metadata_only`
  freshness and local materialization backlog now remain separate status
  concerns.
- Operator preemption now has deterministic source, installed-harness, and
  installed-service proof. The remaining decision is operational: whether that
  evidence is sufficient to resume the normal subscribed-account routine, or
  whether to stage one additional real foreground collision before broad
  resume.

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

### 2026-07-06 | M4/M6 Completion Deferral Evidence

- Live-follow completions that yield to foreground AuraCall work now append a
  `foreground_work_deferred` lifecycle event with the blocking reason and retry
  timestamp.
- The scheduler diagnostics bundle now includes the compact completion
  `latestLifecycleEvent`, matching the live-follow target account rollup, so
  operators can distinguish a foreground deferral from a silent idle wait.
- Installed status readback showed the current configured live-follow accounts
  are paused/minimum-interval or disabled/blocked; this preserves safety, but
  it does not yet produce an installed `operator_preempted` scheduler pass
  without first changing live-follow completion state.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts --testNamePattern "defers due live-follow completion refreshes"`
- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "scheduler diagnostics|foreground scheduler preemption|does not treat an idle background drain cadence timer"`

### 2026-07-06 | M4/M8 Foreground Deferral Smoke

- Added `pnpm run smoke:foreground-deferral` as a deterministic no-provider
  proof that a paused live-follow completion resumes, observes foreground
  backpressure before refresh, records `foreground_work_deferred`, and exposes
  that lifecycle event through API status and scheduler diagnostics.
- Wired the smoke into `preflight:lazy-live-follow`, so release/operator
  preflight now fails if foreground deferral regresses before live dogfood.
- Source smoke proof completed with `providerRefreshCalls=0` and
  `providerWork=none`.

Validation:

- `pnpm run smoke:foreground-deferral`

### 2026-07-06 | M4/M7 Scheduler Preemption Smoke

- Added `pnpm run smoke:scheduler-preemption` as a deterministic no-provider
  proof that an execute-mode scheduler pass yielding to foreground work is
  projected through `/status` and CLI-normalized status as target-level
  `operator_preempted`.
- Wired the smoke into `preflight:lazy-live-follow`, so operator/release
  preflight now proves both completion-level foreground deferral and
  scheduler-level foreground preemption before any live dogfood resumes real
  subscribed accounts.
- The smoke uses an isolated API server with an injected foreground-yielded
  scheduler pass and an injected completion service that would fail if
  completion/provider work started.

Validation:

- `pnpm run smoke:scheduler-preemption`

### 2026-07-06 | M7/M8 Installed Steady-Follow Cadence Readback

- Installed dogfood on `chatgpt/wsl-chrome-3` proved bounded steady-follow
  keep-current completion
  `acctmirror_completion_b770b9eb-a232-4295-8d39-c10053dcf514` completed from
  `2026-07-06T04:22:16.353Z` to `2026-07-06T04:22:31.698Z`.
- The pass remained cheap and metadata-only: it examined three newest
  conversation rows, selected zero rows for detail, scanned zero detail
  surfaces, kept `mirrorCompleteness.state=complete`, reported
  `llmServiceRequests=0`, `cdpMethodCalls=8`, `active.total=2`, and
  `providerGuardCorrelation.state=none`.
- After an installed API restart, completion status and `/status` preserved the
  completed pass evidence and updated the target `lastProgressAt` to
  `2026-07-06T04:22:31.698Z`.
- Resuming the single existing live-follow completion
  `acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae` for
  `chatgpt/wsl-chrome-3` did not restart rails or spend immediate provider
  work. It reconciled to `idle_waiting` with
  `mirrorCompleteness.state=complete`, zero remaining detail surfaces,
  `nextAttemptAt=2026-07-06T04:50:42.986Z`, and the live-follow cycle decision
  `complete`.
- Target routine-decision readback now treats complete `idle_waiting`
  live-follow operations as `steady_follow` cadence wait instead of reporting
  them as actively `running`.

Validation:

- `auracall api mirror-complete --port 18095 --provider chatgpt --runtime-profile wsl-chrome-3 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_b770b9eb-a232-4295-8d39-c10053dcf514 --port 18095 --json`
- `systemctl --user restart auracall-api.service`
- post-restart `/status` readback for `chatgpt/wsl-chrome-3`
- `auracall api mirror-completion-control acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae resume --port 18095 --json`
- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "idle-waiting live-follow|effective live-follow wake|pending detail inventory"`
- `pnpm exec tsc --noEmit --pretty false`

### 2026-07-06 | Gate F Installed Incomplete-Account Probe

- Installed `chatgpt/wsl-chrome-2` bounded completion
  `acctmirror_completion_cacf3d32-091d-4ae1-a4bd-0730a70bc0ef` failed before
  any provider refresh with
  `Unexpected non-whitespace character after JSON at position 470`; disk
  inspection traced the exact malformed file to
  `~/.auracall/cache/providers/chatgpt/__runtime__/rate-limit-wsl-chrome-2.json`,
  not DOM parsing, CDP traffic, or an LLM-service request.
- The ChatGPT rate-limit guard now treats malformed persisted guard JSON as a
  stale/absent guard and writes guard state via temp-file rename. With the same
  malformed installed file still present, bounded completion
  `acctmirror_completion_f9175187-dfe5-43e3-83ce-06d558d2fffe` advanced past
  guard parsing, reached collector progress, and completed
  `2026-07-06T04:42:19.734Z` to `2026-07-06T04:45:39.008Z`.
- That pass transitioned the incomplete account to
  `phase=steady_follow` / `mirrorCompleteness=complete`, preserved
  `llmServiceRequests=0`, reported `cdpMethodCalls=12`, and had
  `providerGuardCorrelation.state=none`. It still spent an over-budget active
  shape (`providerInteractions.used=7` with budget `6`), so it is proof of
  local guard repair and bounded backfill completion, not proof that broad
  cadence is safe.
- The immediate follow-up keep-current probe
  `acctmirror_completion_5ccd7f0d-f112-4f5b-9fd2-a8205bd2e6b9` started
  identity/project/root-conversation progress but failed before refresh
  completion with `WebSocket is not open: readyState 3 (CLOSED)`. Gate F stays
  open until the now-complete account can run a successful follow-up
  keep-current pass without restarting into fragile browser-session state.
- Native Chrome can report closed CDP sockets as
  `WebSocket is not open: readyState 3 (CLOSED)` rather than the previously
  recognized `WebSocket connection closed` string. That browser-session error
  is now classified as retryable so metadata reads can reattach/fresh-tab
  instead of failing the account-mirror cycle.
- After reinstall/restart, bounded completion
  `acctmirror_completion_fe05a8f9-9aa2-4b71-a80d-e35884c7030d` completed from
  `2026-07-06T04:53:45.198Z` to `2026-07-06T04:55:04.354Z` with
  `phase=steady_follow`, `mirrorCompleteness=complete`,
  `classification=passive_dominant`, `providerInteractions.used=5` of budget
  `6`, `llmServiceRequests=0`, `cdpMethodCalls=9`, and
  `providerGuardCorrelation.state=none`.
- Resuming the stale paused `chatgpt/wsl-chrome-2` live-follow completion
  `acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2` did not launch
  an immediate broad sweep. It moved from `paused` to `queued` and then
  reconciled to `idle_waiting`, still in `backfill_history`, with
  `passCount=0` and `nextAttemptAt=2026-07-06T05:14:08.904Z`.
- Completion controls now expose the plan's desired force-one-bounded-pass
  action as `run_one_pass` / CLI `run-one-pass`, while preserving live-follow
  mode and normal provider guard / foreground-yield gates.
- Installed control proof on the same `chatgpt/wsl-chrome-2` live-follow
  completion accepted `run-one-pass` at `2026-07-06T05:13:34.217Z`, set
  `forceRunUntilPassCount=1`, woke at cadence, ran exactly one pass from
  `2026-07-06T05:14:08.920Z` to `2026-07-06T05:14:26.566Z`, and returned to
  `idle_waiting` with `phase=steady_follow`, `passCount=1`,
  `forceRunUntilPassCount=null`, and
  `nextAttemptAt=2026-07-06T05:33:31.828Z`.
- The forced pass was a cheap keep-current pass: freshness frontier examined
  three rows, selected zero rows for detail, reported
  `mirrorCompleteness=complete`, used `providerInteractions.used=2` of budget
  `6`, preserved `llmServiceRequests=0`, reported `cdpMethodCalls=8`, and had
  `providerGuardCorrelation.state=none`.

Validation:

- `pnpm vitest run tests/browser/chatgptRateLimitGuard.test.ts`
- `pnpm vitest run tests/browser/chatgptAdapter.test.ts --testNamePattern "isRetryableConnectionError|isRetryableChatgptTransientMessage|classifies connection failures"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-complete --port 18095 --provider chatgpt --runtime-profile wsl-chrome-2 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_f9175187-dfe5-43e3-83ce-06d558d2fffe --port 18095 --json`
- `auracall api mirror-completion-status acctmirror_completion_5ccd7f0d-f112-4f5b-9fd2-a8205bd2e6b9 --port 18095 --json`
- `auracall api mirror-completion-status acctmirror_completion_fe05a8f9-9aa2-4b71-a80d-e35884c7030d --port 18095 --json`
- `auracall api mirror-completion-control acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2 resume --port 18095 --json`
- `auracall api mirror-completion-control acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2 run-one-pass --port 18095 --json`
- `auracall api mirror-completion-status acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2 --port 18095 --json`

### 2026-07-06 | M1/M2 Cycle-Continuation Preflight Gate

- Added `pnpm run smoke:live-follow-cycle` as a deterministic no-provider
  proof that two scheduler cycles consume the persisted account
  `backfillLedger` rather than restarting at identity/root rails.
- The smoke runs the real status registry and scheduler service against a
  fixture account whose ledger advances from `project-conversations` to
  `detail-inventory` between passes, then to `complete`.
- The smoke is wired into `preflight:lazy-live-follow`, so the operator
  preflight now fails if cycle continuation regresses before live dogfood.
- Full preflight closeout also hardened additive MCP readback contracts:
  `api_status` now accepts top-level `proofScope`, and
  `account_mirror_status` tolerates additive status fields emitted by the
  installed runtime.
- Installed archive parity initially found a stale local archive/search index
  for an existing media-generation artifact; installed
  `auracall api archive-backfill` rebuilt the local index without provider
  work, and the full lazy-live-follow preflight then passed.

Validation:

- `pnpm run smoke:live-follow-cycle`
- `pnpm run preflight:lazy-live-follow`

### 2026-07-06 | M8 Installed Steady-Follow Cadence Cycle

- Installed dogfood on `chatgpt/wsl-chrome-2` used the existing live-follow
  completion `acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2`
  instead of starting a broad new completion.
- Operator `run-one-pass` set `forceRunUntilPassCount=4` while preserving the
  safe cadence gate; the completion stayed `idle_waiting` until
  `nextAttemptAt=2026-07-06T06:12:14.551Z`.
- The cadence pass ran from `2026-07-06T06:12:14.570Z` to
  `2026-07-06T06:12:29.802Z` as refresh
  `acctmirror_644c16a1-0f8-4599-bcd3-b22a248a8485`, advanced `passCount` from
  `3` to `4`, cleared `forceRunUntilPassCount`, and returned to
  `idle_waiting`.
- The pass remained a cheap steady-follow loop: the freshness frontier examined
  three rows, selected zero rows for detail, left
  `mirrorCompleteness.state=complete`, kept remaining detail surfaces at `0`,
  used `providerInteractions.used=2` of budget `6`, reported
  `llmServiceRequests=0`, `cdpMethodCalls=8`, and
  `providerGuardCorrelation.state=none`.
- Direct installed service log inspection around the pass found no
  rate-limit, CAPTCHA/sorry, provider-guard, closed-WebSocket, or warning
  lines.
- After `systemctl --user restart auracall-api.service`, PID `51051` read back
  the same completion as `idle_waiting`, `passCount=4`, cycle `complete`, with
  `latestLifecycleEvent=resumed_after_restart` and target
  `routineDecision.state=steady_follow`.

Validation:

- `auracall api mirror-completion-control acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2 run-one-pass --port 18095 --json`
- `auracall api mirror-completion-status acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2 --port 18095 --json`
- `auracall api status --port 18095 --json`
- `tail -n 400 ~/.auracall/logs/api-18095.log`
- `systemctl --user restart auracall-api.service`
- post-restart `auracall api status --port 18095 --json`
- post-restart `auracall api mirror-completion-status acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2 --port 18095 --json`

### 2026-07-06 | M4/M8 Installed Isolated Preemption Harness

- Ran the installed runtime package's scheduler preemption harness directly
  from `~/.auracall/user-runtime/node_modules/auracall/dist/scripts/`, not the
  source tree.
- The scheduler-level harness used an isolated API server and injected
  foreground backpressure. It proved one execute scheduler pass selected an
  eligible live-follow target, yielded to `foreground-work`, projected target
  `routineDecision.state=operator_preempted`, preserved
  `targetNextPhase=identity`, and started zero provider refresh work.
- Ran the installed runtime package's completion foreground-deferral harness
  from the same installed package. It proved a queued live-follow completion
  resumes, observes foreground pressure before refresh, records
  `foreground_work_deferred`, exposes the same lifecycle through status and
  scheduler diagnostics, and starts zero provider refresh work.
- This closes the installed isolated-harness part of Gate E. It does not claim
  broad live-follow resume safety or a real-provider foreground collision; the
  normal service remains on bounded, cadence-preserving proof.

Validation:

- `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-account-mirror-scheduler-preemption.js`
- `node ~/.auracall/user-runtime/node_modules/auracall/dist/scripts/smoke-account-mirror-foreground-deferral.js`

### 2026-07-06 | M4/M8 Installed Foreground-Pressure Scheduler Proof

- Added a status-control action,
  `accountMirrorScheduler.action=run-once-with-foreground-pressure`, that holds
  the same foreground AuraCall work counter used by foreground API/browser
  paths while running one normal scheduler pass.
- The proof action intentionally ignores only the minimum-interval target
  selection gate so an eligible account can be selected for the preemption
  assertion; it still must yield before refresh and does not bypass provider
  guard or foreground-work gates.
- Source regression coverage proves the action selects a live-follow target,
  records `operator-foreground-pressure-proof`, reports scheduler
  backpressure `foreground-work`, projects target-level `operator_preempted`,
  and never calls provider refresh.
- Installed service proof on PID `78853` selected `chatgpt/wsl-chrome-4`, whose
  next ledger-selected phase was `detail-inventory`, then skipped with
  `backpressure.reason=foreground-work`, `refresh=null`, and `error=null`.
  Installed `/status` preserved `lastWakeReason=operator-foreground-pressure-proof`
  and the selected target's 397 remaining detail surfaces, so the routine
  position was visible even though provider work did not start.
- Installed status for `chatgpt/wsl-chrome-2` remained a separate
  steady-follow cadence account with zero remaining detail surfaces and no
  provider guard, confirming the preemption proof did not turn broad live
  follow into another sweep.

Validation:

- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "foreground-pressure proof"`
- `pnpm vitest run tests/http.responsesServer.test.ts tests/accountMirror/schedulerService.test.ts --testNamePattern "foreground-pressure proof|reports foreground scheduler preemption|does not treat an idle background drain cadence timer|pauses, resumes, and manually triggers lazy account mirror scheduler|selected live-follow phase|pending detail inventory|foreground scheduler preemption"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check --write src/accountMirror/schedulerService.ts src/http/responsesServer.ts tests/http.responsesServer.test.ts --max-diagnostics 30`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- installed `POST /status` with
  `{"accountMirrorScheduler":{"action":"run-once-with-foreground-pressure","dryRun":false}}`
- installed `/status` readback on `2026-07-06T06:39:18.927Z`

### 2026-07-06 | M8 Installed Controlled Live-Follow Cycles

- Installed `chatgpt/wsl-chrome-2` live-follow completion
  `acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2` accepted
  `run-one-pass`, waited for its cadence window, ran from
  `2026-07-06T06:50:58.087Z` to `2026-07-06T06:51:14.936Z`, advanced to
  `passCount=6`, cleared `forceRunUntilPassCount`, and returned to
  `idle_waiting` with `nextAttemptAt=2026-07-06T07:10:41.337Z`.
- That cadence pass stayed cheap and provider-polite: it examined three
  freshness-frontier rows, selected zero rows for detail, used
  `providerInteractions.used=2` of budget `6`, reported
  `llmServiceRequests=0`, `cdpMethodCalls=8`, and kept
  `providerGuardCorrelation.state=none`.
- Installed `chatgpt/wsl-chrome-4` live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` proved the
  remaining legacy-resume shape: the first forced pass had to rebuild
  row-selection evidence before requested `detail-inventory`, reduced
  remaining detail surfaces from `404` to `393`, and returned to
  `idle_waiting`, but it spent `providerInteractions.used=7` of budget `6`.
  That pass is logged as legacy repair evidence, not broad-resume proof.
- A direct follow-up bounded proof on `chatgpt/wsl-chrome-4`,
  `acctmirror_completion_5c806a6b-b023-4506-9e9b-4c54228e6009`, then started
  at `detail-inventory:started projects=0 conversations=25` without replaying
  root or project rails, completed from `2026-07-06T06:57:50.286Z` to
  `2026-07-06T06:58:30.535Z`, scanned to zero remaining detail surfaces, and
  kept `mirrorCompleteness.state=complete`.
- The follow-up proof was the desired scrape shape:
  `classification=passive_dominant`, passive total `4`, active total `3`,
  provider budget `used=3` / `remaining=3`, `projectIndexReads=0`,
  `rootRailReads=0`, `chatLoads=2`, `llmServiceRequests=0`, `cdpMethodCalls=9`,
  and `providerGuardCorrelation.state=none`.
- `/status` exposed a projection bug after this proof: the account evidence was
  complete but the active live-follow operation still carried old
  `phase=backfill_history`. Target status now prefers complete current account
  evidence for complete `idle_waiting` operations, so installed readback after
  reinstall/restart reports `chatgpt/wsl-chrome-4` as
  `phase=steady_follow`, `routineDecision.state=steady_follow`,
  `routineDecision.nextPhase=steady_follow`, no foreground preemption, and no
  provider guard.
- Current installed ChatGPT target posture after the projection fix:
  `wsl-chrome-2` and `wsl-chrome-4` are cadence-waiting steady-follow accounts
  with zero remaining detail surfaces; `wsl-chrome-3` is complete but
  operator-paused; the legacy `chatgpt/default` completion is still paused in
  `backfill_history`, but current account evidence reports
  `mirrorCompleteness=complete`, zero remaining detail surfaces, zero
  consecutive failures, and no provider guard.
- After commit/restart closeout, the installed scheduler naturally advanced
  the `chatgpt/wsl-chrome-2` cadence window without a manual force. It
  completed pass `7` at `2026-07-06T07:10:57.815Z`, scheduled the next wake for
  `2026-07-06T07:30:24.210Z`, kept zero remaining detail surfaces, used
  `providerInteractions.used=2` of budget `6`, reported
  `llmServiceRequests=0`, `cdpMethodCalls=8`, and kept
  `providerGuardCorrelation.state=none`.

Validation:

- `auracall api mirror-completion-control acctmirror_completion_9861be3f-d04e-4864-9f31-96c070e4b5a2 run-one-pass --port 18095 --json`
- `auracall api mirror-completion-control acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63 run-one-pass --port 18095 --json`
- `auracall api mirror-complete --port 18095 --provider chatgpt --runtime-profile wsl-chrome-4 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`
- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "idle-waiting live-follow|newer account evidence|foreground-pressure proof|foreground scheduler preemption"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/http/responsesServer.ts tests/http.responsesServer.test.ts --max-diagnostics 30`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- installed `/status` readback on PID `5943`
- installed natural cadence `/status` readback at `2026-07-06T07:11:15Z`

### 2026-07-06 | M2/M8 Frontier-Scoped Remaining Detail Readback

- Passive observation of the installed scheduler showed
  `chatgpt/wsl-chrome-4` naturally woke the existing live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` for pass `3`
  at `2026-07-06T07:26:59.411Z`.
- The pass preserved the desired provider-polite scrape shape:
  `requestedPhase=detail-inventory`, `projects=0`, `conversations=25`,
  `detailReadLimit=4`, `classification=passive_dominant`,
  `providerInteractions.used=5` of budget `6`, `llmServiceRequests=0`,
  `cdpMethodCalls=9`, and `providerGuardCorrelation.state=none`.
- The pass exposed a remaining status-accounting bug. The freshness frontier
  selected `30` conversation rows and the detail cursor advanced to
  `nextConversationIndex=4`, but remaining detail was calculated against the
  full account catalog (`416 - 4 = 412`) instead of the selected frontier
  detail set (`30 - 4 = 26`).
- Remaining detail readback now scopes the cursor to
  `conversationFreshnessFrontier.rowsSelectedForDetail` when a frontier exists.
  After reinstall/restart, installed `/status` on PID `86558` reports
  `chatgpt/wsl-chrome-4` with `remaining.detailSurfaces=26`,
  `nextPhase=detail-inventory`, `nextAttemptAt=2026-07-06T07:56:47.237Z`,
  no provider guard, and the same passive-dominant scrape budget.
- This keeps Plan 0152 open: the routine no longer exaggerates the backlog, but
  `chatgpt/wsl-chrome-4` still has 26 selected detail surfaces to drain across
  bounded cycles.

Validation:

- `pnpm vitest run tests/accountMirror/statusRegistry.test.ts --testNamePattern "freshness frontier|dispatcher and metadata state|hydrates persisted mirror"`
- `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts tests/http.responsesServer.test.ts --testNamePattern "requested detail-inventory|persisted selected-row cursor|idle-waiting live-follow|newer account evidence"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/statusRegistry.ts tests/accountMirror/statusRegistry.test.ts --max-diagnostics 30`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- installed `/status` readback at `2026-07-06T07:35:37Z`

### 2026-07-06 | M2/M4/M8 Completion-Status Hydration And Deferred Cycle Advance

- Installed readback exposed one more operator-surface drift: `/status`
  reported `chatgpt/wsl-chrome-4` with 26 remaining selected detail surfaces,
  but `mirror-completion-status` for the same live-follow completion still
  returned the stale persisted operation snapshot with 412 remaining surfaces.
- Completion-status readback now hydrates current account status registry
  evidence before returning an operation, so a stale live-follow operation
  snapshot inherits current `mirrorCompleteness` and live-follow cycle
  projection without running provider work.
- After reinstall/restart on PID `37108`, installed
  `mirror-completion-status` and `/status` both reported completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` at
  `passCount=3`, `remainingDetailSurfaces.total=26`,
  `currentPhase=detail-inventory`, and `nextPhase=detail-inventory`.
- Operator `run-one-pass` set `forceRunUntilPassCount=4`. At the original
  cadence window the live-follow completion correctly yielded to foreground
  AuraCall API work and recorded `foreground_work_deferred` with retry at
  `2026-07-06T07:57:55.610Z`, preserving the owed detail phase instead of
  starting provider work under operator pressure.
- On retry, the same existing live-follow completion ran pass `4` from
  `2026-07-06T07:57:55.632Z` to `2026-07-06T07:59:14.173Z`, requested
  `detail-inventory`, skipped project/root rails, and advanced the selected
  detail cursor from `nextConversationIndex=4` to `8`.
- Remaining selected detail surfaces dropped from `26` to `22`, with
  `nextAttemptAt=2026-07-06T08:27:43.215Z` and
  `forceRunUntilPassCount=null`.
- The scrape shape stayed provider-polite:
  `classification=passive_dominant`, passive total `8`, active provider
  interactions `5/6`, `llmServiceRequests=0`, `cdpMethodCalls=9`, and
  `providerGuardCorrelation.state=none`.
- This keeps Plan 0152 open: the routine now proves one more full bounded
  cycle with preemption and continuation, but `chatgpt/wsl-chrome-4` still has
  22 selected detail surfaces to drain.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/schedulerService.test.ts tests/http.responsesServer.test.ts --testNamePattern "hydrates completion status|freshness frontier|idle-waiting live-follow|effective live-follow wake|pending detail inventory|selected live-follow phase"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/completionService.ts src/accountMirror/liveFollowCycleDecision.ts tests/accountMirror/completionService.test.ts --max-diagnostics 30`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- installed `auracall api mirror-completion-status acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63 --port 18095 --json`
- installed `/status` readback at `2026-07-06T08:00:21Z`

### 2026-07-06 | M2/M8 Cadence-Preserved Detail Drain Pass

- The existing installed `chatgpt/wsl-chrome-4` live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` preserved its
  cadence gate after operator `run-one-pass`; the forced marker remained
  pending until `nextAttemptAt=2026-07-06T08:27:43.215Z` instead of bypassing
  the minimum interval.
- With no repeated status polling during the cadence window, pass `5` started
  at `2026-07-06T08:27:43.235Z`, completed at
  `2026-07-06T08:29:03.514Z`, cleared `forceRunUntilPassCount`, and scheduled
  the next attempt for `2026-07-06T08:57:33.300Z`.
- The pass continued the owed `detail-inventory` phase and advanced the
  selected detail cursor from `nextConversationIndex=8` to `12`; `/status`
  reported remaining selected detail surfaces reduced from `22` to `18`.
- The cycle did not restart at identity/root/project rails:
  `rootRailReads=0`, `projectIndexReads=0`,
  `projectConversationReads=0`, and lifecycle readback recorded
  `detail-inventory:started projects=0 conversations=25` followed by
  `detail-inventory:completed projects=0 conversations=25 artifacts=0 files=3`.
- The scrape shape stayed within the live-follow target: `classification` was
  `passive_dominant`, passive total `6`, provider interactions `5/6`,
  `llmServiceRequests=0`, `cdpMethodCalls=9`, and provider guard correlation
  stayed `none`.
- This keeps Plan 0152 open: the installed routine is now proving bounded
  cursor-drain cycles, but `chatgpt/wsl-chrome-4` still has `18` selected
  detail surfaces plus the wider subscribed-account posture to resolve before
  broad resume.

Validation:

- quiet-window observation from `2026-07-06T08:22:59Z` through the scheduled
  cadence window
- `auracall api mirror-completion-status acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63 --port 18095 --json`
- installed `/status` live-follow target readback at `2026-07-06T08:30:25Z`
- persisted completion JSON cursor readback under
  `~/.auracall/cache/account-mirror/completions/`

### 2026-07-06 | M2/M8 Natural Cadence Detail Drain Pass 6

- After the pass-5 proof, the installed service was left quiet until the next
  natural cadence window. No operator force marker was active:
  `forceRunUntilPassCount=null`.
- The same installed `chatgpt/wsl-chrome-4` live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` woke on its own
  at `nextAttemptAt=2026-07-06T08:57:33.300Z`, ran pass `6` from
  `2026-07-06T08:57:33.323Z` to `2026-07-06T08:58:52.092Z`, and returned to
  `idle_waiting`.
- The pass continued `requestedPhase=detail-inventory`, scanned four more
  selected conversations, and advanced the selected detail cursor from
  `nextConversationIndex=12` to `16`.
- `/status` reported remaining selected detail surfaces reduced from `18` to
  `14`, `routineDecision.state=delayed`,
  `routineDecision.nextPhase=detail-inventory`, and no provider guard or
  preemption.
- The cycle still did not restart at root/project rails:
  `projectIndexReads=0`, `rootRailReads=0`,
  `projectConversationReads=0`, with provider interactions `5/6`.
- Scrape telemetry remained provider-polite: `classification=passive_dominant`,
  passive total `6`, `llmServiceRequests=0`, `cdpMethodCalls=9`, and
  `providerGuardCorrelation.state=none`.
- This keeps Plan 0152 open with `14` selected detail surfaces remaining on
  `chatgpt/wsl-chrome-4`; the next natural attempt was scheduled for
  `2026-07-06T09:27:21.970Z`.

Validation:

- quiet-window observation through the installed cadence timestamp
- `auracall api mirror-completion-status acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63 --port 18095 --json`
- installed `/status` live-follow target readback at `2026-07-06T09:00:12Z`
- persisted completion JSON cursor readback under
  `~/.auracall/cache/account-mirror/completions/`

### 2026-07-06 | M2/M8 Natural Cadence Detail Drain Pass 7

- The installed `chatgpt/wsl-chrome-4` live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` continued its
  natural cadence with no operator force marker active.
- Pass `7` started at `2026-07-06T09:27:21.996Z`, completed at
  `2026-07-06T09:28:38.938Z`, returned to `idle_waiting`, and scheduled
  `nextAttemptAt=2026-07-06T09:57:08.909Z`.
- The pass stayed on `requestedPhase=detail-inventory`, scanned four more
  selected conversations, and advanced the selected detail cursor from
  `nextConversationIndex=16` to `20`.
- `/status` reported remaining selected detail surfaces reduced from `14` to
  `10`, with `routineDecision.nextPhase=detail-inventory`, no preemption, and
  no provider guard.
- The scrape shape stayed stable: `classification=passive_dominant`, passive
  total `6`, provider interactions `5/6`, `projectIndexReads=0`,
  `rootRailReads=0`, `projectConversationReads=0`, `llmServiceRequests=0`,
  `cdpMethodCalls=9`, and `providerGuardCorrelation.state=none`.
- This keeps Plan 0152 open with `10` selected detail surfaces remaining on
  `chatgpt/wsl-chrome-4`.

Validation:

- quiet-window observation through the installed cadence timestamp
- `auracall api mirror-completion-status acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63 --port 18095 --json`
- installed `/status` live-follow target readback at `2026-07-06T09:29:36Z`
- persisted completion JSON cursor readback under
  `~/.auracall/cache/account-mirror/completions/`

### 2026-07-06 | M2/M8 Natural Cadence Detail Drain Pass 8

- The installed `chatgpt/wsl-chrome-4` live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` continued the
  selected-detail drain on natural cadence with no operator force marker.
- Pass `8` started at `2026-07-06T09:57:08.927Z`, completed at
  `2026-07-06T09:58:26.820Z`, returned to `idle_waiting`, and scheduled
  `nextAttemptAt=2026-07-06T10:26:56.884Z`.
- The pass stayed on `requestedPhase=detail-inventory`, scanned four more
  selected conversations, and advanced the selected detail cursor from
  `nextConversationIndex=20` to `24`.
- `/status` reported remaining selected detail surfaces reduced from `10` to
  `6`, with `routineDecision.nextPhase=detail-inventory`, no preemption, and
  no provider guard.
- The scrape shape stayed stable again: `classification=passive_dominant`,
  passive total `6`, provider interactions `5/6`, `projectIndexReads=0`,
  `rootRailReads=0`, `projectConversationReads=0`, `llmServiceRequests=0`,
  `cdpMethodCalls=9`, and `providerGuardCorrelation.state=none`.
- This keeps Plan 0152 open with `6` selected detail surfaces remaining on
  `chatgpt/wsl-chrome-4`.

Validation:

- quiet-window observation through the installed cadence timestamp
- `auracall api mirror-completion-status acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63 --port 18095 --json`
- installed `/status` live-follow target readback at `2026-07-06T09:58:50Z`
- persisted completion JSON cursor readback under
  `~/.auracall/cache/account-mirror/completions/`

### 2026-07-06 | M2/M8 Selected Detail Drain Completion

- The installed `chatgpt/wsl-chrome-4` live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` completed the
  selected detail-drain sequence on natural cadence.
- Pass `9` started at `2026-07-06T10:26:56.905Z`, completed at
  `2026-07-06T10:27:19.179Z`, returned to `idle_waiting`, and scheduled
  `nextAttemptAt=2026-07-06T10:55:49.986Z`.
- The pass stayed on `requestedPhase=detail-inventory`, scanned the final
  selected conversation, reset the completed detail cursor to
  `nextConversationIndex=0`, and reduced remaining selected detail surfaces
  from `6` to `0`.
- The live-follow cycle decision moved to `currentPhase=complete`,
  `nextPhase=complete`, `status=complete`, and target
  `routineDecision.state=steady_follow` /
  `routineDecision.nextPhase=steady_follow`.
- The final drain scrape was lighter than the preceding four-row passes:
  `classification=passive_dominant`, passive total `3`, provider interactions
  `2/6`, `projectIndexReads=0`, `rootRailReads=0`,
  `projectConversationReads=0`, `llmServiceRequests=0`, `cdpMethodCalls=9`,
  and `providerGuardCorrelation.state=none`.
- This closes the `chatgpt/wsl-chrome-4` selected-detail drain milestone. Plan
  0152 remains open because the broader subscribed-account posture still shows
  non-current, paused, disabled, or attention-needed targets outside this one
  completed ChatGPT routine.

Validation:

- quiet-window observation through the installed cadence timestamp
- `auracall api mirror-completion-status acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63 --port 18095 --json`
- installed `/status` live-follow target readback at `2026-07-06T10:27:59Z`
- persisted completion JSON cursor readback under
  `~/.auracall/cache/account-mirror/completions/`

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

Current evidence:

- Scheduler-level `operator_preempted` projection is covered by focused API
  tests for selected eligible targets.
- Completion-level foreground deferral is persisted as
  `foreground_work_deferred` and exposed through live-follow target status plus
  scheduler diagnostics.
- Deterministic smoke `pnpm run smoke:foreground-deferral` proves the
  completion deferral/readback path with zero provider refresh calls.
- Deterministic smoke `pnpm run smoke:scheduler-preemption` proves the
  scheduler preemption/readback path with zero provider refresh or completion
  work.
- Installed isolated harness proof now covers both preemption layers without
  touching provider surfaces: the installed package
  `smoke-account-mirror-scheduler-preemption.js` reported
  `schedulerBackpressure=foreground-work`,
  `targetRoutineState=operator_preempted`, and `providerWork=none`; the
  installed package `smoke-account-mirror-foreground-deferral.js` reported
  `deferred=foreground_work_deferred`,
  `diagnosticsLifecycle=foreground_work_deferred`, and `providerWork=none`.
- Installed real service proof now covers the scheduler foreground boundary
  without starting provider work: `POST /status` action
  `run-once-with-foreground-pressure` selected `chatgpt/wsl-chrome-4` at
  `detail-inventory`, yielded to `foreground-work`, reported
  `lastWakeReason=operator-foreground-pressure-proof`, and left
  `refresh=null` / `error=null`.
- A real-provider foreground collision proof is still intentionally deferred
  until it can be staged without broad live-follow resume or provider churn.

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

Current evidence:

- Installed `chatgpt/wsl-chrome-3` has proved the steady-follow keep-current
  side with zero detail rows selected, no LLM-service requests, no provider
  guard correlation, and restart-visible status readback.
- Installed `chatgpt/wsl-chrome-2` has proved the incomplete-account path can
  reach `mirrorCompleteness=complete` after local malformed guard-state repair,
  and the recognized closed-CDP-socket failure is now retryable.
- The same `chatgpt/wsl-chrome-2` live-follow completion later proved
  successful cadence-preserving keep-current behavior: `run-one-pass` preserved
  the cadence gate, refresh
  `acctmirror_644c16a1-0f8-4599-bcd3-b22a248a8485` advanced `passCount` from
  `3` to `4`, selected zero detail rows, kept
  `mirrorCompleteness.state=complete`, used `providerInteractions.used=2` of
  budget `6`, reported `llmServiceRequests=0`, reported `cdpMethodCalls=8`,
  and had `providerGuardCorrelation.state=none`.
- Installed status on 2026-07-06 showed the same `chatgpt/wsl-chrome-2`
  completion still `idle_waiting` in `steady_follow` with `passCount=4`,
  `routineDecision.state=steady_follow`, `remainingWork.detailSurfaces=0`,
  `providerGuard=null`, and `latestLifecycleEvent=resumed_after_restart`.
- Broad live-follow resume is no longer gated on proving a wsl-chrome-2
  follow-up keep-current pass. It remains gated on the final Gate E decision:
  accept the installed isolated plus installed service foreground-pressure
  proofs as sufficient for foreground preemption, or stage one narrowly bounded
  real-provider foreground collision without broad live-follow resume or
  provider churn.

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

Current installed scoreboard:

- Initial/backfill account: covered by `chatgpt/wsl-chrome-2` bounded
  backfill-to-steady proof after malformed guard-state repair.
- Mostly-current steady-follow account: covered by `chatgpt/wsl-chrome-3`
  keep-current proof and restart-visible status readback.
- Artifact-rich ChatGPT account: covered by requested `detail-inventory`
  installed proofs with passive-dominant scrape accounting, zero
  LLM-service requests, exact CDP method counts, and materialization backlog
  separated from metadata freshness.
- Provider-guard or preemption scenario: covered by installed isolated
  preemption harnesses with `providerWork=none` plus the installed service
  `run-once-with-foreground-pressure` proof that selected
  `chatgpt/wsl-chrome-4`, yielded to `foreground-work`, and started no
  refresh. Optional remaining work is a real-provider foreground collision if
  the operator requires live collision evidence before broad resume.
- API restart/resume boundary: covered by wsl-chrome-3 and wsl-chrome-2
  post-restart readbacks, including the wsl-chrome-2 `resumed_after_restart`
  lifecycle event.

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

### 2026-07-05 | M1/M2/M8 Restart Cycle Reconciliation

- `chooseLiveFollowCyclePhase` now treats a completed collector progress record
  as proof that selected freshness-frontier rows have already been consumed,
  provided no detail cursor, yield, in-progress asset inventory, or remaining
  detail surfaces are still pending.
- Loaded live-follow completion operations now rederive `liveFollowCycle` from
  their own last refresh evidence during service startup, so stale persisted
  cycle ledgers do not keep reporting `detail-inventory` after a completed
  metadata pass.
- Installed restart proof on live-follow completion
  `acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae` showed the same
  persisted pass `7` last refresh had `collectorProgress.phase=complete`,
  `event=completed`, `conversationFreshnessFrontier.rowsSelectedForDetail=4`,
  and `remainingDetailSurfaces.total=0`; after reinstall/restart, completion
  readback changed from stale `detail-inventory` to
  `liveFollowCycle.currentPhase=complete`, `nextPhase=complete`, with reason
  `all required live-follow phases are complete for the current evidence
  window`.
- A controlled resume before the restart fix did not start provider work
  immediately; cadence moved the completion to `idle_waiting` with
  `nextAttemptAt=2026-07-06T03:07:06.600Z`, and the operation was paused again
  at pass `7`. This is cadence/yield evidence, not a full keep-current pass.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts --testNamePattern "live-follow cycle decision|reconciles stale loaded live-follow cycle|hydrates active cooldown|requested phase|persisted phase ledger|bounded refresh"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/liveFollowCycleDecision.ts src/accountMirror/completionService.ts tests/accountMirror/completionService.test.ts --max-diagnostics 40`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-completion-status acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae --json --timeout-ms 30000`
- `auracall api status --json --timeout-ms 30000`

### 2026-07-05 | M2/M7 Newer Account Evidence Wins Status Decisions

- `/status` live-follow target decisions now detect when an active completion's
  `liveFollowCycle` is older than the account status registry evidence.
- A paused active completion remains visible as paused, but its
  `routineDecision.nextPhase`, `lastProgressAt`, and remaining-work explanation
  now come from the newer account evidence instead of falsely reporting
  `complete` while detail surfaces remain.
- The regression fixture matches the installed mismatch: paused active
  completion with a stale complete cycle, newer metadata-only scrape evidence,
  90 remaining detail surfaces, `passive_dominant` scrape telemetry, and
  `llmServiceRequests=0`.
- Installed readback after reinstall/restart proved `auracall-api.service`
  active/running with PID `57602`; the active paused completion
  `acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae` still carries
  its older `liveFollowCycle.nextPhase=complete`, while `/status` now reports
  `routineDecision.nextPhase=detail-inventory`, `lastProgressAt=2026-07-06T02:38:56.298Z`,
  90 remaining detail surfaces, 433 materialization backlog assets,
  `providerGuardCorrelation.state=none`, and `llmServiceRequests=0`.

Validation:

- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "newer account evidence|effective live-follow wake|pending detail inventory|persisted backfill ledger|foreground scheduler preemption"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/http/responsesServer.ts --max-diagnostics 40`
- `pnpm exec biome check tests/http.responsesServer.test.ts --max-diagnostics 8`
  - reports only pre-existing non-null assertion warnings outside this slice.
- `pnpm run plans:audit -- --keep 152`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api status --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_a364044f-2779-4e00-b866-e6421f2f1aae --json --timeout-ms 30000`

### 2026-07-05 | M2/M3/M8 Detail Cursor Proof And Failed-Attempt Progress Guard

- Bounded installed proof on `chatgpt/wsl-chrome-3` completed
  `acctmirror_completion_0fa92c99-052c-4141-956d-f2dfa5d7d2ab` with
  `lastRefresh.requestedPhase=detail-inventory`, proving the next pass selected
  the current-evidence detail phase instead of restarting root or project rail
  walks.
- The pass scanned four conversation detail surfaces, persisted
  `backfillLedger.cursors.newestFirstDetail.nextIndex=4`, kept
  `remainingDetailSurfaces.total=90`, and selected five newest conversation
  rows with a three-row freshness frontier stop.
- Scrape telemetry for that installed pass remained `passive_dominant`: passive
  `6`, active `5`, provider interactions `5/6`, `llmServiceRequests=0`,
  `cdpMethodCalls=9`, CDP methods
  `Target.createTarget=2`, `Target.attachToTarget=2`, `Page.enable=2`,
  `Runtime.enable=2`, `Runtime.evaluate=1`, and
  `providerGuardCorrelation.state=none`.
- A second bounded pass,
  `acctmirror_completion_1214d506-d1f7-4a88-b8fd-1e76784aebc9`, failed during
  identity with `WebSocket connection closed` before detail inventory and
  without provider guard evidence. This exposed a status bug: failed attempts
  updated `lastCompletedAt` and could be reported as `routineDecision`
  progress.
- `/status` now derives account-level routine progress from successful account
  evidence only (`lastSuccessAt` or scrape-budget `observedAt`), while keeping
  `lastFailureAt` visible separately. Installed readback after reinstall/restart
  reports `routineDecision.lastProgressAt=2026-07-06T03:11:07.511Z` and
  `lastFailureAt=2026-07-06T03:13:34.985Z`.

Validation:

- `pnpm vitest run tests/http.responsesServer.test.ts --testNamePattern "newer account evidence|effective live-follow wake|pending detail inventory|persisted backfill ledger|foreground scheduler preemption"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/http/responsesServer.ts --max-diagnostics 40`
- `pnpm exec biome check tests/http.responsesServer.test.ts --max-diagnostics 8`
  - reports only pre-existing non-null assertion warnings outside this slice.
- `pnpm run plans:audit -- --keep 152`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_0fa92c99-052c-4141-956d-f2dfa5d7d2ab --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_1214d506-d1f7-4a88-b8fd-1e76784aebc9 --json --timeout-ms 30000`
- `auracall api status --json --timeout-ms 30000`

### 2026-07-05 | M1/M2/M8 Requested Detail Cursor Consumption

- A controlled installed rerun before this fix,
  `acctmirror_completion_11cfbf8f-8524-44af-b442-9d94e21a9dd6`, proved the
  remaining cursor bug: the pass correctly started at `detail-inventory` but
  replayed four selected conversations and persisted
  `newestFirstDetail.nextIndex=4` again.
- The collector now distinguishes fresh frontier selection from requested-phase
  continuation. Fresh frontier filtering still resets the local cursor to the
  newest selected rows, while a requested `detail-inventory` continuation keeps
  the persisted selected-row cursor.
- Installed proof after reinstall/restart completed
  `acctmirror_completion_ee1e76cb-2c4b-492c-a07b-a6ae8a7e8b5e` from the
  persisted `nextIndex=4` cursor. The patched pass scanned one conversation,
  set `attachmentInventory.nextConversationIndex=0`, reported
  `remainingDetailSurfaces.total=0`, and moved the account backfill ledger to
  `state=complete` / `nextEligiblePhase=complete`.
- `/status` then reported `routineDecision.nextPhase=steady_follow`,
  `remainingWork.detailSurfaces=0`, `lastProgressAt=2026-07-06T03:27:49.213Z`,
  `materializationBacklog.state=metadata_current_backlog`, and no provider
  guard evidence.
- A following bounded keep-current pass,
  `acctmirror_completion_37317275-8475-4d90-b7c7-616b6759fd83`, completed with
  no requested phase, read current rails, reached the freshness frontier after
  three fresh rows, selected zero detail rows, kept
  `remainingDetailSurfaces.total=0`, and reported `llmServiceRequests=0` with
  `providerGuardCorrelation.state=none`.
- The keep-current pass exposed a status-only phase fallback bug:
  `projectConversations` evidence with `yielded=false` and
  `nextProjectIndex=0` was incorrectly treated as pending. The phase chooser
  now resumes project conversations only for yielded or nonzero-index project
  cursors, and installed readback after reinstall/restart reports
  `routineDecision.nextPhase=steady_follow`.
- The keep-current pass also exposed remaining performance work before broad
  resume: project discovery took roughly 99 seconds even with zero projects,
  and the sweep shape was `active_dominant` (`active.total=4`,
  `passive.total=0`, `cdpMethodCalls=12`). This is not rate-limit guard
  evidence, but it is still too expensive for an unattended steady routine.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts --testNamePattern "completed project conversation cursor|resumes project conversation cursor|requested detail-inventory|persisted selected-row cursor|resets steady-follow detail cursor|preserves incomplete detail cursor"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/liveFollowCycleDecision.ts src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/completionService.test.ts tests/accountMirror/chatgptMetadataCollector.test.ts --max-diagnostics 40`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_ee1e76cb-2c4b-492c-a07b-a6ae8a7e8b5e --json --timeout-ms 30000`
- `auracall api mirror-completion-status acctmirror_completion_37317275-8475-4d90-b7c7-616b6759fd83 --json --timeout-ms 30000`
- `auracall api status --json --timeout-ms 30000`

### 2026-07-05 | M3/M8 Zero-Project Keep-Current Cost Trim

- ChatGPT steady-follow now skips project discovery when previous account
  evidence proves the project index was complete and empty. It still emits
  `projects:started` and `projects:completed projects=0` progress so lifecycle
  readback stays explicit without opening the project surface.
- ChatGPT steady-follow also skips account-library inventory when the freshness
  frontier selects zero detail rows. This prevents a caught-up metadata-only
  loop from spending an account-library provider interaction just to confirm
  no detail work is needed.
- The same slice fixed a guard-boundary gap exposed by installed proof:
  explicit bounded completions still intentionally ignore minimum interval, but
  they now preflight persisted provider-guard cooldown before calling refresh.
  A guarded bounded completion blocks with `provider_guard_backoff` and never
  starts identity/root/project collector work.
- Installed repro before the guard preflight:
  `acctmirror_completion_c4df53db-43ce-4cc2-9840-2839041954db` started during
  an active ChatGPT cooldown and reached `identity:completed`,
  `projects:completed projects=0`, and `root-conversations:started` before
  blocking. This proved the zero-project skip had landed but also proved
  guarded completions were still touching provider surfaces.
- Installed proof after reinstall/restart:
  `acctmirror_completion_cf5cee77-c960-4b25-a30e-f11f54486feb` completed one
  bounded `steady_follow` pass from `2026-07-06T03:48:43.239Z` to
  `2026-07-06T03:48:59.169Z`. It selected `requestedPhase=root-conversations`,
  observed `projects=0`, `conversations=94`, `artifacts=235`, `files=199`,
  reached a three-row freshness frontier with `rowsSelectedForDetail=0`, and
  kept `remainingDetailSurfaces.total=0`.
- The patched installed scrape budget was the desired cheap keep-current shape:
  `active.identityReads=1`, `active.projectIndexReads=0`,
  `active.rootRailReads=1`, `active.projectConversationReads=0`,
  `active.chatLoads=0`, `active.accountLibraryReads=0`, `active.total=2`,
  provider budget `used=2` / `remaining=4`, `llmServiceRequests=0`,
  `cdpMethodCalls=8`, and `providerGuardCorrelation.state=none`.
- Post-run `/status` for `chatgpt/wsl-chrome-3` reported
  `providerGuard=null`, `lastFailureAt=null`, `mirrorCompleteness=complete`,
  `routineDecision.state=paused`, and `routineDecision.nextPhase=steady_follow`.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts --testNamePattern "provider guard cooldown|bounded completion|persisted phase ledger|completed project conversation cursor"`
- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts --testNamePattern "fresh ChatGPT steady-follow|requested detail-inventory|persisted selected-row cursor"`
- `pnpm exec biome check src/accountMirror/completionService.ts tests/accountMirror/completionService.test.ts src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts --max-diagnostics 60`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall api mirror-complete --provider chatgpt --runtime-profile wsl-chrome-3 --sweep-mode steady_follow --materialization-policy metadata_only --max-passes 1 --json --timeout-ms 30000`
- authenticated `GET /v1/account-mirrors/completions/acctmirror_completion_cf5cee77-c960-4b25-a30e-f11f54486feb`
- `auracall api status --json --timeout-ms 30000`

### 2026-07-06 | M8 Remaining Subscribed-Account Posture Audit

- Installed `/status` at `2026-07-06T10:32:12.872Z` reported
  `auracall-api.service` PID `5546`, scheduler `scheduled`, last wake
  `2026-07-06T10:31:28.309Z`, and live-follow health
  `severity=attention-needed` with `backpressure=routine-delayed`.
- Target counts were `total=10`, `enabled=6`, `disabled=1`,
  `unconfigured=3`, `active=5`, `paused=3`, `attentionNeeded=4`,
  `complete=4`, and `inProgress=2`.
- `chatgpt/wsl-chrome-4` completed the selected artifact-rich detail drain:
  live-follow completion
  `acctmirror_completion_8cd5b932-89d1-49f2-bdf0-a66b406aff63` is
  `idle_waiting`, `phase=steady_follow`, `passCount=9`,
  `mirrorCompleteness=complete`, `remainingWork.detailSurfaces=0`, no provider
  guard, scrape shape `passive_dominant`, provider interactions `2/6`,
  `llmServiceRequests=0`, and `cdpMethodCalls=9`.
- `chatgpt/wsl-chrome-2` is also safe steady-follow evidence:
  `idle_waiting`, `phase=steady_follow`, `passCount=17`,
  `mirrorCompleteness=complete`, `remainingWork.detailSurfaces=0`, and next
  cadence wake `2026-07-06T10:47:41.174Z`.
- `chatgpt/wsl-chrome-3` is complete but still operator-paused:
  `phase=steady_follow`, `passCount=7`, `mirrorCompleteness=complete`,
  `remainingWork.detailSurfaces=0`, `materializationAssets=433`,
  `accountLibraryStatus=preview_only`, and latest lifecycle
  `operator_paused` at `2026-07-06T04:49:51.971Z`.
- `chatgpt/default` remains operator-paused and in progress:
  `phase=backfill_history`, `passCount=0`, `routineDecision.nextPhase=identity`,
  `remainingWork.detailSurfaces=18`, and `materializationAssets=235`. It is
  not a safe broad-resume target without explicit operator decision because it
  is paused and overlaps the already-proven `ecochran76@gmail.com` ChatGPT
  account family.
- `gemini/auracall-gemini-pro` is desired-enabled but legacy blocked:
  its active completion is paused with
  `Gemini live-follow resume is blocked until the completion is upgraded or
  replaced with bounded left-rail retrieval policy.` This needs a
  provider-specific Gemini slice, not blind broad resume.
- `grok/default` remains desired-enabled but blocked by identity mismatch. Its
  completeness evidence is not the live-follow blocker; the blocker is account
  identity/config repair.
- Broad resume should therefore be a target-classifier decision, not a single
  global unpause. Safe automatic candidates are complete, metadata-current
  ChatGPT steady-follow rows with no provider guard. Operator-paused legacy,
  Gemini bounded-left-rail, and Grok identity-mismatch rows must stay out of
  automatic broad resume until their explicit blockers are resolved.

Validation:

- `auracall api status --port 18095 --json`

### 2026-07-06 | M8/M9 Target Classification Contract

- Broad live-follow reconciliation now classifies every configured target
  before starting, keeping, upgrading, or skipping work. The result records
  `safe_steady_follow`, `safe_bounded_resume`, `existing_active`,
  `operator_paused`, `provider_blocked`, `identity_blocked`, or `disabled`
  plus the intended action: `start`, `keep_existing`, or `skip`.
- Operator-paused active completions are now a hard automatic-reconciliation
  boundary: they remain in `existing`, but broad reconciliation does not
  policy-upgrade them. This preserves operator intent until an explicit
  target-level resume decision is made.
- Legacy/provider-blocked Gemini live-follow completions classify as
  `provider_blocked`, so they stay out of blind broad resume until bounded
  left-rail retrieval policy is replaced or upgraded.
- `/status.liveFollow.targets.accounts[]` and CLI-normalized status now expose
  additive `resumePolicy`, giving operators the same classification for live
  target rows without inferring from `routineDecision`, completion status, and
  provider errors manually.
- `docs/dev/live-follow-operating-model-contract.md` and `README.md` document
  the new broad-resume classification contract.
- Installed readback after `pnpm run install:user-runtime-service` and
  `systemctl --user restart auracall-api.service` proved the live service on
  PID `42889` emits `resumePolicy` for the current target posture:
  `chatgpt/wsl-chrome-2` and `chatgpt/wsl-chrome-4` are
  `safe_steady_follow`, `chatgpt/default` and `chatgpt/wsl-chrome-3` are
  `operator_paused`, `gemini/auracall-gemini-pro` is `provider_blocked`, and
  `grok/default` is `identity_blocked`.

Validation:

- `pnpm vitest run tests/accountMirror/liveFollowReconciler.test.ts`
- `pnpm vitest run tests/accountMirror/liveFollowReconciler.test.ts tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts --testNamePattern "live-follow reconciler|effective live-follow wake|identity evidence|proof scope|materialization|routineDecision|resumePolicy|live follow"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/liveFollowReconciler.ts src/http/responsesServer.ts src/status/liveFollowHealth.ts src/cli/apiStatusCommand.ts tests/accountMirror/liveFollowReconciler.test.ts tests/http.responsesServer.test.ts tests/cli/apiStatusCommand.test.ts --max-diagnostics 30`
  - exit status `0`, with pre-existing non-null assertion warnings in
    unrelated sections of `tests/http.responsesServer.test.ts`.
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- installed `auracall api status --port 18095 --json --timeout-ms 30000`
  readback filtered through `jq` for `resumePolicy`.

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
- [x] Backfill progress is persisted per account and resumes from the correct
  phase across API restarts.
- [x] Steady-follow chooses the next phase from current evidence instead of
  restarting at root rails.
- [x] `metadata_only` freshness can complete for chats with persisted context
  and remote references while keeping local materialization backlog visible.
- [x] Provider-polite scrape telemetry distinguishes passive parsing from
  active UI/provider interactions.
- [x] Foreground operator work preempts or defers live follow with explicit
  status evidence.
- [x] Installed dogfood proves at least one full backfill-to-steady transition
  and one steady-follow keep-current loop without avoidable rate-limit warnings.
- [x] Remaining desired-enabled targets are classified so broad resume cannot
  blindly unpause operator-paused, legacy-blocked, or identity-mismatched
  accounts.

## Definition Of Done

This plan closes when installed AuraCall live follow behaves as a durable,
polite, operator-preemptible background routine for subscribed accounts, with
status evidence that explains each account's current phase, remaining backlog,
next wake, and safety posture.
