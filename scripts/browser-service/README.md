# Browser-Service Script Family

This directory groups browser-service-related development scripts without
breaking the historical `scripts/<name>.ts` entrypoints.

The files here are thin wrappers around the existing root scripts. That is
intentional:

- existing docs, shell history, and package scripts keep working
- browser-service tooling has a discoverable family directory
- AuraCall-specific Grok/provider verification helpers do not move into
  `packages/browser-service`, because many still import app/provider code from
  `src/browser/providers`

Normal browser diagnostics should prefer:

```bash
pnpm tsx scripts/browser-service/browser-tools.ts --port <port> tabs
```

Legacy direct-CDP wrappers preserve the same escape hatches as their root
scripts:

```bash
pnpm tsx scripts/browser-service/verify-grok-project-menu.ts --allow-raw-cdp
AURACALL_ALLOW_RAW_CDP=1 pnpm tsx scripts/browser-service/inspector.ts
```

Use the root paths only for backward compatibility. New documentation should
prefer this directory for browser-service-related scripts.
