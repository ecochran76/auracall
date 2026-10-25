# Grok #405 Connector installation source seam

Status: partial source implementation; not installed, not publicly wired, no live
acceptance. Implements the custom-form dispatch seam for Plan0452 / issue #405.
The primary agent owns service/governor/journal/public wiring and shared journal,
fix-log and operator-doc integration. This note is the delegated lane artifact.

`src/browser/providers/grokConnectorInstallation.ts` exports:

- `validateGrokConnectorInstallationInput(input)` validates and whitelists
  `{kind: custom|catalog, name, endpoint?, connectorId?, accountRef?}`. Names are
  bounded; custom URLs require exact canonical HTTPS with no credentials, query
  or fragment. Optional Connector account references are SHA-256 hex digests.
- `createGrokConnectorInstallationClient(runtime, options)` takes the same owned
  CDP Runtime, caller cancellation, verified `providerAccountRef`, and optional
  asynchronous `beforeCommit` admission callback.
- `prepare(input)` reads current observed installed endpoints/names, blocks
  conflicting identities, opens the surveyed New Connector form and fills exact
  Name/Server URL. It never clicks Add Connector. Its token is client-local.
- `commit(prepared)` synchronously consumes that exact token before asynchronous
  admission, verifies owned form/values/current inventory, and dispatches Add
  Connector at most once. Transport/cancellation uncertainty returns unconfirmed
  and fences fresh prepare for the same tuple. It never automates OAuth consent.
- `reconcile(input)` performs only observations/navigation through discovery. An
  exact matching form with authentication text yields awaiting-human. Unrelated
  auth dialogs cannot establish continuation custody.

Outcomes expose status, stable code, validated input, provider account reference,
possible dispatch, optional prepared token and observed Connector readback.
`grantedScopesObserved:false` with `grantedScopes:[]` means grants are unobserved;
it does not assert zero permissions. Server advertisements never become grants.

## Hard boundaries and remaining gates

The survey established neither stable catalog entity/consent identity nor actual
saved account/entity/grant readback. Built-in catalog selection therefore returns
`grok_connector_install_catalog_identity_not_observed`; no inferred catalog ID is
activated. Existing matching endpoints/names without exact account evidence stay
unconfirmed. The current discovery reader cannot establish complete account or
saved entity/grant evidence, so this implementation does not emit completed.
Visible inventory is a bounded observation, not complete account inventory proof.
It checks all observed installed rows (at most ten), refusing missing endpoint
identity, truncation or pagination. No disconnect/replacement occurs.

Before any public use, the service must verify same-transport provider account,
wrap every DOM interaction in existing ownership/request governance, persist an
account+endpoint operation journal **before** commit, and fence unknown effects
across new clients/processes/restarts. Client-local tokens alone do not provide
durable custody. A later reconcile with incomplete evidence cannot authorize a
retry. Public installation and the Mail Receipts qualification remain open.

## Focused validation

Stable seam: installer public prepare/commit/reconcile over injected CDP running
real DOM expressions against sanitized fixtures. This proves dispatch/custody
behavior; it cannot prove provider transport, OAuth, endpoint compatibility,
saved identity or actual grants.

TDD command: `pnpm vitest run tests/browser/grok405Installation.test.ts --maxWorkers=1`.
Observed red before green for missing validation/module, missing orchestration,
unrelated OAuth attribution, vanished-form unknown replay, and concurrent commit
admission (two Add clicks before synchronous token reservation; one afterward).
Final focused command includes `tests/browser/grok404Connectors.test.ts` and
passes 25 tests in two files (eight installation tests, 17 discovery regressions).
`pnpm exec tsc --noEmit --pretty false` passed. Focused Biome lint and
`git diff --check` passed without diagnostics.
No provider/browser/service/resource/controller tools or credentials were used.

Memory disposition: forbidden — delegated source-only scope does not authorize
an external memory write. This canonical note is provenance for any later
separately authorized qualified closeout.

## Renewed execution: durable public installation path

The resumed branch `feat/grok-405-resume` starts at `83e0951e8` and preserves
this initial source seam in commit `b732f2e76` (cherry-pick of `66e1b4327`).
Ticket #405 remains open: this packet does not establish native provider acceptance.

`createGrokConnectorInstallationService` now composes the existing configured
Grok transport, provider traffic governor and exact same-transport account proof
with prepare/commit/reconcile. `install` requires explicit confirmation and the
exact `providerAccountRef` emitted by Connector discovery. The same command
contract reaches CLI, MCP and the existing operator-authorized HTTP endpoint.
The service verifies account identity again immediately before Add and afterward.

A private `0600` journal under `~/.auracall/private/grok/connector-installations/`
claims each account/endpoint intent exclusively before opening the installation
flow. The record is synced and atomically replaced before dispatch. A subsequent
call only reconciles its retained target; it never retries Add. Account/endpoint
fencing spans runtime profiles, while target reconciliation requires the original
runtime profile. Missing/corrupt journals or changed inputs/custody stop recovery.
No journal reset or automatic retry surface is added. Process restart is covered;
this does not claim power-loss durability on every filesystem.

A possibly committed effect, awaiting-human continuation, or transport cleanup
uncertainty retains the target. Public outcomes preserve `effectDispatched`,
`retrySafe=false`, `operationId` and `targetId`; Ops retains only whitelisted
status/count/identity-presence and effect flags. Diagnostic persistence failure
cannot replace the provider outcome. Installation progress is stored independently from inventory progress, so a
later list does not erase pending human/unknown custody. Internal preparation
tokens never cross public interfaces. Catalog install remains explicitly unsupported because the
survey supplied no stable built-in entity/consent controls. No scopes are inferred
from tool metadata; `grantedScopesObserved` remains false without actual evidence.
An exact existing connection also requires an observed stable ID, connected auth,
complete tool coverage, endpoint and account identity.

Focused red/green receipts:

- `pnpm vitest run tests/browser/grok405InstallationService.test.ts --maxWorkers=1`:
  initially failed because the production service did not exist; then passed.
- The same command observed the public install action returning discovery failure
  before CLI/MCP schema wiring, then passed after wiring.
- The final-form guard regression observed `effectDispatched=true` despite zero
  Add clicks; after correction it reports false.
- The cross-runtime-profile regression observed two Add clicks after an uncertain
  first effect; account/endpoint journaling reduced this to one.
- HTTP exercises the real installation service, requires confirmation before
  service resolution and returns the same retained-target human-continuation state.

Remaining acceptance: actual saved provider entity ID and connected account,
observed OAuth continuation/granted scopes, native tool catalog, and built-in
installation behavior. No live install, consent, OAuth, disconnect or replacement
was executed. Source fixtures, installed executable identity and live provider
outcomes remain separate gates. The public path is operational source progress,
not grounds to close #405 or unlock #406.

Final validation command: `pnpm vitest run tests/browser/grok405InstallationService.test.ts tests/browser/grok405Installation.test.ts tests/browser/grok404Connectors.test.ts tests/browser/grok404ConnectorsService.test.ts tests/browser/grok404ConnectorsSurfaces.test.ts tests/http.grokDiscovery.test.ts --maxWorkers=1`.
The initial combined run recorded one HTTP test timeout (dynamic server import
inside its five-second test window); moving that import to collection fixed the
setup cost without raising the timeout. A subsequent later-inventory regression
observed loss of pending installation status, then passed with independent Ops
progress storage. Typecheck, targeted Biome lint, `git diff --check` and parser-only
`pnpm tsx bin/auracall.ts grok-connectors --help` passed. Final focused result: 44 tests passed across six files. `pnpm run build` passed
(compiler, operator UX, console UX and vendor packaging); no installation or
full-suite result is claimed. The coordinator records the integration identity
after its own reconciliation.

A final public-result regression observed MCP `isError=false` for an
awaiting-human installation. The shared outcome classifier now makes incomplete
installation actionable (`isError=true` / nonzero CLI exit) while preserving
structured status and retained-target custody. HTTP keeps its structured body.
Memory disposition: forbidden; no explicit user request authorizes memory writes.


## Plan0458 native preparation repair

The approved exact custom-Connector canary initially refused before Add because
an existing endpoint could not be observed. Native inspection showed an inert
parent Plugins dialog and an Escape-only nested detail, which the prior
controlled fixture did not model. Cleanup now reads only its own activation
marker from the inert parent and verifies owned Escape dismissal. It never
activates Disconnect, Reauthenticate or tool permission controls.

An explicit confirmed install can continue one recorded unsupported
`grok_connector_install_existing_endpoint_unobserved` preparation refusal with
`effectDispatched=false` and `retrySafe=true`. A permanent exclusive continuation
claim fences concurrent callers and repeated attempts. All other existing
intents remain observation-only; no journal reset/removal is provided.
Source tests establish this behavior, including concurrent one-Add continuation;
this does not establish OAuth/entity/catalog/grants acceptance.
