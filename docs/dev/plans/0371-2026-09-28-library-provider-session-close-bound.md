# ChatGPT Library Provider-Session Close Bound | 0371-2026-09-28

State: CLOSED
Lane: P71
Work item: #107
Source base: `origin/main` at `9d7a2d6fab63bdc4b59ffe15fc4f5e3611df5a5a`
Branch: `fix/issue-107-library-session-close-timeout`

## Objective

Return the named terminal result of one exact-target read-only Library attempt
when abort cleanup encounters a provider session whose close never settles.

## Current State

- The Library adapter aborts its named provider operation after 30 seconds.
- Abort cleanup closes a borrowed ChatGPT provider session before the named
  error can return to the caller.
- That provider-session branch bypassed the existing bounded direct-CDP close
  path and could therefore remain pending until the later CLI watchdog masked
  the named provider-stage error.

## Scope

- Apply the existing three-second ChatGPT CDP close bound to abort-driven
  provider-session close.
- Preserve the original named provider error when close rejects or times out.
- Preserve retained-session target semantics and clear the consumed session
  reference without directly closing or disposing the exact Library target.
- Add a deterministic fake-clock regression for a pending provider-session
  close after the 30-second named Library abort.
- Update user, testing, journal, fixes, roadmap, runbook, plan, and lane docs.

## Non-goals

- Widening the CLI, provider-operation, cleanup, or watchdog deadlines.
- Installed or live browser/provider testing, retry, Library attachment,
  prompt submission, Send, refresh, target creation, target disposal, or
  navigation.
- Weakening exact-target, AuraCall runtime profile, tenant, identity, lease,
  or provider-session fencing.

## Acceptance Criteria

- [x] A pending provider-session close is waited on for no more than the
      existing three-second ChatGPT CDP close bound.
- [x] The named 30-second Library stage timeout returns at approximately 33
      seconds instead of being replaced by the later CLI timeout.
- [x] Provider-session close is initiated once, the consumed session reference
      is cleared, and the retained target connection is not closed or disposed.
- [x] Existing Library timeout, cleanup, exact-target, affinity, and
      provider-stage fixtures remain green.
- [x] Focused tests, typecheck, scoped lint, plan/lane audits, and diff hygiene
      pass.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0371-C01`
- `state_transition`: ISSUE_107_ABORT_CLEANUP_PENDING ->
  P0371_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: provider-session abort cleanup bounded; installed
  acceptance withheld
- `evidence`: red-before-green pending-close fixture, adjacent Library
  lifecycle suites, typecheck, scoped lint, plan/lane audits, and diff hygiene
- `material_blockers`: none for source; installed `wsl-chrome-3` acceptance is
  a separate live-effect gate
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, provider work, push, merge, or rebase

## Definition Of Done

Abort cleanup cannot wait indefinitely on a borrowed provider session, the
original named Library result remains authoritative, and retained exact-target
semantics are unchanged.
