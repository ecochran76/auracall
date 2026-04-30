# MCP Server

`auracall-mcp` is a minimal MCP stdio server that mirrors the Aura-Call CLI. It shares session storage with the CLI (`~/.auracall/sessions` or `AURACALL_HOME_DIR`) so you can mix and match: run with the CLI, inspect or re-run via MCP, or vice versa.

## Tools

### `consult`
- Inputs: `prompt` (required), `files?: string[]` (globs), `model?: string` (defaults to CLI), `engine?: "api" | "browser"` (CLI auto-defaults), `slug?: string`.
- Behavior: starts a session, runs it with the chosen engine, returns final output + metadata. Background/foreground follows the CLI (e.g., GPT‑5 Pro detaches by default).
- Logging: emits MCP logs (`info` per line, `debug` for streamed chunks with byte sizes). If browser prerequisites are missing, returns an error payload instead of running.

### `sessions`
- Inputs: `{id?, hours?, limit?, includeAll?, detail?}` mirroring `auracall status` / `auracall session`.
- Behavior: without `id`, returns a bounded list of recent sessions. With `id`/slug, returns a summary row; set `detail: true` to fetch full metadata, log, and stored request body.

### `team_run`
- Inputs: either compact fields (`teamId`, `objective`, optional `title`, `promptAppend`, `structuredContext`, `responseFormat?: "text" | "markdown" | "json"`, `outputContract?: "auracall.step-output.v1"`, `maxTurns`, and bounded `localActionPolicy`) or a prebuilt flattened `taskRunSpec` validated with Aura-Call's live `TaskRunSpec` schema.
- Behavior: creates and executes one bounded team run through the existing `TaskRunSpec -> TeamRun -> runtimeRun` path. The structured result is `object = "team_run"` with `taskRunSpec` and deterministic execution ids/status.
- Provenance: compact MCP-created runs are stamped with `trigger = "mcp"` and `requestedBy.kind = "mcp"`; prebuilt `taskRunSpec` inputs preserve their validated provenance.

### `response_create`
- Inputs: `model`, `input`, optional `instructions`, `runtimeProfile`,
  `agent`, `service`, `transport`, `outputContract`, `composerTool`,
  `deepResearchPlanAction`, and `metadata`.
- Behavior: creates one durable response run through the same stored-step
  response service used by local API `/v1/responses`. Browser-backed ChatGPT
  calls can request volatile workbench tools per call, for example
  `composerTool = "deep-research"` with `deepResearchPlanAction = "edit"`.
  The structured result is `object = "response"` and its `id` can be polled
  through `run_status`.
- Polling contract: create the response once, keep the returned `id`, and use
  `run_status` for subsequent state checks. Status readback is file-backed and
  must not resubmit the prompt, reopen a provider tool, or navigate the browser.

### `run_status`
- Inputs: `id` for a response/runtime run or media generation; optional
  `diagnostics: "browser-state"`.
- Behavior: returns `object = "auracall_run_status"` with a compact status
  envelope across normal response chats, team-runtime chats, and media
  generations. It includes current status, latest event, step summaries when
  available, artifact count, artifact cache path/URI, materialization method,
  provider/runtime metadata, and failure details.
- Browser-backed response runs can also expose a bounded
  `metadata.browserRunSummary`. For ChatGPT Deep Research `edit` runs, this
  includes the review stage/action, conversation URL, modify-plan label,
  iframe/DOM edit target evidence, and passive screenshot path when captured.
- `diagnostics = "browser-state"` adds bounded live browser evidence when the
  run is active and browser-backed, including recent browser mutation records
  when Aura-Call has recorded navigation/reload/open-reuse activity for the
  selected runtime profile and service.
- Use this as the default operator polling tool when the run type may vary.
- Persistence-safe polling: `run_status` is read-only. Calling it after a fresh
  MCP process start should read the stored response/team/media record by id and
  should not trigger provider execution. If the status payload shows an active
  browser-backed run, poll the same id again instead of calling
  `response_create` or `media_generation` a second time.
- CLI parity: `auracall run status <id> --json` reads the same durable status
  envelope from local storage.

### `api_status`
- Inputs: `port` for the local `auracall api serve` listener; optional `host`,
  `timeoutMs`, `expectedAccountMirrorPosture`, and
  `expectedAccountMirrorBackpressure`.
- Behavior: reads the local API `/status` endpoint and returns the same compact
  scheduler summary used by `auracall api status`, including
  `scheduler.operatorStatus.posture`, wake reason, and latest mirror
  backpressure. It does not launch browsers, touch CDP, submit provider work,
  or read provider pages.
- Use this when an MCP operator needs to assert lazy mirror readiness or
  backpressure without shelling out to the CLI. `account_mirror_status` remains
  the cache-only per-target mirror status tool; `api_status` is specifically
  for the running API service posture.
- Smoke: after `pnpm run install:user-runtime`, run
  `pnpm tsx scripts/smoke-api-status-mcp.ts --mode both --port 18081` to start
  short-lived local API servers and verify installed MCP `api_status` reports
  `disabled` and `scheduled` mirror scheduler postures.

### `runtime_inspect`
- Inputs: one runtime lookup key, `runId`, `runtimeRunId`, `teamRunId`, or
  `taskRunSpecId`; optional `runnerId`; optional `probe: "service-state"`;
  optional `diagnostics: "browser-state"`.
- Behavior: returns `object = "runtime_run_inspection"` with the same bounded
  runtime queue/lease projection exposed by
  `GET /v1/runtime-runs/inspect`. `probe = "service-state"` adds live
  provider state for the active step. `diagnostics = "browser-state"` adds a
  bounded browser snapshot for the active step: selected target URL/title/id,
  document readiness, visible control counts, provider evidence, recent
  browser mutation records, and a stored PNG screenshot path.
- This is read-only and does not expose raw JavaScript evaluation or unfenced
  DevTools access.

### `media_generation`
- Inputs: `provider: "gemini" | "grok"`, `mediaType: "image" | "music" | "video"`, `prompt`, and optional `model`, `transport`, `count`, `size`, `aspectRatio`, `outputDir`, `wait`, and metadata.
- Behavior: creates one request through Aura-Call's shared media-generation contract and returns `object = "media_generation"` with durable artifact metadata. `wait = false` returns a running media id immediately so callers can poll `media_generation_status` or `run_status` while browser execution is active. Browser-backed Gemini/Grok media jobs wait through the browser-service operation dispatcher before provider adapters touch CDP; timelines can include `browser_operation_queued` and `browser_operation_acquired` when another operation owns the same managed browser profile or raw DevTools endpoint. Provider execution may still fail when the requested provider capability is unavailable or unsupported. Grok browser image requests are preflighted through `grok.media.imagine_image` on the explicit `/imagine` entrypoint and fail before prompt submission when the account is gated. Grok image requests scrape up to `count` currently visible generated tiles, defaulting to 8, without scrolling the wall to trigger more provider work. Grok browser video requests preflight `grok.media.imagine_video` with `discoveryAction = "grok-imagine-video-mode"`, submit through the active `/imagine` tab, poll the submitted tab for terminal generated-video evidence, and cache the MP4 through the provider download control when available. A diagnostic Grok video readback probe can poll an already-submitted tab when metadata explicitly includes `grokVideoReadbackProbe = true`, `grokVideoReadbackTabTargetId`, and `grokVideoReadbackDevtoolsPort`; it direct-connects to that tab and does not submit, navigate, reload, or fall back to browser-service target resolution.
- Provenance: MCP-created media requests are stamped with `source = "mcp"` in the structured response metadata.
- Polling contract: create the media generation once, keep the returned
  `media_generation.id`, and poll with `media_generation_status` when callers
  need media-specific timeline/artifact diagnostics or `run_status` when they
  need the generic cross-run envelope. Do not call `media_generation` again for
  status; that creates a new provider job.

### `media_generation_status`
- Inputs: `id` for a stored media generation; optional
  `diagnostics: "browser-state"`.
- Behavior: returns `object = "media_generation_status"` with current status,
  latest timeline event, full timeline, artifact count, artifact cache path,
  materialization method, checksum, preview/full-quality comparison fields
  when available, failure details when present, and derived `diagnostics` from
  the persisted timeline. The diagnostics block summarizes capability
  preflight, submitted tab, provider route progression, artifact
  polling/progress counts, terminal run-state counts, and materialization
  source without re-invoking the provider.
- `diagnostics = "browser-state"` adds bounded live browser evidence for a
  running browser-backed media job, using the recorded provider `tabTargetId`
  when present. The same diagnostics payload includes recent browser mutation
  records when available.
- Use this for polling a long-running media request without re-invoking the
  provider or inspecting raw JSON.
- Persistence-safe polling: this tool reads the stored media-generation record
  by id. It can be used from a fresh MCP process and must not submit another
  prompt, refresh the provider workbench, or materialize additional artifacts
  unless a separate materialization command is explicitly invoked.

### `workbench_capabilities`
- Inputs: optional `provider: "chatgpt" | "gemini" | "grok"`, optional `category: "research" | "media" | "canvas" | "connector" | "skill" | "app" | "search" | "file" | "other"`, optional `runtimeProfile`, optional `includeUnavailable`, optional `diagnostics: "browser-state"`, optional `entrypoint: "grok-imagine"`, and optional `discoveryAction: "grok-imagine-video-mode"`.
- Behavior: returns `object = "workbench_capability_report"` with known or discovered provider workbench capabilities, provider labels, invocation modes, surfaces, availability, stability, required inputs, output expectations, and safety flags. This is read-only discovery and does not invoke provider tools. `diagnostics = "browser-state"` adds bounded target/document/provider evidence and a stored PNG screenshot path for the selected provider. `entrypoint = "grok-imagine"` opens or reuses Grok `/imagine` through browser-service control-plane attribution before inspection. `discoveryAction = "grok-imagine-video-mode"` may click the Grok Imagine Video radio for an explicit mode audit, records before/after controls plus bounded `videoModeAudit` evidence, and restores the original Image/Video mode without typing or submitting a prompt. Grok `/imagine` provider evidence can include `run_state`, pending, terminal image/video, media URL, materialization-control signals, controls, and discovery-action evidence when visible.
- Volatility: static catalog entries use conservative `unknown` or `account_gated` availability until browser/provider discovery confirms the current account state. ChatGPT feature-signature discovery can report visible Web Search, Deep Research, Company Knowledge, apps/connectors, and skills without invoking or enabling them. Grok discovery can report visible Imagine image/video evidence without submitting a generation request.

## Resources
- `auracall-session://{id}/{metadata|log|request}` — read-only resources that surface stored session artifacts via MCP resource reads.

## Background / detach behavior
- Same as the CLI: heavy models (e.g., GPT‑5 Pro) detach by default; reattach via `auracall session <id>` / `auracall status`. MCP does not expose extra background flags.

## Launching & usage
- Installed from npm:
  - One-off: `npx auracall auracall-mcp`
  - Global: `auracall-mcp`
- From the repo (contributors):
  - `pnpm build`
  - `pnpm mcp` (or `auracall-mcp` in the repo root)
- mcporter example (stdio):
  ```json
  {
    "name": "auracall",
    "type": "stdio",
    "command": "npx",
    "args": ["auracall", "auracall-mcp"]
  }
  ```
- Project-scoped Claude (.mcp.json) example:
  ```json
  {
    "mcpServers": {
      "auracall": { "type": "stdio", "command": "npx", "args": ["auracall", "auracall-mcp"] }
    }
  }
  ```
- Tools and resources operate on the same session store as `auracall status|session`.
- Defaults (model/engine/etc.) come from your Aura-Call CLI config; see `docs/configuration.md` or `~/.auracall/config.json`.
