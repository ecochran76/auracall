# Phase 6: Browser-Service Hardening + Integration Cleanup

## Goals
- Stabilize the public API surface of `@ecochran76/browser-service`.
- Remove remaining generic browser helpers from Oracle where they do not depend on LLM DOM logic.
- Improve test coverage for the browser-service package (unit tests for profile/port/registry helpers).
- Ensure Oracle wrappers stay thin and do not reintroduce browser-service responsibilities.

## Non-Goals
- No new provider DOM features or cache behavior changes.
- No release/publish process changes yet (handled in a later phase).
- No removal of `ORACLE_*` env aliases (still supported for backwards compatibility).

## Deliverables
- A verified, minimal browser-service API (exports list finalized + documented).
- Remaining generic helpers moved from `src/browser` into browser-service where appropriate.
- Package-level unit tests for core helpers (profile state, port selection, registry, WSL utilities).
- Updated docs describing the finalized package surface + integration guidance.

## Work Plan

### 1) API surface review + export stabilization
- Inventory `packages/browser-service/src/index.ts` exports and ensure every export is generic.
- Confirm no LLM-specific naming appears in the browser-service package (types, errors, logs).
- Add explicit notes in `docs/dev/browser-service.md` on stable vs experimental APIs.
- Decide on any missing exports that Oracle wrappers currently re-export but should come from the package directly.
- Reference: `docs/dev/browser-service-registry-plan.md`.

### 2) Move remaining generic helpers
- Scan `src/browser/index.ts` for helpers that are not ChatGPT/Grok specific and move to browser-service:
  - DevTools connectivity helpers (if any remain).
  - WSL/Windows filesystem utilities used for profile/temp handling.
- Update Oracle wrappers to import the new helpers from browser-service.
- Ensure the Oracle wrapper retains the `.oracle` registry path binding and defaults.

### 3) Package tests
- Add unit tests under `packages/browser-service/tests` (or equivalent) for:
  - `profileState` (DevToolsActivePort reading/writing, PID validation).
  - `portSelection` (range selection and fallback behavior).
  - `stateRegistry` read/write/cleanup flow (temp dir).
  - `chromeLifecycle` utilities that do not require launching Chrome (e.g., WSL host detection).
- Ensure tests are hermetic and do not require a live browser.

### 4) Oracle wrapper sanity + doc sweep
- Confirm Oracle wrappers are thin adapters (no duplicate logic).
- Update `docs/dev/browser-service.md` and `docs/dev/browser-service-refactor-phase-5.md` with any API changes.
- Add a short usage snippet in the docs that shows external use (connect + resolve port).
 - Record wrapper audit results (no duplicate generic logic found; wrappers only bind registry path/config defaults).

### 5) Verification
- Run `pnpm run typecheck`.
- Run `DISPLAY=:0.0 pnpm tsx scripts/test-browser.ts`.
- Optional: `pnpm test:grok-smoke` if selectors were touched.

## Exit Criteria
- No Oracle-specific types/log messages in the browser-service package.
- Oracle wrappers call into browser-service for all generic session/profile helpers.
- Tests passing for browser-service core helpers.
- Docs updated and reflect the final API surface.
