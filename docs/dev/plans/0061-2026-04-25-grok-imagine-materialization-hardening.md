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
