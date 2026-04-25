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
- Grok video, API execution, and edit/reference workflows still fail durably as
  not implemented.
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
  - video remains gated as not implemented
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
- Grok browser video now has a gated executor skeleton:
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
- Grok video post-submit acceptance criteria are now executable, but not yet
  wired to Submit:
  - pending accepts provider `pending`, `generating`, or `progress` evidence
  - terminal success requires `terminal_video` plus generated account video
    evidence, not public/template media
  - public/template video evidence is classified separately as a failure
    class
  - materialization requires generated video `src`/`href` evidence or a
    visible download/open control
  - the canonical media timeline now reserves `video_visible` for terminal
    video observation

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
- No blind Grok Imagine prompt submission. Browser image invocation must pass
  capability preflight and use the pinned submitted tab plus run-state evidence.
- No video generation automation in the first implementation slice.
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
    evidence; video execution remains gated
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
- `pnpm run check`
- `pnpm run plans:audit -- --keep 54`
- `git diff --check`

## Next Slice

Keep Grok video and edit/reference workflows gated. The next browser slice
should wire a no-submit post-submit poll/materialization skeleton against
fixture evidence, then connect the evaluator to the gated executor before any
live video Submit click is enabled.
