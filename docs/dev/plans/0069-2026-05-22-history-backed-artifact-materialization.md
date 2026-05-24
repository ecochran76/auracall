# History-Backed Artifact Materialization

Status: CLOSED
Date: 2026-05-22
Lane: P01

## Context

AuraCall now has two adjacent but incomplete surfaces:

- the account mirror can crawl provider account history and cache metadata for
  conversations, files, artifacts, and media
- the run archive can search AuraCall-created runs and materialize some missing
  generated artifacts when an archive item already carries provider conversation
  evidence

That is not enough for historical artifact recovery. If a provider chat contains
downloadable artifacts, AuraCall should be able to use the mirrored history as a
discovery index, reopen the provider conversation through the managed browser,
download the provider assets through the provider's own controls, and persist
the resulting files into the identity-scoped cache and run archive.

This plan owns that missing backend materialization lane.

## Current State

Closeout note: the opening-state bullets below are retained for historical
context. The bounded backend lane closed on 2026-05-23 after API/CLI/MCP
surfaces, cache-only catalog guarantees, ChatGPT live recovery, Gemini live
skip evidence, and Grok unsupported evidence were all recorded.

Available now:

- Account mirror history crawl:
  - `POST /v1/account-mirrors/refresh`
  - `GET /v1/account-mirrors/status`
  - `GET /v1/account-mirrors/catalog`
  - `GET /v1/account-mirrors/catalog/items/{item_id}`
  - MCP `account_mirror_status`, `account_mirror_refresh`, and
    `account_mirror_catalog`
- ChatGPT account mirror detail inventory can collect conversation-level
  artifacts/files and account-library rows, though the current collector can
  return after library inventory without also walking conversation detail rows in
  the same pass.
- ChatGPT and Gemini provider adapters can reopen a known historical
  conversation and expose conversation context/artifact materialization helpers.
- `LLMService` already has internal primitives for:
  - `getConversationContext(...)`
  - `materializeConversationArtifacts(...)`
  - `materializeConversationArtifact(...)`
  - `materializeConversationFiles(...)`
  - `listAccountFiles(...)`
  - `listConversationFiles(...)`
- Run archive materialization has durable async jobs for one generated-artifact
  archive item through API, CLI, and MCP.
- Media generation has a CLI `media materialize` command that can materialize
  active/provider media when supplied with enough provider conversation evidence.

Missing:

- No durable job lane accepts an account-mirror catalog item or provider
  conversation id and downloads all fetchable artifacts/files from that
  historical chat.
- The account-mirror catalog asset route is cache-only; it serves local files
  only when they already exist and does not enqueue provider download work.
- No bulk reconciliation worker walks account-mirror history, identifies
  missing local assets, and queues bounded provider downloads.
- Gemini and Grok account mirror collectors do not yet populate provider detail
  artifact/media inventory comparable to ChatGPT's conversation detail pass.
- Media-generation archive recovery is not linked to account-mirror/history
  lookup. Older media rows that lack local paths need provider conversation
  matching before they can be refetched.
- MCP/API/CLI parity for account-mirror materialization is in progress. Direct
  media-generation materialization now has CLI, API, and MCP surfaces; the
  history-backed lane remains the account-mirror recovery path.

Live audit snapshot:

- `/v1/search?kind=artifact&assetAvailability=unavailable` reports 71
  unavailable generated artifacts in the installed runtime:
  - 68 Gemini media rows with `media-artifact-missing-local-path`
  - 3 ChatGPT rows, including 2 skipped `legacy_readout.json` sandbox downloads
- `/status.liveFollow.targets` shows ChatGPT mirrors already cache substantial
  artifact/file history across runtime profiles, so the first blocker is not
  absence of history; it is the missing history-to-download orchestration layer.

## Scope

This plan owns backend recovery of downloadable provider artifacts discovered
from cached account history:

- single-conversation materialization by provider/runtime profile/conversation id
- account-mirror catalog item materialization
- bounded bulk reconciliation from history/catalog rows into cache/archive assets
- provider-specific history detail collection needed to discover downloadable
  artifacts and media
- API, CLI, and MCP surfaces for the above

## Non-Goals

- Do not scrape historical session text as a substitute for downloading
  provider artifacts.
- Do not submit new prompts while materializing historical assets.
- Do not make account-mirror catalog reads launch browsers implicitly.
- Do not assume projects are synchronized across tenants or services.
- Do not treat missing provider evidence as silently successful. Missing local
  assets should remain explicit unavailable rows until recovery has enough
  evidence or records a failed/skipped materialization reason.

## Public Contract

The new backend surface should expose:

- create/list/status/cancel for history materialization jobs
- input by account-mirror catalog item id, provider conversation id, or archive
  item id when the archive row lacks enough local evidence
- filters for artifact/file/media kind, max item count, force refresh, provider,
  runtime profile, project id, and bound identity
- per-item manifest entries with provider ids, local paths, cache keys,
  checksums, MIME types, materialization method, and skip/failure reason
- archive backfill/upsert after successful downloads so `/v1/search`,
  `/v1/archive`, account-mirror detail, and asset routes agree

## Implementation Slices

1. Conversation asset materialization service
   - add a durable service that accepts provider, runtime profile, conversation
     id, optional project id, and asset kind filters
   - route through the existing browser operation dispatcher and `LLMService`
     conversation artifact/file materializers
   - persist manifests under the existing conversation-attachment cache
   - upsert archive evidence after each successful local file

2. API/CLI/MCP job surface
   - add account-mirror/history materialization create/list/status/cancel routes
   - expose CLI parity for single conversation and catalog item materialization
   - expose MCP parity for agent callers
   - keep account-mirror catalog reads cache-only; materialization remains an
     explicit queued operation

3. ChatGPT history reconciliation
   - adjust ChatGPT detail inventory so account-library discovery does not
     prevent bounded conversation detail inventory
   - queue missing historical ChatGPT files/artifacts from catalog rows
   - prove the remaining legacy sandbox rows either materialize or record a
     concrete provider skip reason with a conversation link

4. Gemini media/history reconciliation
   - add Gemini account-mirror detail/media inventory using existing
     conversation context and artifact materializer paths
   - connect media-generation rows without local paths to candidate historical
     Gemini conversations by provider/runtime prompt/timestamp evidence
   - materialize matched assets and persist evidence linking the media row to
     the provider conversation

5. Grok history/media follow-through
   - audit whether Grok has a provider-supported historical artifact/media
     materialization path beyond active media materialization
   - add provider-specific materializer support or record explicit unsupported
     skip reasons

## Progress | 2026-05-22

- Slices 1 and 2 now have the first backend lane: a durable
  `history_materialization_job` service, HTTP
  `/v1/account-mirrors/materializations` create/list/read/cancel routes, CLI
  `auracall api history-materialization-*` commands, and MCP
  `history_materialization_*` tools.
- The service can resolve direct provider conversation requests, account-mirror
  catalog items, archive items with provider conversation evidence, and bounded
  reconciliation requests. It calls the existing conversation artifact/file
  materializers, stores per-item manifests, and upserts successful local files
  into the run archive as `account_mirror` rows.
- Account-mirror catalog and catalog-item reads remain cache-only. Provider
  browser recovery is only triggered by the explicit materialization job
  surface.
- Remaining plan work was still open at this checkpoint: ChatGPT history-detail reconciliation,
  Gemini media/history matching and materialization, Grok provider support or
  explicit unsupported evidence, and live installed-runtime proof against the
  currently unavailable artifact rows.
- ChatGPT reconciliation progress:
  - account-library discovery no longer prevents bounded conversation/project
    detail reads in the same refresh pass.
  - artifact/file catalog item materialization can resolve nested
    conversation/project URL evidence from account-mirror metadata.
  - deterministic reconciliation tests now prove materializable cached
    conversation rows are selected while rows without cached asset evidence are
    skipped.
  - live worktree API proof materialized both remaining legacy ChatGPT
    `legacy_readout.json` rows:
    - `hmj_da867a6da526428ca74c310e21a121bd` recovered conversation
      `6a072f1f-7fb0-83ea-9596-3d2736020627`, wrote checksum
      `1554902debc6d64f8bacaba03ab0afc4122125b189387e302485ff87633ffb45`, and
      upserted an `account_mirror` archive row with `fileAvailable=true`.
    - `hmj_887400dde3764636bf350a38e284223b` recovered conversation
      `6a072a9c-9b1c-83ea-823d-b11a2da12fa1`, wrote checksum
      `22a31237870b166b0867e17f556e18aa4fb02189a50bf0df67bcbb216e027482`, and
      upserted an `account_mirror` archive row with `fileAvailable=true`.
    - both jobs used the provider conversation attachment cache and the
      `captured-anchor-fetch` materialization method.
  - Search projection now recognizes history-materialized `account_mirror`
    archive rows as `materialization=succeeded`.
  - ChatGPT unavailable artifacts are now down to the older synthetic
    `chatgpt_image_1` fixture row without provider conversation evidence;
    Gemini media/history matching is the next provider lane.

## Progress | 2026-05-23

- Gemini media/history reconciliation progress:
  - Gemini account-mirror detail inventory now maps conversation-level
    generated/image/video/music artifacts into media manifests using the
    existing conversation context read path.
  - bounded history reconciliation can now include `assetKinds: ["media"]`;
    it scans unavailable media-generation generated-artifact archive rows,
    reads the media-generation prompt, matches it to cached Gemini account
    mirror conversations by direct provider conversation id, unique exact
    title, cached-media evidence, or nearest timestamp-backed exact title, and
    resumes the existing media-generation materializer with the matched Gemini
    conversation URL.
  - explicit `archiveItemId` jobs for media-generation generated artifacts now
    use the same Gemini media-history matching path before falling back to
    ordinary provider-conversation materialization, so an archive-item job can
    recover or explain a row that has a media-generation id but no direct
    provider conversation id.
  - direct provider-conversation evidence on a media-generation archive row now
    bypasses catalog title matching and does not require the account mirror to
    have cached the same conversation row. Legacy media rows with null
    runtime/browser/identity evidence inherit explicit request selectors unless
    the archive row carries a conflicting concrete value.
  - materialized Gemini media refreshes the media-generation archive rows after
    download and returns per-item history manifest entries with local path,
    checksum, materialization method, archive item id, and asset route.
  - direct media-generation materialization now has API/MCP parity with the CLI:
    `POST /v1/media-generations/{media_generation_id}/materialize` and MCP
    `media_generation_materialize` resume the configured media materializer for
    an existing media-generation record instead of creating a second job.
  - human-verification and Gemini `google.com/sorry`/CAPTCHA style errors stay
    hard failures for the queued job instead of being hidden as ordinary skips.
  - legacy Gemini media-generation archive rows whose `runtimeProfile` is null
    are included in runtime-profile-scoped media reconciliation; concrete
    archive runtime-profile evidence is still honored when present.
  - media reconciliation now reads a wider bounded catalog window for media
    jobs and skips ambiguous duplicate Gemini titles instead of opening an
    arbitrary matching conversation; the skip reason reports media-recovery
    evidence counts for cached media, usable timestamps, and cached
    artifacts/files.
  - Gemini detail inventory now prioritizes bounded conversation-context reads
    before project-file reads, so a small account-mirror pass can collect media
    evidence from historical chats instead of spending the full detail-read
    budget on Gemini project surfaces first.
  - regression coverage now proves Gemini conversation-first cursors resume
    through conversation detail reads across bounded passes before falling back
    to project-file reads.
  - regression coverage now proves duplicate-title Gemini media recovery can use
    exactly one cached media manifest row as the disambiguating signal and route
    the materializer to that historical conversation.
  - regression coverage now proves duplicate-title Gemini media recovery stays
    skipped when multiple cached media manifest rows match the same prompt, so
    the matcher does not pick between two media-bearing historical chats.
  - regression coverage now proves duplicate-title Gemini media recovery stays
    skipped when two cached conversations tie for the nearest timestamp-backed
    match, so timestamp evidence only selects a unique closest conversation.
  - regression coverage now proves queued history materialization jobs can be
    cancelled before provider work starts, remain terminal if their scheduled
    queue turn later fires, and reject cancellation after provider work has
    started.
  - regression coverage now proves API-process startup recovery marks
    interrupted queued/running history materialization jobs as failed while
    leaving existing terminal jobs unchanged, so durable status does not strand
    active jobs after restart.
  - active-job dedupe now includes browser profile and explicit provider
    conversation URL selectors, so a queued request for one browser profile or
    provider route cannot be reused for another selector-specific request.
- Deterministic coverage now proves:
  - history materialization active-job reuse is selector-scoped: identical
    requests reuse an active job, but different browser profiles or provider
    conversation URLs queue distinct jobs.
  - account-history materialization HTTP read/cancel routes preserve the shared
    service error contract: missing jobs return `404 not_found_error`, and
    cancelling a non-queued job returns `409 conflict_error`.
  - MCP account-history materialization cancellation preserves the same
    queued-only boundary as a tool error instead of surfacing an unstructured
    handler exception.
  - history materialization job cancellation is enforced in the shared runtime
    service, not only at the HTTP/CLI/MCP wrapper layer.
  - history materialization startup recovery moves interrupted active jobs to
    explicit failed terminal status with operator-readable error evidence.
  - Gemini conversation artifacts produce account-mirror media manifest rows.
  - Gemini detail inventory resumes conversation-first cursor progression across
    bounded passes and only scans project files after conversation contexts are
    exhausted.
  - duplicate Gemini prompt/title matches with one cached media manifest entry
    select the matching conversation by `exact-title-cached-media`.
  - duplicate Gemini prompt/title matches with multiple cached media manifest
    entries remain an explicit ambiguity skip before provider browser work.
  - duplicate Gemini prompt/title matches with equal nearest timestamp evidence
    remain an explicit ambiguity skip before provider browser work.
  - a Gemini unavailable media-generation row with no provider conversation
    evidence can be reconciled by timestamp-backed exact prompt/title match
    against the cached account-mirror conversation and dispatched to the media
    materializer.
  - a Gemini unavailable media-generation row with direct provider-conversation
    evidence can dispatch the media materializer even when the account-mirror
    catalog has no matching conversation row.
  - a targeted archive-item job for a media-generation generated artifact can
    use cached Gemini account history to select the historical conversation
    and dispatch the media materializer without scanning the full archive list.
  - HTTP and MCP direct media materialization call the configured materializer
    for an existing media-generation record and preserve caller metadata.
  - duplicate Gemini prompt/title matches without stronger cached media or
    timestamp evidence are skipped with explicit media-recovery evidence
    counts before provider browser work starts.
- Live/cache proof:
  - worktree API server on `127.0.0.1:18169` queued
    `hmj_112234c5318d4ed6afc5de762f9c0842` for Gemini media reconciliation
    with `assetKinds: ["media"]`, `maxItems: 1`, and `force: true`.
  - the job matched media generation
    `medgen_d3c65525c86e4200916e9f4272b6af99` /
    `artifact_followup_1` to cached Gemini conversation
    `6a131154e90f7362` by exact title
    `Generate an image of an asphalt secret agent`.
  - resumed materialization reached the provider path once but recorded a
    failed manifest entry because Gemini landed on `https://gemini.google.com/app`
    without conversation content:
    `Gemini conversation content not found for 6a131154e90f7362`.
  - no retry was attempted after that provider-state failure; Gemini available
    materialized search rows remained `0`, and unavailable Gemini artifact rows
    remained `68`.
  - follow-up worktree API proof queued
    `hmj_3c45bab418154baa8f8c5ea049c3e733` after widening the media catalog
    window. The job skipped before provider work with:
    `Ambiguous account-mirror conversations for media generation medgen_d3c65525c86e4200916e9f4272b6af99: 5 cached Gemini conversations share the exact title`.
    This records the currently missing evidence instead of reusing the stale
    title-only match; the current matcher also includes media-recovery evidence
    counts on future ambiguity skips.
  - current worktree API proof queued
    `hmj_1c2a052d27b04fc382b0c65104997f80` with `maxItems: 2`; it skipped
    both Gemini rows before provider work with the enhanced evidence counts:
    `0 with cached media`, `0 with usable timestamps`, and
    `1 with cached artifacts/files`.
  - bounded Gemini `mirror-complete` proof
    `acctmirror_completion_a15d4a34-2696-4139-8bc3-f3432a9a8b34` did not touch
    the browser because the account mirror was still inside the provider
    minimum refresh interval until `2026-05-23T05:21:59.172Z`; the queued
    completion was immediately cancelled so it will not run later.
  - after that interval elapsed, a scheduler-disabled worktree API server on
    `127.0.0.1:18169` queued bounded Gemini completion
    `acctmirror_completion_7f78c0b0-cf46-4a64-bb86-3d2431e3f57a` with
    `maxPasses = 1`. It parked as `idle_waiting` with `passCount = 0` and
    `nextAttemptAt = 2026-05-23T07:22:24.538Z`, so it still did not touch the
    browser; the completion was cancelled at `2026-05-23T05:23:24.915Z`.
  - read-only archive summary over all 68 unavailable Gemini generated-artifact
    rows found one direct provider-conversation-evidence row, but it is an old
    async test fixture pointing at `async-conversation`, not a useful live
    recovery target.
  - cache reconciliation job `hmj_abcbe5b6ec7a45a49464624739a93f57` with
    `maxItems: 2` skipped before provider work with the same explicit
    duplicate-title evidence for both rows; final search counts remained
    `unavailable = 68` and `available&materialization=succeeded = 0`.
  - the scheduler-disabled proof also exposed an operator-control distinction:
    `--account-mirror-scheduler-interval-ms 0` stops cadence, but startup
    hydration and configured live-follow reconciliation can still launch
    account-mirror completion loops. `api serve` now has
    `--no-account-mirror-completions-on-start` for isolated proof servers; it
    keeps persisted completion records readable while skipping startup resume
    and live-follow reconcile until an explicit completion command is issued.
- Grok history/media follow-through:
  - current installed-runtime search proof has no unavailable Grok generated
    artifacts: `provider=grok`, `kind=artifact`, and
    `assetAvailability=unavailable` returned `total=0`.
  - code audit found Grok supports active Imagine/files media materialization,
    but not provider-supported historical conversation media materialization:
    the resumed Grok image materializer inspects the active Imagine/files
    surface and does not target a matched provider conversation.
  - history media reconciliation now records an explicit unsupported skip for
    Grok media-generation rows before matching or provider browser work, so it
    cannot accidentally pull an unrelated active Imagine surface into a
    history-backed archive row.
  - deterministic coverage proves a Grok unavailable media-generation archive
    row is skipped before `materializeMediaGeneration` or archive upsert is
    called.
- Final Gemini proof sequence:
  - the remaining Gemini proof required account-mirror media/timestamp evidence
    or a direct provider conversation id for duplicate-title rows before
    provider materialization could be retried safely.
  - the bounded proof server needed
    `--no-account-mirror-completions-on-start`,
    `--account-mirror-scheduler-interval-ms 0`, and
    `--background-drain-interval-ms 0` so only the explicit Gemini command could
    touch a browser.
  - read-only cache audit confirmed the blocker: the five exact-title Gemini
    conversation rows have no cached `createdAt`, `updatedAt`,
    `lastActivityAt`, `cachedMediaCount`, or `cachedArtifactCount`, and the
    current Gemini account-mirror media/artifact manifests are empty.
  - current read-only cache audit at `2026-05-23T00:37:54-05:00` confirmed the
    same blocker and found one persisted Gemini/default live-follow completion
    parked as `idle_waiting` until `2026-05-23T07:06:47.172Z`; future proof
    servers should keep startup completion loops disabled until the explicit
    bounded Gemini command is issued.
  - startup-isolated proof server on `127.0.0.1:18171` was started at
    `2026-05-23T02:01:32-05:00` with startup recovery disabled, background
    drain disabled, scheduler cadence disabled, and account-mirror completion
    startup disabled. Read-only search baselines on that server still show
    Gemini unavailable artifact rows at `total = 68` and Gemini available
    `materialization=succeeded` rows at `total = 0`; no explicit Gemini browser
    command was issued because the safe retry window was still closed.
  - startup-isolated CLI smoke on `127.0.0.1:18170` confirmed that
    `--no-account-mirror-completions-on-start` leaves that existing
    Gemini/default completion readable as `idle_waiting` while the scheduler is
    disabled, and server shutdown leaves the persisted status, next attempt,
    pass count, and lifecycle unchanged.
  - local follow-up at `2026-05-23T01:00:42-05:00` found that cached Gemini
    projects could consume the whole bounded detail-read budget before
    conversation contexts were inspected. The collector now reads Gemini
    conversation details first; the remaining live proof still needs a bounded
    Gemini mirror completion after the provider wait window opens.
  - local audit at `2026-05-23T01:08:22-05:00` added multi-pass regression
    coverage for the Gemini conversation-first cursor; no provider pages were
    touched because the safe retry window is still closed.
  - local audit at `2026-05-23T01:14:51-05:00` added regression coverage for
    the expected post-refresh state where duplicate Gemini titles have exactly
    one cached media manifest row. The matcher selects that conversation with
    `exact-title-cached-media` before provider work; no provider pages were
    touched because the safe retry window is still closed.
  - local audit at `2026-05-23T01:18:54-05:00` added the complementary safety
    regression for multiple cached-media duplicate matches. The matcher records
    the ambiguity with `2 with cached media` and still avoids provider work; no
    provider pages were touched because the safe retry window is still closed.
  - local audit at `2026-05-23T01:26:02-05:00` added the timestamp-tie safety
    regression for duplicate Gemini title matches. The matcher records the
    ambiguity with `2 with usable timestamps` and still avoids provider work;
    no provider pages were touched because the safe retry window is still
    closed.
  - local audit at `2026-05-23T01:31:59-05:00` added service-level cancellation
    regression coverage for the history materialization job queue. Queued
    cancellation now has a direct proof that provider work is never started
    even if the scheduled queue callback runs later; running jobs still reject
    cancellation with the documented pre-provider-work boundary. No provider
    pages were touched because the safe retry window is still closed.
  - local audit at `2026-05-23T01:36:35-05:00` added service-level startup
    recovery regression coverage for interrupted history materialization jobs.
    Active queued/running jobs now have direct proof that restart recovery marks
    them failed with an explicit interruption error, while succeeded/cancelled
    jobs remain terminal. No provider pages were touched because the safe retry
    window is still closed.
  - local audit at `2026-05-23T01:42:59-05:00` fixed active-job dedupe so
    `browserProfile` and explicit `providerConversationUrl` participate in the
    source key. The regression proves identical selector requests still reuse
    an active job, while different browser-profile or provider-URL selectors
    create separate queued jobs. No provider pages were touched because the
    safe retry window is still closed.
  - local audit at `2026-05-23T01:49:43-05:00` added HTTP transport regression
    coverage for account-history materialization read/cancel failures. The API
    now has direct proof that missing reads and cancel requests return
    `404 not_found_error`, while cancel attempts after provider work has
    already completed return `409 conflict_error`; no provider pages were
    touched because the safe retry window is still closed.
  - local audit at `2026-05-23T01:59:10-05:00` hardened MCP cancellation for
    history materialization jobs. Cancel control errors now return MCP
    `isError` text with the shared queued-only message, and the regression
    proves a running-job cancellation does not become an unstructured handler
    exception; no provider pages were touched because the safe retry window is
    still closed.
  - live Gemini mirror completion
    `acctmirror_completion_1458d838-cfb1-46b6-b32a-195b29e2d262` ran after the
    safe retry window opened. It completed one bounded pass with refresh
    `acctmirror_9a01e8fb-faf6-4cc4-ab9a-85cd7e31e6c6`, detected identity
    `ecochran76@gmail.com`, reported provider guard `clear`, and left Gemini
    metadata counts at `projects = 12`, `conversations = 68`,
    `media = 0`.
  - post-refresh media reconciliation job
    `hmj_e4e23eab843e4aba87ca9e3c78540238` processed the first two Gemini media
    rows and skipped both before provider materialization. Both skips recorded
    that five cached Gemini conversations share the exact title
    `Generate an image of an asphalt secret agent`, with `0 with cached media`,
    `0 with usable timestamps`, and `1 with cached artifacts/files`, so no
    unique historical provider conversation could be selected safely.
  - final read-only search counts stayed explicit rather than silently
    successful: Gemini unavailable generated artifacts remained `total = 68`,
    and Gemini available rows with `materialization=succeeded` remained
    `total = 0`.

## Closeout | 2026-05-23

- The history-backed materialization lane is now implemented across shared
  service, HTTP, CLI, and MCP surfaces.
- Account-mirror catalog reads remain cache-only; browser/provider work is
  limited to explicit durable materialization or completion commands.
- ChatGPT historical artifact recovery was proven live with downloaded
  `legacy_readout.json` rows written into the identity-scoped cache/archive.
- Gemini media recovery was proven to stop safely after a live mirror refresh
  because the remaining unavailable media rows still lack unique recovery
  evidence.
- Grok history media recovery is explicitly unsupported for the current provider
  surface and records a skip before browser work.
- Further Gemini improvement should be opened as a new bounded plan only if the
  collector can capture unique media/timestamp evidence or the archive rows gain
  direct provider conversation URLs.

## Acceptance Criteria

- A caller can materialize all downloadable artifacts/files for one cached
  provider conversation without submitting a prompt.
- A caller can queue materialization from an account-mirror catalog item and poll
  durable status without retaining browser details out of band.
- A bounded reconciliation pass can use account history to reduce unavailable
  generated artifacts, including media rows, or record exact provider evidence
  explaining why an item is not fetchable.
- Account-mirror catalog reads remain cache-only and never acquire browser
  dispatcher locks.
- Downloaded files land in the existing identity-scoped cache with manifests and
  are reflected in run archive/search asset availability.
- ChatGPT is proven first, then Gemini media recovery, then Grok provider
  support or explicit unsupported evidence.
