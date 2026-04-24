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
- Grok video, API execution, and edit/reference workflows still fail durably as
  not implemented.
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
- expose discovery through the existing workbench capability report before
  adding provider invocation
- keep API image/video execution as a documented later adapter path

## Non-Goals

- No xAI API implementation in this slice.
- No blind Grok Imagine prompt submission. Browser image invocation must pass
  capability preflight and use the pinned submitted tab plus run-state evidence.
- No video generation automation in the first implementation slice.
- No image editing, video editing, reference-image workflows, or extensions.
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
  - observed `run_state = account_gated`, no pending generation, and no
    terminal generated media promotion from the public gallery
- [x] Unit tests for Grok browser media preflight and guarded executor:
  - `pnpm vitest run tests/mediaGeneration.test.ts tests/mediaGenerationGrokBrowserExecutor.test.ts tests/mediaGenerationGeminiBrowserExecutor.test.ts --maxWorkers 1`
- [x] Bounded live gated media request:
  - `POST /v1/media-generations` with `provider = grok`, `mediaType = image`,
    `transport = browser`
  - observed on current account: `media_capability_unavailable` before
    `prompt_submitted`
  - returned media id:
    `medgen_8744a7d69a314433bc7d7e67615391e9`
  - timeline contained only `running_persisted` and `failed`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 54`
- `git diff --check`

## Next Slice

Keep Grok video and edit/reference workflows gated. The next browser slice
should dogfood the new Grok image preflight through the local API on the current
account, confirm it stops before prompt submission while account-gated, and
then harden terminal materialization for available accounts with provider
download-control support instead of relying only on remote media URLs.
