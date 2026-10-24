# T06: Inspect Grok Connector catalog and installed state

Status: proposed; not a published implementation issue.
Parent: https://github.com/ecochran76/auracall/issues/398

## What to build

List/search Connectors and inspect endpoint, account, auth state and tool inventory without conflating catalog and installed connections.

## Blocked by

- T02: Admit owned Grok backend requests before dispatch

## Acceptance criteria

- [ ] Nested Plugins/Connectors dialogs and expanded tools are handled with explicit coverage.
- [ ] Installed, catalog, incomplete, account-gated and failed states remain distinct.
- [ ] Exact endpoint/entity identity survives duplicate names and ambiguous rows.
- [ ] CLI/API/MCP discovery and Ops diagnostics are privacy bounded.
- [ ] Validate public behavior with the agreed source/installed/live evidence distinctions; update operator docs and decision traceability.

No live effect is authorized by this draft. Bind exact target and authority in the execution packet.
