# Media Generation Compatibility Follow-up | 0055-2026-04-25

State: CLOSED
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
- Decision on 2026-04-25: keep `--generate-image <file>` as a documented
  compatibility shortcut for direct one-file Gemini browser image saves. Do
  not wrap it over the durable media-generation service until operators need
  both legacy direct file output and durable media ids from the same command.
- Gemini API image execution is implemented in the media-generation service for
  `provider = gemini`, `mediaType = image`, and `transport = api`. The executor
  uses the Google GenAI SDK `models.generateImages` path, defaults to Imagen
  `imagen-4.0-generate-001`, requires `GEMINI_API_KEY`, and caches returned
  inline image bytes into the durable media artifact directory.
- xAI API image/video execution and Grok edit/reference workflows remain
  outside this plan unless explicitly selected later.

## Target Contract

- Legacy `--generate-image <file>` remains a documented compatibility shortcut.
- If a later slice wraps the legacy flag over
  `auracall media generate --provider gemini --type image`, preserve operator
  expectations:
  - one output file path remains honored
  - errors still name the provider capability or auth problem clearly
  - no silent API/browser fallback occurs
  - durable media-generation id and artifact cache path remain inspectable
- Gemini API image execution is separate from the browser `Create Image` path:
  explicit `transport = api` uses Imagen API image generation, while default
  browser media requests continue to use Gemini web tool selection.

## Non-Goals

- No live Gemini video quota spend.
- No xAI API implementation.
- No Grok edit/reference/image-editing/video-editing workflows.
- No broad CLI redesign beyond the legacy image shortcut decision.

## Acceptance Criteria

- [x] Legacy `--generate-image` migration has an explicit decision:
  compatibility-only with docs.
- If wrapped in a later slice, tests prove the requested file path receives the
  selected image artifact and the durable media-generation record remains
  readable.
- [x] Gemini API image support is implemented with focused API executor tests.
- [x] README/testing docs identify the preferred CLI media path and any retained
  compatibility shortcut.
- Plan 0049 remains closed and does not absorb more compatibility follow-up.

## Validation Plan

- Unit tests for any legacy `--generate-image` wrapper behavior.
- CLI parser/helper tests for output-path handling if the wrapper is added.
- [x] Focused media-generation service tests for Gemini API image execution if that
  adapter is implemented.
- No routine live Gemini video/music quota spend.
- Live Gemini image smoke only when intentionally validating the legacy wrapper
  or API path on a clean managed browser/profile state.

## Closure

Plan 0055 is closed. The legacy Gemini `--generate-image <file>` flag remains a
documented compatibility shortcut, and the durable media-generation service now
supports Gemini API image generation through explicit `transport = api`.
Provider API access is parked for current dogfooding, so no live Gemini API
image smoke is required before returning to browser-first work.
