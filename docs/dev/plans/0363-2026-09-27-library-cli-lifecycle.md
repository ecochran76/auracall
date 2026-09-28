# ChatGPT Library CLI Lifecycle | 0363-2026-09-27

State: CLOSED
Lane: P63
Work item: #107
Source base: `origin/main` at `ed7e1f0dc74d6f31d6c92781f22a38f3f22ee070`
Branch: `fix/issue-107-library-cli-lifecycle`

## Objective

Make `auracall library-files` terminally bounded and resource-safe. A complete
ChatGPT Library inventory attempt must either return its read-only inventory or
produce a structured terminal failure after aborting and joining browser
cleanup within explicit bounds.

## Current State

- Installed canonical `ed7e1f0dc` selected exact AuraCall runtime profile
  `wsl-chrome-3`, but `library-files --json` produced zero stdout and remained
  alive beyond 180 seconds.
- The exact Node process was interrupted with SIGINT. No retry, Library
  attachment, prompt, Send, refresh, or other provider mutation was attempted.
- `listChatgptLibraryFilesForCli` currently creates a
  `BrowserAutomationClient` and awaits `listLibraryFiles()` without an outer
  deadline or caller abort signal.
- The ChatGPT account-file adapter already closes its CDP connection in
  `finally`, and configured utility affinity closes its interaction governor
  and idles its exact lease after the operation settles. The CLI does not yet
  bound or join those existing cleanup paths.

## Scope

- Bound the complete CLI inventory operation, including client creation,
  managed browser discovery, tab-affinity acquisition, provider inspection,
  and cache persistence.
- Propagate timeout and caller cancellation through `AbortSignal` to the
  existing provider and browser-service cleanup paths.
- Join operation settlement and any command-owned close/dispose hook within a
  second bounded cleanup window before returning terminal output.
- Return machine-readable JSON failures with a nonzero exit status in
  `--json` mode and concise human-readable failures otherwise.
- Add deterministic provider-free success, provider-error, timeout, cleanup,
  and cancellation fixtures.
- Update operator docs, journal, fixes log, plan, and active-lane projection.

## Non-goals

- Retrying the failed installed inventory.
- Running any installed browser/provider acceptance in this implementation
  slice.
- Attaching a Library file, opening a prompt, clicking Send, refreshing a page,
  creating a replacement target, or changing tab-affinity semantics.
- Changing runtime-profile resolution, Library identity semantics, cache
  format, or provider retry policy.

## Execution Packet

1. Reproduce the unbounded command seam with a deterministic pending
   provider-free fixture.
2. Add one whole-operation deadline, caller-cancellation forwarding, and a
   bounded cleanup join while preserving the existing exact-profile and
   tab-affinity call path.
3. Add provider-free terminal-result fixtures for success, error, timeout, and
   cancellation, including cleanup ordering and nonzero structured failures.
4. Run focused tests, typecheck, scoped lint/format validation, diff hygiene,
   and planning/lane audits.
5. Close this provider-free plan and leave the exact installed
   `wsl-chrome-3` inventory acceptance explicitly pending separate authority.

## Acceptance Criteria

- [x] The entire inventory call has one positive default deadline that includes
      client creation and provider/browser discovery.
- [x] Timeout and cancellation abort the in-flight inventory and boundedly join
      cleanup before the command returns.
- [x] Success and provider-error paths also execute resource cleanup exactly
      once.
- [x] `--json` produces a structured success or structured failure document;
      failures return a nonzero exit status instead of hanging.
- [x] Provider-free fixtures prove success, error, timeout, cancellation,
      cleanup ordering, and terminal exit classification.
- [x] The existing read-only operation, exact AuraCall runtime profile,
      tab-affinity, retained-target, and no-refresh/new-target behavior are
      unchanged.
- [x] Focused tests, typecheck, build, scoped lint/format, and diff hygiene
      pass. The goal-plan audit passes and the active-plan audit reports no
      P63 finding; its only non-baseline finding is pre-existing Plan 0362
      roadmap/runbook wiring outside this corrective lane.
- [x] No live browser/provider effect occurs in this slice.

## Stop Conditions

- Stop before any installed command, browser launch, provider inventory,
  Library attachment, prompt, Send, refresh, navigation, or target creation.
- Stop if the repair requires weakening exact-profile routing, read-only
  classification, tab-affinity ownership, or existing provider cleanup.
- Do not retry the preserved live failure receipt.

## Opening Checkpoint | Provider-Free Corrective Lane

- `checkpoint_id`: `P0363-C01`
- `state_transition`: ISSUE_107_OPEN_LIVE_HANG_RETAINED ->
  P0363_ACTIVE_PROVIDER_FREE_LIFECYCLE_REPAIR
- `progress_classification`: blocker_reduction
- `acceptance_state`: live defect reproduced by retained issue evidence;
  provider-free implementation and validation remain open
- `evidence`: installed canonical `ed7e1f0dc` stayed alive beyond 180 seconds
  with zero-byte output; current CLI has no whole-operation deadline or abort
  propagation, while provider and affinity cleanup already exist below it
- `material_blockers`: none for provider-free implementation; installed
  acceptance is withheld by this packet's no-live-effect boundary
- `next_action_or_stop_reason`: implement deterministic timeout, cancellation,
  cleanup join, and terminal-output fixtures without provider effects

## Definition Of Done

The provider-free CLI lifecycle contract is implemented, documented, validated,
and committed on the issue branch. A separately authorized installed
`wsl-chrome-3` inventory acceptance remains the only live follow-up and is not
claimed by this plan.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0363-C02`
- `state_transition`: P0363_ACTIVE_PROVIDER_FREE_LIFECYCLE_REPAIR ->
  P0363_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: implementation complete and provider-free accepted on
  `fix/issue-107-library-cli-lifecycle`; installed acceptance withheld
- `evidence`: 6 lifecycle fixtures and 98 focused/adjacent tests pass;
  typecheck, production build, scoped Biome validation, diff hygiene, and
  goal-plan audit pass; the active-plan audit has no P63 finding and retains
  only the pre-existing Plan 0362 wiring finding; source preserves the existing
  profile resolution, read-only provider call, exact tab-affinity path, and
  retained target
- `material_blockers`: none for provider-free source; installed
  `wsl-chrome-3` validation requires separate live-effect authority
- `next_action_or_stop_reason`: stop before installation or provider access;
  hand the local commit to the integration owner
