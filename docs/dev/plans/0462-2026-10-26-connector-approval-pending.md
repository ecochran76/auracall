# Plan0462 — Connector approval pending (#377)

State: OPEN
Branch: fix/issue377-tool-approval
Target: main
Work item: ecochran76/auracall#377
Base: ce140802491bbc5801b283853bae132f6eb8b90f

## Current State

Current source and installed reconstructed-UI replays pass; no trustworthy historical red exists. Both response wait call
sites already supply the approval handler. Retained original session confirms
allow-once, standard thinking and a180-second timeout, but contains no approval
observations, model log output or timestamped DOM. The retained browser has no
page title matching the original OpenSign run. Source outcome is not yet qualified.

## Bounded packet

Owner: primary agent; serialized. Existing tests/browser/chatgptToolApproval.test.ts
will compose the actual response wait and approval DOM expression at a fake CDP
boundary using the operator-reported card text. Label this reconstructed UI,
not captured DOM. Preserve manual policy, ownership, exact one-time action,
warning stops and no-duplicate behavior. Isolate response/approval seam first;
then rank predictions if a real red is established. At most three materially
different replay/observation attempts before reporting the missing boundary.

Inspect original session and retained ledger evidence read-only. Never equate
pending upload with no earlier effects. No new draft/tool submission, approval
click, warning clearance, provider retry, service restart, CI or unrelated Grok
work. Keep raw artifacts outside Git. Historical HTTP429 attribution requires
request-level evidence; explicitly retain unknown attribution when absent.

## Acceptance

Actual running-response regression red before repair, then green; delayed and
replacement cards remain exact, manual and warning controls preserved. Source
validation and review precede commit. Installed acceptance is a separately
operator-authorized bounded execution after original effect reconciliation.
If reported text/current source cannot reproduce and no trustworthy DOM exists,
close the diagnostic packet with precise missing evidence rather than inventing
a repair. Issue closure requires full stated acceptance and is not inferred.


## Packet result

See `docs/dev/notes/2026-10-26-issue377-approval-evidence.md`. Both source and
installed real response/approval paths pass the reconstructed reported-card
fixture (two cases;291ms bodies). No current retained approval card was found.
Original session lacks approval/DOM/request trace. Ledger preserves two429
warning events and one overlapping operation with73backend reservations, but
endpoint and exact session linkage are missing. No root-cause attribution or
production repair is qualified. Temporary test edits were saved privately and
removed from the source suite. Asked for the original conversation URL to inspect
read-only. No live approval, upload, prompt or warning change occurred.


Missing evidence: exact original conversation URL or contemporaneous failing
DOM/protocol capture. Read-only local cache search returned zero matching rows.
Awaiting operator locator; no further probe is justified without new evidence.
Issue remains open. Diagnostics are preserved as an unintegrated evidence
checkpoint; production and installed code remain unchanged by this packet.
