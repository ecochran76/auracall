# ChatGPT Library Lease Recovery | 0366-2026-09-28

State: CLOSED
Lane: P66
Work item: #107
Source base: `origin/main` at `9fff58ee1f999665df7271dee741731fc52c0394`
Branch: `fix/issue-107-library-production-adoption`

## Objective

Let read-only Library inventory adopt the existing exact ChatGPT `/library`
target when a prior process left safe lease ownership behind, while preserving
live-owner fencing and the no-create/no-navigation contract.

## Current State

- Installed canonical `9fff58ee1` found an exact `/library` page at the selected
  DevTools endpoint but returned `Dedicated browser work found no existing
  compatible target.`
- The retained registry entry for that target was still `active`, owned by a
  prior process, and fenced from selection.
- CodeGraph showed that `buildListOptions` and governor construction occurred
  after tab acquisition but before the existing execution/settlement guard.
  Any exception there stranded the active lease.

## Scope

- Guarantee settlement and idle transition for every path after successful
  utility-tab acquisition, including option and governor setup failures.
- Reconcile expired or dead-owner active leases before exact-target selection.
- For read-only, require-existing-target work only, release safe owner-free
  ephemeral lease ownership after verifying the target is the exact requested
  route. Preserve the target itself; never close, create, refresh, or navigate.
- Retain fencing for a live owner and for `in-flight` or `outcome-unknown`
  effects.
- Exercise the production Chrome target-list dependency with root plus exact
  `/library` provider-free fixtures.

## Non-goals

- Installed or live provider acceptance, retries, Library attachment, prompt,
  Send, browser launch, or managed-browser mutation.
- Ignoring active leases, weakening target ownership, or reclaiming uncertain
  provider effects.
- Changing the 45-second inventory deadline, cleanup deadline, exact AuraCall
  runtime profile, or one-shot CLI exit contract.

## Acceptance Criteria

- [x] A failure after acquisition but before provider execution leaves the
      target lease idle and reusable.
- [x] A later process can reconcile a dead-owner lease and adopt the same exact
      `/library` target through production target enumeration.
- [x] Root and unrelated targets remain untouched; no replacement target is
      opened or closed.
- [x] Live owners and uncertain effects remain fenced.
- [x] Focused provider-free tests, typecheck, scoped lint, planning audit, and
      diff hygiene pass without browser/provider effects.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0366-C01`
- `state_transition`: ISSUE_107_INSTALLED_LEASE_FENCE_REGRESSION ->
  P0366_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: provider-free source repair complete; installed
  acceptance withheld
- `evidence`: production-wiring target enumeration fixtures, post-acquisition
  failure/reentry regression, dead-owner recovery fixture, lease-registry
  safety tests, and existing CLI exit/cleanup fixtures
- `material_blockers`: none for source; installed `wsl-chrome-3` acceptance is
  a separate live-effect gate
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, or provider work

## Definition Of Done

The source repair is documented, provider-free validated, and locally
committed. Installed acceptance is not claimed.
