# T06: Inspect Grok Connector catalog and installed state

Status: published, OPEN, ready-for-agent (subject to blockers).
Issue: https://github.com/ecochran76/auracall/issues/404
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

List/search Connectors and inspect endpoint, account, auth state and tool inventory without conflating catalog and installed connections.

## Blocked by

- T02: Admit owned Grok backend requests before dispatch — https://github.com/ecochran76/auracall/issues/400

## Acceptance criteria

- [ ] Nested Plugins/Connectors dialogs and expanded tools are handled with explicit coverage.
- [ ] Installed, catalog, incomplete, account-gated and failed states remain distinct.
- [ ] Exact endpoint/entity identity survives duplicate names and ambiguous rows.
- [ ] CLI/API/MCP discovery and Ops diagnostics are privacy bounded.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.

Publication approved explicitly in chat after breakdown review. Actor, canonical
URL, full body, OPEN state, labels and blockers were individually read back.
Native sub-issue/dependency mutations are outside the configured action registry;
parent and blocker URLs in the issue body are the supported relationship record.
