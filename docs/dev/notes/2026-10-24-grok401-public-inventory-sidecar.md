# Grok #401 public inventory sidecar

Worker base: `48b373f52897e6fa5706049b6fd2f7cb73d2a305`.
Branch: `feat/grok-404-connectors` (continued by explicit coordinator assignment).
Primary owns history core, adapter, aggregators, Ops persistence and closure.
This slice adds only the public inventory service/command/MCP modules and
uniquely named tests/receipt. Governing scope: Plan0452 and #401.

## Contract and wiring

- `createGrokConversationsService(governedOptions, dependencies?)` exposes
  `list({projectId?,query?,cursor?,limit?,since?,maxPages?,timeoutMs?})`.
- Every result is `{object:'grok_conversation_inventory',items,coverage}`.
  Coverage is the exact `GrokHistoryCoverage` observed from the adapter on
  successful reads, including explicit empty/incomplete results with zero rows.
  Missing coverage cannot become a successful empty array.
- `GrokConversationsRequestSchema` and `grokConversationsInputShape` add optional
  `runtimeProfile` to the above request. `runGrokConversationsCommand(input,
  service)` validates the request, dispatches the public service and bounds
  failures. `grokConversationsFailureResult(projectId?, reason?)` creates an
  empty failed envelope and restricts failure reasons to a fixed allowlist.
- `registerGrokConversationsTool(server, resolveService)` registers
  `grok_conversations`; `createGrokConversationsToolHandler(resolveService)` is
  available for independent registration/testing. Resolver receives the parsed
  request, including runtimeProfile, before the service call.

The coordinator should resolve options through existing
`resolveGrokReadSessionOptions(config,runtimeProfile,abortSignal)`, then construct
this service. It must register CLI/HTTP/MCP entrypoints and update shared docs.
Request fields map to existing `historySearch`, `historyCursor`, `historyLimit`,
`historySince`, `historyMaxPages`, `historyTimeoutMs`; omitted fields preserve
configured option defaults. Project scope is passed explicitly to the existing
history reader. No cache overlay/fallback or alternate transport was added.

Use the final returned `result.coverage` for the shared Ops progress projection,
including failure. This overwrites any provisional core progress when account
verification or cleanup subsequently fails. The existing progress writer strips
cursor values and content; do not persist the full envelope in aggregate Ops.
The caller's `onHistoryInventory` callback receives the final qualified coverage,
not intermediate rows or unqualified progress.

## Authority, failure and custody

The service reuses exported `connectToGrokTab`,
`checkGrokBrowserAuthPreflight` and `listHistoryConversations`; no browser bootstrap,
identity verification, cursor or collection algorithm was copied. It requires
an annotated Grok governor with owned backend admission and the exact connected
target. A provider-read action surrounds same-transport configured positive
identity checks and the real history read. Identity is checked before and after
collection. Any identity mismatch returns zero rows/counts and a null cursor.

Read, authority, account, missing-coverage, cancellation, progress and cleanup
failures remain structured failed coverage; raw thrown messages never appear in
public receipts. Cleanup failure is explicitly `history-cleanup-unconfirmed`.
Unknown annotated socket/request-authority cleanup retains the owned target for
reconciliation, preserving the existing ledger fence. No retry or synthesized
success follows an ambiguous close. Items and cursor are discarded after cleanup
failure even if collection itself succeeded.

A completed visible inventory remains bounded by the core's source/scope/reason;
this public envelope makes no account-wide backfill claim. IDs/content appear
only in the requested successful inventory, never in identity-failure output or
MCP summary text. Failure receipt timestamps are current observations, not proof
of provider state.

## Validation and limits

The TDD public seams were introduced with observed missing-module reds for the
service and command/MCP modules, then their focused tests passed. Additional
behavior checks exercise the real exported adapter and collection core through
controlled CDP: explicit empty versus incomplete zero-row coverage, opaque cursor
resume, configured account switch, unknown cleanup with retained target, CLI/MCP
envelope parity, invalid bounds before dispatch and private resolver-error
suppression. The stable boundary is the service or command/MCP handler; no auth
helper or history callback is mocked.

The transport fixture executes real identity and history-page DOM expressions.
Generic Show All dispatch is a scripted CDP protocol response; the Chats opener
and physical UI action acceptance remain in the primary's tests. The fixture
starts with a visible Chats dialog. Synthetic DOM proves the exercised source
orchestration, not installed/live selectors or account-wide inventory.

Focused command:

`pnpm vitest run tests/browser/grok401ConversationServiceSidecar.test.ts tests/browser/grok401ConversationSurfacesSidecar.test.ts tests/browser/grokHistoryInventory.test.ts --maxWorkers=1`

Observed: 3 files, 15 tests passed, 2.94 seconds, focused/provider-free, no retries.
The selected existing history-core file is included; this is not the full suite.
Focused Biome on the six new TypeScript files passed with no warnings/errors.
`pnpm typecheck` passed after correcting the controlled CDP fixture response
type to include `RemoteObject.type`; the initial failure was fixture typing,
not a source-service error. A final rerun of the two new sidecar test files
passed 8 tests after that correction. Staged diff checks passed.
CodeGraph could not resolve the newly exported history symbol; current named
adapter/core source supplied that seam. No generated graph files are committed.

No live browser/provider action, credential access, install, external messaging,
tracker mutation, nested agent or deployment ran. Installed/live acceptance and
all shared aggregator/ledger/journal changes remain coordinator-owned.

Memory disposition: forbidden — coordinator owns substantive closure and memory
routing; this sidecar performed no independent memory write.
