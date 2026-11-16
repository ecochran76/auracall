# Plan0475 | Coordination lock clock adjustments

State: BLOCKED
Lane: P475
Owner: primary agent
Branch: fix/coordination-lock-clock-20261116
Base: c9d182957251db08307e80d27613928a6a7036d8
Target: validated source branch; installation and provider acceptance are separate.
Work item: bounded operator-requested diagnosis of connector installation failures.

## Current State

Clock defect source repair is validated. The original large-history replay still
reproduces genuine contention; invalid-transition and web-client installation
remain blocked. No runtime activation is claimed.

## Acceptance and boundaries

Reproduce the reported interaction-ledger and tab-registry lock timeout through
real file-backed stores. Determine whether stale metadata is required. Preserve
all ownership, history, persistence and admission contracts. Use monotonic elapsed
time for bounded lock waiting if wall-clock movement is causal. Retain wall-clock
audit timestamps. Do not delete live locks, prune history, widen wait budgets,
change provider permissions, or claim connector installation from source checks.

## Evidence and loop

Private installed-runtime replay against a copied ledger reproduced the exact
interaction lock error with three independent readers twice; two readers passed
twice. No pre-existing lock was copied. Ledger was 98,875,896 bytes, with 25,780
records and 91,633 events. Removing only copied events reduced one replay to
3.020s; empty-scope observation retained 6.848s total latency. These are host
samples, not latency guarantees or proof of a single performance cause.

Ranked predictions: cold history loading, returned-record copying, and wall-clock
movement. Instrumentation observed a failing reader with monotonic3324ms versus
wall10561ms. A deterministic public-store regression jumps Date.now by60s while
another live store briefly holds the real lock; the peer must finish within its
unchanged monotonic budget. This isolates a false timeout from stale ownership
and heavy history. Private runtime data and temporary instrumentation stay outside
Git. Secondary invalid-transition and end-to-end installation remain unproven.

## Execution

- Reproduction and minimization: installed-runtime exact error reproduced.
- Regression: both forward-clock tests red before repair (129ms bodies), then
  green; frozen-clock genuine-timeout/live-owner preservation control passes.
- Fix: node performance.now replaces Date.now only in the two elapsed loops.
- Validation: focused regressions, applicable ledger/tab/governor tests, typecheck,
  build, scoped lint and diff checks; local only, no hosted CI.
- Terminal condition: source-validated repair with explicit runtime acceptance gate.

## Validation and next action

Primary: `pnpm vitest run tests/browser-service/coordinationLockClock.test.ts
 tests/browser-service/interactionLedger.test.ts tests/browser-service/tabLeaseRegistry.test.ts
 tests/browser-service/tabLeaseRestartReconciliation.test.ts
 tests/browser-service/concurrentInteractionGovernor.test.ts
 tests/browser-service/ledgerInteractionGovernor.test.ts
 tests/browser/configuredProviderTrafficAuthority.test.ts --maxWorkers=1`:
70passed,7files,19.74s. `pnpm run typecheck`, `pnpm run build`, `pnpm run docs:list`
and `git diff --check` pass. Scoped Biome lint passes for the new test; the two
package source files are excluded by the existing lint configuration. Full
build/typecheck cover both changed package files. No hosted CI was run.

Primary frozen-patch inspection: ownership/history/persistence branches unchanged;
only elapsed clock source changed. Corrected a test assumption: a second tab
process-binding must retain its process-owned conflict after the wait succeeds.
No clock fix is claimed to resolve genuine large-history contention. A candidate
copied-history run still timed out at5140monotonic ms against the real5sbudget.
No production instrumentation, live lock removal, history pruning, runtime install,
provider test prompt or client activation was performed.

Next action: separately bound a safe large-history contention repair with full
history and cross-process admission preserved; independently reconcile the
invalid-transition. Qualify installed behavior before resuming either web-client
installation. Do not increase budgets or bypass ownership to manufacture success.

Active planning audit reports42existing findings in other artifacts, none for
Plan0475. The audit is not reported as globally passing. Validation environment:
local Linux with repository-pinned dependencies; hosted Actions skipped by cost
policy. Original checkout and other registered worktrees were preserved.
