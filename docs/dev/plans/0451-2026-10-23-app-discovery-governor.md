# Plan0451 — Govern developer-app bootstrap (#368)

State: OPEN
Lane: issue368
Owner: primary agent for ecochran76
Branch: fix/issue368-app-discovery-governor
Target: main
Integration: pull request
Base: 89800c458
Work item: ecochran76/auracall#368

## Current State

Existing backend-admission fixtures pass but start with a target/factory. A new
public CLI regression through the real ChatgptService utility dispatch and shared
physical target guard fails with the exact provider:chatgpt:connect-tab missing-
governor error when serialized discovery needs its first tab. The factory cannot
acquire target-bound authority before a target exists.

Serialized explicit utility commands now request target custody through the
existing ephemeral-tab acquisition/governor pipeline before identity/inventory
or catalog refresh. Prompt concurrency configuration is unchanged. No synthetic
target identity, guard bypass, automatic provider retry or warning clearance.
Configured account scope remains authoritative; serialized discovery without
configured identity uses the existing managed-browser scope convention, not an
inferred account. Affinity-mode identity requirements remain unchanged.

## Scope and acceptance

- Red/green public command regression at real utility + physical target guard.
- Prove list and confirmed refresh-tools use the exact utility tab/governor;
  preserve adapter cleanup and ledger/lease settlement and warning fences.
- Run consumer/utility/governor tests, typecheck, build, review and integration.
- Qualify installed read-only discovery separately from one named in-place app
  refresh. The operator was asked for the exact app/runtime profile; no app is
  guessed and no provider prompt, app replacement or warning clearance is allowed.
- Keep #368 open until its installed target/account/endpoint/connection evidence
  is qualified. Do not claim source tests prove provider catalog refresh.

## Non-goals

No repair of pending approval #377, account-load error #384, model-selector #374,
or borrowed-profile/control/input issues. Preserve unrelated branches and work.

## Validation and next action

Initial targeted existing connection fixtures: 3 pass. Refined command regression
is red with the exact error. Minimal repair reaches governed target reuse; fixture
transport was completed for that real reuse branch. 91 focused command/service/utility checks and 103 backend-admission/utility
checks pass in separate overlapping selections. Mandatory ungoverned creation
still raises the original error. Typecheck, build, scoped Biome, docs:list and whitespace checks pass.
PR390 mergedfb026941f; CLI installation and compiled serialized-utility contract
pass. API PID1777322 and its adopted clipboard helper remain unchanged. See
[installed CLI boundary](../notes/2026-10-23-issue368-cli-governor.md).
Provider discovery/catalog qualification remains pending the exact app/runtime
target requested from the operator; no provider mutation occurred. Installed target selection remains pending.
Memory disposition: forbidden; user has not requested saving memory.
