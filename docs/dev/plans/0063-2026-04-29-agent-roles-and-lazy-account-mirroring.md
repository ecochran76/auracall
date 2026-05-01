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
- Routine scheduler passes now prefer eligible mirrors whose
  `mirrorCompleteness.state` is `in_progress`, and scheduler pass metrics count
  how many eligible mirrors are still walking details.
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

Add an explicit compact scheduler-history readback endpoint if `/status`
remains too large for operator workflows; otherwise add resumable attachment
inventory cursors so later mirror cycles continue beyond the first small
detail-read sample.
