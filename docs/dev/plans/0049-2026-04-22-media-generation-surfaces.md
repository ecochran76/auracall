# Media Generation Surfaces | 0049-2026-04-22

State: OPEN
Lane: P01

## Scope

Implement first-class image/video generation across Aura-Call's operator
surfaces instead of treating provider media tools as ad hoc browser-only
helpers.

## Current State

- Gemini has a browser `--generate-image <file>` path that drives Gemini web
  and saves the first generated image.
- Gemini's web UI exposes a `Create Image` tool in the tool drawer; Aura-Call
  does not yet have a reusable browser-service media operation that selects the
  tool drawer explicitly and reports media artifacts through the runtime.
- Grok Imagine image/video generation is not implemented.
- The generic API text path does not produce media artifacts for Gemini or
  Grok.
- The local `api serve` and MCP surfaces now expose the shared durable
  media-generation request/response contract and fake-provider test seams.
  Provider-backed Gemini/Grok execution is still gated on adapter wiring.

## Target Contract

- Add one route-neutral media request contract that can represent:
  - provider: `gemini` or `grok`
  - media type: `image` initially, `video` once Grok Imagine video is added
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
- Keep provider-specific mechanics in provider adapters:
  - Gemini API adapter uses an image-capable model/configuration and persists
    returned inline image data or generated image URLs.
  - Gemini browser adapter selects `Create Image` in the tool drawer before
    submitting image prompts.
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
- Gemini API image generation works when the configured API key/model supports
  image output, with browser `Create Image` retained as a separate provider
  path.
- [x] Local API can create and read back one media generation request with durable
  artifact metadata through an injected fake executor.
- [x] MCP exposes equivalent media generation execution for agents through the
  same contract and service handler.
- Gemini image generation selects the explicit `Create Image` tool path when
  using the browser surface.
- Grok Imagine implementation is either green for image generation or remains
  explicitly gated with a provider/API credential blocker.
- Docs state which provider/media combinations are implemented, gated, or not
  yet available.

## Validation Plan

- [x] Unit tests for media request schema, routing, and artifact readback.
- Provider-adapter tests for Gemini tool-selection intent and Grok Imagine
  request mapping.
- [x] Local API smoke for create/readback on a fake provider.
- [x] MCP smoke for the same fake provider path.
- Live Gemini image smoke only after managed-profile state is clear of
  `google.com/sorry` or captcha pages.
- Live Grok Imagine smoke only with a configured `XAI_API_KEY` or validated
  browser account path that exposes Imagine.
