# ChatGPT Library Single-Read Deadline Margin | 0370-2026-09-28

State: CLOSED
Lane: P70
Work item: #107
Source base: `origin/main` at `d89abd46cd2e83e69f113379d6c1da29f5c2fb1d`
Branch: `fix/issue-107-library-timeout-retry`

## Objective

Return the named terminal result of one exact-target read-only Library attempt
when the observed production path takes about 50 seconds, without allowing a
generic provider retry to repeat that read.

## Current State

- Correct installed acceptance of canonical `d89abd46` preserved the target
  set but returned the inner 49-second inventory timeout.
- The retained target lease took about 44.55 seconds from acquisition through
  idle settlement. Pre-acquisition work pushed the complete path beyond the
  shared operation deadline.
- The account-file service wraps provider reads in generic retry. The exact
  named Library timeout is already non-retryable, but a connection-shaped
  cleanup error could still initiate another provider read.

## Scope

- Raise the shared operation deadline to 54 seconds and the later terminal
  watchdog to 60 seconds while retaining five-second cleanup.
- Explicitly disable account-file provider retry for this exact CLI inventory.
- Forward the existing caller abort signal through generic account-file retry
  control.
- Add deterministic call-count and observed 50-second boundary regressions.
- Update user, testing, journal, fixes, roadmap, runbook, plan, and lane docs.

## Non-goals

- Installed or live browser/provider testing, retry, Library attachment,
  prompt submission, Send, refresh, target creation, target disposal, or route
  broadening.
- Disabling retry for other account-file consumers or weakening exact target,
  AuraCall runtime profile, tenant, identity, lease, or provider-session
  fencing.
- Extending the complete terminal bound beyond approximately 60 seconds.

## Acceptance Criteria

- [x] A fake-clock result at the observed 50-second boundary retains its named
      provider error instead of the shared operation timeout.
- [x] A named adapter timeout performs one provider call under existing retry
      classification.
- [x] A connection-shaped error performs one provider call when the exact CLI
      no-retry option is present.
- [x] Nonsettling work still aborts and completes bounded cleanup before the
      60-second terminal watchdog.
- [x] Existing timeout, cancellation, cleanup, exact-target, affinity, and
      provider-stage fixtures remain green.
- [x] Focused tests, typecheck, scoped lint, plan/lane audits, and diff hygiene
      pass.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0370-C01`
- `state_transition`: ISSUE_107_INSTALLED_INNER_TIMEOUT ->
  P0370_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: one-read deadline margin repaired; installed acceptance
  withheld
- `evidence`: red-before-green observed-boundary fixture, provider retry
  call-count fixtures, adjacent Library lifecycle suites, typecheck, scoped
  lint, plan/lane audits, and diff hygiene
- `material_blockers`: none for source; installed `wsl-chrome-3` acceptance is
  a separate live-effect gate
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, provider work, push, merge, or rebase

## Definition Of Done

One exact-target Library read has enough bounded time to return its named
result at the observed production boundary, cannot be retried by generic
account-file logic, and remains within a roughly 60-second terminal lifecycle.
