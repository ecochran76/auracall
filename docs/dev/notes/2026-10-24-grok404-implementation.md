# Grok Connector discovery implementation — #404

Parent: [Plan0452](../plans/0452-2026-10-24-grok-upgrade-spec.md),
[#404](https://github.com/ecochran76/auracall/issues/404).
Worker branch: `feat/grok-404-connectors`.
Source base: `f1b2463b1` (fast-forwarded from `1299787d9`).
Status: provider-free implementation; coordinator registration/review and
installed/live acceptance remain separate gates.

## Public behavior

`createGrokConnectorsService(options)` requires configured provider authority,
its annotated existing Grok connection, a matching target, owned backend request
admission and provider-session authorization. It reuses `connectToGrokTab` and
`checkGrokBrowserAuthPreflight`; it does not clone browser bootstrap or create a
second traffic ledger. A governed `provider-read` surrounds discovery. Identity
is verified on the same transport before and after observation, and account
change rejects the result. Transport/owned-target cleanup is awaited. Unknown transport cleanup retains the
owned target for reconciliation instead of destroying that custody.

The public operations are `list(query?)` and `inspect(selector)`. Structured
requests shared by the CLI/API/MCP handlers are:

```json
{"action":"list","query":"Example","runtimeProfile":"default"}
```

```json
{"action":"inspect","selector":{"endpoint":"https://mcp.example.test/mcp","kind":"installed"},"runtimeProfile":"default"}
```

These examples describe handler contracts, not proof that an installed CLI or
HTTP route has been registered. The coordinator owns aggregator registration,
runtime configuration resolution, shared Ops status and operator entrypoint docs.

Installed connections and catalog entries are separate arrays/kinds. IDs are
`null` when the DOM does not expose a provider ID; display names never become
entity IDs. Name matching is exact for inspection, and multiple matches refuse
ambiguity. Exact endpoint selection examines at most ten matching visible rows;
an incomplete scan cannot yield a unique-match claim or prove absence. The
inventory is bounded to 100 visible rows and always reports incomplete account
coverage. A query uses the scoped observed `Search...` input with value readback
and restoration; returned rows remain visible-only coverage.

The reader finds the authoritative Plugins dialog by its Connectors tab, checks
selected-tab state, and scopes every row and detail action. It refuses unrelated
already-open nested dialogs. It opens only an exact observed row handle whose
name still agrees; handles are temporary DOM references, never public entity
IDs. Detail reading uses a separate nested dialog, checks its name, expands
`See more` at most three times (hard maximum ten when configured directly),
stops on unchanged results, and closes only its own named detail through a
unique Close/Back control. Missing/ambiguous cleanup controls produce incomplete
output. It never activates Add, Reauthenticate or Disconnect.

Inventory/detail status is `complete`, `incomplete`, `account-gated` or `failed`.
A failed/missing dialog cannot become a successful empty list. Visible tool
coverage can be complete while overall detail remains incomplete because the
external connection account or endpoint is unobserved. Missing tool headings,
unexpanded tools, row/scan/tool limits and identity drift stay explicit. A
complete detail requires observed tools, endpoint, connection account and
connected UI evidence; it is not a successful tool invocation or OAuth grant.

## Privacy and identity

`providerAccountRef` hashes the verified Grok account identity. `accountRef`
separately hashes an explicitly observed external connection email label;
descriptive row text is not treated as account identity. Unknown external
account/auth state stays unknown. A Reauthenticate button alone is not evidence
that reauthentication is required. Disconnect is connected-UI evidence, not
proof that a granted token is valid or that particular scopes were granted.

`endpointRef` is SHA-256 of the exact valid HTTP(S) endpoint string, including
query/fragment. Exact endpoint matching compares this reference; URL
normalization never silently merges identities. A readable URL is emitted only
for HTTPS conventional `/mcp` or `/sse` paths without credentials, query or
fragment. Other valid endpoints retain only their exact reference. Malformed
Server URL text cannot establish endpoint identity. Output contains bounded
names/tool identifiers, no descriptions, account emails, tokens, headers, raw
DOM, browser objects or raw error causes. Aggregate Ops diagnostics contain
counts, status/coverage, auth state and identity-presence booleans only.

## Source evidence and limits

[The dated survey](2026-10-24-grok-ux-survey.md) and its existing private
`plugins.json`/`connector-detail.json` capture supplied semantic anchors:
Plugins, Connectors, Search..., Connected/Added/Add, nested detail,
Reauthenticate, Disconnect, All tools enabled, See more and Server URL.
No private captured account content was copied into Git. Captures contain text
and control projections, not row HTML; controlled fixture hierarchy and generic
Close/Back semantics are explicitly synthetic. Tests execute the real DOM
expressions through controlled CDP, and do not establish current live hierarchy,
Close/Back availability, virtualized/paginated completeness or installed service
behavior. Search can return partial results while provider rendering is still
in progress; incomplete visible coverage never establishes account-wide absence.

No live browser/provider command, authentication, installation, invocation,
Mail Receipts read, credential access, deployment or tracker mutation ran.
No transport grant/scope or installed/live acceptance is claimed. Installation,
OAuth and invocation belong to #405/#406 or their later execution packets.

## TDD and validation receipt

Stable seams: the public CDP client protects semantic inventory/detail/search and
privacy; the public service protects configured authority, target/account
continuity and cleanup; public command/MCP handlers protect schema/result parity
and diagnostic/error privacy. These do not qualify a live provider session.

Vertical red/green commands, each run with `--maxWorkers=1`:

- `pnpm vitest run tests/browser/grok404Connectors.test.ts --maxWorkers=1`:
  initial missing module; then observed duplicate-name, expansion, endpoint
  selection, missing tool heading, account completeness, malformed endpoint and
  provider search failures before their implementations passed.
- `pnpm vitest run tests/browser/grok404ConnectorsService.test.ts --maxWorkers=1`:
  initial missing module; wrong observed account and mid-read account switch
  first resolved incorrectly, then rejected after the respective repairs. Unknown
  transport cleanup initially closed the owned target, then retained it after
  the custody repair.
- `pnpm vitest run tests/browser/grok404ConnectorsSurfaces.test.ts --maxWorkers=1`:
  initial missing module; private transport error initially escaped, then became
  a bounded failed receipt; provider-account identity initially absent, then
  appeared only as a hash after verification.

Final focused selection:

`pnpm vitest run tests/browser/grok404Connectors.test.ts tests/browser/grok404ConnectorsService.test.ts tests/browser/grok404ConnectorsSurfaces.test.ts --maxWorkers=1`

Expected final inventory: 3 files, 18 tests, focused/provider-free, no retries.
The worker closeout reports the observed final result after staging. Also run
`pnpm typecheck`, focused Biome check on the eight TypeScript files, and
`git diff --cached --check`.
`pnpm typecheck` initially failed only on the coordinator-owned missing
`connectToGrokTab` export; after fast-forwarding `f1b2463b1` that check passed.
Later final checks bind the delivered source slice. No full suite or live tier
was run. CodeGraph was initialized as instructed (1,111 files); the graph missed
the private connection symbol, so focused current source inspection supplied
that seam. Generated graph data is ignored and not part of this commit.

## Coordinator wiring

1. Resolve `GrokConnectorsRequestSchema` and the chosen runtime profile through
   the existing configured Grok service options (including traffic authority and
   provider-session authorization); pass them to `createGrokConnectorsService`.
   Do not call the service with bare browser endpoint options.
2. CLI/API use `runGrokConnectorsCommand(input, service)` for structured output
   and bounded failures; `formatGrokConnectorsFailure` is available for resolver
   failure before a service exists.
3. Register `registerGrokConnectorsTool(server, resolveService)` where the resolver
   accepts the parsed request and returns the configured service. The tool name
   is `grok_connectors`.
4. Use `summarizeGrokConnectorDiagnostics(result)` for aggregate Ops projections.
   Do not copy the full inventory/detail into aggregate telemetry.
5. Update shared operator docs, journal/fixes, integration ledger and acceptance
   disposition. This worker changed only its explicitly assigned new files.

Memory disposition: forbidden — the coordinator owns substantive closure and
its memory/ledger disposition; this delegated worker performed no memory write.
