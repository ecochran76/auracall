# Grok401 implementation candidate

Core source slice: exact Chats opener with ambiguity refusal; scoped Show All;
bounded page/item/time hydration, cancellation, opaque scope-bound cursors,
positive empty versus unknown/failed coverage, exact-origin conversation identity,
project membership and observed Bot provenance. Coverage is visible UI only;
this does not prove account-wide backfill. Per-page shared admission/warning
settlement remains authoritative. Fresh history no longer overlays cached rows
as evidence of live completeness. Metadata survives title preference merges.

61 targeted tests across4files and typecheck pass. The new6+1 collector/DOM
fixtures are sanitized; no live provider action. Detailed CLI/API/MCP entrypoint
registration, integration review and post-completion TDD remain before acceptance.
Ops status carries counts and bounded reason codes, never chat titles/query/IDs.
