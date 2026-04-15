# BrowserService Refactor Phase 2 Plan

## Goal
Formalize the `browserService` base layer so browser automation is reusable outside Oracle while preserving existing behavior.

## Scope (Phase 2)
- Define the `browserService` interface and minimal concrete implementation.
- Centralize shared browser utilities under the base layer.
- Keep LLM-specific logic in place (no `llmService` yet).

## Deliverables
- `browserService` interface + base class with stable hooks.
- Minimal adapter-facing handle (`BrowserServiceHandle`) for providers.
- Consolidated browser utility module(s) used by CLI, scripts, and adapters.
- Documentation of the base API surface and extension points.

## Proposed Structure

### Core Types
- `BrowserServiceConfig`
  - chromePath, profilePath/profileName, cookiePath, display, keepBrowser
  - debugPort, debugPortRange, registryPath override
  - wslChromePreference, remoteChrome host/port
- `BrowserSession`
  - host, port, profileIdentity, pid (required), lastSeenAt
- `BrowserCapabilities`
  - supportsMultipleTabs, supportsProfiles, supportsCookies, supportsHeadless

### Base Class
`class BrowserService`
- `static fromConfig(config): BrowserService`
- `resolveSessionTarget(): BrowserSession`
- `ensureSession(): BrowserSession`
- `connectDevTools(): ChromeClient`
- `navigate(url, options?)`
- `findTargets(filter?)`
- `withPage(fn)`
- `close()` (optional; respects keepBrowser)
- `resolveCredentials()` (stub; returns null or a structured hint)

### Utilities (moved under browserService)
- registry handling + pruning
- port selection + WSL host resolution
- profile discovery + cookie resolution
- UI helpers: waitForDialog, clickByLabel, visible elements, scroll helpers
- credential helper stubs (config/env placeholders for future integration)

## Implementation Steps

1) **Define the browserService API**
   - Add types in `src/browser/service/types.ts`.
   - Create a base class in `src/browser/service/browserService.ts`.
   - Document extension points and expected behavior.

2) **Move shared utilities under browserService**
   - Move registry + port resolution into `src/browser/service/session.ts`.
   - Move profile discovery + cookie resolution into `src/browser/service/profile.ts`.
   - Move UI helpers into `src/browser/service/ui.ts`.

3) **Wire existing code to the base class**
   - `BrowserAutomationClient` becomes a thin wrapper around `browserService`.
   - CLI and scripts call the base service for session/port handling.
   - Providers accept a `BrowserService` instance (or a minimal interface) rather than re-resolving ports.

4) **Document the public surface**
   - Add `docs/dev/browser-service.md` describing the base class and invariants.
   - Update `docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md` with Phase 2 exit criteria.

## Validation (No Regressions)
- CLI: `projects`, `conversations`, `login`, `doctor` all run using the new base class.
- Scripts: `scripts/verify-grok-selectors.ts`, `scripts/inspector.ts`, `scripts/grok-dom-smoke.ts` still resolve sessions via shared helpers.
- No direct registry/port logic exists outside the base layer.

## Exit Criteria
- `browserService` is the single entry point for session/port/profile logic.
- Existing commands and scripts behave the same.
- Base class is documented and ready for `llmService` in Phase 3.

## Status (2026-01-12)
- `BrowserService` base class + handle are in place and used by adapters/scripts.
- Registry, port selection, profile discovery, and UI helpers live under `src/browser/service/`.
- Profile name resolution is normalized (friendly name → on-disk directory) across config, registry, and port lookup.
- Remaining: keep model-selection fallback work in Phase 3; no further Phase 2 changes required.
