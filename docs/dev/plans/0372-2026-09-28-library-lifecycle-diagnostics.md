# ChatGPT Library Lifecycle Diagnostics | 0372-2026-09-28

State: CLOSED
Lane: P72
Work item: #107
Source base: `origin/main` at `a8d340b03c45bfca44c386f5804f36e19f38feab`
Branch: `fix/issue-107-library-diagnostics`

## Objective

Make a whole-operation ChatGPT Library timeout identify the last entered
production stage and bounded cleanup phase without exposing account, route,
target, or provider content.

## Current State

- Correct installed acceptance of canonical `a8d340b03` still returned the
  CLI's 54-second operation timeout while preserving the target set.
- The provider-session abort close is bounded, so that result proves either a
  different wait or a path that did not reach the borrowed-session cleanup.
- The existing structured failure names only the outer timeout and cannot
  distinguish affinity preflight, service option construction, provider work,
  cache persistence, abort cleanup, or affinity settlement.

## Scope

- Carry one closed Library lifecycle recorder through the CLI, configured
  affinity, service, and ChatGPT adapter paths.
- Record the last entered stage, cleanup phase, ISO timestamps, and a maximum
  of 32 closed-vocabulary events in structured terminal failures.
- Cover provider abort request, read rejection, abort cleanup, and affinity
  settlement start/settle/timeout phases.
- Add a provider-free fixture that exercises the real configured-affinity
  production wiring through a whole-operation timeout.
- Document the strongest remaining source-local await candidate without
  changing its behavior in this diagnostic slice.

## Non-goals

- Widening any CLI, adapter, cleanup, settlement, or watchdog deadline.
- Removing the second service option build without installed diagnostic
  evidence that it is the retained wait.
- Persisting URLs, target IDs, account identity, managed browser profile paths,
  provider content, error internals, or other sensitive data.
- Installed or live browser/provider testing, retry, refresh, navigation,
  target creation, target disposal, attachment, prompt submission, or Send.

## Acceptance Criteria

- [x] A whole-operation timeout reports its last entered Library stage and
      cleanup phase with timestamps.
- [x] The timeline is capped and accepts only fixed stage/phase values.
- [x] Production affinity acquisition and settlement propagate through the
      CLI failure without target, URL, or account data.
- [x] Adapter abort cleanup distinguishes settled from timed-out close while
      preserving the original named error and retained target.
- [x] Service instrumentation distinguishes its second list-options build,
      provider read, cache context, and cache write.
- [x] Focused tests, typecheck, scoped lint, P72 plan/lane wiring, and diff
      hygiene pass. The active-only planning audit retains two unrelated
      pre-existing Plan 0362 wiring findings and seven accepted baseline
      findings.

## Source Finding

After configured affinity acquires the exact target and builds exact list
options, `LlmService.listAccountFiles` calls `buildListOptions` again before
entering the adapter's 30-second Library operation. That second build invokes
the full `BrowserService.resolveServiceTarget` path, including registry-wide
liveness classification and a registered-instance target scan, even though
host, port, and target ID are already exact. The adapter timer cannot bound
this work. The next installed failure will show `service-build-list-options`
if this is the retained wait; other closed stages distinguish affinity,
adapter, and cache boundaries.

## Closure Checkpoint | Provider-Free Accepted

- `checkpoint_id`: `P0372-C01`
- `state_transition`: ISSUE_107_UNLOCALIZED_54S_TIMEOUT ->
  P0372_CLOSED_PROVIDER_FREE_ACCEPTED
- `progress_classification`: blocker_reduction
- `acceptance_state`: privacy-bounded lifecycle diagnostics implemented;
  installed localization withheld
- `evidence`: red-before-green whole-operation fixture, production-affinity
  fixture, adapter cleanup fixture, service stage fixture, adjacent Library
  lifecycle suites, typecheck, scoped lint, P72-clean plan/lane audit, and diff
  hygiene
- `material_blockers`: the exact remaining wait requires one separately
  authorized installed `wsl-chrome-3` readback of the new structured failure
- `next_action_or_stop_reason`: commit locally and stop before installation,
  browser access, provider work, push, merge, or rebase

## Definition Of Done

The next bounded installed timeout can localize the retained wait from one
structured, non-sensitive terminal result without another deadline change.
