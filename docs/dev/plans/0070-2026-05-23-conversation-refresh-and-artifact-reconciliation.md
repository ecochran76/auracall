# Conversation Refresh And Artifact Reconciliation

State: CLOSED
Date: 2026-05-23
Lane: P01

## Context

Plan 0069 closed the backend materialization mechanism: AuraCall can now queue
durable history-materialization jobs, reopen provider conversations through the
managed browser, fetch provider artifacts, write identity-scoped cache files,
and upsert archive/search asset evidence.

That is not the whole live-follow problem. Account-mirror snapshots are not
immutable. Operators can continue existing provider conversations from the
provider UI, AuraCall runs, saved links, project chats, mobile apps, and other
surfaces. Those provider-side edits can add messages, files, artifacts, or
generated media to a conversation that AuraCall already cached. The cached row
then becomes stale even though the conversation id is valid.

The current Gemini case also has a one-time backfill requirement: histories are
partially hydrated, so a full live-follow sweep is needed to refresh
conversation detail manifests and materialize all missing artifacts that can be
fetched safely.

This plan owns the next bounded slice: keep existing cached conversations fresh
and reconcile their artifacts from both background live-follow and explicit
operator requests.

## Current State

- Account-mirror live follow can keep durable per-account completion operations
  running and can walk provider projects, left rails, and bounded detail
  inventory.
- Account-mirror catalog/search reads are cache-only and must stay cache-only.
- History materialization can materialize artifacts/files/media for known
  provider conversations and can record terminal skips/failures with provider
  evidence.
- Gemini live proof on `auracall-gemini-pro` materialized two cached
  conversation image artifacts into `history-media` archive rows after identity
  preflight was hardened.
- Some Gemini histories are still only partially hydrated. A normal small
  routine pass will not necessarily reach every older missing artifact quickly.
- Existing cached conversation rows now have a cache-only freshness projection
  that distinguishes:
  - recently seen in the rail/project index
  - detail snapshot refreshed
  - artifact/file/media manifests refreshed
  - local asset bytes materialized
  - deleted/unavailable routeability evidence
- Account-mirror snapshot writes now annotate each cached conversation row with
  explicit index freshness metadata: observation timestamp, source surface,
  recency rank, and a stable index-row fingerprint. Conversation-cache merge
  keeps the newest index observation metadata when global and project-scoped
  caches contain the same conversation id. Refresh merges now also preserve
  the provider-observed order for newly seen conversation rows and append older
  unobserved cached rows, so provider-modified conversations that move to the
  rail/project top stay top-ranked in the cache.
- The operator has durable materialization job surfaces for conversation-level
  reconciliation: `refreshSnapshot` refreshes the online snapshot first and
  then materializes missing artifacts from the refreshed state. Snapshot and
  materialization phases now write per-row account-mirror evidence for cached
  conversations: detail/manifest timestamps, routeability state/reason,
  observed counts, and materialized-asset timestamps. Direct provider
  conversation id reconciliation can also upsert a minimal account-mirror row
  under the bound identity when routeability/detail evidence exists but the
  conversation was not already in the mirror list. Provider hard stops now
  classify materialization jobs as `provider_guard_required` HTTP 409 failures
  so retry surfaces can ask for manual clearance instead of reporting a generic
  internal error.
- React Search conversation rows and cache-only Account Mirror catalog
  conversation rows can queue the same reconciliation job explicitly; row open
  and catalog/search reads remain cache-only.
- Backend full-sweep completion policy is now wired through explicit
  API/CLI/MCP completion starts and configured `liveFollow` reconciliation.
  Successful refresh passes can queue history-materialization jobs and persist
  the latest handoff as `materializationCursor`. The post-backoff live Gemini
  dogfood completion
  `acctmirror_completion_d6ee42c8-898f-424b-9a31-7387603db294` completed a
  bounded `auracall-gemini-pro` full sweep, queued
  `hmj_96c6d998be8948be8c8910076a374890`, and materialized two cached
  conversation image artifacts with bound identity and checksum archive
  evidence. The sweep remains progressive, not exhaustive: mirror completeness
  was `in_progress` with 76 detail surfaces remaining.
- Steady-follow refreshes now reset the attachment/detail cursor to the top of
  the current provider rail/project conversation list, while full-sweep
  refreshes continue to resume the persisted deep cursor. This gives routine
  cadence a deterministic path to observe provider-modified conversations that
  moved back to the top.
- The first bounded Gemini steady-follow proof after the full-sweep dogfood
  waited through the explicit-refresh cooldown, then failed before refresh
  handoff with `Account mirror metadata collector timed out for
  gemini/auracall-gemini-pro`. A bounded browser diagnostic found the managed
  Gemini app ready at `/app` with no provider guard. Gemini steady-follow
  completions now pass a 300s collector timeout while non-Gemini steady follow
  keeps the generic refresh envelope. Refresh failures now also persist target
  status sidecar state so failure-backoff survives API/proof-server restart
  and cannot be bypassed by losing the in-memory status registry. The Gemini
  failure and explicit-refresh politeness defaults were then tuned for practical
  operator proof loops: explicit refresh waits 2 minutes plus at most 1 minute
  of jitter, and refresh failures back off from 2 minutes to a 10 minute cap.
  Provider hard stops and manual-clear guard cooldowns remain separate and
  unchanged. The immediate bounded retry
  `acctmirror_completion_e779a4e1-e6d7-4912-b4bb-445e30a7c028` completed one
  Gemini steady-follow pass with no provider guard, detected identity
  `ecochran76@gmail.com`, refreshed `projects=12` and `conversations=68`,
  queued `hmj_873fd5d4ad154e94ae9517923d7de0dc`, and materialized two Gemini
  image artifacts from conversations `10b7e2a15e2dd77c` and
  `1ab8bb794846c491` with checksums
  `5df1e3626b11b5016e38710e711152e663e10333c591eb4b4db383b3540704c0` and
  `80fcaeb067bcafd5d083a05a30beba58350e30869a6557fcbf84106e8037836b`.
- Gemini account-mirror collection now reads both the left rail and Gem/project
  conversation histories. Project-history reads reserve a bounded share of the
  conversation-row budget, distribute that budget across remaining Gems/projects
  before deepening any one history, preserve aggregate project-history
  truncation in mirror-completeness evidence, and tolerate individual Gem route
  failures with DOM drift evidence instead of failing the whole sweep. Project
  history reads are now page-read bounded and persist a project-history cursor
  so full sweeps resume through later Gems/projects across passes instead of
  trying every project history in one provider refresh. Gemini adapter history
  hydration now runs for project/Gem conversation surfaces as well as the
  global left rail when account mirror requests `includeHistory`. Root rail
  reads now reuse an existing Gemini `/app/<conversationId>` tab as a valid
  `/app` rail surface and open/scroll the rail in place, instead of forcing
  `Page.navigate(...)` just to browse rail history. BrowserService configured
  target matching shares the same `/app/<id>` compatibility rule, and
  scheduler diagnostics now reads recent browser mutation records without
  touching CDP so rail-reuse proof does not contaminate the audit. The clean
  bounded proof `acctmirror_completion_04ce6c2d-f9ba-4e40-b83b-8d341714ef81`
  completed with no provider guard and scheduler diagnostics showed zero
  `provider:gemini:navigate-conversation-surface` records and zero reloads;
  the remaining mutation sources were Gem view/edit project detail probes.
  Gemini context, conversation-file download, and artifact materialization
  reads now also connect through the app/rail surface and click rail-discovered
  conversations in-page before falling back to a direct provider route.
  A follow-up audit removed the remaining lower-level eager direct navigation
  from Gemini conversation-file download and artifact materialization helpers,
  so those paths now delegate conversation opening to the same rail-first
  context reader. A final rail-list audit also routed `listConversations()`
  through the shared rail target resolver, so configured
  `/app/<conversationId>` URLs normalize to `/app` before global rail
  browsing.
  Live proof jobs `hmj_e98eeb402d764ec9b4ed90ce5bc5d06b` and
  `hmj_1959cca2de1c40c8b55b2776fb23f906` materialized one image each from
  conversations `10b7e2a15e2dd77c` and `1ab8bb794846c491`; the second
  conversation was not the active tab before the job. Scheduler diagnostics
  after both jobs reported mutation sources limited to
  `provider:gemini:connect-tab`, with zero reloads and zero navigations.
- A controlled Gemini existing-conversation proof appended prompt marker
  `AC-PLAN0070-STEADY-1779587303869` to conversation
  `1ab8bb794846c491`, then ran bounded steady-follow completion
  `acctmirror_completion_d8e9306a-2a71-46df-ae47-d09e84b29e13`. The completion
  succeeded, queued materialization job `hmj_d8ead771d10e4a08a462c928ab13e29f`,
  refreshed the target conversation to `messageCount=2` / `artifactCount=1`,
  and materialized new artifact `gemini-artifact:1ab8bb794846c491:2:0` with
  checksum `b54ac02a55be8790328ec1d17f89bb5bd2b83470f81447a36a6faec4f60a8501`.
  `/v1/archive` and `/v1/search` expose the asset route. This proves
  reconciliation and materialization of an operator-modified existing
  conversation, but it does not close the exact recency-order acceptance:
  refreshed catalog evidence still reported `1ab8bb794846c491` at
  `indexRank=14`, so Gemini directly continued conversations do not reliably
  move to rail rank 0 in this proof.
- The same proof exposed a freshness projection bug: the catalog row recorded
  materialization evidence, but `conversationFreshness` still reported
  `missing_assets` because it ignored row-level `assetCompleteness: complete`
  when provider manifests remained remote-only. Freshness derivation now honors
  materialization completeness metadata when deriving local asset counts; a
  current-checkout catalog readback now reports `state=fresh`,
  `assetCompleteness=complete`, and
  `assetCounts={known:1, local:1, missingLocal:0}` for `1ab8bb794846c491`.
- Automatic bulk reconciliation now uses conversation freshness evidence when
  choosing bounded targets. Fresh/complete rows are skipped unless forced,
  stale or partial rows can be selected for `refreshSnapshot` reconciliation
  even when cached asset counts are zero, and terminal/guarded row evidence is
  not retried by automatic bulk jobs unless forced.
- Catalog/search conversation rows now project per-conversation asset counts
  from account-mirror artifact/file/media manifests when assets carry provider
  conversation id evidence. History reconciliation target selection uses the
  same manifest bindings, so a steady-follow refresh that discovers a new
  artifact in a moved conversation can enqueue materialization even if the
  cached transcript row still has stale or empty count fields.
- Full-sweep completion refreshes now pass an explicit extended collector
  timeout. Non-Gemini full sweeps use 300s; Gemini full sweeps use 900s because
  project/Gem history hydration plus detail reads are slower under the
  conservative managed-browser pacing. The first bounded Gemini
  `auracall-gemini-pro` dogfood attempt failed at the old collector timeout
  before a refresh pass or materialization handoff was written. The first
  post-project-hydration retry
  `acctmirror_completion_3e96e801-29e3-4360-8028-f2b8961c196e` also timed out
  under the 300s envelope, with no provider guard or CAPTCHA detected; the
  widened Gemini timeout was proven by the post-backoff completion
  `acctmirror_completion_d6ee42c8-898f-424b-9a31-7387603db294`, which finished
  the refresh in about four minutes and handed off asset recovery to the
  history-materialization service.
- Closeout proof: `hmj_96c6d998be8948be8c8910076a374890` records two
  materialized Gemini artifacts with bound identity and checksums. The bounded
  selected-batch proof `hmj_77fc426644154a2f936926f3bc6d34c8` then used the
  same `auracall-gemini-pro` runtime profile with `maxItems=1`,
  `refreshSnapshot=true`, and selected ids
  `7f0070deadbeef42,10b7e2a15e2dd77c`: the synthetic missing id routed to bare
  `/app`, recorded `routeabilityState=not_found_or_unavailable` and
  cache-only `terminal_unavailable` freshness, and did not consume the bounded
  target budget; the same job still refreshed and materialized
  `10b7e2a15e2dd77c` with checksum
  `5df1e3626b11b5016e38710e711152e663e10333c591eb4b4db383b3540704c0`.

## Goal

Existing cached provider conversations should converge toward current online
state without turning cache reads into provider browser work.

There are two valid triggers:

- live follow:
  - full sweep for partial-history backfill
  - steady-state recency walk, because modified conversations normally move to
    the top of project/left-rail history
- operator request:
  - one conversation row
  - one catalog item
  - one provider conversation id
  - a small selected batch from the operator UI, CLI, API, or MCP

Both triggers should use the same provider dispatcher, identity preflight,
politeness, guard, manifest, and archive/search evidence paths.

## Non-Goals

- Do not submit prompts to discover or fetch historical artifacts.
- Do not make `/v1/search`, `/v1/account-mirrors/catalog`, or catalog item
  reads launch browsers implicitly.
- Do not bypass provider politeness, cooldown, dispatcher ownership, or
  human-verification hard stops.
- Do not treat a cached conversation id as live just because it exists locally;
  routeability and active identity remain provider evidence.
- Do not delete local cache rows merely because a bounded pass did not see them.
  Tombstones require direct provider evidence such as a validated route fallback
  or an authoritative provider absence signal.
- Do not add a second materialization backend when the existing
  history-materialization service can be reused or composed.

## Freshness Model

Conversation cache rows need explicit freshness evidence, not just cached
content:

- `indexObservedAt`: when the conversation was last seen in a provider
  left rail, project conversation list, history dialog, or equivalent index.
- `indexSource`: provider surface that saw it, such as `left-rail`,
  `project-conversations`, `history-dialog`, or `account-library`.
- `indexRank`: rank within the recency-ordered surface when available.
- `detailObservedAt`: when AuraCall last read current conversation context.
- `manifestObservedAt`: when AuraCall last refreshed files/artifacts/media
  manifests for that conversation.
- `materializedAt`: newest successful local asset materialization time for the
  conversation.
- `routeabilityObservedAt`: when direct navigation or provider validation last
  proved the id routeable.
- `routeabilityState`: `routeable`, `not_found_or_unavailable`,
  `identity_mismatch`, `guarded`, or `unknown`.
- `conversationFingerprint`: a provider-local change hint derived from stable
  fields that are available without full content when possible: title, updated
  timestamp, message count, artifact/file/media counts, latest turn id,
  provider URL, and provider-specific row metadata.
- `detailCompleteness`: `none`, `partial`, `complete`, or `unknown`.
- `assetCompleteness`: `none`, `partial`, `complete`, or `unknown`.

The freshness states should be conservative:

- `fresh`: index and detail/manifest reads are current enough for the provider
  policy and no missing local assets are known.
- `stale`: provider index evidence is newer than local detail/manifest evidence
  or the conversation fingerprint changed.
- `partial`: detail or asset inventory is known incomplete.
- `missing_assets`: manifests list local-unavailable assets.
- `terminal_unavailable`: routeability evidence says the provider conversation
  is deleted, unavailable to the active identity, or opened under the wrong
  managed browser profile.
- `guarded`: provider hard stop blocked validation; do not retry until a human
  clears the guard and the cooldown expires.

## Live-Follow Algorithm

### Full Sweep Mode

Use for the current partially hydrated histories and any operator-requested
catch-up run.

1. Select one enabled provider/runtime-profile target through the existing
   live-follow completion and scheduler control plane.
2. Run identity preflight and provider guard checks before browser work.
3. Walk provider indexes deeply enough to cover cached history:
   - project conversation lists where the provider supports them
   - global left rail or history dialog
   - account/library indexes for providers that expose artifact/file indexes
4. Merge index rows into the account-mirror cache and retain prior rows that
   were not observed in this bounded pass.
5. Queue bounded detail refresh for rows whose detail is missing, partial,
   stale, or needed to disambiguate missing assets.
6. Refresh conversation context and artifact/file/media manifests.
7. Queue history materialization for missing local assets discovered by the
   refreshed manifests.
8. Record terminal routeability skips without spending the whole target budget.
9. Persist cursors for index, detail, and materialization progress so the next
   pass resumes rather than restarting.

### Steady Follow Mode

Use during normal service operation.

1. On cadence, startup reconcile, or post-work nudge, inspect the top recent
   provider conversations for each enabled target.
2. Treat newly seen ids, changed ranks, changed fingerprints, newer provider
   timestamps, or refreshed stale/partial manifest evidence as candidates. Do
   not require rank 0 when a provider surface proves changed detail/manifest
   evidence without reordering the row.
3. Refresh detail/manifests only for bounded stale candidates, prioritizing:
   - active/in-progress completion cursors
   - conversations with known missing local assets
   - newly changed top-of-rail/project conversations
   - stale or partial cached rows selected by freshness evidence
   - operator-pinned priority rows
4. Materialize missing artifacts only within configured live-follow policy:
   - `metadata_only`: update cache/manifests but do not fetch bytes
   - `recent_missing_assets`: fetch missing assets for changed/recent rows
   - `full_missing_assets`: backfill all fetchable missing assets over time
5. Yield between conversation detail reads when foreground browser work is
   queued.
6. Preserve guard/cooldown behavior. A provider hard stop pauses the target
   rather than causing a tight retry loop.

## Operator Reconciliation

Operators need one explicit action that means: reconcile this cached
conversation against the provider now.

The action should:

- accept provider, AuraCall runtime profile, optional browser profile,
  bound identity, conversation id or catalog item id, and asset kind filters
- optionally force a snapshot refresh even when the routine interval has not
  elapsed
- read the current online conversation context through provider adapters
- update the account-mirror conversation row, transcript/context cache, and
  artifact/file/media manifests
- then run or enqueue history materialization for missing assets from that
  refreshed manifest
- return one durable job id, with sub-results for snapshot refresh and asset
  materialization
- report exact skip/failure reasons for deleted/unavailable conversations,
  identity mismatch, provider guard, unsupported provider surface, no
  downloadable assets, and ambiguous media matching

Preferred surface shape:

- API: add a conversation reconciliation job under the account-mirror namespace,
  or extend the existing history-materialization job with an explicit
  `refreshSnapshot`/`reconcileSnapshot` flag if that keeps the service boundary
  cleaner.
- CLI: expose the same operation through `auracall api ...` without adding
  provider-specific aliases.
- MCP: expose the same operation for agent callers with the same queued status
  and cancellation semantics.
- Frontend: add a compact row affordance on conversation rows in Search and
  Account Mirror views. It should be an icon action with state feedback, not an
  implicit refresh on row open. Row open stays cache-only.

## Implementation Slices

1. Freshness metadata and cache projection - implemented 2026-05-23
   - add freshness fields to account-mirror conversation/item metadata
   - project stale/partial/missing-assets states into catalog/search rows
   - keep all read routes cache-only
   - add unit tests for freshness derivation and deleted/unavailable evidence

2. Conversation reconciliation service - implemented 2026-05-23
   - compose provider context refresh with existing history materialization
   - persist a durable job record with refresh and materialization phases
   - support conversation id, catalog item id, and selected batch inputs
   - preserve queued-only cancellation before provider work starts
   - implemented as `refreshSnapshot` plus optional selected `conversationIds`
     on the durable history-materialization job surface; result payloads carry
     `phases.snapshotRefresh` and `snapshotRefreshes`

3. Live-follow full sweep - backend policy/cursor and bounded live proof
   implemented 2026-05-23
   - added a full-sweep mode to account-mirror completion policy
   - explicit API/CLI/MCP starts and configured `liveFollow` reconciliation can
     set sweep/materialization policy
   - refresh-pass handoffs persist a `materializationCursor` with the queued
     history-materialization job id, pass count, request, and status
   - existing completion pass count, mirror completeness, and materialization
     cursor now provide resumable backend evidence; deeper provider index/detail
     cursors continue progressive backfill across passes
   - full-sweep completion refreshes use an explicit wider collector timeout:
     Gemini uses 900s, while other providers keep the 300s full-sweep envelope
   - Gemini sweep discovery now reserves bounded conversation-row budget for
     Gem/project histories in addition to the left rail, fans that budget
     across project histories before deepening one Gem, and uses a
     project-history cursor so full sweeps continue through later projects
     across passes without over-spending one refresh cycle
   - post-fix Gemini retry reached `idle_waiting` on explicit-refresh cooldown
     until `2026-05-23T17:07:50.624Z`; it was cancelled to avoid stray later
     provider work
   - post-backoff Gemini retry
     `acctmirror_completion_d6ee42c8-898f-424b-9a31-7387603db294` completed
     one bounded full sweep, reported no provider guard, and left
     `mirrorCompleteness.state = in_progress` with 76 detail surfaces
     remaining
   - materialized missing assets according to the configured artifact policy:
     `hmj_96c6d998be8948be8c8910076a374890` materialized two image artifacts
     from conversations `10b7e2a15e2dd77c` and `1ab8bb794846c491`, with
     archive checksums
     `bbe2354aaceff8181f4964064b33dabfa4b91a01a18d111361ae6fb112d6387c` and
     `238987c388e126345879f09cba98eb6271d3a9d25570ddb9ff0c340f20e44537`

4. Steady recency follow - cursor semantics implemented; bounded Gemini
   steady-follow and changed-existing-conversation proofs passed with
   changed-detail/manifest evidence rather than rank-only movement
   - steady-follow completion refreshes now pass `sweepMode = steady_follow`
     into account-mirror refresh/collection
   - steady-follow collection ignores the prior deep attachment cursor and
     starts detail inventory from the current top of the provider conversation
     list so modified existing conversations can be noticed quickly
   - full-sweep collection is the only mode that resumes the persisted deep
     attachment cursor across passes
   - Gemini steady/full collection now includes Gem/project conversation
     histories, with bounded project-history budget distributed across Gems and
     individual project route failures recorded as tolerated drift instead of
     aborting the account sweep
   - Gemini root rail reads can reuse the current `/app` or `/app/<id>` tab and
     scroll/open the rail in place; context/download/materialization reads now
     click rail-discovered conversations in-page before any direct route
     fallback
   - materialization candidate selection now treats account-mirror
     artifact/file/media manifests bound to a conversation id as materializable
     evidence, not just cached row count fields
   - a bounded live Gemini steady-follow completion
     `acctmirror_completion_c27fd23b-08a8-4c79-889d-1542f9398a3c` respected
     explicit-refresh cooldown, then failed at the generic collector timeout
     before writing `lastRefresh`; `browser-tools doctor` showed no visible
     guard, so Gemini steady-follow completions now use a 300s collector
     timeout
   - account-mirror refresh failures now write durable target status state
     alongside completion records; a restarted status registry hydrates
     `lastFailureAtMs` and `consecutiveFailureCount` back into
     `failure-backoff` instead of treating the target as immediately eligible
   - Gemini default proof retry timing is now practical: explicit refreshes
     wait 2 minutes plus at most 1 minute of jitter, and refresh failure
     backoff escalates from 2 minutes up to a 10 minute cap while hard-stop
     provider guards remain unchanged
   - bounded live Gemini steady-follow completion
     `acctmirror_completion_e779a4e1-e6d7-4912-b4bb-445e30a7c028` completed
     one pass, refreshed current rail/project metadata, and handed off
     materialization job `hmj_873fd5d4ad154e94ae9517923d7de0dc`, which
     materialized two assets from cached conversations
   - bounded direct reconciliation live jobs
     `hmj_e98eeb402d764ec9b4ed90ce5bc5d06b` and
     `hmj_1959cca2de1c40c8b55b2776fb23f906` each refreshed a Gemini
     conversation snapshot and materialized one image asset while scheduler
     diagnostics reported only `provider:gemini:connect-tab` browser mutations,
     with zero reloads and zero navigations
   - a controlled existing-conversation proof on Gemini conversation
     `1ab8bb794846c491` refreshed and materialized the newly added artifact,
     but the provider rail evidence still reported `indexRank=14`; the
     steady-follow acceptance now treats changed detail/manifest evidence as a
     valid candidate signal when provider rank does not move
   - automatic bulk reconciliation now skips fresh/complete rows, includes
     stale/partial/missing rows for `refreshSnapshot` even when row asset counts
     are zero, and avoids terminal/guarded rows unless forced

5. Operator surfaces - implemented 2026-05-23 for one-row and API/CLI/MCP
   queued reconciliation; batch UI remains a later ergonomics follow-up
   - API/CLI/MCP parity for one conversation and small selected batches is
     implemented on `history_materialization` create/list/read/cancel
   - row-level Search and Account Mirror affordances queue conversation
     reconciliation explicitly with status feedback
   - list/read/cancel job surfaces expose durable job status; detail links from
     job results can continue to be tightened as search/archive handoff polish

6. Provider-specific closeout
   - Gemini: left rail and project history discovery, direct routeability
     classification, generated-media/artifact materialization
   - ChatGPT: project/sidebar conversation detail refresh and artifact/file
     materialization
   - Grok: update metadata where supported and keep unsupported historical
     media materialization explicit

## Acceptance Criteria

- A full live-follow sweep can take a partially hydrated Gemini account mirror
  and progressively refresh cached conversation detail/manifests until missing
  artifacts are either materialized or have terminal skip/failure evidence.
- A routine steady-follow pass detects an existing provider conversation after
  an operator added content, either from recency-ordered project/left-rail
  movement or from changed detail/manifest freshness evidence, refreshes that
  cached conversation, and makes any new downloadable artifacts visible in
  search/archive asset availability without spending bounded work on already
  fresh/complete rows.
- A single conversation row can be reconciled immediately through API, CLI,
  MCP, and the operator UI without opening browsers from cache-only read
  routes.
- Job results include enough evidence to associate artifact hashes with the
  provider conversation id and bound identity.
- Deleted/unavailable Gemini conversations that route to bare `/app` record
  terminal per-conversation evidence and do not consume the whole bounded
  reconciliation budget.
- Provider hard stops such as `google.com/sorry`, CAPTCHA, reCAPTCHA, and
  account challenges pause/guard the target and require human clearance before
  retry.
- `GET /v1/search`, account-mirror catalog, and catalog detail routes remain
  cache-only and never acquire browser dispatcher locks.

## Definition Of Done

- Plan 0070 is wired from the roadmap and runbook.
- Freshness state is visible in account-mirror/search projections.
- Conversation reconciliation has shared-service tests and API/CLI/MCP parity.
- Live-follow can run both full-sweep and steady-follow policies without
  bypassing dispatcher/politeness controls.
- Frontend row actions request reconciliation explicitly and show durable job
  status.
- Gemini full-sweep dogfood records materialized assets and terminal skips for
  the current partially hydrated account.
- Targeted tests, `pnpm run check`, and `pnpm run plans:audit -- --keep 70`
  pass before closeout.
