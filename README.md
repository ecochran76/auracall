# Aura-Call 🧿 — Whispering your tokens to the silicon sage

<p align="center">
  <img src="./README-header.png" alt="Aura-Call CLI header banner" width="1100">
</p>

<p align="center">
  <a href="https://github.com/ecochran76/auracall/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/ecochran76/auracall/ci.yml?branch=main&style=for-the-badge&label=tests" alt="CI Status"></a>
  <a href="https://github.com/ecochran76/auracall"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=for-the-badge" alt="Platforms"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License"></a>
</p>

Aura-Call bundles your prompt and files so another AI can answer with real context. It speaks GPT-5.1 Pro (default alias to GPT-5.2 Pro on the API), GPT-5.1 Codex (API-only), GPT-5.1, GPT-5.2, Gemini 3 Pro, Claude Sonnet 4.5, Claude Opus 4.1, Grok 4.20, and more—and it can ask one or multiple models in a single run. Browser automation is available; use `--browser-model-strategy current` to keep the active ChatGPT model (or `ignore` to skip the picker). API remains the most reliable path, and `--copy` is an easy manual fallback.

## Quick start

Primary local install: `pnpm run install:user-runtime` builds the current
checkout into `~/.auracall/user-runtime` and writes user-owned wrappers under
`~/.local/bin`; see `docs/user-scoped-runtime.md`.
Public npm distribution is intentionally deferred; `auracall` is not currently
offered through npm or Homebrew.

Requires Node 22+.

```bash
# Copy the bundle and paste into ChatGPT
auracall --render --copy -p "Review the TS data layer for schema drift" --file "src/**/*.ts,*/*.test.ts"

# Minimal API run (expects OPENAI_API_KEY in your env)
auracall -p "Write a concise architecture note for the storage adapters" --file src/storage/README.md

# Multi-model API run
auracall -p "Cross-check the data layer assumptions" --models gpt-5.1-pro,gemini-3-pro --file "src/**/*.ts"

# Preview without spending tokens
auracall --dry-run summary -p "Check release notes" --file docs/release-notes.md

# Browser run (no API key, will open ChatGPT)
auracall --engine browser -p "Walk through the UI smoke test" --file "src/**/*.ts"

# Preferred first-time browser onboarding (guided config + managed profile + live verification)
auracall wizard

# Scriptable browser onboarding (managed Aura-Call profile + live verification + account check)
auracall setup --target grok

# Seed the managed Aura-Call profile from a different browser/source profile
auracall setup --target grok \
  --browser-bootstrap-cookie-path "/mnt/c/Users/<you>/AppData/Local/BraveSoftware/Brave-Browser/User Data/Default/Network/Cookies"

# Machine-readable browser doctor output
auracall doctor --target grok --json

# No-prompt account binding smoke for the selected AuraCall runtime profile
auracall profile identity-smoke --target chatgpt --include-negative --json
auracall profile identity-smoke --all-bound --include-negative --json
# ChatGPT identity smoke also reports accountLevel/accountPlanType when the
# signed-in session exposes them, so Business-vs-Pro profile bindings can fail
# fast before automation uses the wrong model/tool quota lane.

# Machine-readable live browser feature discovery
auracall features --target gemini --json

# Workbench capability discovery before invoking volatile provider tools
auracall capabilities --target gemini --json
auracall capabilities --target gemini --static --json
auracall capabilities --target chatgpt --json
auracall capabilities --target grok --static --json
auracall capabilities --target grok --diagnostics browser-state --json
auracall capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json
auracall capabilities --target grok --entrypoint grok-imagine --discovery-action grok-imagine-video-mode --json

# Shared durable media-generation contract from the CLI
auracall media generate --provider chatgpt --type image -p "Generate an image of an asphalt secret agent" --json
auracall media generate --provider gemini --type image -p "Generate an image of an asphalt secret agent" --json
auracall media generate --provider grok --type image -p "Generate an image of an asphalt secret agent" --count 1 --no-wait
auracall run status <media_generation_id> --json
auracall media materialize <media_generation_id> --count 1 --json

# Save and diff live feature snapshots
auracall features snapshot --target gemini --json
auracall features diff --target gemini --json

# Local dev-only OpenAI-compatible responses server
auracall api serve

# Serve against a non-default AuraCall runtime profile
auracall --profile auracall-gemini-pro api serve

# Probe the local dev server posture
curl http://auracall.localhost/status

# Open the local read-only browser operator dashboard
xdg-open http://auracall.localhost/ops/browser

# Explicitly allow a non-loopback bind only when you mean it
auracall api serve --host 0.0.0.0 --listen-public --port 8080

# Machine-readable browser setup output
auracall setup --target grok --skip-login --skip-verify --json

# If you re-log your source Chrome profile later, rerun setup/login to refresh Aura-Call's managed profile
auracall setup --target grok --force-reseed-managed-profile

# Legacy Gemini browser image shortcut (compatibility-only direct file save)
auracall --engine browser --model gemini-3-pro --prompt "a cute robot holding a banana" --generate-image out.jpg --aspect 1:1

# Sessions (list and replay)
auracall status --hours 72
auracall session <id> --render

# Generic persisted run status for response/team/media runs
auracall run status <id> --json

# TUI (interactive, only for humans)
auracall tui
```

Engine auto-picks API when `OPENAI_API_KEY` is set, otherwise browser; browser is stable on macOS and works on Linux and Windows. On Linux pass `--browser-chrome-path/--browser-cookie-path` if detection fails; on Windows prefer `--browser-manual-login` or inline cookies if decryption is blocked. From WSL, integrated Windows Chrome runs now use an auto-assigned DevTools port plus Aura-Call’s built-in `windows-loopback` relay by default, so firewall rules and `portproxy` are only for manual direct-CDP debugging.

Current browser-mode default posture:
- browser runs still default to Aura-Call-managed profile launch
- if you do not set `manualLogin` explicitly, browser config resolution still
  treats interactive login as on and derives
  `manualLoginProfileDir = managedProfileRoot + auracallProfile + service`
- set `manualLogin: false` explicitly when you need to suppress that managed
  profile path
- non-Windows managed Chrome launches include `--password-store=basic` so
  Linux/WSL automation profiles do not block behind desktop keyring prompts,
  including visible auth-mode launches
- stored team/API browser runs are non-interactive: if ChatGPT shows a logged
  out surface, Aura-Call fails fast and prints an auth-mode command such as
  `auracall --profile <name> login --target chatgpt` instead of waiting in the
  hidden/minimized automation window; API readback also includes those
  recovery fields in `metadata.executionSummary.failureSummary.details`
- managed browser response/chat runs now wait through the browser-service
  operation dispatcher when another operation owns the same managed browser
  profile; login/setup/human-verification flows still surface busy state
  immediately
- steps can opt into the deterministic `auracall.step-output.v1` model-output
  envelope for routing, local actions, artifacts, handoffs, and structured
  failures; `/v1/team-runs` accepts top-level `outputContract` and
  `/v1/responses` accepts `auracall.outputContract`; see
  `docs/response-shape-contract.md`

WSL quick start: run `./scripts/bootstrap-wsl.sh` to install Node 22 + WSL Chrome + deps, then follow `docs/wsl-chatgpt-runbook.md` for the ChatGPT browser setup. If you are choosing between WSL Chrome and Windows Chrome from WSL, prefer WSL Chrome first and keep it as the primary browser profile; the Windows relay path is still more brittle and is better kept in a separate named browser profile.

Terminology note:
- browser profile = browser/account family config such as `default` or `wsl-chrome-2`
- source browser profile = Chromium profile used for cookie/bootstrap sourcing, such as `Default`
- managed browser profile = Aura-Call-owned automation profile directory
- AuraCall runtime profile = top-level `runtimeProfiles.<name>` config entry selected by `defaultRuntimeProfile` / `--profile`

## Integration

**CLI**
- API mode expects API keys in your environment: `OPENAI_API_KEY` (GPT-5.x), `GEMINI_API_KEY` (Gemini 3 Pro), `ANTHROPIC_API_KEY` (Claude Sonnet 4.5 / Opus 4.1), `XAI_API_KEY` (Grok 4.20).
- Gemini browser mode uses Chrome cookies instead of an API key—just be logged into `gemini.google.com` in Chrome (no Python/venv required).
- Operators can poll any persisted response/team/media run from the CLI with
  `auracall run status <id>` or `auracall run status <id> --json`; this uses
  the same `auracall_run_status` envelope as API `GET /v1/runs/{run_id}/status`
  and MCP `run_status`.
- CLI media creation uses the same durable media-generation contract as local
  API and MCP through `auracall media generate --provider
  chatgpt|gemini|grok --type image|music|video -p <prompt>`. Use `--no-wait` to return a running media id
  immediately, then poll it with `auracall run status <id> --json`.
- Prefer `auracall media generate` for new image/music/video automation because
  it persists the media-generation id, timeline, status, and artifact cache.
  ChatGPT image runs use the browser Create image composer tool and keep
  readback/materialization scoped to the submitted tab target. For Grok image
  runs, `auracall media materialize <id> --count 1 --json`
  explicitly retries saved-gallery/files full-quality discovery without
  submitting another prompt, including after the operator has navigated away
  from the original `/imagine` generation page.
  Gemini image requests can use explicit `--transport api` with
  `GEMINI_API_KEY`, but provider API media access is not the current primary
  dogfood lane; browser media paths remain the normal operator focus.
  The older Gemini-only `--generate-image <file>` flag remains a
  compatibility shortcut for direct one-file browser image saves and does not
  create a durable media-generation record.
- A bounded local OpenAI-compatible responses adapter is available for
  development through `auracall api serve`. Start it with
  `auracall --profile <name> api serve` to bind response, runtime, workbench,
  and media behavior to a non-default AuraCall runtime profile. The local
  operator dashboard should use the configured stable URL
  `http://auracall.localhost/ops/browser`; `/status.routes` advertises both the
  relative dashboard path and any configured canonical dashboard URLs. Current
  endpoints are:
  - `GET /ops/browser`
  - `GET /account-mirror`
  - `GET /account-mirror/preview-session`
  - `GET /dashboard` (alias)
  - `GET /status`
  - `GET /status/recovery/{run_id}`
  - `POST /v1/team-runs`
  - `GET /v1/team-runs/inspect`
  - `GET /v1/runtime-runs/inspect`
  - `GET /v1/models`
  - `GET /v1/workbench-capabilities`
  - `POST /v1/responses`
  - `GET /v1/responses/{response_id}`
  - `POST /v1/media-generations`
  - `GET /v1/media-generations/{media_generation_id}`
  - `GET /v1/media-generations/{media_generation_id}/status`
  - `GET /v1/runs/{run_id}/status`
  - `GET /v1/account-mirrors/status`
  - `GET /v1/account-mirrors/catalog`
  - `GET /v1/account-mirrors/catalog/items/{item_id}`
  - `POST /v1/account-mirrors/refresh`
  - `POST /v1/account-mirrors/completions`
  - `GET /v1/account-mirrors/completions`
  - `GET /v1/account-mirrors/completions/{completion_id}`
- Account mirror refreshes are metadata-first and identity-gated. Successful
  refreshes persist the mirror snapshot in the existing provider cache under
  `provider + boundIdentity`; runtime/browser profile ids are retained as
  binding and refresh provenance, not as duplicate mirror cache owners. The
  same refresh stores bounded project/conversation manifests and lightweight
  artifact/file/media indexes without fetching full content. Operators and agents
  can inspect those cached indexes with
  `GET /v1/account-mirrors/catalog?provider=chatgpt&runtimeProfile=default&kind=all&limit=50`;
  catalog reads are cache-only and do not enqueue browser work. Individual
  cached rows can be read with
  `GET /v1/account-mirrors/catalog/items/{item_id}?provider=chatgpt&runtimeProfile=default&kind=conversations`;
  item reads use the same cache catalog and do not enqueue browser work. Lazy mirror
  scheduling is disabled by default; start `api serve` with
  `--account-mirror-scheduler-interval-ms <ms>` to record dry-run eligibility
  passes in `/status.accountMirrorScheduler`, and add
  `--account-mirror-scheduler-execute` only when the service should request
  eligible default-ChatGPT metadata refreshes. Operator controls share
  `POST /status`: `{"accountMirrorScheduler":{"action":"pause"}}`,
  `{"accountMirrorScheduler":{"action":"resume"}}`, or
  `{"accountMirrorScheduler":{"action":"run-once"}}`. Manual `run-once`
  remains dry-run unless the server was started with
  `--account-mirror-scheduler-execute` and the request sets `"dryRun":false`.
  Recent scheduler passes are persisted in the AuraCall cache and exposed at
  `/status.accountMirrorScheduler.history` so cadence and failure evidence
  survives a service restart. `/status.accountMirrorScheduler.lastWakeReason`
  and `lastWakeAt` distinguish routine cadence, manual operator wakes, and
  live-follow nudges after real work settles.
  `/status.accountMirrorScheduler.operatorStatus.posture` gives the compact
  operator read: `disabled`, `paused`, `running`, `scheduled`, `ready`,
  `healthy`, or `backpressured`. MCP `api_status` reads the same local
  `/status` posture and supports expectation fields so agents can assert
  scheduler readiness without shelling out to the CLI. For live execute
  dogfood, prefer a long interval plus one manual `run-once` request so the
  scheduler proves the refresh path without repeatedly touching bot-sensitive
  provider pages.
  Use `auracall api mirror-complete` to start live follow for a mirror target
  on the configured local API. The command returns an id immediately; the
  service backfills history until no more history is detected, then stays in
  steady follow and periodically crawls for new content. `--max-passes` is a
  debug cap, not the default. `auracall api mirror-completion-status <id>`
  polls mode, phase, next attempt, counts, and latest refresh. Completion operation
  records are persisted under the account-mirror cache and hydrated on API/MCP
  startup, so operators can keep polling the same id after service restarts.
  `auracall api mirror-completions --status active` lists recent and active
  persisted completion operations without touching provider pages.
  `auracall api mirror-completion-control <id> pause|resume|cancel` controls a
  live-follow operation without killing the API service or touching provider
  browser state.
  `/status.accountMirrorCompletions` reports completion metrics plus active and
  recent records, and `/ops/browser` renders the same live-follow posture plus
  service controls for the background drain, mirror scheduler run-once,
  scheduler pause/resume, and live-follow completion pause/resume/cancel in the
  local operator dashboard. `/account-mirror` is the dedicated read-only account
  mirror page; it includes the same cache-only catalog browser with
  provider/profile/kind/search/limit controls backed by
  `GET /v1/account-mirrors/catalog`, persists filters in the page URL, and
  opens stable item-detail URLs without starting provider browser work.
  Conversation catalog rows show cached transcript availability and message
  count before opening the row, with a `withTranscript=1` filter for rows that
  will open as chat dialogs.
  Conversation detail reads hydrate any existing cached conversation context
  into the item detail and render cached turns as a chat dialog, while keeping
  the raw cached item JSON available for debugging. Cached chat-dialog details
  can be searched in place, downloaded locally as Markdown, and used to
  navigate cached related files/artifacts/sources without starting provider
  browser work. File, artifact, and media item detail includes a compact cached
  metadata inspector, cached URL links, and a browser-safe cached preview for
  inline text, remote image/video/audio/PDF URLs, or cache-owned materialized
  local files served through the local API before the raw JSON block. Catalog
  rows also show a `Preview` badge so operators can spot `local`, `remote`,
  `inline`, and `metadata` assets before opening detail, then filter or sort
  cached rows by previewability without triggering browser work. Previewable
  asset rows also expose `Open Preview` and `Copy URL` actions directly from
  the catalog table, plus batch actions to inspect, review in one cache-only
  preview session with provider/kind/title/item metadata, select reviewed
  items, open, copy, download selected visible preview URLs, or export a
  selected JSON manifest for operator handoff.
- Current API boundary for that local server:
  - loopback by default; non-loopback requires `--listen-public`
  - runtime-backed create/read with one bounded local execution pass for direct runs
    - `POST /v1/responses` may now initially return `in_progress` while the
      server-owned local background drain advances work
    - poll `GET /v1/responses/{response_id}` for terminal readback
    - direct browser-backed runs now use the same configured stored-step
      executor path as normal Aura-Call runtime execution
    - direct browser-backed ChatGPT runs can request volatile workbench tools
      per call with `auracall.composerTool` and
      `auracall.deepResearchPlanAction`, for example Deep Research `edit`
      review-state runs that can then be polled through generic run status
  - `POST /v1/media-generations` accepts the shared media-generation contract
    for `provider = chatgpt|gemini|grok`, `mediaType = image|music|video`, prompt,
    optional `model`, `transport`, `count`, `size`, `aspectRatio`, and
    metadata. Gemini API image generation is supported with
    `transport = api`, `GEMINI_API_KEY`, and the Imagen
    `models.generateImages` path; the default model is
    `imagen-4.0-generate-001`, and generated inline image bytes are cached as
    durable media artifacts. By default the route waits for terminal completion; add
    `?wait=false` or JSON `"wait": false` to return a running media id
    immediately for polling. The route persists request/readback records with a
    `timeline[]` showing processing milestones such as capability discovery,
    capability-gate stops, prompt submission, submit-path observation,
    artifact polling, `image_visible`/`video_visible` terminal media
    observation, materialization, and terminal completion. Grok browser video
    requests preflight the explicit Imagine Video mode, submit through the
    active `/imagine` tab, poll the submitted tab for terminal video evidence,
    and cache the generated MP4 through the provider download control when
    available. A diagnostic-only Grok video readback probe exists for
    already-submitted tabs when metadata explicitly provides
    `grokVideoReadbackProbe = true`, `grokVideoReadbackTabTargetId`, and
    `grokVideoReadbackDevtoolsPort`; it bypasses capability preflight and
    direct-connects to that tab without submitting, navigating, reloading, or
    opening/reusing the Imagine entrypoint. Use
    `docs/grok-imagine-video-readback-runbook.md` for the bounded manual live
    probe. Browser-backed ChatGPT/Gemini/Grok media jobs wait through the
    browser-service operation dispatcher before provider adapters touch CDP;
    timelines can include `browser_operation_queued` and
    `browser_operation_acquired` when another operation already owns the same
    managed browser profile or raw DevTools endpoint. Operators can poll the
    generic `GET /v1/runs/{run_id}/status`
    surface for response/team chats and media jobs. Media jobs also retain the
    narrower
    `GET /v1/media-generations/{media_generation_id}/status` for a compact
    status summary with the latest timeline event, artifact cache path, and
    materialization method. When provider readback exposes named download
    variants, status artifacts include compact `downloadLabel`,
    `downloadVariant`, and `downloadOptions` fields so callers can distinguish
    outputs such as Gemini music MP4-with-art versus MP3 without fetching the
    full generation record. Media status also includes a derived
    `diagnostics` block from persisted timeline evidence so operators can see
    capability preflight, selected workbench mode/tool state, submitted tab,
    provider route progression, artifact polling/progress counts, terminal
    run-state counts, and materialization source without a separate browser
    probe. Grok browser image jobs require
    generated account media for terminal success; public gallery/template
    media remains diagnostic evidence and is not cached as generated output.
    Repeated stable
    public/template terminal media with no generated account image fails as
    `media_generation_no_generated_output`; inspect `diagnostics` or
    `submit_path_observed` to see whether Grok reported pending generation,
    generated media, blocked state, or public-template reuse after the send
    click. Grok browser image jobs default to scraping up to eight currently
    visible generated tiles from the submitted Imagine page; pass `count` to
    request fewer visible tiles. The default capture path does not scroll the
    wall to trigger additional provider generation.
    Add `diagnostics=browser-state` to either status route during a running
    browser-backed media job to capture the selected provider target,
    document readiness, visible control counts, provider evidence, and a stored
    PNG screenshot path without re-invoking the provider.
    Browser readback/materialization on a submitted tab now treats that tab as
    the authority when `preserveActiveTab` is set: provider adapters reuse the
    existing tab target and refuse post-submit navigation/reload/reopen
    recovery on that tab.
    Gemini browser image runs now emit pre-submission milestones such as
    `browser_target_attached`, `gemini_surface_ready`, `capability_selected`,
    `composer_ready`, `prompt_inserted`, and `send_attempted` before the
    terminal `prompt_submitted`/artifact-polling sequence, so operators can
    distinguish a healthy managed browser from a stuck provider interaction.
    Gemini image/music/video requests with `transport = browser` now check the
    matching workbench capability, select the matching `Images`/`Music`/`Videos`
    workbench tool, and materialize generated artifacts through the managed
    browser path. Gemini music can cache both provider download variants when
    readback exposes them: video with album art and MP3 audio. If Gemini
    exposes one music artifact plus visible option labels, Aura-Call expands
    those labels into separate provider-menu materialization requests. Read-only
    artifact discovery also preserves already-visible provider download option
    labels without opening the menu. Gemini music/video
    live smokes are quota-sensitive and should stay opt-in/manual; fixture
    coverage is the routine validation path. Grok image requests with
    `transport = browser` now check `grok.media.imagine_image` through the
    explicit `/imagine` entrypoint first; account-gated or unavailable accounts
    fail before prompt submission, while available accounts use the pinned
    `/imagine` tab, provider run-state polling, visible tile capture, and a
    provider download-button comparison before falling back to remote media
    fetch. Grok video remains explicitly gated.
  - `GET /v1/workbench-capabilities` reports currently known or discovered
    provider workbench capabilities for regular service discovery. Filter with
    `provider=chatgpt|gemini|grok`, `category=research|media|canvas|connector|skill|app|search|file|other`,
    and `runtimeProfile=<name>`. Static entries report conservative
    `unknown` or `account_gated` availability. When served with the configured
    runtime, `provider=gemini`, `provider=chatgpt`, and `provider=grok` can
    merge live browser feature-signature evidence from the matching managed
    browser profile.
    ChatGPT discovery reports visible Web Search, Deep Research, Company
    Knowledge, apps/connectors, and skills without invoking or enabling them.
    Grok discovery reports visible Imagine image/video capability evidence
    without submitting a generation request. The matching CLI surface is
    `auracall capabilities --target gemini --json`,
    `auracall capabilities --target chatgpt --json`, or
    `auracall capabilities --target grok --json`; add `--static` to skip
    browser attachment during debugging. Add `--diagnostics browser-state` or
    `diagnostics=browser-state` to include bounded target/document/provider
    evidence and a stored screenshot path for the selected provider. For Grok
    Imagine, add `--entrypoint grok-imagine` or `entrypoint=grok-imagine` to
    inspect the `/imagine` workbench route without submitting a prompt. Grok
    Imagine provider evidence includes conservative read-only run-state,
    pending, terminal image/video, media URL, and materialization-control
    signals when those are visible in the workbench. Bounded visible masonry
    and filmstrip tiles are preserved separately from terminal media evidence.
    Passive upsell affordances such as `Upgrade to SuperGrok` are not treated
    as account gates unless the page also lacks ready generation controls or
    generated media.
  - `POST /v1/team-runs` creates one bounded task-backed team execution:
    - request fields are either:
      - compact fields: `teamId`, `objective`, and optional `title`,
        `promptAppend`, `structuredContext`, `responseFormat`, `maxTurns`, and
        bounded `localActionPolicy`
      - a prebuilt flattened `taskRunSpec` validated with Aura-Call's live
        `TaskRunSpec` schema
    - the server constructs or accepts exactly one `TaskRunSpec`, one
      `TeamRun`, and one `sourceKind = team-run` runtime run through
      `TeamRuntimeBridge`
    - the response envelope is `object = "team_run"` with `taskRunSpec`,
      deterministic `execution` ids/status, and links for team inspection,
      runtime inspection, and `/v1/responses/{runtimeRunId}` readback
    - when server background drain is enabled, creation returns after
      persistence and the existing server-owned background drain advances the
      team runtime; when background drain is disabled, the route keeps the
      synchronous one-request behavior
    - sectioned public task-run-spec envelopes, background worker pools, and
      parallel team execution remain out of scope
  - startup recovery default source can be tuned with
    `--recover-runs-on-start-source <direct|team-run|all>`
    (`direct` by default)
  - `GET /status?recovery=true` (or `1`) returns optional recovery state:
    - defaults to `sourceKind=direct`
    - optionally filters with `sourceKind=direct|team-run|all`
    - includes `totalRuns`, plus `reclaimableRunIds`,
      `recoverableStrandedRunIds`, `activeLeaseRunIds`, `strandedRunIds`, and
      `idleRunIds`
    - also includes bounded local-claim summary under `localClaim` when a local runner is configured:
      - `runnerId`
      - `selectedRunIds`
      - `blockedRunIds`
      - `notReadyRunIds`
      - `unavailableRunIds`
      - `statusByRunId`
      - `reasonsByRunId`
    - also includes bounded active-lease health under `activeLeaseHealth`:
      - `freshRunIds`
      - `staleHeartbeatRunIds`
      - `suspiciousIdleRunIds`
      - `reasonsByRunId`
    - also includes bounded lease-repair posture under `leaseRepair`:
      - `locallyReclaimableRunIds`
      - `inspectOnlyRunIds`
      - `notReclaimableRunIds`
      - `repairedRunIds`
      - `reasonsByRunId`
  - `GET /status/recovery/{run_id}` returns one bounded per-run recovery
    detail view with:
    - `taskRunSpecId`
    - bounded persisted `taskRunSpecSummary`:
      - `id`
      - `teamId`
      - `title`
      - `objective`
      - `createdAt`
      - `persistedAt`
  - `GET /v1/runtime-runs/inspect` returns one bounded read-only runtime
    queue/runner view:
    - required query:
      - `runId`
      - `runtimeRunId`
      - `teamRunId`
      - `taskRunSpecId`
      - optional query:
        - `runnerId`
        - `probe=service-state`
        - `diagnostics=browser-state`
        - `authority=scheduler`
    - returns:
      - `resolvedBy`
      - `queryId`
      - `queryRunId`
      - bounded alias match summary:
        - `matchingRuntimeRunCount`
        - `matchingRuntimeRunIds`
      - bounded `taskRunSpecSummary` when the runtime run is task-backed
      - optional `serviceState` when explicitly requested with
        `probe=service-state`
        - this is a live run-scoped provider-state probe, not durable replay
        - current posture is explicit:
          - `probeStatus = observed`
          - `probeStatus = unavailable`
        - current default live probes are:
          - ChatGPT on the managed browser path
          - Gemini on browser-backed runtime profiles only
            - active browser-backed Gemini runs prefer provider-owned
              lottie/avatar spinner evidence when visible, then fall back to
              executor-owned transient `thinking`
          - Grok on browser-backed runtime profiles only
            - active browser-backed Grok runs prefer executor-owned transient
              `thinking` state before DOM/page fallback
        - Gemini API-backed runtime profiles still return honest
          `unavailable` posture on this seam
        - Grok API-backed runtime profiles still return honest `unavailable`
          posture on this seam
        - keep `serviceState` separate from:
          - runtime queue/lease state
          - `/status` server/runner health
      - optional `browserDiagnostics` when explicitly requested with
        `diagnostics=browser-state`
        - this is a bounded live browser snapshot for the active running step,
          not raw CDP access
        - includes selected target URL/title/id, document readiness, visible
          control counts, provider evidence such as Gemini activity state, and
          a PNG screenshot path under AuraCall diagnostics storage
        - when a browser run queued behind another same-profile operation,
          diagnostics can also include recent browser-operation queue events
          such as `queued`, `acquired`, or `busy-timeout`
        - generic run/media status also supports this switch for active
          browser-backed media jobs and prefers the provider `tabTargetId`
        - workbench capability reports support the same switch for selected
          providers, so Grok Imagine account-gating evidence can be inspected
          without submitting a prompt
        - media status can also surface provider browser diagnostics recorded at
          prompt submission
        - the local read-only `/ops/browser` dashboard links these seams and
          only runs browser-state probes when an operator explicitly clicks a
          probe
      - optional `schedulerAuthority` when explicitly requested with
        `authority=scheduler`
        - this is read-only scheduler evidence, not assignment authority
        - returns the deterministic decision, reason, active lease posture,
          candidates, selected runner evidence, future mutation label, and
          `mutationAllowed = false`
      - `runtime.queueProjection` with:
        - `queueState`
        - `claimState`
        - `nextRunnableStepId`
        - `activeLeaseId`
        - `activeLeaseOwnerId`
        - active/waiting/running/deferred/terminal step ids
        - bounded affinity evaluation
          - `requiredService`
          - `requiredRuntimeProfileId`
          - `requiredBrowserProfileId`
          - `requiredHostId`
          - `hostRequirement`
          - `requiredServiceAccountId`
          - `browserRequired`
          - `eligibilityNote`
        - when configured service identity exists for the active step service,
          `requiredServiceAccountId` uses the same
          `service-account:<service>:<identity-key>` shape as runner
          `serviceAccountIds`
        - this is declarative config-derived affinity only:
          - identity key preference is `email`, then `handle`, then `name`
          - `api serve` does not live-probe the browser account during runner
            registration
          - a matching id means the runner is configured for that account, not
            that the currently logged-in browser tab has been independently
            verified
      - bounded `runner` summary when:
        - `runnerId` is supplied, or
        - the active lease owner resolves to a persisted runner record
        - `api serve` derives runner `serviceAccountIds` from configured
          service identities when present, using
          `service-account:<service>:<identity-key>`
        - when configured identities are absent or incomplete for a
          browser-capable runner, `eligibilityNote` preserves that caveat
          instead of implying full browser-account affinity
    - this is still inspection-only; it does not create, claim, cancel, or run
      work
      - `requestedOutputCount`
      - `inputArtifactCount`
    - bounded `orchestrationTimelineSummary` from relevant durable
      `sharedState.history` entries:
      - `total`
      - bounded `items`
        - `type`
        - `createdAt`
        - `stepId`
        - `note`
        - `handoffId`
    - bounded `handoffTransferSummary` when incoming planned handoffs for the
      current dependent step carry task-aware transfer context:
      - `total`
      - bounded `items`
        - `handoffId`
        - `fromStepId`
        - `fromAgentId`
        - `title`
        - `objective`
        - `requestedOutputCount`
        - `inputArtifactCount`
    - current host classification
    - active lease snapshot
    - dispatch posture
    - reconciliation / repair posture and reasons
    - active-lease health under `leaseHealth`, including whether the lease looks fresh, stale-heartbeat, or suspiciously idle
    - bounded host drain now also treats `stale-heartbeat` as its own skip posture; `suspiciously-idle` remains diagnostic only
    - `POST /status` now also accepts one bounded stale-heartbeat operator action:
      - `{"leaseRepair":{"action":"repair-stale-heartbeat","runId":"..."}}`
      - it only repairs runs currently classified as `stale-heartbeat` when the existing durable repair posture is already `locally-reclaimable`
      - successful action results also preserve bounded reconciliation detail under `reconciliationReason`
      - `suspiciously-idle` remains read-only and is rejected by that action
    - `POST /status` now also accepts one bounded local run-cancel operator action:
      - `{"runControl":{"action":"cancel-run","runId":"..."}}`
      - it only cancels runs that currently hold an active lease owned by the local configured runner/host
      - it releases that active lease with release reason `cancelled`
      - inactive or not-owned runs are rejected cleanly instead of being force-cancelled
    - `POST /status` now also accepts one bounded human-escalation resume action:
      - `{"runControl":{"action":"resume-human-escalation","runId":"...","note":"...","guidance":{...},"override":{"promptAppend":"...","structuredContext":{...}}}}`
      - it applies to direct or team runs currently paused for human escalation
      - it resumes the cancelled human-escalation step back to `runnable`
      - runs without a paused human-escalation step are rejected cleanly
    - `POST /status` now also accepts one bounded targeted drain action:
      - `{"runControl":{"action":"drain-run","runId":"..."}}`
      - it applies to direct or team runs
      - it triggers one targeted host drain pass for that run
      - it is the intended post-resume follow-through path when operators want immediate execution instead of waiting for the ordinary background drain
      - it can also execute a runnable run already leased by the configured
        server-local runner, including after a successful scheduler local claim
    - `POST /status` now also accepts one bounded local-action request resolution action:
      - `{"localActionControl":{"action":"resolve-request","runId":"...","requestId":"...","resolution":"approved|rejected|cancelled"}}`
      - it only applies to currently `requested` local action records on direct or team runs
      - it updates the persisted local-action outcome summary used by `GET /v1/responses/{response_id}`
      - already-resolved requests are rejected cleanly instead of being overwritten
    - `POST /status` now also accepts one bounded scheduler-control claim action:
      - `{"schedulerControl":{"action":"claim-local-run","runId":"...","schedulerId":"operator:local-status"}}`
      - it is gated by read-only scheduler authority and only claims or reassigns to the server-local runner
      - it does not execute by itself; follow with targeted `drain-run` for
        immediate execution through the existing local-owned lease
      - fresh active leases, still-active lease owners, non-local selected runners, and affinity/capability blocks are rejected without mutation
    - recovery summary/detail now also surface bounded operator attention for
      stale-heartbeat and suspiciously-idle active-lease cases:
      - `recoverySummary.attention.staleHeartbeatInspectOnlyRunIds`
      - per-run `attention.kind = stale-heartbeat-inspect-only|suspiciously-idle`
    - recovery summary/detail now also surface bounded cancellation readback:
      - `recoverySummary.cancelledRunIds`
      - `recoverySummary.cancellation.reasonsByRunId`
      - per-run `cancellation.cancelledAt`
      - per-run `cancellation.source`
      - per-run `cancellation.reason`
    - startup recovery logs now also emit:
      - `attention=stale-heartbeat-inspect-only:<count>`
      - `attention=suspiciously-idle:<count>` when active leases look
        idle-but-not-stale
    - configured local runner claim posture under `localClaim`, including whether the current local runner is actually selected
  - `GET /v1/team-runs/inspect` returns one bounded read-only team linkage view:
    - query by `taskRunSpecId=<task_run_spec_id>`, `teamRunId=<team_run_id>`, or `runtimeRunId=<runtime_run_id>`
    - returns:
      - `resolvedBy`
      - `queryId`
      - bounded `taskRunSpecSummary`
      - `matchingRuntimeRunCount`
      - bounded `matchingRuntimeRunIds`
      - bounded `runtime` summary:
        - `runtimeRunId`
        - `teamRunId`
        - `taskRunSpecId`
        - `runtimeSourceKind`
        - `runtimeRunStatus`
        - `runtimeUpdatedAt`
        - `sharedStateStatus`
        - `stepCount`
        - `handoffCount`
        - `localActionRequestCount`
        - `nextRunnableStepId`
        - bounded runnable/deferred/waiting/running/blocked/terminal step ids
        - `activeLeaseOwnerId`
    - this is inspection-only and does not create or mutate team execution
  - `/status` also reports bounded background-drain state:
    - `enabled`
    - `intervalMs`
    - `state = disabled|idle|scheduled|running|paused`
    - `paused`
    - `lastTrigger`
    - `lastStartedAt`
    - `lastCompletedAt`
    - `api serve` defaults timer-driven drain to a 60-second cadence; use
      `--background-drain-interval-ms <ms>` to tune it, or `0` to disable the
      timer
  - `/status` now also reports the live persisted local runner identity for
    `api serve` under `runner`:
    - `id`
    - `hostId`
    - `status`
    - `lastHeartbeatAt`
    - `expiresAt`
    - `lastActivityAt`
    - `lastClaimedRunId`
  - `/status` also reports read-only runner topology/readiness under
    `runnerTopology`:
    - `localExecutionOwnerRunnerId`
    - `generatedAt`
    - aggregate active/stale/fresh/expired/browser-capable runner counts
    - bounded runner capability summaries for service ids, runtime profiles,
      browser profiles, service-account ids, and browser capability
    - `selectedAsLocalExecutionOwner` marks the runner this server may execute
      through
    - this is read-only capacity evidence; it does not grant scheduler,
      reassignment, lease, or parallel execution authority
  - plain `/status` now also reports a compact direct-run local claim snapshot
    under `localClaimSummary` when a local runner is configured:
    - `sourceKind`
    - `runnerId`
    - `selectedRunIds`
    - `blockedRunIds`
    - `notReadyRunIds`
    - `unavailableRunIds`
    - `statusByRunId`
    - `reasonsByRunId`
  - bounded local claims now use that live runner id as the lease owner
    instead of a generic host-only owner string
  - successful bounded direct-run execution now also updates that persisted
    runner record with:
    - `lastActivityAt`
    - `lastClaimedRunId`
  - if a run is cancelled while a delayed local step is still finishing, the
    final persisted state now stays `cancelled` instead of being overwritten by
    the later step completion
  - bounded local execution now refreshes the active lease heartbeat while a
    step is still running so live runner-owned claims do not start stale and do
    not rely on one-shot lease freshness
  - `POST /status` provides one bounded operator control seam for the same
    background drain loop:
    - `{"backgroundDrain":{"action":"pause"}}`
    - `{"backgroundDrain":{"action":"resume"}}`
    - and one bounded stale-heartbeat lease repair action:
      - `{"leaseRepair":{"action":"repair-stale-heartbeat","runId":"..."}}`
    - and one bounded local run-cancel action:
      - `{"runControl":{"action":"cancel-run","runId":"..."}}`
      - cancellation is single-runner scoped and only applies to active locally
        owned runs
    - and one bounded human-escalation resume action:
      - `{"runControl":{"action":"resume-human-escalation","runId":"...","note":"...","guidance":{...},"override":{"promptAppend":"...","structuredContext":{...}}}}`
      - resume is limited to direct or team runs currently paused for human escalation
    - and one bounded targeted drain action:
      - `{"runControl":{"action":"drain-run","runId":"..."}}`
      - targeted drain is limited to direct or team runs and performs one host-owned pass for that run
    - and one bounded local-action request resolution action:
      - `{"localActionControl":{"action":"resolve-request","runId":"...","requestId":"...","resolution":"approved|rejected|cancelled"}}`
      - resolution is limited to currently `requested` direct-run or team-run local action records
    - and one bounded scheduler-control claim action:
      - `{"schedulerControl":{"action":"claim-local-run","runId":"...","schedulerId":"operator:local-status"}}`
      - claims local-eligible runs or reassigns expired stale/missing-owner leases only to the server-local runner
  - `/status` now reports explicit development posture, route surface, and
    unauthenticated/local-only state, including the current AuraCall version
  - optional `X-AuraCall-*` execution headers for:
    - `X-AuraCall-Runtime-Profile`
    - `X-AuraCall-Agent`
    - `X-AuraCall-Team`
    - `X-AuraCall-Service`
  - no auth
  - no streaming
  - no `chat/completions` adapter yet
  - runner self-registration + heartbeat now exist for the local `api serve`
    host, but there is still no broader multi-runner claim/reassignment mode
  - direct-run responses now include bounded execution readback under
    `metadata.executionSummary`
  - if runtime shared state exposes `structuredOutputs[key="response.output"]`,
    preserve that structured mixed payload on top-level `response.output`
    instead of flattening it into metadata
  - runtime-backed response readback now also includes bounded assignment
    identity under top-level response metadata:
    - `metadata.taskRunSpecId`
  - task-backed runtime execution now also injects bounded assignment context
    directly into step execution:
    - `taskContext`
    - `taskStructuredContext`
    - `taskInputArtifacts`
    - dependency-scoped `taskTransfer` from incoming planned handoffs
  - task-backed team planning now also shapes bounded inter-step handoffs with
    compact transfer context under handoff `structuredData.taskTransfer`:
    - `title`
    - `objective`
    - `successCriteria`
    - bounded `requestedOutputs`
    - bounded `inputArtifacts`
  - runtime-backed detailed response readback now also includes bounded task
    assignment artifact refs under:
    - `metadata.executionSummary.inputArtifactSummary`
    - `total`
    - bounded `items`
      - `id`
      - `kind`
      - `title`
      - `path`
      - `uri`
    - runtime-backed detailed response readback now also includes bounded
      consumed handoff transfer context under:
      - `metadata.executionSummary.handoffTransferSummary`
      - `total`
      - bounded `items`
        - `handoffId`
        - `fromStepId`
        - `fromAgentId`
        - `title`
        - `objective`
        - `requestedOutputCount`
        - `inputArtifactCount`
  - runtime-backed detailed response readback now also includes bounded
      orchestration timeline summary derived from durable shared-state history
      under:
      - `metadata.executionSummary.orchestrationTimelineSummary`
      - `total`
      - bounded `items`
        - `type`
        - `createdAt`
        - `stepId`
        - `note`
        - `handoffId`
    - mixed-provider response readback now also includes bounded per-step
      routing projection under:
      - `metadata.executionSummary.stepSummaries`
      - use this field when you need routing proof from response readback
        itself
      - contract split:
        - top-level `metadata.service` / `metadata.runtimeProfile` remain the
          compact response summary
        - top-level `response.output` remains the transport payload
        - `metadata.executionSummary.stepSummaries` is the per-step routing
          projection
        - execution-summary fields should not leak into individual `output`
          items
        - `GET /status/recovery/{run_id}` remains the orchestration timeline
          surface and should not grow routing fields like:
          - `runtimeProfile`
          - `service`
          - `stepSummaries`
    - requested-output fulfillment reads now also include
      `metadata.executionSummary.requestedOutputSummary` with:
        - `total`
      - `fulfilledCount`
      - `missingRequiredCount`
      - bounded per-item `label`
      - bounded per-item `kind`
      - bounded per-item `format`
      - bounded per-item `destination`
      - bounded per-item `required`
      - bounded per-item `fulfilled`
      - bounded per-item `evidence`
    - required requested-output policy reads now also include
      `metadata.executionSummary.requestedOutputPolicy` with:
      - `status = satisfied|missing-required`
      - `message`
      - `missingRequiredLabels`
      - when required outputs are still missing, response readback now returns
        `status = failed` with bounded failure code
        `requested_output_required_missing`
      - stored runtime/service terminal state now also converges to `failed`
        for those same clearly missing-required cases
      - task-run-spec provider request budget now also has one bounded runtime
        enforcement seam:
        - when the next runnable step order would exceed
          `constraints.providerBudget.maxRequests`, runtime/service state fails
          before execution with bounded failure code
          `task_provider_request_limit_exceeded`
      - task-run-spec provider token budget now also has one bounded runtime
        enforcement seam:
        - when cumulative stored provider usage already exceeds
          `constraints.providerBudget.maxTokens`, runtime/service state fails
          before the next step executes with bounded failure code
          `task_provider_token_limit_exceeded`
    - runtime-backed response readback now also includes bounded provider
      usage when the stored execution path reports real usage:
      - `metadata.executionSummary.providerUsageSummary`
      - `ownerStepId`
      - `generatedAt`
      - `inputTokens`
      - `outputTokens`
      - `reasoningTokens`
      - `totalTokens`
    - resumed/drained operator lifecycle reads now also include
      `metadata.executionSummary.operatorControlSummary` with:
      - `humanEscalationResume.resumedAt`
      - `humanEscalationResume.note`
      - `targetedDrain.requestedAt`
      - `targetedDrain.status`
      - `targetedDrain.reason`
        - preserves the specific local-claim explanation when targeted drain
          cannot safely claim a run
      - `targetedDrain.skipReason`
        - keeps the bounded coarse skip enum such as
          `claim-owner-unavailable`
    - cancelled terminal reads now also include
      `metadata.executionSummary.cancellationSummary` with:
      - `cancelledAt`
      - `source`
      - `reason`
    - local-action terminal reads now also include
      `metadata.executionSummary.localActionSummary` with:
      - `ownerStepId`
      - `generatedAt`
      - `counts`
      - bounded `items`
      - operator resolution of pending local-action requests now updates this same summary
    - immediate `/status` operator action results now also preserve bounded
      identity/timestamp detail:
      - `resolve-request`
        - `resolvedAt`
        - `ownerStepId`
      - `resume-human-escalation`
        - `resumedAt`
        - `resumedStepId`
  - non-loopback `--host` bindings are allowed but still warned as unsafe for
    anything beyond local development
- If your Gemini account can’t access “Pro”, Aura-Call auto-falls back to a supported model for web runs (and logs the fallback in verbose mode).
- Gemini feature discovery/snapshot/diff is now first-class through
  `auracall features ...`.
- Blocking pages such as `google.com/sorry`, CAPTCHA / reCAPTCHA, or similar
  human-verification surfaces now stop `doctor`, `features`, `setup`, `login`,
  and shared browser runs early with manual-clear guidance instead of being
  treated as ordinary pages.
- Prefer API mode or `--copy` + manual paste; browser automation is experimental.
- Browser support: stable on macOS; works on Linux (add `--browser-chrome-path/--browser-cookie-path` when needed) and Windows (manual-login or inline cookies recommended when app-bound cookies block decryption).
- Remote browser service: `auracall serve` on a signed-in host; clients use `--remote-host/--remote-token`.
- AGENTS.md/CLAUDE.md:
  ```
  - Aura-Call bundles a prompt plus the right files so another AI (GPT 5 Pro + more) can answer. Use when stuck/bugs/reviewing.
  - Run `npx -y auracall --help` once per session before first use.
  ```
- Tip: set `browser.chatgptUrl` in config (or `--chatgpt-url`) to a dedicated ChatGPT project folder so browser runs don’t clutter your main history.

**Codex skill**
- Copy the bundled skill from this repo to your Codex skills folder:
  - `mkdir -p ~/.codex/skills`
  - `cp -R skills/oracle ~/.codex/skills/oracle`
- Then reference it in your `AGENTS.md`/`CLAUDE.md` so Codex loads it.

**MCP**
- Run the stdio server via `auracall-mcp`.
- Configure clients via [steipete/mcporter](https://github.com/steipete/mcporter) or `.mcp.json`; see [docs/mcp.md](docs/mcp.md) for connection examples.
- MCP tools include `consult`, `sessions`, bounded team execution through
  `team_run`, direct response creation through `response_create`, generic run
  status through `run_status`, the shared media contract through
  `media_generation`, media run status readback through
  `media_generation_status`, and routine provider workbench discovery through
  `workbench_capabilities`. When launched from a resolved AuraCall runtime
  profile, the MCP response, media, and workbench tools use the same configured
  browser-backed service bundle as the local API server.
- Persistence-safe MCP polling pattern: create once, keep the returned
  `response.id` or `media_generation.id`, then poll with `run_status` or
  `media_generation_status`. Status tools read durable local records and should
  not be replaced with a second create call just to check progress.
```bash
npx -y auracall auracall-mcp
```
- Cursor setup (MCP): drop a `.cursor/mcp.json` like below, then pick “oracle” in Cursor’s MCP sources. See https://cursor.com/docs/context/mcp for UI steps.
[![Install MCP Server](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en-US/install-mcp?name=oracle&config=eyJjb21tYW5kIjoibnB4IC15IEBzdGVpcGV0ZS9vcmFjbGUgb3JhY2xlLW1jcCJ9)

```json
{
  "auracall": {
    "command": "auracall-mcp",
    "args": []
  }
}
```

## Highlights

- Bundle once, reuse anywhere (API or experimental browser).
- Multi-model API runs with aggregated cost/usage, including OpenRouter IDs alongside first-party models.
- Render/copy bundles for manual paste into ChatGPT when automation is blocked.
- GPT‑5 Pro API runs detach by default; reattach via `auracall session <id>` / `auracall status` or block with `--wait`.
- Azure endpoints supported via `--azure-endpoint/--azure-deployment/--azure-api-version` or `AZURE_OPENAI_*` envs.
- File safety: globs/excludes, size guards, `--files-report`.
- Sessions you can replay (`auracall status`, `auracall session <id> --render`).
- Session logs and bundles live in `~/.auracall/sessions` (override with `AURACALL_HOME_DIR`).

## Flags you’ll actually use

| Flag | Purpose |
| --- | --- |
| `-p, --prompt <text>` | Required prompt. |
| `-f, --file <paths...>` | Attach files/dirs (globs + `!` excludes). |
| `-e, --engine <api\|browser>` | Choose API or browser (browser is experimental). |
| `-m, --model <name>` | Built-ins (`gpt-5.1-pro` default, `gpt-5-pro`, `gpt-5.1`, `gpt-5.1-codex`, `gpt-5.2`, `gpt-5.2-instant`, `gpt-5.2-pro`, `gemini-3-pro`, `claude-4.5-sonnet`, `claude-4.1-opus`) plus any OpenRouter id (e.g., `minimax/minimax-m2`, `openai/gpt-4o-mini`). |
| `--models <list>` | Comma-separated API models (mix built-ins and OpenRouter ids) for multi-model runs. |
| `--base-url <url>` | Point API runs at LiteLLM/Azure/OpenRouter/etc. |
| `--chatgpt-url <url>` | Target a ChatGPT workspace/folder (browser). |
| `--browser-model-strategy <select\|current\|ignore>` | Control ChatGPT model selection in browser mode (current keeps the active model; ignore skips the picker). |
| `--browser-manual-login` | Skip cookie copy; reuse a persistent automation profile and wait for manual ChatGPT login. |
| `--browser-thinking-time <light\|standard\|extended\|heavy>` | Set ChatGPT thinking-time intensity (browser; Thinking/Pro models only). Pro is selected through the model picker (`--model gpt-5.2-pro` with the default `--browser-model-strategy select`); Standard/Extended alone only select the workbench depth and are not proof that the run used Pro. |
| `--browser-composer-tool <tool>` | Select a ChatGPT composer tool/add-on such as `web-search`, `canvas`, or `deep-research`. Deep Research is staged: AuraCall verifies the account tier, submits the prompt, waits for the provider plan, clicks only the Start CTA when available, records timed auto-starts, preserves review evidence in run metadata, and reads completed reports from the Deep Research iframe as Markdown, Word, and PDF conversation artifacts. |
| `--browser-deep-research-plan-action <start\|edit>` | Control ChatGPT Deep Research after the provider plan appears. `start` accepts the plan; `edit` opens the plan editor before the timed auto-start window, keeps the managed browser open, and stores review evidence including the iframe/DOM edit target and passive screenshot path. |
| `--browser-port <port>` | Force a fixed Chrome DevTools port (advanced/debugging). Normal WSL -> Windows launches default to auto-discovery instead. |
| `--browser-inline-cookies[(-file)] <payload|path>` | Supply cookies without Chrome/Keychain (browser). |
| `--browser-timeout`, `--browser-input-timeout` | Control overall/browser input timeouts (supports h/m/s/ms). |
| `--render`, `--copy` | Print and/or copy the assembled markdown bundle. |
| `--wait` | Block for background API runs (e.g., GPT‑5.1 Pro) instead of detaching. |
| `--write-output <path>` | Save only the final answer (multi-model adds `.<model>`). |
| `--files-report` | Print per-file token usage. |
| `--dry-run [summary\|json\|full]` | Preview without sending. |
| `--remote-host`, `--remote-token` | Use a remote `auracall serve` host (browser). |
| `--remote-chrome <host:port>` | Attach to an existing remote Chrome session (browser). From WSL, `windows-loopback:<port>` now relays to a Windows Chrome listening on Windows `127.0.0.1:<port>` without raw WSL->Windows CDP TCP. |
| `--youtube <url>` | YouTube video URL to analyze (Gemini browser mode). |
| `--generate-image <file>` | Legacy Gemini browser image shortcut that saves one file directly; prefer `auracall media generate` for durable media runs. |
| `--edit-image <file>` | Edit existing image with `--output` (Gemini browser mode). |
| `--azure-endpoint`, `--azure-deployment`, `--azure-api-version` | Target Azure OpenAI endpoints (picks Azure client automatically). |

## Configuration

Put defaults in `~/.auracall/config.json` (JSON5). Example:
```json5
{
  model: "gpt-5.1-pro",
  engine: "api",
  filesReport: true,
  browser: {
    chatgptUrl: "https://chatgpt.com/g/g-p-691edc9fec088191b553a35093da1ea8-oracle/project"
  }
}
```
Use `browser.chatgptUrl` (or the legacy alias `browser.url`) to target a specific ChatGPT workspace/folder for browser automation.
See [docs/configuration.md](docs/configuration.md) for precedence and full schema.

For multiple ChatGPT workspaces, keep profile entries in `~/.auracall/config.json` and select one at runtime:

```json5
{
  defaultRuntimeProfile: "default",
  runtimeProfiles: {
    default: {
      services: {
        chatgpt: { url: "https://chatgpt.com/" },
      },
    },
    work: {
      services: {
        chatgpt: { url: "https://chatgpt.com/g/p-691edc9fec088191b553a35093da1ea8-oracle/project" },
      },
    },
    review: {
      services: {
        chatgpt: {
          projectId: "g-p-abcdef123456789", // no hardcoded URL needed
        },
      },
    },
  },
}
```

```bash
auracall --profile work --engine browser -p "Draft to share" --file notes.md
auracall --profile review --engine browser --project-name "Sprint Review Notes" -p "Clean this draft"
auracall --profile review --engine browser --project-id g-p-abcdef123456789 -p "Review this branch"
```

Project-name rule

- `--project-name` resolves and reuses an existing exact-name project when one
  is already visible from the provider list.
- `auracall projects create '<name>' --target <provider>` now refuses
  exact-name duplicates instead of creating a second project with the same
  display name.
- If you mean "create if missing", list or resolve first, then create only when
  no exact-name match exists.

Advanced flags

| Area | Flags |
| --- | --- |
| Browser | `--browser-manual-login`, `--browser-thinking-time`, `--browser-composer-tool`, `--browser-deep-research-plan-action`, `--browser-timeout`, `--browser-input-timeout`, `--browser-cookie-wait`, `--browser-inline-cookies[(-file)]`, `--browser-attachments`, `--browser-inline-files`, `--browser-bundle-files`, `--browser-keep-browser`, `--browser-headless`, `--browser-hide-window`, `--browser-no-cookie-sync`, `--browser-allow-cookie-errors`, `--browser-chrome-path`, `--browser-cookie-path`, `--browser-bootstrap-cookie-path`, `--chatgpt-url` |
| Azure/OpenAI | `--azure-endpoint`, `--azure-deployment`, `--azure-api-version`, `--base-url` |

Remote browser example
```bash
# Host (signed-in Chrome): launch serve
auracall serve --host 0.0.0.0:9473 --token secret123

# Client: target that host
auracall --engine browser --remote-host 192.168.1.10:9473 --remote-token secret123 -p "Run the UI smoke" --file "src/**/*.ts"

# If cookies can’t sync, pass them inline (JSON/base64)
auracall --engine browser --browser-inline-cookies-file ~/.auracall/cookies.json -p "Run the UI smoke" --file "src/**/*.ts"
```

Session management
```bash
# Prune stored sessions (default path ~/.auracall/sessions; override AURACALL_HOME_DIR)
auracall status --clear --hours 168
```

Team execution (bounded internal bridge)
```bash
# Execute one configured team through the internal runtime bridge
auracall teams run auracall-solo "Draft a concise runtime note"

# Machine-readable payload for inspection
auracall teams run auracall-solo "Reply exactly with: OK" --max-turns 1 --json

# Bounded two-step workflow on the same Grok project/runtime profile
auracall teams run auracall-two-step "Reply exactly with: OK" --max-turns 2 --json

# Bounded multi-agent planner-to-finisher workflow on the same Grok project/runtime profile
auracall teams run auracall-multi-agent "Reply exactly with: OK" --max-turns 2 --json

# Bounded tooling workflow with one allowed local shell action
auracall teams run auracall-tooling "Run one bounded node local shell action, then reply exactly with: OK" \
  --max-turns 2 \
  --allow-local-shell-command node \
  --allow-local-cwd-root /home/ecochran76/workspace.local/auracall \
  --json

# Require operator approval/cancellation before the bounded local action can proceed
auracall teams run auracall-tooling "Request one bounded node local shell action, then wait for operator approval/cancellation" \
  --max-turns 2 \
  --allow-local-shell-command node \
  --allow-local-cwd-root /home/ecochran76/workspace.local/auracall \
  --require-local-action-approval \
  --json

# Bounded ChatGPT team baseline on the managed wsl-chrome-2 browser profile
auracall teams run auracall-chatgpt-solo "Reply exactly with: OK" --max-turns 1 --json

# Bounded cross-service workflow: ChatGPT planner -> Grok finisher
auracall teams run auracall-cross-service "Reply exactly with: OK" --max-turns 2 --json

# Bounded cross-service workflow: ChatGPT planner -> Gemini finisher
auracall teams run auracall-cross-service-gemini "Reply exactly with: OK" --max-turns 2 --json

# Inspect persisted task assignment and linked runtime state
auracall teams inspect --task-run-spec-id taskrun_auracall-solo_abc123 --json
auracall teams inspect --team-run-id teamrun_auracall-solo_abc123 --json
auracall teams inspect --runtime-run-id teamrun_auracall-solo_abc123

# Review the whole persisted team-run sequence as a read-only ledger
auracall teams review --task-run-spec-id taskrun_auracall-solo_abc123 --json
auracall teams review --team-run-id teamrun_auracall-solo_abc123 --json
auracall teams review --runtime-run-id teamrun_auracall-solo_abc123
```

Current boundary:
- `auracall teams run` is a real CLI execution entrypoint and returns
  `taskRunSpecId`, `teamRunId`, `runtimeRunId`, step summaries, and shared
  state.
- `auracall teams inspect` is a bounded internal debug surface for persisted
  `taskRunSpec -> teamRun -> runtime` linkage. It reads one persisted task
  assignment plus the latest linked runtime dispatch state without widening
  public team execution semantics.
- `auracall teams review` is a bounded read-only review surface for the
  persisted team-run sequence. It projects steps, handoffs, artifacts,
  prompt/input snapshots, output snapshots, failures, and provider
  conversation refs when existing runtime metadata carries them. Provider refs
  include stored conversation id, tab URL, configured URL, project id, runtime
  profile id, browser profile id, agent id, and selected model when available.
  Missing provider refs are reported as `null`; provider cache paths are only
  reported when stored metadata already carries a concrete path.
- Review observations now include:
  - durable failure-derived hard stops for provider error, login required,
    captcha/human-verification, and awaiting human action
  - stored ChatGPT passive observations for `thinking`,
    `response-incoming`, and `response-complete` when the browser execution
    path emits them
  - stored Gemini passive observations for `thinking`,
    `response-incoming`, and `response-complete` when the Gemini executor path
    or browser-native attachment path emits them
  - stored Grok passive observations for `thinking`,
    `response-incoming`, and `response-complete` when the Grok browser
    execution path emits them
  - on the current managed WSL Chrome path, ChatGPT `thinking` is most
    reliably evidenced by the placeholder assistant turn
    `ChatGPT said:Thinking`; generic status-node scans remain supplemental
- Gemini observations currently derive from Gemini-owned executor evidence, not
  ChatGPT-style DOM heuristics:
  - web executor: returned thoughts/text/images plus successful completion
  - browser-native attachment path: prompt committed, answer first visible,
    answer stabilized
- Grok observations currently derive from Grok’s own assistant-result
  lifecycle:
  - prompt submitted
  - first new assistant content visible
  - stabilized result returned
- Rich passive monitoring is still provider-path scoped. The provider-parity
  slice is implemented; broader monitoring remains a later checkpoint.
- Browser-backed team execution is now provider-backed on the stored-step seam.
- The current live smoke target is:
  - `auracall teams run auracall-solo "Reply exactly with: AURACALL_TEAM_SMOKE_OK" --title "AuraCall team smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_SMOKE_OK and nothing else." --max-turns 1 --json`
- The current ChatGPT team baseline target is:
  - `auracall teams run auracall-chatgpt-solo "Reply exactly with: AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK" --title "AuraCall ChatGPT team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK and nothing else." --max-turns 1 --json`
- The current cross-service live target is:
  - `auracall teams run auracall-cross-service "Reply exactly with: AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK" --title "AuraCall cross-service team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current cross-service Gemini live target is:
  - `auracall teams run auracall-cross-service-gemini "Reply exactly with: AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK" --title "AuraCall cross-service Gemini team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current broader-workflow live target is:
  - `auracall teams run auracall-two-step "Reply exactly with: AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK" --title "AuraCall two-step team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current multi-agent live target is:
  - `auracall teams run auracall-multi-agent "Reply exactly with: AURACALL_MULTI_AGENT_LIVE_SMOKE_OK" --title "AuraCall multi-agent team live smoke" --prompt-append "Do not use tools. Reply with exactly AURACALL_MULTI_AGENT_LIVE_SMOKE_OK and nothing else." --max-turns 2 --json`
- The current bounded tooling live target is:
  - `auracall teams run auracall-tooling "Run one bounded node local shell action that emits AURACALL_TOOL_ACTION_OK, then reply exactly with: AURACALL_TOOL_TEAM_LIVE_SMOKE_OK" --title "AuraCall tooling team live smoke" --prompt-append "For the tool envelope, use a top-level localActionRequests array with exactly one shell action. Preserve the provided toolEnvelope unchanged. Use kind \"shell\" and command \"node\". Use args [\"-e\",\"process.stdout.write('AURACALL_TOOL_ACTION_OK')\"]. Use structuredPayload {\"cwd\":\"/home/ecochran76/workspace.local/auracall\"}. After the local action succeeds, the final answer must be exactly AURACALL_TOOL_TEAM_LIVE_SMOKE_OK." --max-turns 2 --allow-local-shell-command node --allow-local-cwd-root /home/ecochran76/workspace.local/auracall --json`
- Gemini-bound team experimentation is now also live on the same stored-step seam:
  - `auracall teams run auracall-gemini-tooling "Use the provided toolEnvelope structured context to request one bounded shell action, then use the resulting tool outcome to return the provided finalToken exactly." --title "AuraCall Gemini tooling team live smoke" --prompt-append "Requester must emit exactly one JSON object with top-level localActionRequests containing the provided toolEnvelope unchanged. Do not rename fields, add markdown fences, or add prose. Finisher must output only the final token after a successful executed tool outcome." --structured-context-json '{"toolEnvelope":{"kind":"shell","summary":"Run one bounded deterministic node command","command":"node","args":["-e","process.stdout.write('\''AURACALL_TOOL_ACTION_OK'\'')"],"structuredPayload":{"cwd":"/home/ecochran76/workspace.local/auracall"}},"finalToken":"AURACALL_GEMINI_TOOL_TEAM_SMOKE_OK"}' --max-turns 2 --allow-local-shell-command node --allow-local-cwd-root /home/ecochran76/workspace.local/auracall --json`
  - on this WSL Chrome pairing, stored Gemini team execution may need exported cookies first:
    - `pnpm tsx bin/auracall.ts login --target gemini --profile auracall-gemini-pro --export-cookies`
  - stored Gemini team execution now reuses the same scoped/home exported-cookie fallback as direct Gemini browser mode when Linux keyring cookie reads return no Google auth cookies
- Current expected live result:
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
  - `runtimeProfileId = "auracall-grok-auto"`
  - `browserProfileId = "default"`
  - `service = "grok"`
  - `finalOutputSummary = "AURACALL_TEAM_SMOKE_OK"`
- Current expected broader-workflow result:
  - two ordered steps succeed on the same Grok runtime profile
  - durable shared state records consumed-transfer evidence for step 2
  - `finalOutputSummary = "AURACALL_TEAM_TWO_STEP_LIVE_SMOKE_OK"`
- Current expected ChatGPT team baseline result:
  - `runtimeSourceKind = "team-run"`
  - `runtimeRunStatus = "succeeded"`
  - `runtimeProfileId = "wsl-chrome-2"`
  - `browserProfileId = "wsl-chrome-2"`
  - `service = "chatgpt"`
  - `finalOutputSummary = "AURACALL_CHATGPT_TEAM_LIVE_SMOKE_OK"`
- Current expected cross-service result:
  - two ordered steps succeed across different providers
  - step 1 resolves to:
    - `runtimeProfileId = "wsl-chrome-2"`
    - `browserProfileId = "wsl-chrome-2"`
    - `service = "chatgpt"`
  - step 2 resolves to:
    - `runtimeProfileId = "auracall-grok-auto"`
    - `browserProfileId = "default"`
    - `service = "grok"`
  - durable recovery/response readback both show:
    - non-empty orchestration timeline
    - at least one `handoff-consumed` item
  - `finalOutputSummary = "AURACALL_CROSS_SERVICE_LIVE_SMOKE_OK"`
- Current expected cross-service Gemini result:
  - two ordered steps succeed across different providers
  - step 1 resolves to:
    - `runtimeProfileId = "wsl-chrome-2"`
    - `browserProfileId = "wsl-chrome-2"`
    - `service = "chatgpt"`
  - step 2 resolves to:
    - `runtimeProfileId = "auracall-gemini-pro"`
    - `browserProfileId = "default"`
    - `service = "gemini"`
  - durable recovery/response readback both show:
    - non-empty orchestration timeline
    - at least one `handoff-consumed` item
  - `finalOutputSummary = "AURACALL_CROSS_SERVICE_GEMINI_LIVE_SMOKE_OK"`
- Current expected multi-agent result:
  - two ordered steps succeed on the same Grok runtime profile
  - the planner step hands off to the finisher step
  - durable shared state records consumed-transfer evidence for step 2
  - `finalOutputSummary = "AURACALL_MULTI_AGENT_LIVE_SMOKE_OK"`
- Current expected tooling result:
  - two ordered steps succeed on the same Grok runtime profile
  - the first step emits only a bounded `localActionRequests` JSON envelope
  - the allowed `node` local shell action executes under the declared cwd root
  - shared state records:
    - `local shell action executed: node`
    - local action outcome summary for the tool step
  - `finalOutputSummary = "AURACALL_TOOL_TEAM_LIVE_SMOKE_OK"`
- Current tooling-test boundary:
  - manual provider-backed CLI proof is green
  - the automated tooling live case remains separately gated behind
    `AURACALL_TOOLING_LIVE_TEST=1`
  - keep the stable Grok baseline on `AURACALL_LIVE_TEST=1` only until the
    Grok tool-envelope path is deterministic enough to stop flaking
- Important browser-profile rule:
  - when a runtime profile points at an existing managed browser profile via
    `manualLoginProfileDir`, Aura-Call now follows the owning browser family
    for managed-profile resolution instead of minting a fresh runtime-profile-
    namespaced browser directory.
- Important Grok testing guard:
  - Grok browser-backed runs now persist one bounded per-managed-browser-profile
    cooldown/spacing record under `~/.auracall/cache/providers/grok/__runtime__`
  - repeated Grok test runs may now:
    - auto-wait briefly
    - or fail fast with a visible `Grok rate limit cooldown active until ...`
      / `Grok write spacing active until ...` message
  - visible provider toasts such as:
    - `Query limit reached for Auto`
    - `Try again in 4 minutes`
    are now treated as real Grok cooldown signals instead of timing out as
    generic browser failures
  - this is intentional and is meant to reduce self-inflicted live-test churn
    during repeated browser/team runs

## More docs
- Browser mode & forks: [docs/browser-mode.md](docs/browser-mode.md) (includes `auracall serve` remote service), [docs/chromium-forks.md](docs/chromium-forks.md), [docs/linux.md](docs/linux.md)
- MCP: [docs/mcp.md](docs/mcp.md)
- OpenAI/Azure/OpenRouter endpoints: [docs/openai-endpoints.md](docs/openai-endpoints.md), [docs/openrouter.md](docs/openrouter.md)
- Manual smokes: [docs/manual-tests.md](docs/manual-tests.md)
- Testing: [docs/testing.md](docs/testing.md)
  - the live suite is intentionally tiered into:
    - stable baseline
    - extended matrix
    - flaky-but-informative probes
  - use the stable baseline for routine confidence and keep the broader
    provider/operator matrix opt-in
  - current routine baseline command:
    - `pnpm run test:live:team:baseline`

If you’re looking for an even more powerful context-management tool, check out https://repoprompt.com  
Name inspired by: https://ampcode.com/news/oracle

## More free stuff from steipete
- ✂️ [Trimmy](https://trimmy.app) — “Paste once, run once.” Flatten multi-line shell snippets so they paste and run.
- 🟦🟩 [CodexBar](https://codexbar.app) — Keep Codex token windows visible in your macOS menu bar.
- 🧳 [MCPorter](https://mcporter.dev) — TypeScript toolkit + CLI for Model Context Protocol servers.
