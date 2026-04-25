# Grok Imagine Research Checkpoint | 0054-2026-04-24

State: OPEN
Lane: P01

## Scope

Research the current Grok Imagine image/video generation surface before adding
provider execution, and select the smallest implementation slice that fits the
existing Aura-Call media-generation contract.

## Current State

- Plan 0049 keeps Grok Imagine explicitly gated:
  - image generation is not implemented
  - video generation is not implemented
  - live smoke requires `XAI_API_KEY` or a validated browser account path
- Aura-Call already has a route-neutral `media_generation` resource for
  `provider = "grok"` and `mediaType = image|music|video`.
- The default local API media executor now has a guarded Grok browser image
  path for `provider = grok`, `mediaType = image`, `transport = browser`.
- The MCP server now builds the same configured browser-backed media/workbench
  service bundle as the local API path for media generation, media status,
  generic run status, and workbench capability tools.
- Grok API execution and edit/reference workflows still fail durably as not
  implemented.
- Grok Imagine video-mode auditing now has an explicit workbench capability
  discovery action:
  - CLI: `auracall capabilities --target grok --entrypoint grok-imagine --discovery-action grok-imagine-video-mode --json`
  - API: `GET /v1/workbench-capabilities?provider=grok&entrypoint=grok-imagine&discoveryAction=grok-imagine-video-mode`
  - MCP: `workbench_capabilities` with
    `discoveryAction = "grok-imagine-video-mode"`
  - the action may click the Video radio, records before/after control
    evidence, restores the original Image/Video mode, and does not type or
    submit a prompt
  - Video-mode audit evidence now includes composer, disabled submit state
    before text entry, upload controls, aspect-ratio controls, filmstrip
    entries, download controls, visible media, and generated/selected media
    counts
- Static/read-only workbench capability reporting now includes conservative
  Grok Imagine image/video entries.
- The Grok browser adapter now exposes a read-only feature signature that can
  detect visible Imagine entrypoints, labels, routes, modes, and gating/failure
  evidence without submitting a prompt.
- First live read-only managed-browser probe on 2026-04-24 succeeded:
  - `auracall capabilities --target grok --json`
  - observed `/imagine`
  - reported `grok.media.imagine_image` as `account_gated`
  - kept `grok.media.imagine_video` at static `unknown`
  - did not submit a generation request
- Workbench capability reports now support opt-in bounded browser diagnostics:
  - CLI: `auracall capabilities --target grok --diagnostics browser-state --json`
  - API: `GET /v1/workbench-capabilities?provider=grok&diagnostics=browser-state`
  - MCP: `workbench_capabilities` with `diagnostics = "browser-state"`
  - diagnostics include selected target/document state, Grok Imagine provider
    evidence, recent browser mutation records, and a stored PNG screenshot path
- First diagnostics dogfood on 2026-04-24 succeeded:
  - `pnpm tsx bin/auracall.ts capabilities --target grok --diagnostics browser-state --json`
  - selected the current managed Grok project-chat tab, not `/imagine`
  - captured target URL/title and a stored PNG screenshot path
  - kept Grok Imagine image/video capabilities conservative `unknown`
  - did not submit a generation request or navigate to a conversation id
- Grok Imagine entrypoint inspection now exists:
  - CLI: `auracall capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
  - API: `GET /v1/workbench-capabilities?provider=grok&entrypoint=grok-imagine&diagnostics=browser-state`
  - MCP: `workbench_capabilities` with `entrypoint = "grok-imagine"`
  - live dogfood on 2026-04-24 opened/reused `https://grok.com/imagine`
    through browser-service `target-open-or-reuse` control-plane attribution
  - diagnostics captured `Imagine - Grok`, visible image/video mode evidence,
    one visible `/imagine` control, and a stored PNG screenshot path
  - both image and video capabilities reported `account_gated`
  - no generation prompt was submitted
- Grok Imagine read-only provider evidence now includes run-state/readback
  signals when visible on `/imagine`:
  - `run_state = account_gated|blocked|pending|terminal_video|terminal_image|idle|not_visible`
  - pending indicators from visible busy/progress/generation text evidence
  - terminal image/video DOM media evidence and media URLs
  - visible materialization controls such as download/save/open/share/copy
  - bounded visible tile evidence from the masonry wall and filmstrip,
    including tile URL, selected state, generated/public-gallery
    classification, and tile surface
  - capability metadata carries the same evidence for API/MCP/CLI consumers
  - no prompt submission or generation-control click is performed
- Live dogfood on 2026-04-24 confirmed the current `/imagine` page reports:
  - `run_state = account_gated`
  - `pending = false`
  - `terminal_image = false`
  - `terminal_video = false`
  - public gallery media URLs remain visible as page evidence, but are not
    promoted to terminal generated output while the account is gated
- Grok browser image invocation is now wired behind capability preflight:
  - media service checks `grok.media.imagine_image` with
    `entrypoint = grok-imagine` and `diagnostics = browser-state`
  - `account_gated`, `unknown`, `blocked`, or missing capability stops before
    provider prompt submission
  - gated runs persist `capability_unavailable` before terminal failure and
    retain the inspection command plus bounded workbench capability metadata in
    failed readback/status
  - available accounts use a pinned `/imagine` tab, provider run-state polling,
    and remote media materialization from detected terminal image evidence
  - video later adopted the same capability-preflight and submitted-tab
    readback pattern
- Durable local API dogfood on 2026-04-24 confirmed browser-backed Grok image
  runs persist processing state and artifacts:
  - request id: `medgen_bb41e86d6d6d4bcea5499bc2c090772c`
  - `POST /v1/media-generations?wait=false` returned `running`
  - status polling observed `image_visible` while the run was still `running`
    and then terminal `completed`
  - `GET /v1/media-generations/{id}/status` and
    `GET /v1/runs/{id}/status` agreed on `status = succeeded`,
    `artifactCount = 1`, and the cached artifact path under
    `~/.auracall/runtime/media-generations/.../artifacts`
  - remaining materialization gap: the durable path landed on a
    `/imagine/templates/...` route and cached a remote media fetch, while the
    earlier direct executor path proved visible-tile/download-button capture
    can produce local browser-derived artifacts
- Durable local API dogfood after generated-media tightening confirmed the
  false-success path is now blocked:
  - request id: `medgen_3affbd24ef6b4fecb72801a2e78a64c4`
  - the submitted tab reported `terminal_video`/`terminal_image`,
    `imageCount = 20`, and `generatedImageCount = 0`
  - the run failed as `media_generation_provider_timeout` instead of
    materializing public template/gallery media as generated output
  - timeout diagnostics now preserve image, generated-image, visible-tile, and
    media-url counts for operator readback
- The follow-up status slice now promotes repeated stable public/template
  terminal media with no generated account image into a specific
  `media_generation_no_generated_output` failure:
  - timeline includes `no_generated_media` before terminal `failed`
  - failure details preserve provider href, template-route flag, public-gallery
    counts, visible-tile counts, and generated-image count
  - generic timeout remains reserved for cases without stable terminal
    public/template evidence
- Grok submit-path diagnostics now emit `submit_path_observed` after the send
  click:
  - outcomes include `pending`, `generated_media`,
    `public_template_no_generated`, `blocked`, and `idle`
  - details preserve route kind, provider href, run state, generated-image
    count, public-gallery image/tile counts, and media URL count
  - repeated `public_template_no_generated` evidence returns prompt submission
    control to the media executor early so status can fail as
    `media_generation_no_generated_output`
- Live submit-path dogfood on 2026-04-24 confirmed the new status path:
  - request id: `medgen_33cc6d83194a4beba1f91e21566472a1`
  - `submit_path_observed` reported `outcome =
    public_template_no_generated`, `routeKind = imagine_template`, and
    `generatedImageCount = 0`
  - provider href was
    `https://grok.com/imagine/templates/b1d6b6a6-f21f-4a87-80cf-3e75765b5b96`
  - status reached terminal `failed` with
    `media_generation_no_generated_output`
  - first dogfood attempts exposed missing Zod schema entries for the new
    timeline events; `src/media/schema.ts` now includes both
    `submit_path_observed` and `no_generated_media`
- The composer/send audit confirmed the previous live failure was selector
  drift, not an account gate:
  - the live `/imagine/templates/...` DOM included a visible `Go Skiing`
    template card that matched the old broad `go` send-control heuristic
  - submit selection is now scoped to the composer form and only accepts an
    enabled `type = submit` or explicit submit/send/generate/create
    aria/title/text control
  - after prompt insertion, the executor waits briefly for Grok to enable the
    form submit button before clicking
  - request id `medgen_68d57594cbe94fbc853f8e9ea2a3466c` reproduced the
    enablement race: prompt inserted, later DOM showed enabled `Submit`, but
    the earlier click attempt failed with `composer submit control not found`
  - request id `medgen_60f410b013da4e3480b57f1f3072d93f` then succeeded with
    `send_attempted.ok = true`, `label = submit`,
    `submit_path_observed.outcome = generated_media`, and four cached
    artifacts
- Durable status readback after the submit-control fix confirms API/CLI/MCP
  parity on the fixed image path:
  - request id `medgen_b6d1209802934b5bab20f5cb5f358af7`
  - media status and generic run status both reported `succeeded`,
    `lastEvent = completed`, `artifactCount = 1`, and the same cached
    `grok-imagine-visible-1.jpg`
  - direct MCP tool-handler readback returned matching
    `media_generation_status` and `run_status` structured content for the
    same persisted id
  - MCP media output schemas now reuse the canonical media timeline event
    schema instead of carrying a duplicated event enum
- Bounded read-only video discovery has started:
  - the live `/imagine` page exposes `Image` and `Video` as visible
    `role = radio` controls, with `Image` checked and `Video` unchecked
  - feature discovery now scans radio controls and preserves mode-control
    text, checked state, type, disabled state, and geometry in provider
    evidence
  - the live workbench capability probe now reports
    `grok.media.imagine_video` from browser discovery without submitting a
    video generation request
- Bounded live video-mode audit on 2026-04-24 confirmed:
  - `discoveryAction = grok-imagine-video-mode` clicked Video from Image and
    observed `status = observed_video_mode`
  - Video mode kept a contenteditable `Type to imagine` composer and disabled
    `Submit` before prompt text
  - visible controls included `Upload` and `Aspect Ratio = 2:3`
  - root-state Video mode exposed one generated/selected media selector but no
    visible filmstrip or download controls until generated media is selected or
    produced
  - the probe restored the original Image/Video mode after evidence capture
- First Grok browser video executor skeleton established the pre-submit guard:
  - media capability preflight requests
    `discoveryAction = grok-imagine-video-mode`
  - the executor receives the discovered workbench capability evidence and
    emits `capability_selected`, `composer_ready`, and
    `submitted_state_observed` with `submitted = false`
  - the executor fails with `media_provider_not_implemented` before prompt
    insertion or Submit until video run-state and artifact materialization
    acceptance criteria are defined
  - live local API dogfood id
    `medgen_5db184cae1ea432aae1e6649beb6ed22` confirmed the expected
    pre-submit timeline and no prompt submission
- Grok video post-submit acceptance criteria are executable:
  - pending accepts provider `pending`, `generating`, or `progress` evidence
  - terminal success requires `terminal_video` plus generated account video
    evidence, not public/template media
  - public/template video evidence is classified separately as a failure
    class
  - materialization requires generated video `src`/`href` evidence or a
    visible download/open control
  - the canonical media timeline reserves `video_visible` for terminal video
    observation
- Grok video readback now has a fixture-backed decision skeleton:
  - one provider feature signature becomes a `run_state_observed` timeline
    payload and, when ready, the future terminal `video_visible` payload
  - readback decisions are `pending`, `ready`, `failed`, or `continue`
  - first materialization candidates are selected from generated video
    entries, selected generated video tiles, or visible download/open controls
  - the helper is shared by the diagnostic readback branch and the normal
    automated Submit path
- Grok video polling and remote materialization now have fixture-backed
  primitives:
  - the wait loop polls only an existing tab target through
    `getFeatureSignature` and does not navigate, reload, or submit
  - pending evidence continues polling, ready evidence emits `video_visible`,
    and failed evidence maps to media-generation failure codes
  - generated video candidates can be cached as `type = video` artifacts with
    materialization source metadata
  - these primitives are now used by the normal post-submit path
- Grok video readback primitives were first wired to a diagnostic executor
  branch:
  - the diagnostic path remains available for already-submitted tabs
  - the diagnostic branch requires `metadata.grokVideoReadbackProbe = true`
    plus an existing `metadata.grokVideoReadbackTabTargetId` and
    `metadata.grokVideoReadbackDevtoolsPort`
  - the branch polls that existing tab, emits the normal media timeline, and
    can materialize a generated video artifact
  - the branch never calls `runPrompt`, navigates, reloads, or opens a new
    Grok route
- The Grok video readback probe now also bypasses service-level capability
  preflight so the request cannot trigger `grok-imagine` entrypoint discovery
  or the Video-mode discovery action before attaching to the existing tab.
- The manual readback procedure is documented in
  `docs/grok-imagine-video-readback-runbook.md`:
  - human starts the Grok video run
  - Aura-Call attaches to the existing DevTools tab id and DevTools port only
  - status is read back through both media-generation status and generic run
    status
  - no Submit click, navigation, reload, or entrypoint open/reuse is allowed
- A first human-started probe exposed a contract gap:
  - request id `medgen_6af3f99688dc4424abebbe29c580cd41`
  - the request carried a tab id but no DevTools port
  - provider option building could not direct-connect to the tab and fell back
    through browser-service target resolution
  - the tab moved from `/imagine/post/...` to `/imagine`, and status failed as
    `media_generation_no_generated_output`
  - the readback contract now requires `grokVideoReadbackDevtoolsPort` to
    prevent that fallback
- The corrected direct-connect probe then validated no-navigation status
  readback, but did not find generated account video:
  - request id `medgen_08245dd8c6744e7ba57ea87d241c453b`
  - metadata included tab target id `6088C5371BC63D7C88C9BB4A6F7DFAD4`,
    DevTools port `38261`, host `127.0.0.1`, and tab URL
    `https://grok.com/imagine`
  - media-generation status and generic run status agreed on terminal
    `media_generation_no_generated_output`
  - first readback poll saw `terminal_video`, `generatedVideoCount = 0`,
    `publicGalleryVideoCount = 3`, `visibleTileCount = 14`, and
    `mediaUrlCount = 17`
  - post-run tab inspection still reported the same tab at
    `https://grok.com/imagine`, confirming the corrected probe did not
    navigate the tab
- A later direct-connect probe on the mature post URL validated status sensing
  but exposed browser-owned materialization as the missing step:
  - request id `medgen_19864cb8180b443ebed3a30c8fc37840`
  - first poll saw `runState = terminal_video`, `generatedVideoCount = 1`,
    `downloadControlCount = 1`, `materializationCandidateCount = 2`, and
    provider href
    `https://grok.com/imagine/post/540a1b45-5ee3-4cb4-8b57-a25dcc2ee9dd`
  - direct Node/curl fetch of the generated asset URL returned `403` with no
    bytes, so the selected-media download button is the authoritative cache
    route for this surface
  - the readback path now tries the exact tab's visible
    `aria-label = "Download"` control before falling back to direct URL fetch
- Live validation after the download-control fix succeeded:
  - request id `medgen_bc4771f047934deeae2df262c8f41f9b`
  - media-generation status and generic run status both reported
    `status = succeeded`, `artifactCount = 1`, and
    `materialization = download-button`
  - cached artifact:
    `~/.auracall/runtime/media-generations/medgen_bc4771f047934deeae2df262c8f41f9b/artifacts/grok-imagine-video-1.mp4`
  - local file size: `4,877,074` bytes
  - post-run tab inspection still reported
    `https://grok.com/imagine/post/540a1b45-5ee3-4cb4-8b57-a25dcc2ee9dd`,
    so the readback/download path did not navigate away from the submitted
    conversation
- Normal Grok browser video submit is now wired behind capability preflight:
  - capability preflight requests `discoveryAction =
    grok-imagine-video-mode`
  - the provider adapter accepts `grok.media.imagine_video`, selects Video
    mode, inserts the prompt, clicks the composer-scoped Submit control, and
    returns the submitted tab target plus DevTools endpoint
  - the executor polls only the submitted tab for terminal generated-video
    evidence, then materializes the MP4 through the selected-media download
    control when the direct `assets.grok.com` URL is browser-gated
  - the first normal live attempt,
    `medgen_71a1d44956304f83b4f6d97626de6e39`, exposed that the
    service-level capability derivation did not treat successful
    Video-mode action evidence as `grok.media.imagine_video`; capability
    derivation now consumes the action-specific evidence it requested
  - fixed live validation id:
    `medgen_ae8dfbd131e346038c4e8bad9a6afcb4`
  - status observed pending run-state evidence, terminal `video_visible` at
    poll count `21`, `generatedVideoCount = 1`, and
    `materializationCandidateSource = generated-video`
  - media-generation status and generic run status agreed on
    `status = succeeded`, `artifactCount = 1`, `mimeType = video/mp4`,
    `materialization = download-button`, and
    `artifactPollCount = 21`
  - cached artifact:
    `~/.auracall/runtime/media-generations/medgen_ae8dfbd131e346038c4e8bad9a6afcb4/artifacts/grok-imagine-video-1.mp4`
  - local file size: `2,253,656` bytes
  - post-run browser inspection confirmed the Grok tab stayed on
    `https://grok.com/imagine/post/47f5b640-a7c7-45ca-b5a7-8f34d7c8148e`

## Research Findings

Primary sources reviewed:

- xAI Image Generation docs:
  - `https://docs.x.ai/developers/model-capabilities/images/generation`
- xAI Video Generation docs:
  - `https://docs.x.ai/developers/model-capabilities/video/generation`
- xAI Imagine API landing page:
  - `https://x.ai/api/imagine`
- xAI API introduction:
  - `https://docs.x.ai/developers/introduction`
- xAI Grok Imagine API announcement:
  - `https://x.ai/news/grok-imagine-api`

Findings:

- xAI API and Grok consumer surfaces are separate offerings:
  - API access uses `api.x.ai` and an xAI API key
  - Grok.com/X/mobile subscriptions do not imply xAI API access
- Image generation is the simplest first implementation target:
  - endpoint: `POST https://api.x.ai/v1/images/generations`
  - model: `grok-imagine-image`
  - output can be URL or `b64_json`
  - request supports multiple images through `n`
  - request supports `aspect_ratio`
  - request supports `resolution = 1k|2k`
- Image editing is a separate follow-up:
  - endpoint: `POST https://api.x.ai/v1/images/edits`
  - supports image URL input and multi-image editing
- Video generation is a different execution shape:
  - endpoint: `POST https://api.x.ai/v1/videos/generations`
  - model: `grok-imagine-video`
  - response returns a `request_id`
  - caller must poll `GET https://api.x.ai/v1/videos/{request_id}`
  - terminal states include `done`, `expired`, and `failed`
  - in-progress state is `pending`
  - returned video URLs are temporary and should be downloaded promptly
  - supported parameters include `duration`, `aspect_ratio`, and `resolution`
- Video supports more than simple text-to-video:
  - image-to-video from public image URL or base64 data URI
  - video editing through a separate edit path
  - reference-image workflows and video extensions exist as later slices
- Grok Imagine has a material safety/moderation context:
  - returned image/video metadata can include moderation posture such as
    `respect_moderation`
  - browser/UI-facing Grok Imagine has had volatile gating, availability, and
    safety behavior in public reports

## Decision

Implement browser-side Grok Imagine discovery and proof first. Do not implement
the xAI API executor yet.

Reasoning:

- The requested product path is the signed-in Grok workbench, not the separate
  xAI API account/key surface.
- Browser Grok Imagine is the complicated and volatile interface that needs
  Aura-Call hardening:
  - account-tier gating
  - web/mobile differences
  - image/video mode transitions
  - moderation and rate-limit failures
  - generated post URLs and history/readback ambiguity
  - download/materialization surfaces that may differ from chat artifacts
- The official API remains useful reference material for expected media
  concepts, but it must not drive the first implementation slice.
- xAI API image/video support should remain a later adapter path after the
  browser workbench path has discovery, status sensing, and artifact readback.

## First Implementation Slice

Add a browser-first Grok Imagine discovery/audit slice:

- use the managed Grok browser profile through browser-service-owned
  dispatcher/control-plane paths only
- discover whether the signed-in account exposes Imagine on web
- record the actual entrypoint, labels, routes, and visible controls
- classify available generation modes:
  - text-to-image
  - image-to-video
  - text-to-video if exposed on web
  - edit/variation/favorites/history if exposed
- identify run-state evidence:
  - generation pending/in-progress
  - moderation/rate-limit/account-gated failures
  - terminal image visible
  - terminal video visible
- identify artifact materialization paths:
  - download buttons
  - image/video URLs
  - post URLs
  - cacheable DOM media elements
- compare visible preview tiles against the provider-owned full-quality
  download path before deciding which artifact should be canonical
- expose discovery through the existing workbench capability report before
  adding provider invocation
- keep API image/video execution as a documented later adapter path

## Non-Goals

- No xAI API implementation in this slice.
- No blind Grok Imagine prompt submission. Browser image/video invocation must
  pass capability preflight and use the pinned submitted tab plus run-state
  evidence.
- No image editing, video editing, reference-image workflows, or extensions.
- No automated infinite-scroll harvesting beyond the currently visible,
  bounded tile set until the preview/full-quality comparison path is proven.
- No fallback from browser to API when the browser account is missing Imagine.
- No claim that API support means browser Imagine is available.

## Acceptance Criteria

- Plan 0049 and roadmap clearly select browser-first Grok Imagine discovery as
  the next Grok implementation step.
- [x] Browser discovery remains read-only and dispatcher-owned.
- [x] Tests cover Grok Imagine capability projection from captured/browser
  discovery evidence.
- Docs state that xAI API image/video support is deferred, not the current
  implementation target.
- Live browser audit uses the managed Grok browser profile and stops on
  account gating, moderation walls, or human-verification pages.
- [x] One bounded live read-only Grok browser capability probe records the
  current account posture without invoking Imagine.
- [x] Operators can request bounded browser diagnostics for Grok capability
  discovery without raw CDP access or prompt submission.
- [x] Operators can explicitly inspect Grok `/imagine` read-only through the
  workbench capability surface before invocation exists.
- [x] Grok `/imagine` diagnostics can classify account gating, blocked,
  pending, terminal image/video, and visible materialization evidence without
  submitting a prompt.
- [x] Grok browser image invocation is guarded by capability preflight so
  account-gated accounts fail before prompt submission.
- [x] Account-gated Grok browser image attempts record a pre-submit
  `capability_unavailable` timeline event and preserve the matching
  workbench capability evidence for operator status/readback.
- [x] Grok `/imagine` diagnostics preserve bounded visible tile evidence for
  the current masonry/filmstrip surfaces.
- [x] Grok `/imagine` diagnostics do not treat passive `Upgrade to SuperGrok`
  upsell text as an account gate when usable controls or generated media are
  visible.
- [x] Grok materialization can download all currently visible generated tiles
  through the active browser tab and compare one preview against the
  provider-owned full-quality download-button path before falling back to
  remote media fetch.
- [x] Grok browser image generation can run through the durable local API
  media-generation service path and be read back through both media-generation
  status and generic run status.
- [x] MCP media/workbench tools use the configured browser-backed service
  bundle rather than default no-executor services.
- [x] Grok browser image runs do not treat public gallery/template media as a
  completed generated artifact; success requires generated account media.
- [x] Stable Grok public/template terminal media with no generated account
  image gets a specific `media_generation_no_generated_output` failure instead
  of a generic timeout.
- [x] Grok prompt submission emits submit-path diagnostics so operators can
  distinguish pending/generated/template/blocked post-send states.
- [x] Live Grok submit-path dogfood records `submit_path_observed` and terminal
  no-generated-output status through the local API status path.
- [x] Explicit Grok Video-mode discovery records composer/input requirements,
  generated-media selector counts, and materialization-control evidence without
  submitting a prompt.
- [x] Grok browser video requests have a durable pre-submit executor skeleton
  that records Video-mode evidence and fails before prompt insertion.
- [x] Grok video post-submit acceptance criteria classify pending,
  terminal generated video, public/template reuse, and materialization
  candidates without enabling Submit.
- [x] Grok video readback decisions produce reusable timeline payloads and
  materialization candidate selection from fixture evidence without enabling
  Submit.
- [x] Grok video wait-loop and remote materialization primitives are covered
  by fixture tests and do not invoke prompt submission or route navigation.
- [x] Grok video readback primitives are wired to a diagnostic-only executor
  branch behind explicit metadata, while normal callers remain pre-submit
  gated.
- [x] The diagnostic Grok video readback branch bypasses service-level
  capability preflight so no entrypoint discovery or Video-mode mode-audit
  side effects can occur before existing-tab attachment.
- [x] The diagnostic Grok video readback branch requires a DevTools port with
  the tab target id, so existing-tab polling cannot fall back through
  browser-service target resolution.
- [x] Operators have a bounded manual runbook for validating status/readback on
  a human-submitted Grok Imagine video tab without enabling automated Submit.
- [x] The diagnostic Grok video readback branch can materialize a generated
  account video through the existing tab's selected-media download control
  when direct `assets.grok.com` URL fetches are forbidden.
- [x] Grok browser video requests can submit through the durable local API,
  poll terminal generated-video evidence, cache an MP4 artifact, and read back
  through both media-generation status and generic run status.

## Validation Plan

- [x] Unit tests for Grok Imagine browser-discovery evidence mapping.
- Targeted browser-service/provider tests for dispatcher-owned discovery paths.
- [x] Bounded live read-only managed-browser discovery:
  - `pnpm tsx bin/auracall.ts capabilities --target grok --json`
- Targeted tests for workbench browser diagnostics across CLI/API/MCP/service.
- [x] Bounded live read-only managed-browser diagnostics:
  - `pnpm tsx bin/auracall.ts capabilities --target grok --diagnostics browser-state --json`
- [x] Bounded live read-only managed-browser Grok Imagine entrypoint inspection:
  - `pnpm tsx bin/auracall.ts capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
- [x] Unit tests for Grok Imagine read-only run-state/materialization evidence:
  - `pnpm vitest run tests/browser/grokAdapter.test.ts tests/workbenchCapabilities.test.ts --maxWorkers 1`
- [x] Bounded live read-only run-state dogfood:
  - `pnpm tsx bin/auracall.ts capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --json`
  - first observed the passive-upsell false positive as `run_state =
    account_gated`
  - after narrowing gate detection, observed `run_state = terminal_image`,
    `account_gated = false`, and `grok.media.imagine_image` availability
    `available`
- [x] Unit tests for Grok browser media preflight and guarded executor:
  - `pnpm vitest run tests/mediaGeneration.test.ts tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGenerationGeminiBrowserExecutor.test.ts --maxWorkers 1`
- [x] Unit tests for Grok visible-tile materialization and full-quality
  comparison routing:
  - `pnpm vitest run tests/mediaGenerationGrokBrowserExecutor.test.ts tests/browser/grokAdapter.test.ts --maxWorkers 1`
- [x] Bounded live gated media request:
  - `POST /v1/media-generations` with `provider = grok`, `mediaType = image`,
    `transport = browser`
  - observed on current account: `media_capability_unavailable` before
    `prompt_submitted`
  - returned media id:
    `medgen_8744a7d69a314433bc7d7e67615391e9`
  - timeline contained only `running_persisted` and `failed`
- [x] Bounded live Grok browser image materialization:
  - direct Grok browser media executor prompt:
    `Generate an image of an asphalt secret agent`
  - observed prompt insertion/submission, changed terminal media fingerprint,
    eight visible tile JPEG artifacts, and one provider download-button
    artifact under `/tmp/auracall-grok-live-materialization`
  - first preview and full-quality artifact matched by SHA-256, so the current
    web surface appears to expose full-quality bytes in the visible tile
- [x] Unit tests for configured MCP media/workbench service wiring:
  - `pnpm vitest run tests/mcp.server.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.runStatus.test.ts tests/mcp.workbenchCapabilities.test.ts --maxWorkers 1`
- [x] Bounded durable local API Grok browser image request:
  - `POST /v1/media-generations?wait=false` with `provider = grok`,
    `mediaType = image`, `transport = browser`
  - returned id: `medgen_bb41e86d6d6d4bcea5499bc2c090772c`
  - status polling observed `image_visible` before `completed`
  - media-generation status and generic run status both reported the cached
    artifact
- [x] Regression test for public-template false terminal media:
  - `tests/mediaGenerationGrokBrowserExecutor.test.ts`
  - executor observes a public template image first with
    `generatedImageCount = 0`, waits, then succeeds only after generated
    account media appears
- [x] Bounded durable local API Grok browser image false-success check:
  - returned id: `medgen_3affbd24ef6b4fecb72801a2e78a64c4`
  - observed `terminal_video`/`terminal_image` with `generatedImageCount = 0`
  - failed as `media_generation_provider_timeout`
- [x] Regression test for repeated public-template no-generated-output:
  - `tests/mediaGenerationGrokBrowserExecutor.test.ts`
  - executor emits `no_generated_media` after repeated stable template evidence
    and fails with `media_generation_no_generated_output`
- [x] Submit-path timeline coverage:
  - `tests/mediaGenerationGrokBrowserExecutor.test.ts`
  - verifies `submit_path_observed` flows through media timelines
- [x] Bounded live Grok submit-path dogfood:
  - returned id: `medgen_33cc6d83194a4beba1f91e21566472a1`
  - observed `public_template_no_generated`
  - failed durably as `media_generation_no_generated_output`
- [x] Bounded live Grok composer-submit dogfood:
  - initial reproduction id:
    `medgen_68d57594cbe94fbc853f8e9ea2a3466c`
  - fixed validation id: `medgen_60f410b013da4e3480b57f1f3072d93f`
  - timeline observed `send_attempted.ok = true`, `label = submit`,
    `generated_media`, and four artifacts
- [x] Durable API/MCP status readback on the fixed Grok image path:
  - request id: `medgen_b6d1209802934b5bab20f5cb5f358af7`
  - media status, generic run status, CLI run status, and direct MCP tool
    handlers agree on terminal success and the cached visible-tile artifact
- [x] Bounded read-only Grok video capability discovery:
  - live `/imagine` probe observed Image/Video radio controls
  - `grok.media.imagine_video` is now reported from browser discovery
    evidence
- [x] Bounded read-only Grok video-mode semantics audit:
  - `pnpm tsx bin/auracall.ts capabilities --target grok --entrypoint grok-imagine --diagnostics browser-state --discovery-action grok-imagine-video-mode --json`
  - observed contenteditable composer, disabled Submit, Upload, Aspect Ratio,
    one generated/selected media selector, and no root-state filmstrip/download
    controls
- [x] Unit tests for the Grok video executor skeleton:
  - `pnpm vitest run tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGeneration.test.ts --maxWorkers 1`
- [x] Bounded live Grok video executor skeleton dogfood:
  - returned id: `medgen_5db184cae1ea432aae1e6649beb6ed22`
  - terminal failure: `media_provider_not_implemented`
  - timeline included `capability_selected`, `composer_ready`, and
    `submitted_state_observed` with `submitted = false`
- [x] Unit test for the Grok video post-submit acceptance contract:
  - `pnpm vitest run tests/mediaGenerationGrokBrowserExecutor.test.ts --maxWorkers 1`
  - validates pending/generating evidence, public-template terminal-video
    failure, generated-account video identity, and materialization candidates
- [x] Unit test for the Grok video readback skeleton:
  - `pnpm vitest run tests/mediaGenerationGrokBrowserExecutor.test.ts --maxWorkers 1`
  - validates pending/progress, terminal ready, public-template failure,
    missing-materialization failure, selected-tile candidate selection, and
    future `video_visible` timeline payloads
- [x] Unit test for Grok video polling/materialization primitives:
  - `pnpm vitest run tests/mediaGenerationGrokBrowserExecutor.test.ts --maxWorkers 1`
  - validates existing-tab polling through `getFeatureSignature`,
    no-`runPrompt` behavior, `video_visible`, remote `video/mp4`
    materialization, and terminal missing-candidate failure
- [x] Unit test for the disabled Grok video executor readback probe:
  - `pnpm vitest run tests/mediaGenerationGrokBrowserExecutor.test.ts --maxWorkers 1`
  - validates explicit metadata opt-in, existing-tab polling, no `runPrompt`,
    timeline/status shape, `video_visible`, and artifact materialization
- [x] Service-level unit test for the explicit Grok video readback probe:
  - `pnpm vitest run tests/mediaGeneration.test.ts tests/mediaGenerationGrokBrowserExecutor.test.ts --maxWorkers 1`
  - validates that `grokVideoReadbackProbe = true` skips capability preflight,
    leaves `workbenchCapability` unset, and invokes the executor without
    `capability_discovered`
- [x] Executor unit test for the direct-connect readback contract:
  - validates that missing `grokVideoReadbackDevtoolsPort` fails before
    `BrowserAutomationClient.fromConfig` and before `getFeatureSignature`
- [x] Corrected live direct-connect readback:
  - `medgen_08245dd8c6744e7ba57ea87d241c453b`
  - validated status parity and no-navigation behavior
  - ended with `media_generation_no_generated_output` because only
    public/template video evidence was visible
- [x] Live direct-connect generated-video readback and browser-download
  materialization:
  - initial generated-video probe:
    `medgen_19864cb8180b443ebed3a30c8fc37840`
  - validated terminal generated-video status sensing but failed direct URL
    materialization because the asset URL returned `403` outside the browser
  - fixed validation id:
    `medgen_bc4771f047934deeae2df262c8f41f9b`
  - media status and generic run status agreed on `succeeded`,
    `artifactCount = 1`, and `materialization = download-button`
  - cached `grok-imagine-video-1.mp4` as a `4,877,074` byte artifact
  - post-run `browser-tools inspect` confirmed the Grok tab stayed on the same
    `/imagine/post/...` URL
- [x] Normal durable local API Grok browser video request:
  - initial preflight regression id:
    `medgen_71a1d44956304f83b4f6d97626de6e39`
  - fixed validation id:
    `medgen_ae8dfbd131e346038c4e8bad9a6afcb4`
  - status polling observed pending evidence, terminal `video_visible`,
    `generatedVideoCount = 1`, and `materialization = download-button`
  - media-generation status and generic run status agreed on terminal success
    and the cached `grok-imagine-video-1.mp4` artifact
  - `stat` confirmed a `2,253,656` byte artifact
  - post-run `browser-tools inspect` confirmed the Grok tab stayed on the
    submitted `/imagine/post/...` URL
- [x] Follow-up normal Grok browser video dogfood with browser kept open:
  - initial rerun id `medgen_9fb698483a9840c88fdb5ead8fd8fcd9`
    exposed a route-ready/hydration race where media preflight saw the static
    `unknown` video capability while an immediate explicit Video-mode
    capability probe reported `available`
  - Grok feature-signature discovery now waits for visible Image and enabled
    Video controls before running `grok-imagine-video-mode`
  - fixed rerun id `medgen_11c3fe4fcafe4eb9b55ca49abcff8f35` submitted to
    `https://grok.com/imagine/post/25687eca-0bab-464b-8381-cf6e12296405`
  - status polling observed `pending`, terminal `video_visible` at poll `3`,
    `generatedVideoCount = 1`, and `materialization = download-button`
  - media-generation status and generic run status agreed on terminal success
    with one cached `video/mp4` artifact
  - `stat` confirmed a `3,248,027` byte artifact
  - post-run `browser-tools inspect` confirmed the Grok tab stayed on the
    submitted `/imagine/post/...` URL
- [x] Media status now includes persisted-path diagnostics:
  - `media_generation_status` derives capability preflight, submitted tab,
    provider route progression, latest run-state counts, and materialization
    source from stored timeline events
  - generic `run_status` for media jobs carries the same media diagnostics in
    metadata, so callers can use one route-neutral status surface
  - this does not run browser probes, navigate, reload, or reattach to the
    provider
- [x] API/MCP/status media regression tests:
  - `pnpm vitest run tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGeneration.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.runStatus.test.ts --maxWorkers 1`
- [x] `pnpm run check`
- [x] `pnpm run build`
- [x] `pnpm run plans:audit -- --keep 54`
- [x] `git diff --check`

## Next Slice

Keep Grok edit/reference workflows gated. The next browser slice should move
the same browser-first pattern to the next media parity gap.
