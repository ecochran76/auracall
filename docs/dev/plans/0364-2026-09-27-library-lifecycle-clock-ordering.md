# ChatGPT Library Lifecycle Clock Ordering | 0364-2026-09-27

State: CLOSED
Lane: P64
Work item: #110
Source base: `origin/main` at `34397a20e237544abc8139bf0f10aafb99237f4b`
Branch: `fix/issue-110-library-clock-ordering`

## Objective

Keep provider-interaction lifecycle timestamps causally ordered when the wall
clock moves backward, so a successful or failed read-only Library inventory is
not replaced by an internal `settledAt`/`startedAt` ledger error.

## Current State

- Installed canonical `34397a20e` bounded and cleaned the exact
  `wsl-chrome-3` Library inventory, but returned after 2.9 seconds with
  `library_files_inventory_failed: settledAt cannot be earlier than startedAt`.
- The ledger correctly rejects out-of-order timestamps. Its caller, the
  ledger-backed interaction governor, reads the injected wall clock separately
  for reservation, start, and settlement without preserving causal order.
- A deterministic provider-free fixture reproduces the exact failure by moving
  the injected clock backward between interaction start and settlement.

## Scope

- Preserve one nondecreasing timestamp sequence inside each ledger-backed
  interaction governor while retaining the ledger's strict ordering check.
- Add a deterministic backwards-clock regression at the browser-service
  governor boundary.
- Re-run the Library CLI lifecycle and exact-tab utility-affinity suites plus
  typecheck, scoped lint, and diff hygiene.
- Update testing guidance, the journal, durable fixes log, roadmap, runbook,
  plan, and active-lane projection.

## Non-goals

- Retrying the installed `wsl-chrome-3` inventory in this provider-free slice.
- Weakening ledger timestamp validation or rewriting persisted history.
- Changing the 45-second inventory deadline, five-second cleanup join,
  cancellation, exact AuraCall runtime profile, tab-affinity, or target
  lifecycle behavior.
- Refreshing, navigating, creating a target, attaching a Library file, or
  making any provider mutation.

## Acceptance Criteria

- [x] A deterministic backwards-clock fixture fails before the repair and
      passes after it.
- [x] Reservation, start, and settlement timestamps emitted by one governor
      are nondecreasing even when its injected wall clock regresses.
- [x] The ledger's direct out-of-order rejection remains unchanged and its
      focused suite passes.
- [x] Focused governor, ledger, configured-affinity, and Library CLI lifecycle
      tests pass with typecheck, scoped lint, and diff hygiene.
- [x] No installed command, browser launch, provider access, retry, or mutation
      occurs in this slice.

## Stop Conditions

- Stop before installed or live acceptance; the parent packet explicitly
  withholds provider effects.
- Stop if the repair would weaken persisted ledger integrity or change exact
  tab/profile ownership semantics.
- Do not retry the retained issue-110 installed failure.

## Opening Checkpoint | Reproduced Provider-Free

- `checkpoint_id`: `P0364-C01`
- `state_transition`: ISSUE_110_INSTALLED_CLOCK_REGRESSION ->
  P0364_ACTIVE_PROVIDER_FREE_CLOCK_REPAIR
- `progress_classification`: blocker_reduction
- `acceptance_state`: exact error reproduced by a deterministic injected-clock
  fixture; implementation validation remains open
- `evidence`: settlement at `11:59:59.999Z` after start at `12:00:00.002Z`
  produces the retained `settledAt cannot be earlier than startedAt` error
- `material_blockers`: none for provider-free source; installed acceptance is
  withheld by the current authority boundary
- `next_action_or_stop_reason`: clamp governor lifecycle reads to a
  nondecreasing sequence, then validate without browser/provider effects

## Definition Of Done

The provider-free clock-ordering repair is implemented, documented, validated,
and committed locally. Exact installed `wsl-chrome-3` acceptance remains a
separate live-effect gate and is not claimed by this plan.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0364-C02`
- `state_transition`: P0364_ACTIVE_PROVIDER_FREE_CLOCK_REPAIR ->
  P0364_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: provider-free source accepted locally; integration and
  installed acceptance remain open
- `evidence`: the exact deterministic regression is red before and green after
  the repair; 48 focused tests across governor, ledger, configured utility/live
  affinity, prompt affinity, and Library CLI pass with typecheck, scoped Biome,
  goal-plan audit, and diff hygiene
- `material_blockers`: none for source; exact installed `wsl-chrome-3`
  inventory acceptance requires separate live-effect authority
- `next_action_or_stop_reason`: stop before installation/provider access and
  hand the local commit to the integration owner
