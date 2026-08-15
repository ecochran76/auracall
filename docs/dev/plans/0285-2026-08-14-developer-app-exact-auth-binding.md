# Developer-App Exact Auth Binding | 0285-2026-08-14

State: CLOSED
Disposition: PROVIDER-FREE SOURCE ACCEPTED
Lane: P01

## Stable Objective

Prevent a newly installed ChatGPT developer app from inheriting OAuth status
from an older same-name connector by binding inventory auth state only to one
exact app/connector identity.

## Current State

- Plan 0284 proved the installed inventory path returns a complete catalog, but
  LitScout governance later reconciled the replacement app against retained
  OAuth rows and found no exact OAuth subject for the new app id.
- `deriveChatgptDeveloperAppState()` currently accepts either exact identity or
  normalized display-name equality when joining installed and linked records.
- Provider-free work is authorized. Install, browser replay, OAuth action,
  prompt, connector call, and LitScout canonical effects remain excluded.

## Execution Contract

1. Reproduce same-name/different-id auth crossover through the exported state
   derivation seam before changing source.
2. Remove display-name auth joining and require exactly one exact app-id match.
3. Preserve exact ACTIVE and REAUTH_REQUIRED mappings and fail closed on a
   missing or ambiguous exact match.
4. Run the focused developer-app suite, affected CLI/account-mirror suites,
   typecheck, build, scoped lint, CodeGraph readback, and planning audits.
5. Commit and push the provider-free source candidate with a durable receipt.

## Non-Goals And Hard Stops

- No user-runtime install, service restart, browser action, inventory replay,
  prompt, connector call, app/OAuth mutation, or LitScout canonical write.
- No change to app selection, refresh replacement, OAuth creation, or linked
  payload normalization semantics beyond the exact auth-state join.
- No live P3 adjudication or Experiment 6 action.

## Acceptance Criteria

- [x] Same-name/different-id and duplicate-exact-id fixtures reproduce the
  prior fail-open behavior before source changes.
- [x] Auth status maps only from one exact app-id match; missing or ambiguous
  matches return null.
- [x] Exact ACTIVE and REAUTH_REQUIRED fixtures remain green.
- [x] Focused and affected provider-free validation, typecheck, build, lint,
  CodeGraph, planning audits, and diff hygiene pass.
- [x] Source candidate and closeout receipt are committed and pushed.

## Effect Budget

- `max_user_runtime_installs: 0`
- `max_service_restarts: 0`
- `max_browser_actions: 0`
- `max_inventory_replays: 0`
- `max_prompt_submissions: 0`
- `max_connector_calls: 0`
- `max_app_or_oauth_mutations: 0`
- `max_litscout_canonical_writes: 0`
- `max_experiment_6_runs: 0`

## Definition Of Done

This plan closes after the exact-identity join is provider-free validated and
the source candidate plus terminal receipt are pushed. Installed/read-only
inventory verification remains a separately authorized boundary.

## Terminal Checkpoint | Provider-Free Source Accepted

- Same-name/different-id first failed with `ACTIVE` instead of null. Duplicate
  exact matches then failed by selecting the first status. Both are green after
  the exact-one join; focused validation passes 23/23 and affected validation
  passes 221/221.
- Typecheck, production build, scoped Biome, current CodeGraph readback, plan
  library audit, and diff hygiene pass. The shared fleet active audit retains
  25 pre-existing policy/legacy-plan findings and reports none for Plan 0285.
- Exact pushed source candidate is `0c9110e43b73f9e0d44bc3ca36314c4f0f0e3065`.
  Durable receipt:
  [docs/dev/notes/2026-08-14-plan0285-exact-auth-binding.json](../notes/2026-08-14-plan0285-exact-auth-binding.json).
- No install, service restart, browser action, inventory replay, prompt,
  connector, app/OAuth mutation, LitScout canonical write, or Experiment 6
  action ran. Installed verification remains a separate authority boundary.
