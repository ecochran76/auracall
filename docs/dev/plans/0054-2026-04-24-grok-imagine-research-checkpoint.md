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
- The default media executor still fails Grok requests durably with
  `media_provider_not_implemented`.
- No browser-service Grok Imagine workflow is implemented.

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

Implement Grok Imagine through the xAI API first, not through browser
automation.

Reasoning:

- The official API is documented and separates image and video mechanics
  clearly.
- API image generation maps directly into the existing `media_generation`
  executor result shape.
- Browser Grok Imagine is account-tier and UI dependent, and should stay behind
  discovery/reporting until a live surface is intentionally audited.
- Video generation requires a deferred polling loop and temporary artifact
  download semantics, so it should follow the image executor rather than land
  in the same first code slice.

## First Implementation Slice

Add a Grok API image executor:

- select it only when:
  - `provider = "grok"`
  - `mediaType = "image"`
  - `transport = "api"` or `transport` is omitted/`auto`
- require `XAI_API_KEY` or an injected test key/dependency
- call `POST /v1/images/generations` with:
  - `model = request.model ?? "grok-imagine-image"`
  - `prompt`
  - `n = count` when provided
  - `aspect_ratio = aspectRatio` when provided
  - `resolution = size` when provided and it is an xAI image resolution
  - prefer `response_format = "b64_json"` for durable cache materialization
- persist returned images into the media-generation artifact directory
- emit timeline events for provider request, response receipt, and artifact
  materialization
- preserve moderation/model metadata when returned

## Non-Goals

- No Grok browser Imagine automation in this slice.
- No video generation in the first implementation slice.
- No image editing, video editing, reference-image workflows, or extensions.
- No fallback from API to browser when `XAI_API_KEY` is missing.
- No claim that Grok Imagine browser availability is known from API support.

## Acceptance Criteria

- Plan 0049 and roadmap clearly select API image generation as the next Grok
  implementation step.
- Unit tests cover request mapping, missing-key failure, base64 artifact
  materialization, and URL artifact materialization if supported.
- HTTP/MCP media-generation tests prove `provider = "grok"` image execution can
  run through the shared contract with an injected fake transport.
- Docs state that Grok image/video browser support remains gated.
- Live smoke remains opt-in behind `AURACALL_LIVE_TEST=1` and `XAI_API_KEY`.

## Validation Plan

- `pnpm vitest run tests/mediaGeneration.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts`
- New Grok API media executor unit tests.
- `pnpm run check`
- `pnpm run plans:audit -- --keep 54`
- `git diff --check`

## Next Slice

Implement the Grok API image executor only. Defer video until the image path has
durable artifact materialization and status readback.
