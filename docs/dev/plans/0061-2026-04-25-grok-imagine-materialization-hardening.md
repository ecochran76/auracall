# Plan 0061 | Grok Imagine Materialization Hardening

State: OPEN
Lane: P01

## Purpose

Return from browser-service control-plane hardening to the provider-facing
Grok Imagine materialization path, using the now-proven managed browser
profile, queued dispatcher, and registry-first DevTools authority.

## Current State

- Plan 0054 closed the browser-first Grok Imagine research checkpoint with
  discovery, guarded image/video invocation, submitted-tab status sensing,
  visible-tile/download-button materialization, compact status diagnostics,
  live image/video proofs, and provider-adapter regression tests.
- Plans 0056 through 0060 closed the browser-operation queue/control-plane
  follow-up for browser media and response runs.
- Installed-runtime dogfood on 2026-04-25 proved `auracall-grok-auto` targets
  `~/.auracall/browser-profiles/default/grok` on registry port `38261` while
  Gemini remains isolated on port `45011`.
- Grok Imagine can produce multiple images per prompt. The current default
  capture target is the visible generated-tile set, with a sensible default
  limit of `8` so routine smokes do not scroll-trigger additional generation.
- First Plan 0061 slice: compact media status now preserves checksum and
  preview-vs-full-quality comparison metadata, and the focused adapter
  regression proves multiple visible tiles plus one linked full-quality
  download comparison artifact without live provider work.
- Installed-runtime dogfood on 2026-04-25 created
  `medgen_5daf6d6e792848bda1e980d5d7b10d12` through
  `auracall-grok-auto` and proved the submitted Grok Imagine tab stayed on
  `https://grok.com/imagine`, used DevTools port `38261`, requested the default
  visible-tile limit `8`, and cached five visible-tile image artifacts. The
  same run also showed the installed runtime had not yet picked up the newest
  checksum/full-quality comparison status fields, so that evidence remains a
  source-or-updated-runtime validation item.
- The installed CLI prompt path had a full-program option collision:
  `media generate --prompt ...` was rejected before browser launch when the
  root CLI also owned `-p/--prompt`. The source command now accepts media prompt
  text from the command option, a positional media prompt, or the root prompt
  fallback.
- Updated installed-runtime dogfood on 2026-04-25 created
  `medgen_e455048f119f4fde9ba48bbb8524f194` through the installed CLI after
  refreshing the user runtime. The request stayed on the submitted
  `https://grok.com/imagine` tab and generic `run status --json` surfaced
  artifact checksums, requested visible-tile count, and route diagnostics. The
  run exposed one hardening issue now fixed in source: redacted
  `data:image/...;base64,<omitted ...>` signature values must be skipped rather
  than cached as tiny placeholder artifacts.
- Follow-up installed-runtime dogfood
  `medgen_c96d0cc5f7c44bc9ab094d0f4ecbae98` proved the redacted-data-url fix
  in the installed CLI: no tiny placeholder artifacts were filed. That same
  run reported four generated images but only one materialized visible artifact,
  so live multi-tile capture remains open.
- Current source now records bounded `grokMaterializationDiagnostics` in run
  metadata and the `artifact_poll` timeline: selected tile fingerprints,
  source kind/length/prefix, score/surface, capture outcomes, and
  full-quality download attempted/clicked/file/reason state.
- Installed-runtime dogfood on 2026-04-26 created
  `medgen_549e131d631745ba8a9f5a38164b34d6` after refreshing the user runtime.
  It stayed on `https://grok.com/imagine`, reported
  `requestedVisibleTileCount = 8`, cached five visible artifacts, and proved
  the diagnostics can distinguish four current masonry data-url tiles from one
  remote preview. The full-quality path still reported
  `download-button-missing`.
- Follow-up installed-runtime dogfood
  `medgen_daab8a2e82674e8e8b17ce799a31087b` exposed that remote
  `assets.grok.com` residue can be stale and tiny: it selected a 48 px preview
  even though run state reported generated images. Source now rejects tiny
  remote Grok generated assets as visible-tile and download-selection
  candidates unless they are displayed as substantial previews; current
  data-url/blob masonry outputs remain eligible.
- Installed-runtime dogfood after installing `9912cd3a` created
  `medgen_47fae2a0df8e4ed9999d1955b6a67d69` and proved the thumbnail guard in
  the user runtime: the run materialized four artifacts, all selected tiles
  were current `data-url` masonry images at `272x426`, and no stale remote
  thumbnail was counted.
- Remaining live gap: the installed smoke did not produce a linked
  full-quality download-button comparison artifact. The newest diagnostics
  show the download path selects the first current masonry tile
  (`f1c111415ebdbfa6`) but finds zero download-button candidates, so the next
  slice should discover the provider action surface after tile activation.
- Source follow-up: full-quality download discovery now activates likely
  masonry tile wrapper ancestors, not just the `img` node, and records bounded
  post-activation action-button labels. This preserves the browser-service
  control-plane path while making the next live miss actionable without extra
  ad hoc DOM probing.
- Live validation gate: before retesting the action-surface patch, manually
  clear the managed Grok browser profile. A read-only browser-tools check found
  `auracall-grok-auto/grok` on a Google Accounts password challenge for
  `ecochran76@gmail.com` with "Too many failed attempts", so further live
  automation would only churn the auth blocker.

## Scope

- Audit the current Grok Imagine materialization path against the live
  installed-runtime behavior.
- Harden multi-image materialization so the default visible-tile count is
  honored consistently across CLI, local API, MCP, status, and cache metadata.
- Prefer submitted-tab, no-navigation readback and materialization; do not load
  immature conversation ids or re-navigate after prompt submission.
- Compare preview-tile capture and full-quality provider download for at least
  one selected generated image, then record whether full-quality download is
  materially different from the visible preview artifact.
- Keep all CDP interactions behind browser-service dispatcher/control-plane
  paths or explicit raw-debug escape hatches.

## Non-Goals

- No xAI API image/video execution.
- No Grok edit/reference/image-editing/video-editing workflows.
- No routine Gemini video live testing.
- No broad media contract redesign beyond materialization/count/status
  correctness for Grok Imagine.

## Acceptance Criteria

- A browser-backed Grok image generation request can materialize multiple
  visible generated images with default count `8` when the provider exposes
  enough visible generated tiles.
- Status/readback surfaces report requested count, materialized artifact count,
  materialization method, cache paths, and any preview-vs-download comparison
  evidence.
- The provider adapter never re-navigates after prompt submission while waiting
  for generated media or materializing artifacts.
- A focused regression test covers visible-tile multi-artifact materialization
  and full-quality download comparison metadata without live provider work.
- One narrow installed-runtime dogfood run proves the live path after focused
  tests pass.

## Validation Plan

- Focused Grok adapter/media executor tests for multi-tile materialization and
  preview/download comparison metadata.
- `pnpm exec tsc --noEmit`
- Installed-runtime `auracall run status <id> --json` check for checksum and
  preview-vs-full-quality fields after `pnpm run install:user-runtime`.
- `pnpm run plans:audit -- --keep 61`
- `git diff --check`
- One installed-runtime Grok browser smoke after unit/type validation, using
  `auracall-grok-auto` and the existing managed `default/grok` profile.

## Definition Of Done

- Grok Imagine image materialization is reliable enough for routine dogfood
  through the durable media-generation contract without reopening
  browser-service control-plane work.
- Any remaining provider/API/edit/reference work is explicitly deferred to a
  new bounded plan instead of being added to this slice.
