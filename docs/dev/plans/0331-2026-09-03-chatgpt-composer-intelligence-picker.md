# ChatGPT Composer Intelligence Picker | 0331-2026-09-03

State: CLOSED
Lane: P24
Operational state: INTEGRATED_INSTALLED_LIVE_ACCEPTED
Branch: fix/plan0331-chatgpt-composer-intelligence-picker
Target: main
Integration: merge
Revision: 2 | 2026-09-03

## Stable Objective

Restore ChatGPT browser model and effort selection after the active composer
adopted a combined intelligence picker with a horizontal Power slider, while
preserving safe local-file upload discovery after attachment-row label drift.

## Current State

- Scout's handoff changes for a missing `modelSelector` and a composer-bound
  unrestricted `#upload-files` input are already present on current `main`.
- Manual inspection through retained Chrome PID `1933`, DevTools port `45015`,
  found the active composer picker on all three open conversations. It exposes
  checked model rows for `GPT-5.6 Sol` and `GPT-5.5`, plus a five-position
  horizontal Power slider: Instant, Medium, High, Extra High, Pro.
- An older assistant turn also exposes `aria-label="Switch model"`, but that
  control opens a `Try again` menu. Treating it as a composer model trigger can
  regenerate an old answer instead of selecting the active model.
- Provider-free red/green coverage now scopes model selection to the active
  composer, excludes assistant-turn controls, and maps AuraCall effort levels
  to slider positions 0 through 3.
- A source canary read `GPT-5.6 Sol`, selected Extra High through the actual
  AuraCall expression, and restored the original Pro slider state. No prompt,
  file upload, model-family change, or `Answer now` action occurred.
- The affected cone passes 83 tests, typecheck, production build, scoped
  zero-warning lint, diff hygiene, and the 330-candidate zero-error plan audit.
  The comprehensive suite passes 3,059 tests with 65 policy-skipped tests; its
  sole failure is Plan 0326's documented stale raw-CDP allowlist expectation.
- The user runtime is installed from checkpoint `c9f976f1`. All three changed
  runtime modules, the service manifest, and the already-integrated attachment
  module are byte-identical to the accepted build.
- Installed no-prompt acceptance read `GPT-5.6 Sol`, selected Extra High (3),
  and restored Pro (4). The installed attachment probe returned `ready` with
  `#upload-files` through the composer-local fallback. Chrome PID `1933` still
  owns port `45015`; composers are empty and no generation is active.
- Non-forced merge `cd3e6b68` integrates the accepted topic branch into
  current `main` without touching the unfinished P08/P17 checkout.

## Scope

- Remove assistant-turn `Switch model` controls from the bundled ChatGPT model
  selector manifest and reject any turn-local fallback at runtime.
- Select only a visible model trigger within the active composer.
- Support the current simple-view Power slider and verify `aria-valuenow` after
  selection.
- Preserve older menu/listbox effort selectors as fallbacks.
- Update operator docs and add focused provider-free regressions.
- Install the accepted build and repeat bounded no-prompt readback against the
  retained managed browser.

## Non-goals

- Sending a prompt, uploading a file, changing model family, or clicking
  `Answer now`.
- Automating ChatGPT's assistant-turn retry/model menu.
- Mapping an AuraCall effort alias to the slider's maximum Pro position; the
  four existing levels remain Instant, Medium, High, and Extra High.
- Restarting the API service or taking shutdown ownership of retained Chrome.

## Acceptance Criteria

- [x] Live DOM evidence distinguishes the active composer picker from the old
      assistant-turn retry menu.
- [x] The exact five Power options and selected value are read from the live
      component without inference.
- [x] Model-trigger discovery is composer-scoped and cannot choose an
      assistant-turn `Switch model` control.
- [x] `light`, `standard`, `extended`, and `heavy` map to slider values 0, 1,
      2, and 3 with post-click verification.
- [x] Focused model/thinking-time tests and typecheck pass.
- [x] Production build, affected tests, scoped zero-warning lint, diff hygiene,
      and plan audit pass.
- [x] User runtime installation is byte-identical to the accepted build.
- [x] Installed no-prompt readback passes and restores the original live state.

## Definition of Done

The implementation, docs, and regressions are committed and pushed; installed
runtime bytes match; a bounded installed canary proves composer-scoped model
readback and slider control without prompt submission; retained Chrome remains
healthy at its original DevTools endpoint.
