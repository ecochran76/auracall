# Media Generation Surfaces | 0049-2026-04-22

State: OPEN
Lane: P01

## Scope

Implement first-class image/music/video generation across Aura-Call's operator
surfaces instead of treating provider media tools as ad hoc browser-only
helpers.

## Current State

- Gemini has a browser `--generate-image <file>` path that drives Gemini web
  and saves the first generated image.
- Gemini also exposes generated music and video surfaces; music can render
  through a video transport artifact, so the public contract must model
  `music` separately from `video`.
- Gemini's web UI exposes a `Create Image` tool in the tool drawer; Aura-Call
  does not yet have a reusable browser-service media operation that selects the
  tool drawer explicitly and reports media artifacts through the runtime.
- Grok Imagine image/video generation is not implemented.
- The generic API text path does not produce media artifacts for Gemini or
  Grok.
- The local `api serve` and MCP surfaces now expose the shared durable
  media-generation request/response contract and fake-provider test seams.
  Provider-backed Gemini/Grok execution is still gated on adapter wiring.
- Gemini browser-transport media requests now consult workbench capability
  discovery before executor invocation. Unknown, blocked, or not-visible
  `Create image`, `Create music`, or `Create video` capability reports fail
  durably with `media_capability_unavailable` instead of attempting tool
  selection.
- Gemini browser image execution is wired for local API runs backed by a
  resolved AuraCall runtime profile: it selects `Create image`, submits the
  prompt through the managed Gemini provider adapter, reads generated image
  artifacts from the conversation, and materializes them under the
  media-generation artifact directory. A first live API smoke proved capability
  discovery, tool selection, and prompt submission, but Gemini remained in an
  active `Stop response` state until the media-generation timeout, so artifact
  completion/readback is still pending.
- Gemini browser image execution now uses prompt-submission completion for the
  generic prompt path, then polls refreshed conversation context for image
  artifacts under the media-generation executor. Missing artifacts now fail as
  `media_generation_provider_timeout` instead of the generic assistant-text
  timeout.
- Follow-up live smoke showed Gemini can leave the workbench in a stale
  `Stop response` state even after rendering the image and after the user stops
  the response. Refreshing the page restores the composer. Media artifact
  polling now preserves the active tab instead of navigating on every poll, so
  readback does not move away from an in-progress image-generation surface.
- Active Gemini media generation is now keyed to the visible lottie avatar
  spinner, with stop/cancel controls treated as stale once generated media is
  visible.
- Follow-up live smokes showed additional churn after prompt submission:
  renamed Gemini media rows (`Images`, `Videos`, `Music`), zero-state
  `Create image` selection on `/app`, successful image render followed by
  binary-fetch failure, and navigation/materialization paths that could cancel
  a fresh image chat. Gemini browser image execution now waits for visible
  generated media before readback, preserves the active tab through
  materialization, refuses navigation during active media materialization, and
  can fall back to screenshot capture of the visible generated image.
- A follow-up audit confirmed `preserveActiveTab` was not enough by itself
  because URL-based target resolution could still navigate a same-origin tab
  before provider-level no-navigation guards ran. Gemini browser image
  execution now requires the submitted tab target id, polls active-tab
  artifacts directly instead of refreshing conversation context, and passes the
  same tab target id into materialization.
- The first supervised local API Gemini browser image smoke after the
  no-navigation readback change succeeded:
  `medgen_422d7585aa8544ba86c8c8bcf17c03cc` persisted
  `Generated image 1.png` via `visible-image-screenshot` from conversation
  `10b7e2a15e2dd77c` after two artifact polls.
- Media-generation records now include a durable `timeline[]` that is persisted
  while the request is running and retained on terminal readback. The timeline
  records service-level milestones plus provider progress such as Gemini prompt
  submission, artifact polls, visible image detection, materialization, and
  terminal completion/failure.
- A supervised local API Gemini browser image smoke after timeline persistence
  succeeded:
  `medgen_ef56c1911ddd4c4ebf9b17ea885d90a5` persisted
  `Generated image 1.png` via `visible-image-screenshot` from conversation
  `3543f8378a674997` after one artifact poll. The final readback retained the
  full processing timeline and completed at `2026-04-23T03:45:22.951Z`.
- Operators can now read a compact media-generation status summary through
  local API `GET /v1/media-generations/{media_generation_id}/status` and MCP
  tool `media_generation_status`. Both surfaces report current status, latest
  timeline event, artifact cache path, and materialization method without
  creating a new provider request.
- API and MCP media creation now support opt-in async creation with
  `wait=false`, returning a running media generation id while the same durable
  executor path continues in the background.
- The broader operator contract is now run-scoped rather than media-scoped:
  local API `GET /v1/runs/{run_id}/status` and MCP `run_status` return a shared
  compact envelope for response/team chats and media generations. Media-specific
  status remains a narrow helper, not the primary cross-run polling surface.
- CLI now has matching generic readback through `auracall run status <id>` and
  `--json`, backed by the same durable run-status reader as API/MCP.
- Grok Imagine research is captured in
  [0054 Grok Imagine Research Checkpoint](0054-2026-04-24-grok-imagine-research-checkpoint.md):
  - implement xAI API image generation first with `grok-imagine-image`
  - prefer API execution over browser automation for the first Grok slice
  - defer Grok video because it is a separate deferred polling flow with
    temporary video URLs

## Target Contract

- Add one route-neutral media request contract that can represent:
  - provider: `gemini` or `grok`
  - media type: `image`, `music`, or `video`
  - prompt
  - aspect ratio / size / count when supported
  - output artifact destination
  - source surface: CLI, local API, or MCP
- Route CLI `--generate-image` through that contract instead of keeping it as a
  Gemini-only side path.
- Extend local `api serve` with a bounded media-generation request/readback
  surface.
- Extend MCP with the same bounded media request/readback surface.
- Persist media artifacts and metadata under the existing runtime/session
  ownership model so readback is possible after the generating process exits.
- Persist a route-neutral `timeline[]` on media-generation records so API and
  MCP callers can see whether Aura-Call is running, waiting on provider
  artifacts, materializing, completed, or failed without inspecting browser
  state directly.
- Expose compact status readback on API and MCP so operators can poll a run
  without parsing the full media-generation response or touching the browser.
- Keep the generic status envelope route-neutral so future chat surfaces do not
  invent separate status contracts.
- Expose the same generic status envelope through CLI for local operators and
  scripts that are not using API/MCP.
- Use
  [0050 Workbench Capability Surfaces](0050-2026-04-23-workbench-capability-surfaces.md)
  as the discovery/availability layer for provider workbench tools; keep this
  plan focused on the simpler first-class media-generation resource.
- Keep provider-specific mechanics in provider adapters:
  - Gemini API adapter uses an image-capable model/configuration and persists
    returned inline image data or generated image URLs.
  - Gemini browser adapter selects the matching tool drawer mode (`Create
    Image`, `Create music`, or `Create video`) before submitting media prompts.
  - Grok adapter/API client owns Grok Imagine image/video specifics.

## Non-Goals

- Do not add a fleet scheduler, background worker pool, or cross-run media
  batch scheduler in this slice.
- Do not silently fall back from API to browser or browser to API without
  reporting the selected provider path.
- Do not auto-retry against Gemini `google.com/sorry`, CAPTCHA, or similar
  human-verification pages.
- Do not claim Grok video support until at least one provider-backed smoke is
  validated.

## Acceptance Criteria

- CLI can request one Gemini image and save it through the shared media
  contract.
- Gemini music/video requests stay representable through the same contract,
  with music allowed to persist a `video/mp4` transport artifact.
- Gemini API image generation works when the configured API key/model supports
  image output, with browser `Create Image` retained as a separate provider
  path.
- [x] Local API can create and read back one media generation request with durable
  artifact metadata through an injected fake executor.
- [x] MCP exposes equivalent media generation execution for agents through the
  same contract and service handler.
- [x] Gemini image generation selects the explicit `Create Image` tool path when
  using the browser surface.
- [x] Gemini browser image prompt submission is guarded by post-submit evidence
  and fallback submit paths, so stale composer clicks fail fast instead of
  waiting for a generic text response.
- [x] Gemini browser image execution waits on image artifact evidence rather
  than generic assistant text after prompt submission.
- [x] Gemini browser image execution avoids re-navigation after prompt
  submission while the generated image is visible on the active tab.
- [x] Gemini browser image artifact polling is pinned to the submitted tab
  target id and does not use general conversation-context refresh.
- [x] Media-generation readback includes a persisted processing timeline with
  prompt submission, artifact polling, materialization, and terminal state
  evidence.
- [x] Operators can check media-generation run status through API and MCP
  without re-invoking the provider.
- [x] Operators can check generic response/team chat and media run status
  through one API/MCP status envelope.
- [x] Operators can check the same generic response/team chat and media run
  status through CLI.
- Gemini music/video generation selects the explicit tool path when those
  browser adapter paths are implemented.
- [x] Gemini browser media requests are gated by the matching workbench
  capability availability before tool selection/execution.
- Grok Imagine implementation is either green for image generation or remains
  explicitly gated with a provider/API credential blocker.
- Docs state which provider/media combinations are implemented, gated, or not
  yet available.
- [x] Grok Imagine research identifies the first implementation target and the
  video/deferred-polling follow-up boundary.

## Validation Plan

- [x] Unit tests for media request schema, routing, and artifact readback.
- Provider-adapter tests for Gemini tool-selection intent and Grok Imagine
  request mapping.
- [x] Local API smoke for create/readback on a fake provider.
- [x] MCP smoke for the same fake provider path.
- [x] Unit coverage for media-generation timeline persistence and Gemini
  browser executor progress events.
- [x] HTTP and MCP tests for compact media-generation status readback.
- [x] HTTP and MCP tests for generic run-status readback across response and
  media runs.
- [x] CLI helper coverage for generic run-status readback across response and
  media runs.
- Live Gemini image smoke only after managed-profile state is clear of
  `google.com/sorry` or captcha pages. Avoid repeated back-to-back Gemini image
  smokes on the same managed browser profile; the next acceptance smoke should
  be one manually observed request from a clean idle `/app` tab.
- Latest supervised local API Gemini image smoke passed on 2026-04-23 with a
  persisted image artifact, no media-generation failure, and full timeline
  readback through terminal completion.
- Live Grok Imagine smoke only with a configured `XAI_API_KEY` or validated
  browser account path that exposes Imagine.
- First Grok implementation validation should use injected/fake HTTP transport
  before any live `XAI_API_KEY` smoke.
