# Live-Follow Operating Model Contract

This contract records the shared live-follow vocabulary used by account-mirror
completion, scheduler, status, CLI/API readback, and operator surfaces.

The source of truth in code is
`src/accountMirror/liveFollowOperatingModel.ts`.

## Routine Phases

Collector phases:

- `identity`: verify the provider account binding without mutating provider
  state.
- `projects`: read the provider project index.
- `root-conversations`: read account-level conversation rail/catalog rows.
- `project-conversations`: read project-scoped conversation rows.
- `chatgpt-library`: read ChatGPT account-library metadata.
- `detail-inventory`: load selected chats and parse context, files, artifacts,
  media, and remote download references.
- `merge-persisted-catalog`: merge newly observed rows with persisted catalog
  state.
- `complete`: no collector phase remains for the current evidence window.

Routine-only phases:

- `materialization`: recover or materialize known remote assets according to
  policy.
- `account-library`: advance account-library catch-up work.

## Routine Decision States

- `disabled`: live follow is not enabled for this account.
- `unsupported`: the provider/account cannot currently support live follow.
- `missing_identity`: the target lacks provider account identity proof.
- `provider_guarded`: provider guard, CAPTCHA, sorry page, or cooldown blocks
  work.
- `operator_preempted`: foreground operator/API/browser work has priority.
- `running`: a live-follow completion is running or in its idle waiting state.
- `queued`: live-follow work is queued but not running yet.
- `paused`: an active live-follow completion is paused.
- `attention_needed`: the latest live-follow completion failed, blocked, or was
  cancelled.
- `backfilling`: historical metadata catch-up remains.
- `steady_follow`: newest-first maintenance is active.
- `materialization_pending`: metadata is sufficient for the current policy, but
  local bytes or materialization work remain.
- `account_library_catchup`: account-library catch-up remains.
- `caught_up`: live-follow metadata is current for configured provider surfaces.
- `eligible`: the account can run the next routine pass now.
- `delayed`: cadence, politeness, or another non-terminal delay is active.

## Broad Resume Policy

Live-follow target rows expose additive `resumePolicy` readback so broad resume
decisions can be audited without inferring from completion status alone:

- `safe_steady_follow`: metadata is complete with zero remaining detail
  surfaces; the target may continue cadence-only steady follow.
- `safe_bounded_resume`: unfinished account evidence remains and the target
  should resume only from the persisted next phase.
- `existing_active`: a live-follow completion is already queued, running, or
  otherwise active; keep that completion instead of starting another one.
- `operator_paused`: an active completion is paused; automatic broad
  reconciliation must keep it paused and must not policy-upgrade it.
- `provider_blocked`: a provider guard, cooldown, or provider-specific legacy
  policy blocks automatic resume.
- `identity_blocked`: configured identity is missing, unsupported, or
  mismatched.
- `disabled`: live follow is disabled or unconfigured for the target.

`resumePolicy.action` is one of `start`, `keep_existing`, or `skip`. It is an
operator classification layer, not a provider-safety bypass; provider guards,
foreground preemption, and cadence checks still apply before provider work.

## Explicit Bounded Retry

`run_one_pass` is the retry boundary for a terminal live-follow operation. It
may re-arm `blocked` or `failed` live follow for exactly one additional pass,
preserving the subscription mode while setting a pass-count ceiling. It never
re-arms completed or cancelled live follow, and it never reopens a bounded
completion.

Repeated controls are an operator/runtime policy decision, not an automatic
loop: diagnose the prior terminal class and apply a reasonable remediation or
wait for a materially changed condition before another attempt. Every forced
terminal pass requests managed-browser cleanup on both success and failure.

## Scheduler Operator Authority

Scheduler pause/resume is operator control state, not transient process state.
The API persists that posture under the AuraCall home cache and hydrates it
before startup cadence. A paused scheduler therefore remains paused after a
service restart; only an explicit resume restores automatic scheduling.

ChatGPT rate-limit detection history is scoped to the browser profile. Recent
detections escalate the cooldown from 5 to 15 and 45 minutes up to a six-hour
cap, remain present across later successful reads, and age out after 24 hours.

## Materialization Backlog States

- `none`: no known remote assets are missing local materialization.
- `metadata_current_backlog`: metadata is current under the active policy, but
  known remote assets are not local.
- `materialization_required`: active policy requires local bytes and known
  remote assets are missing locally.
- `inventory_unknown`: remote asset inventory is not complete enough to judge
  local materialization.

`metadata_current_backlog` must not reselect a chat for detail scraping by
itself. Policies that require local bytes should expose or queue
`materialization_required` work instead.

## Provider Deadlines And Failure Authority

ChatGPT discovery/identity and detail inventory budget browser settling
separately from interaction pacing. The production provider window is 240
seconds, with the configured conversation/page/renavigation governor allowance
added to form the effective per-call deadline. Reaching that deadline aborts
the provider request and closes an account-mirror disposable tab; timed-out
work must not continue navigating, overlap the next chat, or write late cache
state. Browser-launch failure remains a host/runtime readiness failure; a wider
collector deadline must not be treated as a substitute for a working display
and reachable configured CDP endpoint.

A failed collector phase remains authoritative until a later successful
refresh. Persisting or reconciling the backfill ledger after the failure does
not convert the live-follow cycle to `complete` and does not clear the exact
completion error.

## Collector-To-Materialization Pacing

A successful collector refresh hands materialization the exact conversation IDs
whose detail snapshots were observed, the refresh freshness boundary, and the
effective browser-interaction policy. Materialization waits until the maximum
configured conversation-read, page-refresh, or renavigation cooldown has
elapsed before provider work begins. Its snapshot and asset operations then
share one job-scoped interaction governor.

When completion-owned materialization becomes terminal, its `completedAt`
provider-work boundary starts a fresh collector minimum interval. The
completion cursor persists that settlement timestamp across restarts, and the
next collector remains `idle_waiting` until
`providerWorkSettledAt + limits.minIntervalMs`. Time spent inside the
materialization job does not count as post-provider quiet time.

## Provider-Wide Fair Serialization

The routine account-mirror scheduler and all completion loops in one API
runtime share a FIFO provider-work lease keyed by provider. A direct scheduler
pass or completion must own that lease before collector refresh; completions
also require it before complete-ledger materialization begins. When collector
work queues completion-owned materialization, ownership continues until the
materialization job reaches a terminal provider-work settlement; it is not
released merely because a bounded completion run returns.

The lease is released before the owning completion enters its subsequent
minimum-interval wait. This permits the next same-provider tenant to rotate in
without allowing two managed browser profiles to touch the same provider
concurrently. Pause and cancel remove queued waiters, while in-flight owners
retain the lease until physical materialization settles. Providers use
independent queues, so ChatGPT serialization does not block Gemini or Grok.

For a conversation refreshed by the immediately preceding collector pass,
materialization must try the new cache first and must not issue another live
snapshot refresh merely because no local asset was produced. Account-mirror
context cache routing reuses the collector's already verified identity and
skips feature-signature probing. Disposable browser targets remain required;
this contract removes nested and duplicate reads rather than retaining one tab
across unrelated conversation URLs.

Configured ChatGPT Business/workspace targets use qualified service-account
identity (`plan`, `structure`, and configured organization/account ID when
present). When a target exposes only a Business account-level label, Account
Mirror adds `structure=business` as its cache-isolation fallback. Personal
targets retain the legacy email-only Account Mirror tenant key, and
presentation-only account-level labels do not alter shared execution affinity.
Provider identity verification compares the primary email portion, so
qualifiers isolate caches without masking a login to a different email.

Exact collector-ID handoff does not override terminal asset-family evidence.
Unless `force: true` is explicit, materialization must suppress a selected
conversation when all of its usable catalog asset-family signatures are
already terminal through available run-archive assets, recorded volatile
dispositions, or complete catalog evidence. A selected conversation with no
usable catalog signature remains eligible so stale or newly refreshed rows do
not lose the existing provider-work fallback.

The same rule applies to operator/API requests that use singular
`conversationId`: local catalog and terminal evidence must be checked before
opening the provider browser. The direct request keeps its direct source and
target result shape, and `force: true` remains the explicit replay override.

Download-family identity is provider-surface neutral. Percent-encoded URI
filenames, sandbox action labels, `download-dom` rows, and archived `download`
items must converge on the same decoded filename/source family before candidate
selection. UI action wording such as `Open the ... PDF` must not make an
already archived download look new.
