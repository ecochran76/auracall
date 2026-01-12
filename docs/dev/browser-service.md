# BrowserService Base Layer

## Purpose
`browserService` is the reusable browser automation core. It is service-agnostic and domain-agnostic, providing session management, profile/cookie handling, and DevTools connectivity. Oracle-specific LLM behavior lives in `llmService` (Phase 3).

## Invariants
- **Single source of truth** for session/port resolution: registry → config → env fallback.
- **Profile identity** is `{ profilePath, profileName }`.
- **Registry first**: live sessions are resolved via the registry, not ad-hoc port probes.
- **PID required** for registry entries to avoid stale session reuse.

## Core Types
- `BrowserServiceConfig`
  - Chrome path, profile path/name, cookie path, display, keepBrowser.
  - Debug port/range, WSL preference, remote Chrome host/port.
- `BrowserSession`
  - host, port, profileIdentity, pid, lastSeenAt.
- `BrowserCapabilities`
  - supportsMultipleTabs, supportsProfiles, supportsCookies, supportsHeadless.

## Base Class Surface
`class BrowserService`
- `fromConfig(config)`
- `resolveDevToolsTarget({ ensurePort, launchUrl })`
- `connectDevTools()`
- `resolveCredentials()` (stub; future password/OTP helpers)

## Adapter Interface
Service adapters should depend on a minimal handle instead of direct registry/port logic:
- `BrowserServiceHandle` (config access, DevTools target resolution, connectDevTools, credentials stub)

## Utilities
Located under `src/browser/service/`:
- `session.ts`: registry + port resolution
- `profile.ts`: profile discovery + cookie resolution
- `ui.ts`: DOM helper utilities

## Notes
- `manualLogin` will be renamed to `interactiveLogin` (or `loginMode`) with legacy alias mapping.
- Headless/headful should be controlled in browserService, not service adapters.
