# Media Generation Compatibility Follow-up | 0055-2026-04-25

State: OPEN
Lane: P01

## Scope

Handle compatibility/API follow-ups that were intentionally split out when
Plan 0049 closed the shared durable media-generation resource.

## Current State

- Plan 0049 is closed for the route-neutral media-generation contract:
  - CLI: `auracall media generate`
  - local API: `POST /v1/media-generations`
  - MCP: `media_generation`
  - status: CLI/API/MCP generic `run_status` plus media-specific status
- Browser-backed Gemini image/music/video and Grok Imagine image/video are
  represented by the shared durable request, timeline, artifact, and status
  contracts.
- The legacy Gemini `--generate-image <file>` path still bypasses the durable
  media-generation record and writes directly through the older Gemini web
  executor.
- Gemini API image execution is not implemented in the media-generation service.
  `transport = api` currently remains a contract shape unless a test seam or
  future provider adapter handles it.
- xAI API image/video execution and Grok edit/reference workflows remain
  outside this plan unless explicitly selected later.

## Target Contract

- Decide whether legacy `--generate-image <file>` should:
  - remain a documented compatibility shortcut, or
  - wrap `auracall media generate --provider gemini --type image` and copy the
    selected artifact to the requested path.
- If wrapping the legacy flag, preserve operator expectations:
  - one output file path remains honored
  - errors still name the provider capability or auth problem clearly
  - no silent API/browser fallback occurs
  - durable media-generation id and artifact cache path remain inspectable
- Add Gemini API image execution only if the configured API key/model path can
  be validated against the current Gemini image-capable API contract without
  weakening the browser `Create Image` path.

## Non-Goals

- No live Gemini video quota spend.
- No xAI API implementation.
- No Grok edit/reference/image-editing/video-editing workflows.
- No broad CLI redesign beyond the legacy image shortcut decision.

## Acceptance Criteria

- Legacy `--generate-image` migration has an explicit decision:
  - compatibility-only with docs, or
  - wrapper over durable media generation with focused tests.
- If wrapped, tests prove the requested file path receives the selected image
  artifact and the durable media-generation record remains readable.
- Gemini API image support is either implemented with focused API adapter tests
  or explicitly deferred with a provider/API blocker.
- README/testing docs identify the preferred CLI media path and any retained
  compatibility shortcut.
- Plan 0049 remains closed and does not absorb more compatibility follow-up.

## Validation Plan

- Unit tests for any legacy `--generate-image` wrapper behavior.
- CLI parser/helper tests for output-path handling if the wrapper is added.
- Focused media-generation service tests for Gemini API image execution if that
  adapter is implemented.
- No routine live Gemini video/music quota spend.
- Live Gemini image smoke only when intentionally validating the legacy wrapper
  or API path on a clean managed browser/profile state.
