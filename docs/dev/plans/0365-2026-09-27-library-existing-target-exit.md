# ChatGPT Library Existing Target And Terminal Exit | 0365-2026-09-27

State: CLOSED
Lane: P65
Work item: #107
Source base: `origin/main` at `48955d62c7d415fe892cf41620967de7631ca293`
Branch: `fix/issue-107-library-target-exit`

## Objective

Make the read-only Library inventory adopt the exact existing ChatGPT Library
page without creating a blank target, and guarantee that its one-shot CLI
process terminates after emitting structured success or failure output.

## Current State

- Installed canonical `48955d62c` returned the structured error `ChatGPT
  target ... is on about:blank, not the expected https://chatgpt.com/library`
  and then remained alive for more than 30 seconds until Ctrl-C.
- CodeGraph showed that configured utility affinity had a target-listing
  dependency but did not pass it into ephemeral tab acquisition, so an
  existing endpoint always opened a new target.
- The exact-target ChatGPT attachment path could throw on route validation
  before returning the CDP client to its outer cleanup owner.

## Scope

- Require the CLI inventory to select one unleased exact `/library` page from
  the selected AuraCall runtime profile and managed browser profile.
- Fail closed when that page is absent or ambiguous; never create, refresh, or
  unnecessarily navigate a page. A blank target retained under this command's
  prior lease may be closed as owned cleanup before exact-target adoption;
  unrelated targets remain untouched.
- Close a newly attached exact-target CDP client when validation fails before
  ownership transfers to the normal provider cleanup boundary.
- End the completed one-shot CLI after output and signal-listener cleanup.
- Add provider-free adoption, no-target, pre-handoff cleanup, and retained
  event-loop-handle exit regressions.

## Non-goals

- Installed or live provider acceptance, provider retries, Library attachment,
  prompts, Send, refresh, navigation, or browser/profile mutation.
- Changing other utility commands' existing create-if-missing behavior.
- Replacing exact runtime-profile, managed-browser-profile, tenant, lease, or
  interaction-ledger affinity.

## Acceptance Criteria

- [x] Exact existing Library target is leased and passed as `tabTargetId`.
- [x] Blank and non-Library pages are not adopted; no target is created when
      the exact Library page is absent. Only a stale target already owned by
      the same command lease may be closed during reconciliation.
- [x] Exact-target rejection closes its attached CDP client.
- [x] The command exits after terminal output even if a noncritical event-loop
      handle remains.
- [x] Focused provider-free tests pass; no live/provider effect occurs.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0365-C01`
- `state_transition`: ISSUE_107_REOPENED_INSTALLED_TARGET_EXIT_REGRESSION ->
  P0365_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: source repair complete; installed acceptance withheld
- `evidence`: focused exact-target, adapter cleanup, coordinator, and CLI
  lifecycle tests plus typecheck, scoped lint, planning audit, and diff hygiene
- `material_blockers`: none for source; installed `wsl-chrome-3` acceptance is
  a separate live-effect gate
- `next_action_or_stop_reason`: commit locally and stop before installation or
  provider access

## Definition Of Done

The provider-free repair is documented, validated, and committed locally.
Installed acceptance is not claimed.
