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
- No blind Grok Imagine prompt submission until discovery selectors and
  run-state evidence are captured.
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

## Validation Plan

- [x] Unit tests for Grok Imagine browser-discovery evidence mapping.
- Targeted browser-service/provider tests for dispatcher-owned discovery paths.
- [x] Bounded live read-only managed-browser discovery:
  - `pnpm tsx bin/auracall.ts capabilities --target grok --json`
- `pnpm run check`
- `pnpm run plans:audit -- --keep 54`
- `git diff --check`

## Next Slice

Implement Grok browser Imagine discovery first. The first code slice should
report whether the managed Grok account exposes Imagine and which image/video
controls are visible, without submitting a generation request.
