# Agent Roles And Lazy Account Mirroring Plan | 0063-2026-04-29

State: OPEN
Lane: P01

## Purpose

Define the next bounded step for account-aware agents and lazy account
mirroring while `auracall api serve` is running.

This plan does not implement a new provider API lane. It keeps the browser
service as the control plane and treats provider account history as
identity-scoped state that must be mirrored patiently through the same managed
browser profile and dispatcher paths as normal browser work.

## Current State

- `agents.<name>.runtimeProfile` is the only live agent-owned execution
  selector.
- `agents.<name>.description`, `instructions`, and `metadata` are accepted
  config fields, but they remain organizational/future-workflow fields.
- Account identity already belongs on
  `runtimeProfiles.<name>.services.<service>.identity`.
- A missing expected service identity is unsafe for browser-backed work because
  it can pollute caches or use the wrong provider account.
- Browser-backed response and media work now routes through the browser
  operation dispatcher; lazy mirroring must use the same queue/control plane.
- The default ChatGPT tenant has the richest useful history and should be the
  first mirror source.

## Proposed Agent Catalog

These are intended config-level agents. They specialize purpose and routing,
not browser identity.

| Agent | Runtime profile | Primary service | Purpose |
| --- | --- | --- | --- |
| `default-chatgpt-memory-steward` | `default` | `chatgpt` | Maintain the low-churn mirror of the default ChatGPT tenant's history, projects, artifacts, account level, and capability snapshot. |
| `default-chatgpt-primary` | `default` | `chatgpt` | Use the richest default ChatGPT account context for normal planning, drafting, synthesis, and historical recall. |
| `consult-chatgpt-pro` | `wsl-chrome-2` | `chatgpt` | Route Pro-capable consulting work and Deep Research while keeping it separate from the default account cache. |
| `soylei-chatgpt-pro` | `wsl-chrome-3` | `chatgpt` | Route Soylei-domain Pro and Deep Research work with its own identity-scoped cache. |
| `grok-imagine-media` | `auracall-grok-auto` | `grok` | Handle Grok Imagine image/video work and mirror saved/files metadata during idle windows. |
| `gemini-media-research` | `auracall-gemini-pro` | `gemini` | Handle Gemini media/research workflows with quota-aware, low-churn discovery and mirror updates. |
| `cross-service-synthesizer` | `default` | `chatgpt` | Consume mirrored account indexes and orchestrate provider-specific agents without merging account identities. |

Initial config shape should stay within the existing schema:

```json5
{
  agents: {
    "default-chatgpt-memory-steward": {
      runtimeProfile: "default",
      description: "Low-churn mirror steward for the default ChatGPT tenant.",
      instructions: "Maintain account mirror freshness without submitting prompts or navigating away from active provider work.",
      metadata: {
        service: "chatgpt",
        purpose: "account-mirror",
        mirrorPolicy: {
          mode: "lazy",
          priority: "background",
          contentPolicy: "metadata-first"
        }
      }
    }
  }
}
```

The `metadata.mirrorPolicy` block is descriptive until a later slice promotes a
typed execution contract.

## Lazy Mirroring Model

Lazy account mirroring should be opportunistic and conservative:

- enqueue only while `api serve` or a future service host is running
- run on startup, idle windows, after successful provider work, and explicit
  operator/API/MCP refresh requests
- acquire the browser operation dispatcher queue before touching CDP
- apply a self-imposed politeness policy before queueing browser work:
  - provider-specific minimum refresh intervals
  - deterministic jitter so all mirrors do not wake at once
  - shorter, still jittered explicit-refresh intervals for operator-requested
    checks
  - exponential failure backoff
  - long cooldowns after provider hard stops such as CAPTCHA, `sorry`, account
    challenge, rate limit, or sign-in required states
- fail fast when expected identity is missing, mismatched, signed out, or
  blocked by human-verification
- prefer metadata first:
  - account identity and account level
  - provider capabilities/tool snapshots
  - projects/workspaces
  - conversation ids, titles, timestamps, service refs, and maturity state
  - files/artifact manifests
  - media saved/files indexes
- fetch full content or binary artifacts lazily on explicit request or bounded
  recent-window policy
- never reload or re-navigate a just-submitted conversation in order to mirror
  it
- never load immature conversation ids for validation; wait for provider-owned
  completion evidence first
- serialize per managed browser profile and provider service
- cap each mirror cycle with provider-specific page/read budgets; do not chase
  infinite scroll or full-history completion in one pass

Current implementation-facing politeness contract:

- `src/accountMirror/politePolicy.ts` owns the first pure policy evaluator.
- `src/accountMirror/statusRegistry.ts` owns the first read-only status
  registry over configured runtime-profile service identities.
- `/status.accountMirrorStatus`, `GET /v1/account-mirrors/status`, and MCP
  `account_mirror_status` expose whether each configured service/profile
  mirror is currently `eligible`, `delayed`, or `blocked` before any browser
  work is enqueued.
- `src/accountMirror/refreshService.ts` owns the first explicit refresh request
  path. It is intentionally narrow: default ChatGPT only, browser operation
  dispatcher acquisition/release first, identity verification before history
  reads, and bounded metadata collection only.
- `src/accountMirror/chatgptMetadataCollector.ts` owns the first passive
  ChatGPT collector. It reads identity, project rows, and conversation rows
  through the existing ChatGPT adapter, bounded by the politeness page/row
  budgets. It does not submit prompts or fetch full conversation bodies.
- `POST /v1/account-mirrors/refresh` and MCP `account_mirror_refresh` request
  that one explicit refresh and return dispatcher evidence plus updated mirror
  status.
- `src/accountMirror/cachePersistence.ts` owns the first durable persistence
  seam. Mirror content is stored in the existing provider cache store under
  `cache/providers/<provider>/<boundIdentity>/account-mirror/snapshot.json`
  and the matching SQLite `account-mirror` dataset when the SQLite/dual cache
  backend is active.
- The canonical mirror content key is provider service plus bound identity.
  AuraCall runtime profile and browser profile remain profile-binding and
  refresh-provenance fields; they do not own separate copies of the same
  account mirror.
- `/status`, `GET /v1/account-mirrors/status`, and MCP `account_mirror_status`
  hydrate persisted mirror counts/evidence before readback without enqueueing
  browser work.
- Successful default-ChatGPT refreshes now persist the bounded project and
  conversation manifests into the existing identity-scoped provider cache
  datasets, plus lightweight `account-mirror-artifacts`,
  `account-mirror-files`, and `account-mirror-media` manifest datasets. These
  are index rows only; full content, user uploads, and binary artifacts remain
  lazy.
- `src/accountMirror/catalogService.ts` owns the read-only catalog service over
  cached mirror manifests. `GET /v1/account-mirrors/catalog` and MCP
  `account_mirror_catalog` expose project/conversation/artifact/file/media index
  rows for operators and agents without acquiring the browser dispatcher,
  launching browsers, scraping providers, submitting prompts, or loading
  conversation ids.
- `src/accountMirror/schedulerService.ts` owns the first scheduler pass seam.
  `api serve` keeps the scheduler disabled by default; when
  `--account-mirror-scheduler-interval-ms` is set it records dry-run
  eligibility passes in `/status.accountMirrorScheduler`, and only
  `--account-mirror-scheduler-execute` allows a pass to request one eligible
  default-ChatGPT routine refresh.
- `POST /status` owns the first scheduler operator controls:
  `pause`, `resume`, and `run-once`. Manual `run-once` remains dry-run unless
  the server was started with `--account-mirror-scheduler-execute` and the
  request explicitly sets `"dryRun": false`.
- Installed-runtime dry-run dogfood refreshed the user-scoped runtime and ran
  `api serve` with `--account-mirror-scheduler-interval-ms 750`. `/status`
  reported nine configured mirror targets, seven eligible, two blocked, one
  eligible default-ChatGPT routine target, dry-run last passes only, and
  `refresh: null`; pause, run-once, and resume controls all returned the
  expected `account-mirror-scheduler` control result.
- `src/accountMirror/schedulerLedger.ts` owns the first persisted pass-history
  seam. It stores a bounded scheduler-pass history in the AuraCall cache and
  `/status.accountMirrorScheduler.history` exposes recent entries so cadence
  and failure evidence survives process restart.
- `GET /v1/account-mirrors/scheduler/history` exposes a compact readback of
  the same persisted scheduler pass history. It summarizes recent passes and
  highlights the latest cooperative-yield event without requiring operators or
  MCP callers to parse the full `/status` payload.
- `auracall api scheduler-history --port <port>` and MCP
  `account_mirror_scheduler_history` read the same compact route from the
  running API service, so operators can inspect recent passes and yield/no-yield
  proof without raw HTTP.
- Installed-runtime dogfood after refreshing `~/.auracall/user-runtime`
  verified both surfaces against an installed API server on port `18093`.
  Installed CLI and MCP both returned the persisted live no-yield pass:
  `refresh-completed` for `chatgpt/default`, `backpressure=none`,
  `yielded=false`, and 67 remaining detail surfaces.
- Default ChatGPT cursor-completion dogfood on installed port `18094` resumed
  the saved attachment cursor through cooldown-spaced explicit refreshes until
  `mirrorCompleteness.state` reached `complete`. Final high-limit catalog
  metrics were 5 projects, 76 conversations, 374 artifacts, 24 files, 0 media,
  and zero remaining detail surfaces.
- Installed-runtime restart dogfood verified that a dry-run pass history entry
  persisted after stopping the scheduler-enabled server and starting a second
  scheduler-disabled server: `lastPass` reset to `null`, while
  `history.entries[0]` retained the prior dry-run completion timestamp.
- `/status.accountMirrorScheduler.lastWakeReason` and `lastWakeAt` expose why
  the latest lazy scheduler pass woke up: startup cadence, routine cadence,
  manual operator run/resume, media settlement, or response-drain completion.
- `/status.accountMirrorScheduler.operatorStatus.posture` gives operators a
  compact scheduler read without inspecting pass internals: `disabled`,
  `paused`, `running`, `scheduled`, `ready`, `healthy`, or `backpressured`.
- MCP `api_status` reads the local API `/status` summary and supports
  `expectedAccountMirrorPosture` / `expectedAccountMirrorBackpressure` so
  agents can assert the running scheduler posture without shelling out to the
  CLI.
- `auracall api status` and MCP `api_status` now project
  `/status.accountMirrorCompletions` into compact completion-control posture:
  aggregate live-follow counts, active operations, and recent paused/cancelled
  or failed operations are visible without raw `/status` JSON or the
  `/ops/browser` dashboard.
- Live follow has moved from explicit one-off completion starts toward a config
  reconciler. The durable desired-state unit is
  `runtimeProfiles.<profile>.services.<provider>.liveFollow`: if the service
  entry has a bound identity and `liveFollow.enabled: true`, `api serve`
  now ensures exactly one durable live-follow completion exists for that
  provider/runtime-profile pair. If `liveFollow.enabled: false`, the reconciler
  leaves the account stopped even when identity is configured. Omitted
  `liveFollow` remains non-surprising until an explicit migration chooses
  whether identity-bound accounts default to `auto`.
- Root-level live-follow config should own fleet defaults only: service-wide
  enablement, cadence, provider budgets, backoff caps, dashboard visibility,
  and maximum concurrent background browser operations. It should not own
  account identity or replace the provider/runtime-profile key.
- API, MCP, and `/ops/browser` should expose both desired state and actual
  operation state for every configured account:
  `desired=enabled|disabled|auto|unsupported`, provider/runtime profile,
  browser profile, expected identity, detected identity, account level,
  operation id, operation status, phase, pass count, next attempt, last refresh,
  mirror completeness, remaining detail surfaces, last error, and latest
  backpressure/yield signal. Operators should be able to see accounts that are
  eligible but not yet running, disabled by config, unsupported by provider
  design, blocked by identity mismatch, or actively backfilling.
- The same status path now supports count expectations for completion-control
  posture: CLI flags `--expect-completion-active`,
  `--expect-completion-paused`, `--expect-completion-cancelled`, and
  `--expect-completion-failed`, plus matching MCP `api_status` inputs.
- `auracall api status` now prints a `Live follow health:` line that combines
  derived severity, scheduler posture, scheduler state, completion-control
  counts, backpressure, and latest cooperative-yield evidence. MCP
  `api_status` exposes the same data in structured `liveFollow` content.
- The derived `liveFollow.severity` is now assertable through
  `auracall api status --expect-live-follow-severity` and MCP
  `api_status.expectedLiveFollowSeverity`, so operators can check `healthy`,
  `backpressured`, `paused`, or `attention-needed` without rebuilding that
  decision from raw scheduler and completion counts.
- Installed-runtime execute dogfood started `api serve` with
  `--account-mirror-scheduler-interval-ms 600000` and
  `--account-mirror-scheduler-execute`, then triggered one manual
  `run-once` with `"dryRun": false`. It completed one default-ChatGPT refresh
  at `2026-04-29T13:59:34.688Z`, detected the bound identity
  `ecochran76@gmail.com`, detected account level `Business`, recorded
  dispatcher operation `e3fd9664-5b67-4fa7-9d5f-43c409890b62`, cached five
  projects and 64 conversations, and then delayed the target on the routine
  minimum interval.
- The attachment inventory slice added explicit file manifests to the mirror
  cache/catalog contract and samples ChatGPT project files, conversation files,
  and conversation artifact manifests within the existing per-cycle artifact
  row budget. Account-level ChatGPT uploads remain a provider-surface gap until
  ChatGPT exposes or AuraCall implements an account-file listing path.
- Live default-ChatGPT attachment dogfood validated the narrowed collector:
  `acctmirror_25a269dd-b31d-4115-935e-b16c9f89cd38` completed in about 65
  seconds, recorded dispatcher operation
  `b1af2e83-5975-43b5-accd-e5e786576feb`, and cached five projects, 69
  conversations, three artifact manifests, 24 file manifests, and zero media.
  The artifact/file inventory is intentionally marked truncated when the
  detail-read budget is exhausted.
- Attachment inventory now records a resumable
  `metadataEvidence.attachmentInventory` cursor. Each refresh starts at the
  prior project/conversation detail index, then merges newly discovered
  artifact/file rows with the existing identity-scoped catalog before writing
  the next snapshot. This makes repeated lazy refreshes incremental without
  increasing the per-cycle browser-read budget.
- Installed-runtime cursor dogfood validated the first resumed snapshot write:
  `acctmirror_7fe49faf-5991-42be-873b-1a1fdb530a45` completed through
  dispatcher operation `f0885a9a-53bb-48c0-926d-638fd347769f`, preserved the
  existing five project, 69 conversation, three artifact, and 24 file counts,
  and persisted attachment cursor `{ nextProjectIndex: 5,
  nextConversationIndex: 1, detailReadLimit: 6 }`.
- Status, refresh, and catalog readback now expose derived
  `mirrorCompleteness` so operators do not need to interpret raw cursor values:
  `none` means no snapshot, `complete` means current metadata indexes are not
  truncated, `in_progress` means cursor-backed walking is still underway, and
  `unknown` means truncated evidence lacks a continuation cursor.
- Installed-runtime read-only dogfood confirmed both
  `GET /v1/account-mirrors/status` and `GET /v1/account-mirrors/catalog`
  report the cached default ChatGPT mirror as `in_progress` with 68 remaining
  conversation detail surfaces.
- Routine scheduler passes now select across all configured live-follow targets,
  not only `chatgpt/default`; they still prefer eligible mirrors whose
  `mirrorCompleteness.state` is `in_progress`, and scheduler pass metrics count
  enabled, eligible, delayed, and in-progress live-follow targets.
- Scheduler passes expose `backpressure.reason` so operators can distinguish
  routine politeness delay, dispatcher contention, cooperative yield, and no
  backpressure without parsing refresh errors or attachment cursors.
- `auracall api status --port <port>` prints that backpressure reason from the
  installed runtime and can assert it with
  `--expect-account-mirror-backpressure <reason>`.
- Routine scheduler-triggered refreshes call the dispatcher with
  `queueTimeoutMs: 0`. Lazy mirror work therefore only starts when the browser
  lane is immediately available; if a real API response/media request or other
  browser operation already owns the lane, the lazy pass records a blocked
  refresh instead of waiting behind user work.
- API-served real work now nudges the same lazy scheduler after media generation
  settles and after response-run drain completes. The nudge only reschedules the
  existing account-mirror scheduler; it does not scrape directly, bypass
  politeness, or wait behind browser work.
- Installed-runtime dry-run `POST /status` verified the scheduler readback
  includes the new metrics. The pass skipped because default ChatGPT was
  routine-delayed, confirming the scheduler still respects politeness before
  attempting any browser work.
- Installed-runtime default Gemini/Grok cooldown dogfood proved the
  configured-account rollup correctly raises enabled-target attention, but also
  exposed provider identity-detection drift. Gemini can temporarily lack an
  in-page Google account label while the managed Chrome profile still exposes
  the bound account; Grok settings fallback can see cookie/preference-center
  UI text. Identity preflight now accepts a browser-profile fallback only when
  page identity is absent, and Grok normalizes settings-dialog identity
  candidates through the low-signal filter before reporting a match/mismatch.

## API Work Interaction Plan

Lazy mirroring must remain lower priority than API-requested work:

- Real work is any user/API/MCP-requested response, media generation, explicit
  account refresh, or operator control that needs provider/browser execution.
- Routine lazy mirror passes may observe status and cached catalogs at any
  time, but they may only acquire browser execution opportunistically with zero
  queue wait.
- If real work has already acquired the browser dispatcher, the routine mirror
  pass exits as blocked and the scheduler tries again on its normal cadence.
- If a routine mirror has already acquired the dispatcher before a real work
  request arrives, the collector checks for queued operations between
  project/conversation detail reads. When a queued operation is observed behind
  the current mirror operation, the collector marks the inventory truncated,
  preserves the continuation cursor, releases the dispatcher, and lets the
  scheduler try again later.
- Queue observations now record the queued request owner as well as the active
  blocker. Routine mirrors yield to user/API browser work such as response
  execution and media generation, but they do not preempt themselves just
  because another routine mirror refresh is queued behind the active mirror.
- Browser media generation now writes to the shared queue-observation ledger,
  so lazy live follow can detect media work waiting behind an already-running
  mirror pass instead of relying only on response browser-execution events.
- When a routine mirror yields, the attachment continuation cursor now records
  a bounded `yieldCause` with the queued work owner command, kind, operation
  class, and observation time. Compact scheduler history projects that cause
  together with the resume cursor and remaining detail surfaces.
- Deterministic local API dogfood uses `pnpm run smoke:scheduler-history`. The
  smoke starts a short-lived in-process API server with an injected yielded
  scheduler pass and verifies `GET /v1/account-mirrors/scheduler/history`,
  `readApiSchedulerHistoryForCli`, `readApiStatusForCli`, MCP
  `account_mirror_scheduler_history`, and MCP `api_status` all report
  `media-generation:chatgpt:image`, four remaining detail surfaces, and the
  expected resume cursor without launching browsers.
- Low-churn live follow dogfood on 2026-05-01T00:34-00:37Z ran one
  execute-enabled `run-once` against the bound default ChatGPT profile. The
  pass completed without backpressure, advanced the attachment cursor to
  `nextConversationIndex: 7`, reduced remaining detail surfaces from 68 to 67,
  and left `latestYield` null because no response or media browser work queued
  behind the mirror.
- This first cooperative-yield contract is intentionally boundary-scoped: it
  yields between detail surfaces, not in the middle of a provider DOM read.
- default routine intervals:
  - ChatGPT: 6 hours plus up to 20 minutes jitter
  - Gemini: 12 hours plus up to 45 minutes jitter
  - Grok: 8 hours plus up to 30 minutes jitter
- default explicit refresh intervals:
  - ChatGPT: 10 minutes plus jitter
  - Gemini: 30 minutes plus jitter
  - Grok: 20 minutes plus jitter
- hard-stop cooldowns:
  - ChatGPT/Grok: 12 hours
  - Gemini: 24 hours
- default per-cycle budgets:
  - ChatGPT: 12 page reads, 250 conversation rows, 80 artifact rows
  - Gemini: 6 page reads, 120 conversation rows, 40 artifact rows
  - Grok: 8 page reads, 160 conversation rows, 80 artifact rows

## Runtime Surfaces

The service should expose mirror status through API and MCP before broadening
the worker behavior:

- `idle`
- `queued`
- `syncing`
- `blocked`
- `stale`
- `healthy`
- `failed`

Each status payload should include:

- AuraCall runtime profile
- browser profile
- provider service
- expected identity
- detected identity when available
- account level when available
- last sync attempt
- last successful sync
- next eligible sync
- queued/acquired browser operation evidence
- metadata counts by resource kind
- latest hard-stop reason

## Acceptance Criteria

- Agent role guidance is documented without changing the live agent execution
  contract.
- Lazy mirroring has a service-mode plan that keeps browser/CDP access behind
  the browser operation dispatcher.
- Read-only mirror-status reporting exists before any background mirror loop.
- Explicit default ChatGPT refresh can be requested through API/MCP and records
  queued/running/completed dispatcher evidence without background looping.
- Explicit default ChatGPT refresh verifies the bound identity before reading
  bounded project/conversation metadata.
- Configured Pro ChatGPT runtime-profile refreshes can be requested through the
  same API/CLI/MCP completion path and verify the bound profile identity before
  reading bounded metadata.
- The first implementation slice targets default ChatGPT metadata-first
  mirroring only.
- API and MCP mirror-status readback exist before any long-running background
  mirror loop is widened.
- Mirror storage is keyed by provider service plus bound identity, not by
  agent name, AuraCall runtime profile, or browser profile alone.
- Mirror status can read the latest persisted metadata counts/evidence from
  the cache store after process restart without keeping all mirror state in
  memory.
- Bounded mirror manifests are persisted separately from the status snapshot:
  projects, conversations, artifacts, files, and media indexes can be read from the
  identity-scoped provider cache without submitting prompts or materializing
  full content.
- API and MCP manifest catalog readback can list cached
  project/conversation/artifact/file/media rows by provider, AuraCall runtime
  profile, kind, and limit without requiring callers to know cache file paths.
- A disabled-by-default lazy scheduler can run dry-run eligibility passes from
  `api serve`, expose its last pass in `/status`, and avoid browser dispatcher
  acquisition unless execution mode is explicitly enabled.
- Scheduler operator controls can pause/resume the timer and trigger one
  manual pass through `POST /status`, with manual execution still requiring
  explicit server execute mode.
- Scheduler pass history is persisted in a bounded cache ledger and projected
  into `/status.accountMirrorScheduler.history`.
- Nonblocking mirror completion is available as a service operation:
  callers start completion through the API/CLI/MCP, receive an operation id
  immediately, and poll status instead of holding a long shell command open.
- The default completion mode is unbounded live follow. It backfills history
  until the provider reports no more history, then remains running in a steady
  follow phase that periodically crawls for new content. `maxPasses` is only a
  debug cap.
- Completion operation records are now file-backed under the account-mirror
  cache and hydrated on API/MCP startup. Active records resume automatically,
  and persisted `nextAttemptAt` cooldowns are honored before another refresh
  request is issued.
- Persisted completion operations are listable through API/CLI/MCP filters for
  `status`, `provider`, `runtimeProfile`, and `limit`; list readback is
  service/cache-only and must not touch provider browsers.
- Configured live-follow desired state is discoverable without launching
  browsers: every configured provider account with a bound identity appears in
  API/MCP/dashboard readback with desired state, eligibility, and any linked
  completion operation.
- `api serve` can reconcile configured live-follow accounts into durable
  completion operations without creating duplicates after restart.
- Provider/runtime-profile pairs that are configured but unsupported, missing
  identity, identity-mismatched, or operator-disabled are visible as
  non-running accounts with a specific reason.
- Configured Gemini and Grok accounts now use the same browser-backed refresh
  service and provider dispatcher path as ChatGPT for read-only identity,
  project, and conversation metadata. ChatGPT remains the only provider with
  attachment/artifact detail inventory until Gemini/Grok detail surfaces are
  proven.
- `/status.accountMirrorCompletions` summarizes persisted completion metrics
  plus active and recent operations, and `/ops/browser` renders the same
  "Mirror Live Follow" posture for local operators.
- `auracall api status` and MCP `api_status` summarize the same completion
  posture so operators can see paused/cancelled live-follow state from the
  regular status command.
- `auracall api status` and MCP `api_status` can assert active/paused/cancelled
  and failed completion counts for deterministic control-state smokes.
- `auracall api status` and MCP `api_status` expose compact live-follow health
  as a first-class summary instead of requiring operators to mentally combine
  scheduler, completion, and yield fields.
- `auracall api status` and MCP `api_status` expose and assert derived
  live-follow severity: `healthy`, `backpressured`, `paused`, or
  `attention-needed`.
- `/status.liveFollow` exposes the same shared live-follow health projection
  used by CLI status, MCP `api_status`, and `/ops/browser`.
- `/status.liveFollow.targets` now exposes configured-account desired/actual
  rollups: enabled/disabled/unconfigured/missing-identity/unsupported counts,
  active/queued/running/paused/attention counts, completeness counts, and a
  compact account list with provider/runtime profile, desired state, operation
  status, phase, pass count, next attempt, completeness, and metadata counts.
- `/ops/browser` shows the same derived live-follow severity in the Server
  summary and Mirror Live Follow panel, so dashboard operators can see the
  health state without reading raw completion counts.
- Live-follow completion controls are available by id through API, CLI, MCP,
  and `/ops/browser`: pause keeps the operation active but stopped, resume
  relaunches the service-owned loop, and cancel records a terminal
  `cancelled` state without touching provider browsers.
- `pnpm run smoke:completion-control` starts a short-lived local API server
  with an injected completion service and proves `POST /status` pause, CLI
  resume, MCP cancel, and `/status.accountMirrorCompletions` readback without
  acquiring browser dispatcher or provider state.
- `POST /status` now accepts `accountMirrorCompletion` controls for
  `pause|resume|cancel`, and `/ops/browser` uses that regular status preflight
  path for the Mirror Live Follow control buttons.
- `pnpm run smoke:live-follow-health` starts one fixture-backed local API
  server and proves `/status.liveFollow`, CLI `api status`, MCP `api_status`,
  and `/ops/browser` all report the same shared live-follow health projection
  without acquiring browser dispatcher or provider state.
- `pnpm run smoke:completion-hydration` seeds a paused live-follow completion
  into a temp cache, restarts the API over the same cache, and proves `/status`,
  CLI `api status`, and MCP `api_status` preserve active paused posture without
  acquiring browser dispatcher or provider state.
- `pnpm run smoke:ops-browser-control` verifies `/ops/browser` button wiring
  points to `POST /status` with `accountMirrorCompletion`, then pauses a
  fixture live-follow completion through that status-control path without
  acquiring browser dispatcher or provider state.
- `auracall api ops-browser-status` reads `/ops/browser` and linked `/status`,
  asserts the dashboard completion-control contract, and supports the same
  live-follow severity and completion-count expectations as `api status`. The
  CLI summary also prints the concrete `/ops/browser` URL for direct operator
  handoff.
- MCP `api_ops_browser_status` exposes the same dashboard/status contract
  readback plus the same `dashboardUrl` for remote operators, and
  `pnpm run smoke:ops-browser-control` verifies it against the fixture server
  without browser/provider work.
- `/status.serviceDiscovery` reports the configured API bind URL, local
  hostname/base URL, external hostname/base URL, dashboard/account-mirror
  paths, proxy target, ingress, and auth guard. This keeps the service
  findable after restart without relying on whichever host/port a single
  status probe used. The browser dashboard renders the same service discovery
  data as a dedicated panel so operators can find local, external, and proxy
  routes without opening raw `/status`. The configured dashboard and
  account-mirror paths are also served as operator route aliases and drive the
  dashboard navigation/preview links. `/config` is the read-only operator page
  for the effective service discovery, operator URLs, and routing fields.
- `pnpm run smoke:mcp-ops-browser` verifies the installed `auracall-mcp`
  binary lists and calls `api_ops_browser_status` against a paused live-follow
  fixture API server without browser/provider work.
- `pnpm run preflight:lazy-live-follow` is the compact operator gate for this
  surface. It runs completion-control, completion-hydration,
  live-follow-health, ops-browser-control, user-runtime install, and installed
  MCP status smokes in sequence.
- Installed default-ChatGPT dogfood on port `18095` proved the start/status/
  pause control plane through API, MCP `api_status`, MCP
  `api_ops_browser_status`, and `/ops/browser`. It also found and fixed a
  completion accounting gap: pause during an in-flight refresh must still
  preserve the completed pass result.
- `api mirror-completions --status active` now parses correctly from the real
  CLI entrypoint. Regression coverage verifies the spaced form and
  `--status=paused` both reach the completion-list endpoint as query filters.
- Installed default-ChatGPT resume dogfood on port `18095` proved the patched
  accounting on the persisted operation: completion
  `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5` advanced to
  `passCount: 1`, stored `lastRefresh`, remained in `backfill_history`, and
  paused again with 279 remaining detail surfaces after refresh
  `acctmirror_715a135d-8a8d-4339-9c2a-c4b75fd7e36f`.
- Focused completion-service coverage now proves the unbounded `live_follow`
  loop wakes from `nextAttemptAt` on its own, runs the next refresh, and records
  the following cooldown without an operator issuing another resume.
- Installed default-ChatGPT dogfood proved that cadence against the real
  service/cache on port `18095`: completion
  `acctmirror_completion_e26007da-f0e6-4423-bc64-8352c1fdc5c5` advanced from
  `passCount: 2` to `passCount: 3` when it woke itself at
  `nextAttemptAt` and completed refresh
  `acctmirror_e84dd5df-2fca-4271-bff9-dea4b33ef9c2` without a second operator
  resume.
- Pro ChatGPT live-follow dogfood found the first post-default expansion gap:
  completions could target `chatgpt/wsl-chrome-2`, but refresh still blocked
  with `account_mirror_refresh_scope_unsupported` because the first refresh
  slice was hard-coded to the default ChatGPT runtime profile.
- The refresh path now remains ChatGPT-only but supports any configured
  ChatGPT AuraCall runtime profile. The ChatGPT metadata collector resolves the
  requested runtime profile before opening the browser, so identity preflight,
  dispatcher ownership, and cache provenance stay scoped to the profile while
  mirror content remains keyed by provider plus bound identity.
- Installed-runtime Pro dogfood on port `18096` verified
  `chatgpt/wsl-chrome-2`: identity smoke matched
  `consult@polymerconsultinggroup.com` with account level `Pro`, completion
  `acctmirror_completion_115e1b32-30f5-444c-9109-e8f1f45939ba` completed one
  pass through refresh `acctmirror_9a813ac9-a3f3-4d77-9665-4e68c8acf70d`,
  cached three projects, 55 conversations, zero artifacts, nine files, and
  zero media, then paused at `passCount: 1` with 52 remaining detail surfaces.
- Installed-runtime Pro dogfood on port `18096` also verified
  `chatgpt/wsl-chrome-3`: identity smoke matched
  `eric.cochran@soylei.com` with account level `Pro`, completion
  `acctmirror_completion_1c09faa0-84eb-4e80-911c-50767a45a368` completed one
  pass through refresh `acctmirror_d409561a-43f3-4d86-bdca-0ad727658d69`,
  cached one project, 17 conversations, 12 artifacts, zero files, and zero
  media, then paused at `passCount: 1` with 12 remaining detail surfaces.
- The long-lived installed API service on port `18095` was restarted on the
  patched runtime and hydrated both paused Pro completion operations from the
  cache. Resuming `chatgpt/wsl-chrome-3` advanced completion
  `acctmirror_completion_1c09faa0-84eb-4e80-911c-50767a45a368` to
  `passCount: 2` through refresh `acctmirror_68992df3-116a-4b61-bbc7-5a78f4d5d772`,
  reduced remaining detail surfaces from 12 to 8, and scheduled the next
  polite attempt for `2026-05-02T17:02:15.386Z` while the API stayed
  responsive.
- The same long-lived `18095` service then continued `chatgpt/wsl-chrome-3`
  without manual resume through pass 4. Refresh
  `acctmirror_41420d44-b67c-4593-984b-f9a5ebc2cc48` started at
  `2026-05-02T17:18:30.928Z`, completed at
  `2026-05-02T17:19:27.279Z`, moved the completion into `steady_follow`,
  and marked mirror completeness `complete` with one project,
  17 conversations, 194 artifacts, zero files, zero media, and zero remaining
  detail surfaces.
- Resuming the larger `chatgpt/wsl-chrome-2` Pro completion on the same
  long-lived `18095` service completed pass 2 through refresh
  `acctmirror_2547daec-8e8b-4610-b5d7-f52dfbdc87c0`, started at
  `2026-05-02T17:22:34.056Z`, completed at
  `2026-05-02T17:26:10.349Z`, and reduced remaining detail surfaces from
  52 to 46 while preserving three projects, 55 conversations, nine files, and
  zero completion errors.
- The `wsl-chrome-2` completion then woke on its next cooldown without a
  manual resume. Pass 3 refresh
  `acctmirror_bf2c386d-c9a5-4de9-ad01-c6ba2a754592` started at
  `2026-05-02T17:51:56.268Z`, completed at
  `2026-05-02T17:55:28.452Z`, and reduced remaining detail surfaces from
  46 to 40.
- Pass 4 for `wsl-chrome-2` also woke autonomously. Refresh
  `acctmirror_dee52066-cf79-4dab-84d0-ff46d6f250e8` started at
  `2026-05-02T18:21:14.464Z`, completed at
  `2026-05-02T18:24:38.401Z`, and reduced remaining detail surfaces from
  40 to 34.
- Default Gemini and Grok live-follow dogfood on the long-lived `18095`
  service now starts provider completions instead of reporting `unsupported`.
  After installing and restarting on PID `3705379`, `/status` showed
  `gemini/default` cached 12 projects and 54 conversations with conversation
  truncation still in progress, and `grok/default` cached 9 projects and
  43 conversations with mirror completeness `complete`.
- Account mirror refresh now wraps the metadata collector with a default
  two-minute timeout so a provider DOM drift or helper hang releases the
  browser-operation lease and reports a failed pass instead of leaving the
  target permanently `already-running`.
- Operator status now includes a live-follow target rollup. `/status` exposes
  `liveFollow.targets`, CLI `auracall api status` prints `Live follow
  targets:`, and MCP `api_status` includes the same structured target rollup
  without acquiring browser dispatcher or provider state.
- ChatGPT conversation mirroring treats the left rail as an infinite history
  surface. `includeHistory` plus `historyLimit` must scroll older rows before
  claiming conversation inventory is complete.
- Tests cover config projection, mirror scheduling state, identity hard stops,
  and dispatcher queue evidence before live provider dogfood.
- The first scheduling tests prove self-imposed jitter, minimum intervals,
  provider hard-stop cooldowns, failure backoff, and page/read budgets.

## Non-Goals

- Provider API execution for ChatGPT, Gemini, Grok, xAI, or Google AI.
- Cross-account cache merging.
- A fleet scheduler or parallel browser workers.
- Agent-local browser identity overrides.
- Prompt submission as part of background account mirroring.

## Next Implementation Slice

Reinstall/restart the long-lived runtime with the provider identity hardening,
then let default Gemini/Grok complete one routine pass. The first restarted
status poll now shows both enabled default targets running with
`attentionNeeded: 0`. The browser dashboard now renders
`status.liveFollow.targets` in the Mirror Live Follow panel; after the default
Gemini/Grok pass completed cleanly, live-follow severity was adjusted so
healthy enabled targets are not masked by stale terminal completion history.
The first provider-specific detail collector is Grok account files: live follow
uses the existing `listAccountFiles()` surface, caps the read with the artifact
row budget, writes account file manifests, and derives media manifests for
recognized image/video/audio assets. Saved/Imagine gallery scraping remains
deferred until that surface is proven as a stable read-only index.
ChatGPT now has a matching account-level detail surface through
`https://chatgpt.com/library`: the provider adapter exposes it as
`listAccountFiles()`, normalizes visible files/artifacts to UUID-backed account
file IDs, and the live-follow collector merges those library files/artifacts
with the existing bounded project/conversation attachment walk.
The default ChatGPT Business account is now explicitly opted into live follow
with the same `metadata-first` / `background` desired state as default Gemini
and Grok, so API startup reconciliation can keep Library/account metadata fresh
without requiring manual refresh calls.
The lazy scheduler has also been de-biased from its original `chatgpt/default`
bootstrap path: routine passes now choose among all enabled live-follow accounts,
while deprecated `defaultChatgpt*` metrics remain as compatibility aliases for
older status consumers.
Scheduler passes now also re-run live-follow reconciliation after the pass is
recorded, so an enabled account whose durable completion reached a terminal
failed/blocked/cancelled state can be recreated on the next scheduler wake
without requiring an API process restart.
Gemini live follow no longer treats the `/gems/view` project index as mandatory:
the collector tolerates transient Gem manager route failures, continues with
conversation metadata, and merges the previously cached project manifest. The
Gem manager navigation also no longer uses the `location.assign` fallback, so a
failed route settle does not trigger a second re-navigation.
Operator status now distinguishes routine mirror cadence from active live-follow
backfill cadence: `/status.liveFollow.targets.accounts[]` includes
`routineEligibleAt`, `activeCompletionNextAttemptAt`, and effective
`nextAttemptAt`, with the effective value preferring the active completion wake.
API service lifecycle hygiene now handles the restart case exposed during
dogfood: `api serve` terminates same-port orphan `api serve` processes before
binding, and graceful server shutdown parks runnable account-mirror completions
as persisted `queued` work before marking the local runner stale. Startup also
prunes stale browser-operation locks so a forced restart does not leave
live-follow targets blocked by dead owner PIDs. Completion records now include
a bounded `lifecycleEvents` trail, surfaced through API/MCP/CLI status paths,
so operators can see `parked_for_shutdown` and `resumed_after_restart` handoff
evidence without inspecting cache files.
The headline live-follow health line now uses current target rollups
(`enabled`, `active`, `paused`, `attention`) when available, leaving
historical failed/cancelled completion totals in the separate completion
metrics block.
Operator status now also exposes desired-vs-actual live-follow rollups:
`/status.liveFollow.targets.desired` records configured intent, and
`/status.liveFollow.targets.actual` records active/completeness state. CLI
`api status`, MCP `api_status`, and `/ops/browser` render the same compact
signal so operators can see configured accounts without raw entry inspection.
The browser dashboard now renders the per-account live-follow targets as a
table with target id, desired state, actual status, phase, pass count, next
wake, and cache counts, while keeping the raw JSON block as a debug surface.
It also renders an operator attention queue ahead of the full tables, limited
to targets and completion operations in paused, blocked, failed, cancelled,
missing-identity, or attention-needed states.
It also renders active completion operations as a compact table with
completion id, target, status, phase, pass count, next wake, and matching
controls. Each active completion row can inspect the persisted operation via
the existing `GET /v1/account-mirrors/completions/{id}` endpoint without
starting provider work. The same inspection path is available from the manual
completion-id input for pasted operation ids.
Rows with an active completion expose the matching completion id and provide a
`Use ID` control that fills the existing pause/resume/cancel input. They also
render state-aware row actions wired to the same `/status`
`accountMirrorCompletion` control path: queued/running/refreshing operations
offer pause and cancel, while paused operations offer resume and cancel. The
same panel includes an `aria-live` operator feedback notice so selection,
in-flight control requests, successes, and failures are visible without
reading the raw JSON block.
The dashboard also now exposes a read-only account mirror catalog browser and a
dedicated `/account-mirror` page backed by `GET /v1/account-mirrors/catalog`,
with provider, runtime profile, kind, search, and limit controls. Catalog
browsing reads cached indexes only and does not enqueue browser work. Filters
are preserved in the page URL, and rows open cached manifest detail for the
first account mirror navigation/search surface before broader account-mirror
pages are added.
Catalog rows now also have stable cache-backed detail URLs:
`GET /v1/account-mirrors/catalog/items/{item_id}?provider={provider}&runtimeProfile={runtime_profile}&kind={kind}`.
Those item-detail reads share the same bounded cached catalog lookup and do
not enqueue browser work.
Conversation item details now render cached transcript turns as a chat dialog
when `messages`, `turns`, `conversation`, `transcript`, or ChatGPT-style
`mapping` data is present. If a mirror only has metadata, the detail view shows
the conversation header and a no-transcript state while keeping raw JSON
available.
The catalog item detail path also hydrates conversation rows from the existing
cached conversation context store. That keeps catalog list reads lightweight,
does not enqueue browser work, and lets `/account-mirror` display real chat
bubbles whenever a prior provider detail read has cached `messages`.
Catalog conversation rows now include a bounded transcript summary
(`hasCachedTranscript`, `messageCount`, and cached attachment/source/artifact
counts), and the dashboard renders that summary as a `Transcript` column so
operators can identify full chat-dialog candidates before opening item detail.
The dashboard also has a `With transcript only` checkbox persisted as
`withTranscript=1`; it filters client-side against the cached transcript
summary and does not enqueue provider browser work.
The dedicated `/account-mirror` page now treats the catalog as a compact
cached-object browser: kind-count quick filters sit above the table, rows are
condensed to type/name/updated/state/identity/actions, selected rows are
highlighted, and the page automatically opens the first cached conversation
detail as a chat-dialog drill-in when transcript data is available.
Selected account-mirror details are now encoded in the page URL as `item`,
`itemKind`, `itemProvider`, and `itemRuntimeProfile`, so refreshing or sharing
the `/account-mirror` URL reopens the same cache-only detail view without
depending on transient client row indexes.
The same detail pane now includes a compact result navigator for the current
filtered row set, so operators can move between cached conversations, files,
artifacts, and media while preserving the selected-row highlight and stable
detail URL params. Keyboard navigation supports `/` to focus catalog search
and ArrowUp/ArrowDown to move through the result navigator.
Conversation detail views with cached turns now include a local Markdown
transcript download action. The export is rendered in the dashboard from the
already-hydrated cached detail object, so it does not navigate, submit prompts,
or start provider browser work.
Those cached chat-dialog detail views also include local transcript search:
operators can filter visible turns by text or role inside the loaded detail
without re-reading the catalog or touching provider pages.
Conversation detail now also surfaces cached related files, artifacts, and
sources. Files and artifacts reuse the existing cache-backed item-detail route,
while source URLs open externally; neither path starts provider browser work.
File, artifact, and media item-detail views now render a compact cached
metadata inspector with provider/source/type/size/parent context and cached
URLs before the raw JSON block, so operators can review attachments without
manually reading the full payload. The same detail view now renders a
browser-safe cached preview when the cached item has inline text or an
image/video/audio/PDF URL; unavailable previews remain explicit metadata-only
states and do not trigger provider browser work. Materialized cache-owned local
files are served through
`GET /v1/account-mirrors/catalog/items/{item_id}/asset` after the same catalog
identity/profile lookup and a cache-root containment check, allowing the
dashboard preview to render local blobs without exposing arbitrary file paths.
Catalog rows now also include a `Preview` column and summary count that mark
file/artifact/media rows as `local`, `remote`, `inline`, or `metadata`, so
operators can pick previewable cached items before opening the detail pane.
The catalog controls can now filter by preview state and sort previewable or
local cached assets first while staying entirely cache-only.
Rows with local or remote preview URLs now expose direct `Open Preview` and
`Copy URL` actions, with local blobs still routed through the bounded
account-mirror asset endpoint.
The filtered table also has `Preview visible URL list`, `Review visible
previews`, `Open visible previews`, `Copy visible preview URLs`, and `Download
visible preview URL list` batch actions that inspect, render in a single
cache-only preview session with provider/kind/title/item labels, open, or
export the deduplicated local/remote preview URLs for the currently visible
rows. Preview sessions default all tiles selected, then let operators select
all, select none, or narrow export to a reviewed subset before copying or
downloading URLs. Operators can also download a selected JSON manifest with the
same URL plus provider, runtime profile, kind, title, item id, identity, and
updated timestamp context, and can load that manifest back into the same
cache-only preview-session renderer. The local API now persists named preview
session records under the account-mirror cache through
`POST /v1/account-mirrors/preview-sessions`, list/read routes, and matching
dashboard controls so reviewed preview sets can be reopened by id. In
`sqlite`/`dual` cache mode, the canonical named-session rows live in
`account-mirror/cache.sqlite`; the older `account-mirror/preview-sessions/*.json`
records remain readable as a compatibility/import layer. The same local API
surface also supports `PATCH` rename and `DELETE` removal for saved preview
sessions, with dashboard controls wired to the saved-session selector. The
Preview Session page also includes a compact saved-session browser with search,
created/updated timestamps, item counts, content badges, and load/open actions.
