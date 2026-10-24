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
