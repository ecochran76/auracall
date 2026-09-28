# ChatGPT Library Deadline Composition | 0369-2026-09-28

State: CLOSED
Lane: P69
Work item: #107
Source base: `origin/main` at `34fd52d0cde851082c2645b65b48f5dd9337b1be`
Branch: `fix/issue-107-library-budget-composition`

## Objective

Keep the read-only Library operation's named result authoritative when bounded
preflight, provider, connection cleanup, and affinity settlement latencies
compose near the terminal CLI watchdog.

## Current State

- Correct installed acceptance of canonical `34fd52d0` retained the exact
  target set but still returned the outer `library_files_inventory_timeout`
  after 45 seconds.
- The outer timer began before client creation and tab-affinity acquisition.
  The provider's 30-second timer began later inside the adapter and could be
  followed by a three-second CDP close and five-second affinity settlement.
- Persisted timing placed meaningful use and idle settlement about 43 seconds
  after target acquisition, before accounting for CLI-to-acquisition time.
  The composed path could therefore lose to the otherwise valid outer timer.

## Scope

- Add one shared 49-second deadline across client creation, affinity preflight,
  provider work, and settlement.
- Retain the independent five-second cleanup join and place the final watchdog
  later at 55 seconds.
- Add deterministic fake-clock coverage that composes pre-provider latency,
  the provider timeout, CDP close, and affinity settlement.
- Update user, testing, journal, fixes, roadmap, runbook, plan, and lane docs.

## Non-goals

- Installed or live browser/provider testing, retry, Library attachment,
  prompt submission, Send, refresh, target creation, target disposal, or route
  broadening.
- Weakening runtime-profile, tenant, identity, lease, provider-session,
  exact-target, no-navigation, or no-refresh fencing.
- Treating provider-interaction ledger duration as complete CLI duration.

## Acceptance Criteria

- [x] A fake-clock path with four seconds of client setup, six seconds of
      provider preflight, a 30-second provider bound, three-second CDP close,
      and five-second settlement returns its named provider-stage error.
- [x] A nonsettling full operation aborts at the earlier shared operation
      deadline and cleanup completes before the later watchdog.
- [x] Existing success, provider-error, timeout, cancellation, cleanup,
      exact-target, and affinity fixtures remain green.
- [x] Focused tests, typecheck, scoped lint, plan/lane audits, and diff hygiene
      pass.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0369-C01`
- `state_transition`: ISSUE_107_INSTALLED_COMPOSED_TIMEOUT ->
  P0369_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: deadline composition repaired; installed acceptance
  withheld
- `evidence`: red-before-green composed fake-clock fixture, adjacent Library
  lifecycle suites, typecheck, scoped lint, plan/lane audits, and diff hygiene
- `material_blockers`: none for source; installed `wsl-chrome-3` acceptance is
  a separate live-effect gate
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, provider work, push, merge, or rebase

## Definition Of Done

The CLI's later watchdog cannot mask the shared operation deadline or a named
provider-stage result, cleanup remains bounded, and the provider-free repair is
documented, validated, and locally committed.
