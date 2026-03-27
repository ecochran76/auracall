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
- Session helper utilities (generic DOM helpers)
- DevTools inspection helpers and generic tab-selection diagnostics
- Explainable tab resolution helpers (`instanceScanner.explainTabResolution`)
- Generic readiness / hydration waits (`ui.waitForPredicate`, `ui.waitForDocumentReady`)
- Package-owned developer diagnosis tools (`browserTools tabs`, `probe`, `doctor`)
- Versioned JSON contracts for package doctor/probe output (`version: 1`)
- Manual login session helper (config injected by host app)
- Core browser session runner (host app supplies prompt assembly + error handling)

## What Stays In Oracle
- LLM service adapters and DOM workflows
- Cache policies and list/refresh semantics
- CLI behaviors and logging conventions
- Oracle-specific config parsing and defaults
- ChatGPT-specific selectors, cookies, and DOM debugging helpers
- Session reattach flows and ChatGPT recovery logic

## Integration Notes
- Oracle keeps thin wrappers for registry path and default profile directory ("~/.auracall").
- Package APIs accept injected defaults to avoid coupling to Oracle config.
- Environment variables:
  - Preferred: `BROWSER_SERVICE_*`
  - Backward compatible (Oracle): `AURACALL_*` (do not remove yet; still referenced by existing configs/scripts)

## Current Exports

Stable:
- `chromeLifecycle` helpers: `launchChrome`, `connectToChrome`, `registerTerminationHooks`,
  `resolveWslHost`, `resolveUserDataBaseDir`, `reuseRunningChromeProfile`
- `portSelection`, `processCheck`, `profileState`, `utils`
- `service`: `BrowserService`, `stateRegistry`, `instanceScanner`, `profile`, `profileDiscovery`,
  `portResolution`, `ui`, `types`
- Core `types`
- Generic DevTools helpers in `browserTools`, including tab census/selection explanation

Provisional:
- `manualLogin`, `loginHelpers`, `login`
- `client`
- `sessionRunner`

## Example (External Use)
```ts
import { BrowserService } from '@ecochran76/browser-service';

const service = new BrowserService(resolvedConfig, {
  resolveBrowserListTarget: async () => undefined,
  pruneRegistry: async () => {},
  launchManualLoginSession: async () => {
    throw new Error('Implement launchManualLoginSession for your host app.');
  },
});

const target = await service.resolveDevToolsTarget({ ensurePort: true });
if (target.port) {
  const { client } = await service.connectDevTools();
  await client.close();
}
```

## API Stability
- Stable: chrome lifecycle + port selection + registry/profile helpers, `BrowserService`, core types.
- Provisional: login helpers, manual login workflow, session runner core, browser client core.
- Oracle wrappers should prefer stable APIs unless a provisional feature is required.

## Wrapper Audit (Oracle)
- Oracle wrappers bind registry path and default profile directory, but do not reimplement browser-service logic.
- Any non-LLM generic browser helpers should remain in this package.

## Non-Goals
- No LLM-specific caching, project/conversation logic, or DOM selectors.
- No product CLI parsing or Aura-Call-specific end-user prompts. Package-owned
  developer tooling such as `browser-tools` is allowed when it stays generic.
