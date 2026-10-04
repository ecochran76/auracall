# Plan 0386 renewed installed wrapper control

The operator's renewed `ok go` authorized installation of PR 176 and one bounded
control. Preserve the original five repair cycles/eight probes as history;
this is renewed control 1, historical probe 9. No scheduler resume or prompt.

## Installation and runtime

Fresh origin/main was 500619f6e785b5f14fdf0e1edd29a9d1fdc152da. The owned
canonical worktree was detached there and installed with
pnpm run install:user-runtime-service. Both touched service files matched the
canonical build byte-for-byte; hashes are in the adjacent JSON receipt.
Runtime/browser profile wsl-chrome-3; identity matched eric.cochran@soylei.com.
Remote View desktop 4 retained the exact managed stealth Chromium browser.
The MCP transport was unavailable; its installed launcher was the fallback.
Endpoint was read from the managed browser's DevToolsActivePort, not pinned.

## Installed result

The real installed createLlmService('chatgpt') path ran identity proof, then
materializeConversationArtifacts for conversation
6ab6d340-89e4-83ea-9990-d8fb278993e6. It selected only the cached PDF and
unresolved ZIP. force=false, maxItems=1 as new-transfer budget, single visit,
existing governor preserved, 120-second abort bound. The first context read
refreshed; the repeat explicitly used the just-populated cached context.
Before the run the attachment manifest contained the PDF and no selected ZIP.

Control succeeded from 2026-10-04T02:04:39.310Z to
2026-10-04T02:05:18.204Z, including the terminal warning observation window.
PDF was reused: 2132164 bytes, SHA-256
d5b9b70647bb6ed38c83431ee2476501a4cd33f333203df8713b64828378cf08.
ZIP captured once: Bailey_FY27_Proposal_With_Figures.zip, 1721645 bytes,
application/zip, SHA-256
c463e95ddac8fc739d5f5865986d63a33add63ff87696ec57a06be43bf8a46dc.
ZIP signature is PK0304; CRC check passes with one entry. Both file checksums
match the retained successful files. First-pass manifest agrees with names,
sizes and types: PDF cached-provider-file, ZIP download-button. The per-pass
manifest snapshots are retained because the cached repeat replaces the sidecar.

First pass: one attempted/successful download, zero failures; one target attach
for the read, followed by reuse of that scoped session for transfer; three real
Input.dispatchMouseEvent calls. No Page.navigate/reload occurred in that pass.
Identity proof separately recorded one Page.navigate from ChatGPT home.
First-pass observer saw 176 requests and one Document event. Full page-target
observer window including proof saw 226 requests and two Document events.
These are page-target network events, not all-target HTTP or top-level navigation
counts; mouse telemetry records method counts, not coordinate/event parameters.

Cached repeat: both files checksum-verified and cached-provider-file; zero
downloads, CDP calls, and observed page-target requests/Document events. This
proves the explicit cached repeat and unresolved-asset transfer, not autonomous
scheduler freshness detection against future changes.

A passive observer attached before identity proof and remained through five
seconds after terminal materialization. It inspected visible alerts/dialogs,
verification frames and page title; no warning/verification was observed under
that coverage. No retry or warning dismissal occurred.

## Cleanup and remaining gate

Browser.close ran in finally. Fresh OS census: zero exact managed browser
processes; endpoint 36545 no longer listening. Proof and read/transfer leases
both released as preserved, without waiting for dead-owner maintenance.
Scheduler remains paused, no foreground request. No unrelated runtime/root
worktree or scheduler setting was changed.

Read-only archive searches for the exact ZIP filename and checksum returned
zero matching generated-artifact/asset rows. Direct service/cache success does
not prove provider-generated archive publication. Gate D therefore remains
OPEN for archive projection agreement; queued history-job and autonomous
live-follow acceptance remain unproven. Issue 165 stays open. Next bounded
packet should reconcile the verified cached asset through the normal archive
publication path, preserving the established no-redundant-transfer behavior.

Private harness: /tmp/auracall-plan0386-debug/auracall-renewed-wrapper-control.mjs.
Private full receipt: /tmp/auracall-renewed-wrapper-control.json. The adjacent
sanitized JSON is the durable selected-input/outcome/counter receipt; it omits
raw conversation content and private local file paths.
