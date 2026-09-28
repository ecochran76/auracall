# ChatGPT Library Provider Inventory Liveness | 0367-2026-09-28

State: CLOSED
Lane: P67
Work item: #107
Source base: `origin/main` at `96095e68c4199bff5db33f180b56609c27e0f6ca`
Branch: `fix/issue-107-library-inventory-stage`

## Objective

Make the adopted exact-target ChatGPT Library provider operation settle before
the existing 45-second CLI deadline when a CDP stage ignores abort or never
acknowledges, while preserving the read-only target and route contract.

## Current State

- Correct installed acceptance of canonical `96095e68c` adopted the existing
  exact `/library` target with one adoption and zero create, navigate, reload,
  focus, or close actions, then returned
  `library_files_inventory_timeout` at 45 seconds.
- The provider's Library DOM inventory awaited raw `Runtime.evaluate`. The
  account-file path did not use its existing abort-bound connection helper,
  and exact-target setup did not forward abort through every attached-client
  stage.
- A deterministic production-adapter fixture leaves only the Library DOM
  evaluation pending and reproduces the non-settling operation without a live
  browser or provider.

## Scope

- Add named, bounded provider stages for interaction governance, connection,
  identity, dialog cleanup, exact-route readiness, and Library DOM inventory.
- Cap the complete provider operation below the 45-second CLI boundary.
- Race attached CDP work against abort and bound client close independently so
  a CDP promise need not cooperate for the operation to settle.
- Preserve the existing exact target, no-create, no-refresh, and
  no-unnecessary-navigation behavior.
- Add a provider-free production-adapter regression and update operator,
  testing, journal, fixes, plan, and lane documentation.

## Non-goals

- Installed or live browser/provider testing, retries, Library attachment,
  prompt submission, Send, refresh, target creation, target disposal, or route
  broadening.
- Weakening runtime-profile, tenant, identity, lease, or provider-session
  fencing.
- Changing the outer 45-second inventory or five-second CLI cleanup limits.

## Acceptance Criteria

- [x] An indefinitely pending Library DOM CDP evaluation fails at the named
      `dom-inventory` stage before the outer CLI timeout.
- [x] Timeout and caller abort can settle attached-client work without waiting
      for the pending CDP promise itself.
- [x] The command-owned CDP connection close is initiated and awaited only
      within an independent bound, while the exact Library page is retained.
- [x] The exact-target regression proves zero `Page.navigate` calls and no
      provider/browser network effect.
- [x] Focused tests, typecheck, scoped lint, plan/lane audits, and diff hygiene
      pass.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0367-C01`
- `state_transition`: ISSUE_107_INSTALLED_PROVIDER_TIMEOUT ->
  P0367_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: provider-side liveness repair complete; installed
  acceptance withheld
- `evidence`: production-adapter pending-CDP regression plus adjacent Library
  lifecycle suites, typecheck, scoped lint, plan/lane audits, and diff hygiene
- `material_blockers`: none for source; installed `wsl-chrome-3` acceptance is
  a separate live-effect gate
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, provider work, push, merge, or rebase

## Definition Of Done

The provider operation fails with a named internal stage before the outer CLI
timeout, releases its CDP resources without changing the retained page target,
and the provider-free repair is documented, validated, and locally committed.
