# ChatGPT Library Terminal Result Cleanup | 0368-2026-09-28

State: CLOSED
Lane: P68
Work item: #107
Source base: `origin/main` at `4ff8edfe0309b76a8cddb4c81c51538227d63564`
Branch: `fix/issue-107-library-client-cleanup`

## Objective

Return the provider's named Library result or error before the existing
45-second CLI deadline even when command-client or tab-affinity settlement
cleanup never acknowledges.

## Current State

- Correct installed acceptance of canonical `4ff8edfe0` still returned the
  outer `library_files_inventory_timeout` after 45 seconds, despite the
  provider operation's 30-second ceiling and three-second CDP close bound.
- The CLI included `closeClient()` inside the promise governed by the
  inventory deadline. A pending optional client disposal therefore hid an
  already-settled provider result.
- Production `BrowserAutomationClient` has no close/dispose hook. Its remaining
  post-provider boundary was configured utility affinity, which awaited
  governor and lease settlement without a deadline before rethrowing the
  provider-stage error.

## Scope

- Separate the inventory result from independently bounded client cleanup.
- Bound configured ChatGPT utility governor/lease settlement to five seconds.
- Preserve the original provider-stage error when settlement times out; retain
  an unresolved lease as active so another process remains fenced.
- Add provider-free fixtures for client-dispose success/error and pending
  governor settlement.
- Update user, testing, journal, fixes, roadmap, runbook, plan, and lane docs.

## Non-goals

- Installed or live browser/provider testing, retry, refresh, navigation,
  target creation/disposal, prompt submission, or Send.
- Weakening exact runtime-profile, exact Library route, tenant, identity,
  provider-session, active-lease, or uncertain-effect fencing.
- Returning provider success when affinity settlement is unresolved.

## Acceptance Criteria

- [x] Provider success and a named provider-stage error settle through the CLI
      within the independent cleanup bound when client disposal never settles.
- [x] A provider-stage error remains authoritative when interaction-governor
      settlement never settles.
- [x] Timed-out affinity settlement leaves its target lease active rather than
      exposing it for unsafe adoption.
- [x] Existing exact-target, no-create, no-navigation, no-refresh, timeout,
      cancellation, and lease-recovery fixtures remain green.
- [x] Focused tests, typecheck, scoped lint, plan/lane audits, and diff hygiene
      pass.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0368-C01`
- `state_transition`: ISSUE_107_INSTALLED_OUTER_TIMEOUT ->
  P0368_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: terminal-result and cleanup ordering repaired; installed
  acceptance withheld
- `evidence`: red-before-green pending-dispose fixtures, pending-governor
  settlement fixture, adjacent Library lifecycle suites, typecheck, scoped
  lint, plan/lane audits, and diff hygiene
- `material_blockers`: none for source; installed `wsl-chrome-3` acceptance is
  a separate live-effect gate
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, provider work, push, merge, or rebase

## Definition Of Done

The CLI reports the provider's terminal result without allowing cleanup to
consume its inventory deadline, affinity settlement is bounded while retaining
safe lease fencing, and the provider-free correction is documented, validated,
and locally committed.
