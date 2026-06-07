# Oracle Identity Mismatch Self-Healing Plan | 0137-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Fix the Oracle/account-mirror bug where a stale persisted
`identity-mismatch` can keep a live-follow target blocked even after the
current provider app session proves the expected account is signed in.

The triggering case is `chatgpt/wsl-chrome-2`: the configured expected identity
is `consult@polymerconsultinggroup.com`, live ChatGPT auth-session readback
matches that email and Pro personal account, but API status remains blocked
because the persisted account-mirror state from `2026-05-31T08:02:50.016Z`
contains `detectedIdentityKey="consulting pcg pro"`.

## Current State

- `~/.auracall/config.json` binds `profiles.wsl-chrome-2.services.chatgpt` to
  `consult@polymerconsultinggroup.com`.
- `auracall --profile wsl-chrome-2 profile identity-smoke --target chatgpt
  --include-negative --json` currently reports:
  - expected `consult@polymerconsultinggroup.com`;
  - actual ChatGPT auth-session `consult@polymerconsultinggroup.com`;
  - `preflight.ok=true`.
- `auracall api status --json` still reports the live-follow account target as
  `actualStatus=blocked`, `statusReason=identity-mismatch`,
  `lastFailureAt=2026-05-31T08:02:50.016Z`, and
  `consecutiveFailureCount=179`.
- The persisted status file under
  `~/.auracall/cache/account-mirror/status/` stores the expected
  `boundIdentityKey` as the email, but stores `detectedIdentityKey` as the
  display-name/plan shaped string `consulting pcg pro`.
- `statusRegistry.createAccountMirrorStatusSummary()` feeds persisted
  `state.detectedIdentityKey` directly into `evaluateAccountMirrorPoliteness()`.
  The politeness gate blocks whenever normalized detected and expected keys
  differ, regardless of staleness, evidence quality, or newer provider-app
  identity proof.

## Problem Statement

Identity mismatch is a safety stop only when current provider-app identity
evidence proves the browser session is bound to the wrong service account.
It must not become an unrecoverable cache latch.

The current behavior fails in two ways:

- A malformed historical identity key such as `consulting pcg pro` is treated
  with the same authority as a fresh provider-app email mismatch.
- A later successful provider-app identity preflight does not clear or
  supersede the stale account-mirror mismatch state, so status cannot repair
  itself.

Chrome/Google browser profile identity is diagnostic only. The authoritative
identity for ChatGPT live-follow is the ChatGPT provider app session.

## Scope

- Add account-mirror identity evidence semantics that distinguish:
  - provider-app identity;
  - Chrome/Google browser identity;
  - display-name/account-plan labels;
  - stale persisted mismatch state.
- Ensure ChatGPT account-mirror collection writes a canonical email identity
  key when the provider auth session exposes one.
- Make stale or malformed persisted mismatch state recheckable instead of a
  permanent hard block.
- When a live provider-app recheck proves the expected identity, clear the
  mismatch latch, reset mismatch failure/backoff fields, retain useful mirror
  metadata counts, and record repair evidence.
- When a live provider-app recheck proves a different email/account, preserve
  the hard stop and report exact expected versus detected provider-app
  identity.
- Surface enough status evidence that operators can tell the difference
  between `identity-mismatch-current` and `identity-mismatch-stale-recheck`.

## Non-Goals

- Do not weaken real cross-account protections.
- Do not use Chrome/Google account identity as the authority for ChatGPT
  provider app identity.
- Do not auto-click ChatGPT `Answer now`.
- Do not hand-edit user-scoped cache files as the product fix.
- Do not change handoff target mutation or handoff approval behavior.
- Do not broaden live-follow account-library automatic mode.

## Design

### 1. Canonical Identity Evidence

Extend account-mirror status state with optional identity evidence fields:

- `detectedIdentityKey`
- `detectedIdentitySource`
- `detectedIdentityObservedAtMs`
- `detectedIdentityConfidence`
- `identityMismatchLastCheckedAtMs`
- `identityMismatchRepair`

For ChatGPT, `detectedIdentityKey` should be the normalized provider-app email
when the auth-session exposes one. Display names, account labels, and plan
names may be retained as diagnostics, but they must not be used as the
provider identity key.

### 2. Recheckable Mismatch Policy

Update the account-mirror politeness decision so persisted mismatch state is
classified by evidence quality:

- hard block when the detected key is a current authoritative provider-app
  identity that differs from expected;
- eligible for an identity recheck when the detected key is stale, malformed
  for the provider, or lacks authoritative provider-app evidence;
- eligible for normal refresh when detected identity is absent or matches.

The recheck path must be narrow: acquire the normal managed browser operation
lease, run provider-app identity preflight/identity readback first, and only
continue to metadata refresh after the identity is proven safe.

### 3. Self-Healing State Merge

When an identity recheck returns the expected provider-app identity:

- persist `detectedIdentityKey=<expected email>`;
- clear identity-mismatch failure state and cooldown/backoff derived solely
  from the stale mismatch;
- preserve retained metadata counts, cache evidence, and materialization
  completeness;
- record a lifecycle/status repair event with previous detected key, repair
  source, observed time, and request id.

When an identity recheck returns a different authoritative provider-app
identity:

- persist the current detected provider-app identity;
- keep `statusReason=identity-mismatch`;
- include expected and actual identities in diagnostics and CLI/API status.

### 4. Operator Readback

Status surfaces should make this distinguishable without requiring cache
inspection:

- API `/status.liveFollow.targets.accounts[]`;
- `accountMirrorStatus.entries[]`;
- scheduler diagnostics;
- CLI formatting for blocked account-mirror targets.

Minimum useful fields:

- `identityEvidence.source`;
- `identityEvidence.observedAt`;
- `identityEvidence.recheckable`;
- `identityEvidence.repairStatus`;
- previous versus current detected key when a repair occurred.

## Parallelizable Work

- Status model and policy tests can proceed in parallel with ChatGPT collector
  identity-key normalization tests.
- CLI/API formatting tests can proceed after the status model shape is fixed.
- Installed live proof should wait until the core policy and persistence tests
  pass.

## Critical Path

1. Add failing regression coverage for stale persisted
   `detectedIdentityKey="consulting pcg pro"` with expected
   `consult@polymerconsultinggroup.com`.
2. Tighten ChatGPT identity extraction so provider-app email is the canonical
   detected key and display-name/plan strings cannot become identity keys.
3. Add the recheckable mismatch decision and repair state transition.
4. Wire repair evidence through API status, scheduler diagnostics, and CLI
   readback.
5. Rebuild/install/restart the user runtime service.
6. Prove `chatgpt/wsl-chrome-2` repairs from stale mismatch to eligible or
   active live-follow state without manual cache editing.

## Acceptance

- Unit tests prove a stale malformed detected identity key does not permanently
  hard-block a target when recheck is allowed.
- Unit tests prove a current authoritative provider-app email mismatch still
  hard-blocks.
- ChatGPT collector tests prove provider auth-session email wins over display
  name and plan labels for `detectedIdentityKey`.
- Status/API/CLI tests expose recheckable mismatch and repaired mismatch
  evidence.
- Installed live proof on `chatgpt/wsl-chrome-2` shows:
  - provider app identity still reads `consult@polymerconsultinggroup.com`;
  - API status no longer reports stale `identity-mismatch` from
    `consulting pcg pro`;
  - active account-mirror/materialization jobs are not leaked;
  - retained mirror counts/materialization evidence are not discarded.

## Validation Plan

- `pnpm vitest run tests/accountMirror/politePolicy.test.ts`
- `pnpm vitest run tests/accountMirror/statusRegistry.test.ts`
- `pnpm vitest run tests/accountMirror/refreshService.test.ts`
- focused ChatGPT metadata collector/browser adapter tests for identity
  normalization
- focused API/CLI status tests covering identity repair readback
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on changed source/test files
- `pnpm run build`
- `pnpm run plans:audit -- --keep 137`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`
- `auracall --profile wsl-chrome-2 profile identity-smoke --target chatgpt
  --include-negative --json`
- `auracall api status --json --timeout-ms 30000`

## Definition Of Done

Plan 0137 closes when Oracle/account-mirror status can repair a stale,
malformed identity-mismatch latch after current provider-app identity proof,
while preserving hard-stop behavior for a real current provider-app account
drift.

## Closeout

Closed on 2026-06-07.

- Stale/malformed persisted identity state is now recheckable instead of a
  permanent hard block.
- ChatGPT provider-app auth-session email is the canonical detected identity;
  display names and plan labels cannot become ChatGPT identity keys.
- Current authoritative provider-app email mismatches still hard-block.
- Verified provider-app identity is persisted even when later metadata
  collection times out, so a successful identity proof is not lost behind a
  non-identity failure.
- API and CLI status now expose identity evidence, recheckability, repair
  status, previous/current detected keys, and repair metadata.

Validation:

- `pnpm vitest run tests/accountMirror/politePolicy.test.ts
  tests/accountMirror/statusRegistry.test.ts
  tests/accountMirror/refreshService.test.ts
  tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm vitest run tests/http.responsesServer.test.ts -t "stale identity
  mismatch evidence"`
- `pnpm vitest run tests/http.responsesServer.test.ts -t "read-only account
  mirror status"`
- `pnpm vitest run tests/cli/apiStatusCommand.test.ts -t "identity evidence|proof
  scope"`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on changed source and test files
- `pnpm run build`
- `pnpm run install:user-runtime-service`
- `systemctl --user restart auracall-api.service`

Installed live proof on `chatgpt/wsl-chrome-2`:

- provider-app identity readback remains
  `consult@polymerconsultinggroup.com`;
- API status no longer reports stale `identity-mismatch` from
  `consulting pcg pro`;
- identity evidence reports `source=provider-app`,
  `confidence=authoritative`, and `repairStatus=stale_mismatch_repaired`;
- retained mirror counts are preserved and merged:
  `projects=6`, `conversations=68`, `artifacts=64`, `files=73`, `media=0`;
- active history-materialization jobs returned `0`;
- active mirror-completion operations returned `0`.
