# Live-Follow Predicate And Cleanup Repair | 0313-2026-08-24

State: OPEN
Lane: P06
Operational state: PROVIDER_FREE / IMPLEMENTATION_PENDING
Branch: fix/plan0313-live-follow-predicate-cleanup
Target: main
Integration: merge
Revision: 1 | 2026-08-24

## Stable Objective

Repair the two source defects exposed by Plan 0312: a bounded ChatGPT sidebar
readiness probe must fall through to its existing recovery path when its own
predicate transport deadline expires, and one explicitly forced terminal
live-follow pass must request managed-browser cleanup on both success and
failure.

## Current State

- Plan 0312 is closed under `C4_hard_stop`. Scheduler isolation worked, but the
  frozen `chatgpt/wsl-chrome-3` parent failed at pass 1 on a 587 ms predicate
  transport timeout and retained API-owned Chrome until exact manual cleanup.
- Source diagnosis localizes the timeout to the 800 ms first-pass sidebar
  readiness check in `ensureChatgptSidebarOpen(...)`. Shared
  `waitForPredicate(...)` correctly bounds each CDP evaluation by the remaining
  outer budget; the provider caller incorrectly lets that bounded timeout skip
  its already-defined sidebar-open fallback.
- Completion cleanup is currently requested only for the final pass of a
  bounded Gemini operation. A ChatGPT live-follow `run-one-pass` force ceiling
  therefore reaches refresh success/failure without the cleanup request that
  `refreshService` already honors on both paths.
- The scheduler is durably paused. API PID `57888` is healthy with zero
  restarts, exact managed-browser port 45015 is closed, and `main ==
  origin/main` at `28e46b01` before this packet.
- Plan and P06 custody were published on canonical `main` through `7a28cd73`
  before source edits.

## Authority And Effect Budget

- Operator `ok go` authorizes this provider-free source repair.
- Authorized: plan/custody docs; exact RED/GREEN fixtures; narrow provider and
  completion-policy source edits; focused and affected provider-free tests;
  typecheck, lint, build, CodeGraph, plan audit, commits, push, and integration.
- Excluded: user-runtime install, API restart, browser launch/attach/navigation,
  provider read or mutation, scheduler control, completion control, retry,
  prompt/composer action, materialization action, canary, and `Answer now`.
- Critical-path owner: `/root`; serialized work only, no subagents.

## Execution Packet

1. Publish this plan and P06 custody on canonical `main`, then create the owned
   topic branch.
2. Add an exact provider-free regression showing the bounded initial sidebar
   readiness timeout falls through to the existing open/recheck path while
   unrelated CDP errors remain fail-closed.
3. Add an exact completion-service regression showing an explicitly forced
   terminal ChatGPT live-follow pass requests refresh cleanup; preserve normal
   indefinite live-follow retention and final bounded Gemini cleanup.
4. Make the smallest provider-local and completion-policy changes that satisfy
   those regressions without weakening shared predicate liveness.
5. Run focused/affected provider-free validation, typecheck, scoped lint,
   build, CodeGraph, planning audit, diff hygiene, and runtime containment
   readback.
6. Publish the validated checkpoint, reconcile P06, integrate to `main`, and
   verify local/remote parity. Installed adoption and any canary remain a
   separate effect packet.

## Acceptance Criteria

- `LFPC-R1`: the exact 800 ms readiness-probe transport timeout no longer
  aborts root-rail discovery before the existing sidebar-open recovery.
- `LFPC-R2`: non-timeout CDP failures remain visible and fail closed.
- `LFPC-R3`: a forced terminal ChatGPT live-follow pass sets
  `cleanupManagedBrowserAfterRefresh=true`; ordinary indefinite live follow
  does not change retention policy.
- `LFPC-R4`: refresh cleanup remains effective on success and failure, with the
  existing bounded Gemini contract preserved.
- `LFPC-R5`: focused/affected tests, typecheck, scoped lint, build, CodeGraph,
  plan audit, diff hygiene, Git custody, and runtime containment all pass.

## Non-Goals And Hard Stops

- Do not change shared `waitForPredicate(...)` rejection/liveness semantics.
- Do not broaden ChatGPT labels, selectors, composer mode, model selection,
  tool approval, or `Answer now` behavior.
- Do not terminate an installed browser or test cleanup against a real managed
  browser profile in this packet.
- Stop on a required installed/live proof, scheduler drift, browser launch,
  unrelated dirty overlap, or a repair that needs a new public abstraction.

## Definition Of Done

- All five criteria have provider-free evidence at one durable topic-branch
  checkpoint.
- Plan, roadmap, runbook, journal, fixes log, active-lane catalog, Git refs,
  CodeGraph, and current paused-runtime evidence agree.
- No installed, browser, provider, scheduler, completion, materialization, or
  canary effect occurred; those remain separately gated.
