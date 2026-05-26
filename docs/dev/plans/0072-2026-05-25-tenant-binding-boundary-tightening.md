# Tenant Binding Boundary Tightening

State: CLOSED
Date: 2026-05-25
Lane: P01

## Context

Recent Gemini reconciliation work exposed an architectural ambiguity that should
be made explicit before more live-follow and artifact materialization work
lands: the tenant is the LLM service account, while browser/runtime profile
fields are execution bindings.

The intended invariant is:

- tenant cache identity = provider service plus bound identity key
- AuraCall runtime profile = config binding that selects service settings,
  expected identity, live-follow policy, and a browser profile
- browser profile / managed browser profile / Chrome executable = operational
  path used to reach that tenant, mostly cookie and launch state
- runtime/browser profile ids in cache, search, archive, status, and campaign
  rows are provenance or current binding evidence unless a specific execution
  contract says otherwise

This matters because moving a tenant from one browser to another should be a
small user-scoped config edit followed by identity smoke, not a cache
migration. The old browser executable or old managed browser profile should not
be treated as owning tenant conversations, artifacts, media, files, or
checksums.

## Current State

Already true:

- README states that account mirror snapshots persist under
  `provider + boundIdentity` and retain runtime/browser profile ids as binding
  and refresh provenance.
- Plan 0063 states the same canonical mirror content key and requires mirror
  storage not to be keyed by agent name, AuraCall runtime profile, or browser
  profile alone.
- `src/accountMirror/cachePersistence.ts` catalog reads build the cache context
  from provider plus `boundIdentityKey`, so catalog content follows the tenant
  identity.
- Tests already include coverage that canonical mirror data is stored by
  provider and bound identity.

Resolved in this slice:

- Account mirror status and reconciliation targets now expose both `tenantKey`
  and `bindingKey`, while retaining `runtimeProfileId`, `browserProfileId`,
  and identity fields for compatibility.
- Catalog and catalog-item readback also carry tenant/binding fields from the
  status target; cache reads still resolve by provider plus bound identity.
- CLI, MCP schemas, the React operator console, and legacy HTML dashboard
  readback now label tenant identity separately from browser/runtime binding.
- Config doctor now warns on duplicate enabled live-follow bindings for the
  same provider plus bound identity across AuraCall runtime profiles.
- Regression tests cover binding moves without catalog migration and prove old
  binding status/backoff state does not suppress tenant catalog visibility.

## Goal

Make the tenant boundary mechanically obvious in docs, code, tests, and
operator surfaces:

- a tenant is `provider + boundIdentityKey`
- an AuraCall runtime profile binds a tenant to service policy and a browser
  profile
- a browser profile and managed browser profile are login-cookie and launch
  state, not cache ownership
- moving a tenant's browser binding is config-only and requires identity smoke,
  not DB migration
- status/backoff records tied to an old runtime/browser binding are displayed
  as stale operational binding state, not tenant data loss

## Non-Goals

- Do not rename every existing public `runtimeProfileId` or
  `browserProfileId` field in one breaking sweep.
- Do not migrate existing account-mirror cache rows, archive rows, or search
  rows when a browser binding changes.
- Do not make cache/catalog/search reads launch browsers to verify a move.
- Do not auto-copy cookies between managed browser profiles. Seeding or login
  remains explicit operator/browser work.
- Do not support two active normal live-follow bindings for the same tenant
  without a visible diagnostic or explicit future failover mode.

## Boundary Contract

### Tenant Key

The tenant key is:

- `provider`: `chatgpt`, `gemini`, `grok`, or a future provider id
- `boundIdentityKey`: configured service identity after normalization

Tenant-owned content includes:

- account-mirror project, conversation, artifact, file, and media catalog rows
- cached conversation contexts and manifests
- materialized asset rows and checksums
- search projection rows derived from account-mirror catalog content

### Binding Key

The binding key is:

- provider
- AuraCall runtime profile id
- browser profile id
- managed browser profile path when available
- optional live DevTools port / launch evidence

Binding-owned state includes:

- current live-follow enablement and policy
- provider guard state and failure/backoff posture for that binding
- dispatcher ownership and last operation ids
- identity-smoke and detected-identity evidence
- launch/browser diagnostics

### Move Semantics

A same-runtime browser move should normally be one config edit:

- change `runtimeProfiles.<name>.browserProfile` or the referenced
  `browserProfiles.<id>` launch fields
- ensure the selected managed browser profile has valid login cookies for the
  tenant
- run `auracall profile identity-smoke --target <provider> --include-negative
  --json`
- run or wait for mirror refresh/reconciliation

A move to another AuraCall runtime profile is also cache-migration-free if the
new runtime profile carries the same provider service identity. The old binding
status may be left as operational history, but the new binding must read the
same tenant catalog by provider plus bound identity.

## Implementation Slices

### 1. Docs And Operator Contract

- Update README terminology near account mirror/live-follow to name `tenantKey`
  and `bindingKey` explicitly.
- Update `docs/browser-mode.md` to state that browser profiles store login
  state and launch defaults, not tenant cache ownership.
- Update `docs/testing.md` with a regression test expectation for moving a
  tenant binding without migrating cache data.
- Add a Plan 0071 note that its target key is campaign execution binding, and
  Plan 0072 owns the stricter tenant/cache boundary.

### 2. Type And Helper Boundary

- Add a small account-mirror helper module or colocated helpers that construct
  normalized tenant and binding keys.
- Prefer names such as `AccountMirrorTenantKey` and
  `AccountMirrorBindingKey` for new internal code.
- Keep existing public fields for compatibility, but have new code pass through
  the helper instead of ad hoc arrays of provider/runtime/browser/identity.
- Make helper tests cover normalization and stable string forms.

### 3. Status And Campaign Readback

- Add `tenantKey` and `bindingKey` fields to account-mirror status entries,
  reconciliation targets, and CLI/MCP/dashboard summaries.
- Label runtime/browser profile ids as binding fields in text output.
- Preserve existing `runtimeProfileId`, `browserProfileId`, and
  `expectedIdentityKey` fields for compatibility.
- Treat persistent status files from old bindings as binding history. Do not
  confuse their absence under a new binding with missing tenant catalog data.

### 4. Config Diagnostics

- Add a config diagnostic for duplicate enabled live-follow tenant bindings:
  same provider plus bound identity across multiple AuraCall runtime profiles.
- Classify this as a warning unless the repo later defines an explicit failover
  or migration mode.
- Ensure diagnostics never print secrets and continue to keep tenant-specific
  values in user-scoped config/runtime state.

### 5. Cache And Reconciliation Regression Coverage

- Add tests proving catalog/search/reconciliation readback finds existing
  account-mirror catalog rows after the runtime/browser binding changes but the
  provider plus bound identity stays the same.
- Add tests proving status/backoff state remains binding-scoped and does not
  suppress tenant catalog visibility after a move.
- Add reconciliation planner coverage that reports same-tenant duplicate
  bindings as operator attention instead of silently treating them as distinct
  cache owners.

## Parallelizable Tracks

- Docs and operator wording can proceed independently from helper/type work.
- Config diagnostics can proceed independently after the tenant-key helper
  exists.
- Dashboard/CLI/MCP labels can proceed after status/campaign readback exposes
  `tenantKey` and `bindingKey`.

## Critical Path

One owner should land the key model first:

1. helper/type boundary
2. status/campaign readback fields
3. regression tests for browser-binding moves
4. docs and dashboard wording cleanup
5. config duplicate-binding diagnostics

## Acceptance Criteria

- README and browser-mode docs explicitly say that tenant cache ownership is
  provider plus bound identity, while browser/runtime profile fields are
  binding/provenance.
- Account mirror status and reconciliation readback expose distinct tenant and
  binding keys without breaking existing fields.
- A deterministic test demonstrates that changing a tenant's browser binding
  does not require cache migration and does not lose catalog visibility.
- A deterministic test demonstrates that binding-scoped status/backoff state
  cannot be mistaken for missing tenant catalog data.
- Config diagnostics warn on duplicate enabled bindings for one tenant.
- `pnpm run plans:audit -- --keep 72`, targeted account-mirror/config tests,
  typecheck, and lint/check gates pass for the implementation slice.

## Closeout Evidence

- Implemented `src/accountMirror/tenantBinding.ts` and threaded
  `tenantKey`/`bindingKey` through account-mirror status, catalog,
  reconciliation, CLI summaries, MCP schemas, `/status` live-follow readback,
  and dashboard tables/inspectors.
- Added duplicate enabled live-follow tenant-binding diagnostics in
  `src/config/model.ts` without printing the bound identity in the diagnostic
  message.
- Added deterministic tests:
  - `tests/accountMirror/tenantBinding.test.ts`
  - binding-move and binding-backoff catalog tests in
    `tests/accountMirror/catalogService.test.ts`
  - reconciliation target readback coverage in
    `tests/accountMirror/reconciliationCampaignService.test.ts`
  - duplicate binding diagnostics in `tests/configModel.test.ts`
- Validation:
  - `pnpm vitest run tests/accountMirror/tenantBinding.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/catalogService.test.ts tests/accountMirror/reconciliationCampaignService.test.ts tests/configModel.test.ts tests/mcp.accountMirrorStatus.test.ts tests/mcp.accountMirrorCatalog.test.ts tests/cli/apiMirrorCompletionCommand.test.ts`
  - `pnpm run typecheck`
  - `pnpm exec biome lint src/accountMirror/tenantBinding.ts src/accountMirror/politePolicy.ts src/accountMirror/statusRegistry.ts src/accountMirror/catalogService.ts src/accountMirror/reconciliationCampaignService.ts src/config/model.ts src/mcp/tools/accountMirrorStatus.ts src/mcp/tools/accountMirrorCatalog.ts src/status/liveFollowHealth.ts src/http/responsesServer.ts src/cli/apiStatusCommand.ts src/cli/apiMirrorCompletionCommand.ts ux/operator/src/App.jsx tests/accountMirror/tenantBinding.test.ts tests/accountMirror/statusRegistry.test.ts tests/accountMirror/catalogService.test.ts tests/accountMirror/reconciliationCampaignService.test.ts tests/configModel.test.ts tests/mcp.accountMirrorStatus.test.ts tests/mcp.accountMirrorCatalog.test.ts tests/cli/apiMirrorCompletionCommand.test.ts tests/runtime.searchProjectionService.test.ts tests/http.responsesServer.test.ts`
  - `pnpm run plans:audit -- --keep 72`
  - `pnpm run check`
  - `git diff --check`

## Definition Of Done

- The operator-facing answer to "can I move a tenant to another browser?" is
  documented as: edit the user-scoped binding, seed/login the managed browser
  profile if needed, run identity smoke, no DB migration.
- Public API/CLI/MCP/dashboard readback makes tenant identity and browser
  binding visually distinct.
- Cache/catalog/search/archive code paths continue to resolve tenant content by
  provider plus bound identity.
- Old runtime/browser status records are retained only as operational binding
  history.
