# Browser Service

## Purpose
Provide a reusable, service-agnostic browser automation core that can be embedded in Oracle or other
automation tools. This package focuses on profile/session management, DevTools connection helpers,
registry utilities, and low-level DOM helpers. LLM-specific behavior lives in Oracle.

## Package
- Location: `packages/browser-service/`
- Name: `@ecochran76/browser-service`
- API entry: `packages/browser-service/src/index.ts`

## What Lives Here
- Chrome lifecycle helpers (launch/connect/terminate)
- Port selection + registry helpers
- Profile discovery + cookie path utilities
- Session helper utilities (DOM helpers, debug helpers)
- Manual login session helper (config injected by host app)
- Core browser session runner (host app supplies prompt assembly + error handling)

## What Stays In Oracle
- LLM service adapters and DOM workflows
- Cache policies and list/refresh semantics
- CLI behaviors and logging conventions
- Oracle-specific config parsing and defaults

## Integration Notes
- Oracle keeps thin wrappers for registry path and default profile directory ("~/.oracle").
- Package APIs accept injected defaults to avoid coupling to Oracle config.
- Environment variables:
  - Preferred: `BROWSER_SERVICE_*`
  - Backward compatible (Oracle): `ORACLE_*`

## Current Exports (Partial)
- `launchChrome`, `connectToChrome`, `resolveWslHost`
- `launchManualLoginSession`
- `BrowserService` (core)
- `runBrowserSessionExecutionCore`
- `resumeBrowserSessionCore`
- `profileDiscovery` helpers + registry utilities

## Non-Goals
- No LLM-specific caching, project/conversation logic, or DOM selectors.
- No CLI parsing or end-user prompts.
