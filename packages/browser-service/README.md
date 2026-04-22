# @ecochran76/browser-service

Reusable browser automation substrate for Chrome/Chromium DevTools workflows.

This package is currently developed inside the Aura-Call monorepo and is still
marked `private`, but it is intended to become independently launchable later.
The goal is to keep the package boundary explicit now so that future extraction
does not require rediscovering what is generic versus what is Aura-Call-specific.

## Purpose

`@ecochran76/browser-service` owns the generic browser mechanics that should be
useful across multiple host applications:

- Chrome launch / connect / shutdown helpers
- DevTools port resolution and process checks
- managed profile state helpers
- browser instance registry utilities
- generic UI interaction and readiness helpers
- structured DOM inspection and page probing
- manual-login and browser session runner seams

Provider semantics, product CLI behavior, and application-specific DOM logic do
not belong here.

## Current package status

- package name: `@ecochran76/browser-service`
- source entry: [`src/index.ts`](./src/index.ts)
- module type: ESM
- current status: internal/private monorepo package

## What lives here

Core generic browser utilities:

- [`chromeLifecycle.ts`](./src/chromeLifecycle.ts)
- [`portSelection.ts`](./src/portSelection.ts)
- [`processCheck.ts`](./src/processCheck.ts)
- [`profileState.ts`](./src/profileState.ts)
- [`utils.ts`](./src/utils.ts)
- [`types.ts`](./src/types.ts)

Service-layer helpers:

- [`service/browserService.ts`](./src/service/browserService.ts)
- [`service/profile.ts`](./src/service/profile.ts)
- [`service/profileDiscovery.ts`](./src/service/profileDiscovery.ts)
- [`service/portResolution.ts`](./src/service/portResolution.ts)
- [`service/stateRegistry.ts`](./src/service/stateRegistry.ts)
- [`service/instanceScanner.ts`](./src/service/instanceScanner.ts)
- [`service/selectors.ts`](./src/service/selectors.ts)
- [`service/ui.ts`](./src/service/ui.ts)
- [`service/types.ts`](./src/service/types.ts)

Package-owned developer tooling:

- [`browserTools.ts`](./src/browserTools.ts)
  - tab census
  - page probe / doctor
  - structured DOM search
  - structured UI listing (`ls`)
  - navigation / eval / screenshot / pick / cookies / inspect / kill

Provisional higher-level seams:

- [`manualLogin.ts`](./src/manualLogin.ts)
- [`loginHelpers.ts`](./src/loginHelpers.ts)
- [`login.ts`](./src/login.ts)
- [`client.ts`](./src/client.ts)
- [`sessionRunner.ts`](./src/sessionRunner.ts)

Platform support utilities:

- [`windowsLoopbackRelay.ts`](./src/windowsLoopbackRelay.ts)
- [`platformPaths.ts`](./src/platformPaths.ts)

## What stays in host apps

Examples of logic that should remain outside this package:

- LLM/provider adapters
- provider DOM selectors and semantics
- cache policies and provider cache ownership
- product CLI command semantics
- session formatting and product logging conventions
- app-specific auth/account heuristics

In Aura-Call terms, this means ChatGPT/Grok/Gemini workflows stay in the app
layer, while generic browser mechanics stay here.

## Stable vs provisional surface

### Stable

These exports are the intended durable core:

- Chrome lifecycle helpers
- port/process/profile-state helpers
- `BrowserService`
- service/profile/registry/instance-scanner helpers
- generic UI helpers in [`service/ui.ts`](./src/service/ui.ts)
- structured page/browser inspection helpers in [`browserTools.ts`](./src/browserTools.ts)
- core shared types

### Provisional

These are useful, but the host-integration boundary may still change:

- manual login workflow
- login helpers
- client wrapper
- browser session runner

Host apps should prefer the stable surface unless they explicitly need one of
the provisional seams.

## Browser-tools surface

The package owns a generic DevTools helper program builder in
[`browserTools.ts`](./src/browserTools.ts):

- `tabs`
- `probe`
- `doctor`
- `ls`
- `search`
- `nav`
- `eval`
- `screenshot`
- `pick`
- `cookies`
- `inspect`
- `kill`

Inside Aura-Call, this is exposed through the thin compatibility wrapper:

- [`../../scripts/browser-tools.ts`](../../scripts/browser-tools.ts)
- [`../../scripts/browser-service/browser-tools.ts`](../../scripts/browser-service/browser-tools.ts)

That wrapper adds Aura-Call-specific runtime-profile and managed-browser-profile
resolution, but the generic DOM/page inspection behavior is package-owned.
The `scripts/browser-service/` directory groups browser-service-related
development wrappers while preserving the historical root script paths.
When an operation lock root is configured, `browser-tools` acquires dispatcher
ownership for both managed browser profile commands and explicit raw
DevTools-port commands. Port-only diagnostics use a raw endpoint key such as
`devtools:127.0.0.1:45013`.
Legacy direct-CDP development scripts in Aura-Call are guarded separately and
require an explicit `--allow-raw-cdp` flag or `AURACALL_ALLOW_RAW_CDP=1` escape
hatch.

## Current anti-bot boundary

The package now classifies blocking pages first-class through structured
`blockingState` output in browser-tools page probes and tab-census entries.
Manual-clear decisions must consider the full browser tab census, not only the
selected page, because hidden tabs can preserve provider anti-bot redirects
while another visible app tab still looks healthy. Current generic coverage
includes:

- Google `google.com/sorry`
- CAPTCHA / reCAPTCHA
- Cloudflare interstitials
- generic human-verification pages

The package should keep owning generic blocking-page classification and probe
contracts. Provider-specific recovery/cooldown policy should stay in host apps.

## Example

```ts
import { BrowserService } from '@ecochran76/browser-service';

const service = new BrowserService(resolvedConfig, {
  resolveBrowserListTarget: async () => undefined,
  pruneRegistry: async () => {},
  launchManualLoginSession: async () => {
    throw new Error('Host app must provide manual login launch behavior.');
  },
});

const target = await service.resolveDevToolsTarget({ ensurePort: true });
if (target.port) {
  const { client } = await service.connectDevTools();
  await client.close();
}
```

## Non-goals

- no provider-specific cache model
- no ChatGPT/Grok/Gemini DOM policy
- no product CLI UX
- no application-specific project/conversation semantics
- no assumption that one host app owns all browser state

## Related docs

- internal package boundary note:
  [`../../docs/dev/browser-service.md`](../../docs/dev/browser-service.md)
- current generic backlog:
  [`../../docs/dev/browser-service-upgrade-backlog.md`](../../docs/dev/browser-service-upgrade-backlog.md)
- current generic tools notes:
  [`../../docs/dev/browser-service-tools.md`](../../docs/dev/browser-service-tools.md)
