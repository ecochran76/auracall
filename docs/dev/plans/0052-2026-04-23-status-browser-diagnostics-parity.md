# Status Browser Diagnostics Parity | 0052-2026-04-23

State: CLOSED
Lane: P01 maintenance

## Scope

Extend bounded browser diagnostics from runtime inspection into the generic
status surfaces that operators already poll for mixed run types.

The dogfood trigger was a direct Gemini response run on
`auracall-gemini-pro`: it completed through the Gemini cookie/web client before
`runtime-runs/inspect` could observe an active managed-browser workbench. The
media-generation path is where Gemini keeps a long-lived managed browser tab and
records `tabTargetId`, so status diagnostics need to work there too.

## Current State

- `GET /v1/runtime-runs/inspect?...&diagnostics=browser-state` works for
  active runtime steps.
- `GET /v1/runs/{id}/status` is the route-neutral operator polling surface for
  response chats and media jobs.
- `GET /v1/media-generations/{id}/status` is the compact media-specific status
  surface.
- Gemini browser media generation records prompt-submission timeline details,
  including `tabTargetId`, before artifact polling begins.

## Non-Goals

- Do not expose raw DevTools or arbitrary page evaluation through status.
- Do not make terminal run status pretend to have live browser evidence.
- Do not navigate or refresh Gemini during diagnostics.
- Do not replace `runtime-runs/inspect`; keep it as the richer runtime queue
  inspection surface.

## Implementation

- `GET /v1/runs/{id}/status?diagnostics=browser-state` adds optional
  `browserDiagnostics` for active browser-backed response or media runs.
- `GET /v1/media-generations/{id}/status?diagnostics=browser-state` adds the
  same bounded browser snapshot for active browser-backed media jobs.
- MCP `run_status` and `media_generation_status` accept optional
  `diagnostics: "browser-state"`.
- Media-generation records now persist the selected AuraCall runtime profile in
  metadata so diagnostics can resolve the same browser profile family.
- Media diagnostics prefer the provider `tabTargetId` recorded in generation
  metadata or timeline details.

## Acceptance Criteria

- [x] Generic API run status accepts opt-in browser diagnostics.
- [x] Media-generation API status accepts opt-in browser diagnostics.
- [x] MCP status tools accept the same opt-in diagnostics flag.
- [x] Media diagnostics return honest `unavailable` for terminal or
  non-browser jobs.
- [x] Media diagnostics can use prompt-submission `tabTargetId` for active
  Gemini browser media jobs.

## Validation

- [x] `pnpm run check`
- [x] `pnpm vitest run tests/mediaBrowserDiagnostics.test.ts tests/http.mediaGeneration.test.ts tests/mcp.mediaGeneration.test.ts tests/mcp.runStatus.test.ts tests/mcp.schema.test.ts`
- [x] Guarded live API smoke exercised
  `GET /v1/media-generations/{id}/status?diagnostics=browser-state` on
  `medgen_4bf95e87bb594929aa51578ca7a2564a`:
  - initial status diagnostics proved the API route could reach the Gemini
    browser family, but the snapshot happened before Gemini prompt submission
    and therefore had no `tabTargetId`, spinner evidence, or generated media
    evidence
  - the implementation was tightened after that finding: active media
    diagnostics now return `unavailable` until prompt submission records a
    provider browser tab target
  - the media job later failed with `media_generation_failed` before a
    `prompt_submitted` timeline event was persisted, so this proves API
    reachability and honest diagnostics posture, not successful image
    generation

## Follow-Up

- A follow-up dogfood run exposed that `api serve` loaded raw config and did
  not apply the selected AuraCall runtime profile before constructing HTTP,
  workbench, and media services; media records therefore persisted
  `runtimeProfile: "default"` even when the server was started for
  `auracall-gemini-pro`.
- Fixed in the follow-up slice: `api serve` now forwards CLI options into
  config resolution and logs the active AuraCall runtime profile at startup.
- Rerun one guarded Gemini browser image request with
  `auracall --profile auracall-gemini-pro api serve ...`, then require a
  `prompt_submitted` timeline event before accepting the diagnostics snapshot
  as active-tab proof.
