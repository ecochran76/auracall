# Media Generation Surfaces | 0049-2026-04-22

State: OPEN
Lane: P01

## Scope

Implement first-class image/music/video generation across Aura-Call's operator
surfaces instead of treating provider media tools as ad hoc browser-only
helpers.

## Current State

- Gemini still has a browser `--generate-image <file>` compatibility path that
  drives Gemini web and saves the first generated image.
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
  media-generation artifact directory.
- Gemini browser video execution is fixture-backed and wired through the same
  browser media executor: it selects `Create video`, submits through the
  managed Gemini provider adapter, polls the submitted tab for generated video
  artifacts, emits `video_visible`, and materializes the generated media file.
  Live video smokes are intentionally not part of routine validation because
  Gemini exposes only a small daily video-generation quota.
- Gemini browser music execution is fixture-backed and wired through the same
  browser media executor: it selects `Create music`, submits through the
  managed Gemini provider adapter, polls the submitted tab for generated music
  artifacts, emits `music_visible`, and materializes every generated music
  download variant exposed by readback. The current accepted fixture models
  Gemini's two provider download choices: video with album art and MP3 audio.
  Live music smokes should be opt-in/manual for the same quota and
  provider-churn reasons as video.
- Gemini generated-media readback now preserves visible music download-option
  labels from the artifact container and already-open provider menu overlays.
  This read-only probe records options such as `Download as video with album
  art` and `Download as MP3` as artifact metadata without clicking the menu or
  spending generation quota.
- A live read-only probe against an already-open Gemini music chat confirmed
  active-tab artifact readback can classify generated music and preserve the
  visible `Download track` control in compact status without navigation or
  quota spend. With the menu closed, Gemini did not expose hidden MP4/MP3
  variant labels in the DOM; those require an already-open menu or an explicit
  non-routine menu-opening/materialization probe.
- A bounded live open-menu probe on the same chat showed Gemini's music
  download menu labels as `VideoAudio with cover art` and `Audio onlyMP3
  track`. Adapter readback now preserves both labels when that menu is already
  visible, including Gemini's concatenated menu-panel text shape.
- Gemini music materialization now expands a single generated music artifact
  with visible provider download options into explicit variant-labeled
  materialization targets. The adapter can open the download menu on the
  submitted active tab, select the requested option label, and cache the
  captured browser download or anchor response; fixture coverage includes the
  live-style `VideoAudio with cover art` and `Audio onlyMP3 track` labels.
- A bounded live MP3 materialization probe against the already-open
  `Pavement Espionage` chat first exposed and then fixed a false-positive
  fallback: an explicit `Audio onlyMP3 track` request must not cache the
  default MP4 URL when provider-menu selection fails. The corrected active-tab
  probe selected the visible MP3 menu item with CDP pointer events and cached
  `Pavement_Espionage.mp3` as `audio/mpeg`, size `3,780,874`, with
  `materialization = generated-media-download-variant`.
- A live browser-transport Gemini music service run
  `medgen_51a010028fbd4079b9a6ba6b33bdb2d2` succeeded end to end: capability
  discovery, Music tool selection, prompt submission, `music_visible` at poll
  6, and cached `the_velvet_pursuit.mp4` as `video/mp4`. That fresh artifact
  exposed only `Download track`, so executor expansion now treats a generated
  music artifact with a download button and hidden variant labels as eligible
  for Gemini's known MP4-with-art and MP3 variant requests. A second live run
  `medgen_170d647a163741fe82a18b4e16e6e03c` selected Music and submitted, but
  Gemini returned no generated music artifact before timeout; the managed tab
  stayed healthy and unblocked.
- A first live API image smoke proved capability discovery, tool selection,
  and prompt submission, but Gemini remained in an active `Stop response` state
  until the media-generation timeout, so artifact completion/readback was still
  pending at that point.
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
  timeline event, artifact cache path, materialization method, and compact
  artifact `downloadLabel`, `downloadVariant`, and `downloadOptions` fields
  when provider readback exposes named variants, without creating a new
  provider request.
- API and MCP media creation now support opt-in async creation with
  `wait=false`, returning a running media generation id while the same durable
  executor path continues in the background.
- The broader operator contract is now run-scoped rather than media-scoped:
  local API `GET /v1/runs/{run_id}/status` and MCP `run_status` return a shared
  compact envelope for response/team chats and media generations. Media-specific
  status remains a narrow helper, not the primary cross-run polling surface.
- CLI now has matching generic readback through `auracall run status <id>` and
  `--json`, backed by the same durable run-status reader as API/MCP, including
  compact media artifact download labels/variants when available.
- CLI media creation now has a shared-contract surface:
  - `auracall media generate --provider gemini|grok --type image|music|video`
  - requests use the durable media-generation service with `source = cli`
  - `--no-wait` returns a running media id for `auracall run status <id>`
  - the legacy Gemini `--generate-image <file>` flag remains as a compatibility
    side path until a later migration decides whether to retire or wrap it
- Grok Imagine research is captured in
  [0054 Grok Imagine Research Checkpoint](0054-2026-04-24-grok-imagine-research-checkpoint.md):
  - browser-first Imagine discovery, image/video invocation, status readback,
    and materialization are closed for the managed Grok profile
  - keep xAI API image/video execution as a later adapter path
  - use API research only as background context for media concepts, not as the
    first implementation target
- Browser media capability preflight failures now persist an explicit
  `capability_unavailable` timeline event before terminal `failed` and carry
  bounded capability metadata into failed readback/status, so operators can
  prove a gated run stopped before provider prompt submission.
- Live Gemini capability discovery on 2026-04-25 reported
  `gemini.media.create_image`, `gemini.media.create_music`, and
  `gemini.media.create_video` as `available` from browser discovery. The
  implemented Gemini browser image path then completed request
  `medgen_0b72e6f23cb04e0293dc4005ceb6521d` with one cached
  `Generated image 1.png` artifact from conversation `b0450d66b9120b2b`.
  Video and music are now implemented fixture-first in the Gemini browser
  executor. Music readback accepts the two known provider download variants:
  video with album art and MP3 audio.
- Media status diagnostics now summarize Gemini `artifact_poll` events as
  `artifact_polling` with pending state, poll count, and artifact counts, so
  operators can distinguish submitted-but-waiting image runs from unknown
  provider state without requesting live browser diagnostics.

## Target Contract

- Add one route-neutral media request contract that can represent:
  - provider: `gemini` or `grok`
  - media type: `image`, `music`, or `video`
  - prompt
  - aspect ratio / size / count when supported
  - output artifact destination
  - source surface: CLI, local API, or MCP
- Add a durable CLI media creation surface on the shared contract; keep
  `--generate-image` as a Gemini-only compatibility side path until migration
  criteria are explicit.
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

- [x] CLI can create one Gemini/Grok media-generation request through the
  shared durable media contract.
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
- [x] Compact media status artifacts expose provider download labels/variants,
  including Gemini music variant labels, through API, MCP, and CLI readback.
- [x] Gemini video generation selects the explicit `Create video` tool path,
  polls the submitted tab for generated video artifacts, and materializes the
  generated media file in fixture coverage.
- [x] Gemini music generation selects the explicit `Create music` tool path,
  polls the submitted tab for generated music artifacts, and materializes
  video-with-album-art plus MP3 variants in fixture coverage.
- [x] Gemini browser media requests are gated by the matching workbench
  capability availability before tool selection/execution.
- [x] Browser media capability-gate failures expose a pre-submit
  `capability_unavailable` timeline event and compact capability metadata on
  failed readback/status.
- [x] Grok Imagine implementation is either green for image generation or remains
  explicitly gated with a provider/API credential blocker.
- [x] Docs state which provider/media combinations are implemented, gated, or not
  yet available.
- [x] Grok Imagine research identifies browser-first discovery as the first
  implementation target and keeps xAI API execution deferred.

## Validation Plan

- [x] Unit tests for media request schema, routing, and artifact readback.
- [x] CLI helper coverage for shared-contract media creation.
- [x] Provider-adapter tests for Gemini tool-selection intent and Grok Imagine
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
- Latest live local API Gemini image smoke passed on 2026-04-25 with persisted
  status diagnostics:
  - request id `medgen_0b72e6f23cb04e0293dc4005ceb6521d`
  - capability discovery showed Images, Music, and Videos available
  - media status first reported `prompt_submitted`, then `artifact_poll`, then
    terminal `completed`
  - generic run status and CLI run status reported matching
    `metadata.mediaDiagnostics`
  - cached artifact:
    `~/.auracall/runtime/media-generations/medgen_0b72e6f23cb04e0293dc4005ceb6521d/artifacts/Generated image 1.png`
- Gemini video validation is fixture-first by default because live Gemini video
  generations are quota-sensitive. Live video smoke should be a single
  intentional manual/operator run after capability discovery reports
  `gemini.media.create_video` as available and the managed browser profile is
  clear of `google.com/sorry` or CAPTCHA state.
- Gemini music validation is fixture-first by default for the same
  quota/churn reasons. Live music smoke should be a single intentional
  manual/operator run after capability discovery reports
  `gemini.media.create_music` as available and should verify that both
  download variants, video with album art and MP3 audio, are cached when the
  provider exposes both.
- Fixture coverage should include both readback shapes: two already-separated
  music artifacts and one generated music artifact whose `downloadOptions`
  drive explicit provider-menu variant selection.
- Read-only Gemini music download-option discovery is covered by adapter
  fixtures. It should not click download menus during routine validation; if a
  human has already opened the menu in the managed browser, readback may
  preserve the visible option labels.
- Live Gemini music dogfood should treat closed-menu `Download track` evidence
  as a successful read-only music detection/status probe, not as proof that all
  hidden provider download variants were discoverable.
- Open-menu Gemini music dogfood should expect compact status
  `downloadOptions` to include `Download track`, `VideoAudio with cover art`,
  and `Audio onlyMP3 track` when those labels are visible.
- Explicit Gemini music variant materialization must verify the cached file's
  MIME/extension matches the requested variant; an MP3 request returning the
  default MP4 transport is a failed variant materialization, not a success.
- Fresh Gemini music readback can hide provider variants behind the generic
  `Download track` trigger. Fixture coverage should keep the hidden-option
  shape so future changes continue to request the known MP4-with-art and MP3
  variants instead of caching only the default transport artifact.
- Live Grok Imagine smoke only with a configured `XAI_API_KEY` or validated
  browser account path that exposes Imagine.
- First Grok implementation validation should use read-only managed-browser
  discovery and captured discovery fixtures before any prompt-submission smoke.
