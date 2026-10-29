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

## Structured public entrypoints

CLI `grok-conversations`, operator-authorized POST `/v1/grok/conversations/query`,
and MCP `grok_conversations` return `{object,items,coverage}`, including zero-row
empty/incomplete/failed states. Configured resolvers reuse exact Grok options and
record final coverage after account-continuity/cleanup decisions. Scope-bound
cursors do not claim backend or account-wide backfill. Legacy array listing keeps
per-row coverage and fresh history avoids cached evidence substitution. Legacy
provider listing now checks account before/after and refuses DOM extraction errors.

66 tests across6files and typecheck pass. Post-completion TDD found filesystem
name overflow for200-character runtime IDs; hashed projection filenames fix it.
The same real filesystem check confirms extra fields and opaque cursor contents
do not reach Ops. CLI/API/MCP public envelope checks retain explicit empty
coverage. Source-only proof; native selectors/installed adoption remain separate.
