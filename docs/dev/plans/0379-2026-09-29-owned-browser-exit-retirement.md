# Owned Browser Exit Registry Retirement | 0379-2026-09-29

State: OPEN
Lane: P79
Work item: ecochran76/auracall#135
Source base: `origin/main` at `660b7ec7473d2f5bbee60f9ac83c817f91dbda8f`
Branch: `fix/issue-135-browser-exit-retirement`
Target: `main`
Integration: merge

## Stable Objective

Retire the exact browser registry generation when an AuraCall-owned Chrome
process exits, clearing its owner, operation, and lease projection without
allowing a delayed event or reused PID to remove a replacement instance.

## Current Evidence

- The failed `wsl-chrome-3` materialization browser and DevTools endpoint were
  absent while `browser-state.json` retained PID `63650`, port `45015`, and the
  failed job's owner, operation, and lease.
- Linux later reused PID `63650` for `slack-receipts-mcp`; Slack did not hold or
  acquire the browser lease, but the stale record made the processes appear
  related.
- `registerTerminationHooks` handles `SIGINT`, `SIGTERM`, and `SIGQUIT` by
  invoking the browser handle's `kill()`. Owned launch handles unregister on
  explicit `kill()`, but ordinary child exit has no registry retirement
  observer.
- Existing `unregisterInstance` deletes by managed browser profile identity
  only. A delayed old-process callback could therefore delete a newer
  replacement registered under the same key.
- Later liveness discovery can prune dead entries, but it is a recovery path,
  not immediate lifecycle settlement.
- Graphiti discovery was available but returned no relevant prior durable fact;
  current runtime evidence and repository source are authoritative.

## Current State

- Issue 135 is open, assigned, and linked to this active implementation lane.
- The generation-matched registry test first failed because no conditional
  retirement API existed; the owned-child-exit test then failed because no
  exit observer invoked retirement.
- Matching retirement now compares PID, DevTools port, and `launchedAt` under
  a cross-process registry lock. Owned child exit, explicit kill, and the
  existing SIGTERM hook converge on that idempotent operation.
- Focused and adjacent provider-free validation passes 55 tests across eight
  files, plus typecheck and production build. No live effect was used.

## Execution Packet

1. Add generation-matched registry retirement using stable instance identity
   from the owned launch record.
2. Prove red then green for matching retirement, repeated retirement, and a
   replacement generation that must survive an old exit callback.
3. Attach retirement to the owned Chrome child exit path and keep explicit
   `kill()` / signal cleanup on the same idempotent contract.
4. Preserve adopted/external browser non-ownership and retain liveness pruning
   as abrupt-crash recovery.
5. Update lifecycle documentation and durable fix notes, then run focused
   provider-free tests, typecheck, formatting, and planning/lane audits.

## Acceptance

- Owned child exit retires the exact matching registry entry and its embedded
  owner, operation, and lease.
- Explicit kill, including signal-driven kill, uses the same generation-safe,
  idempotent retirement.
- A replacement instance with a different PID, port, or launch generation
  survives a stale callback.
- Reused/adopted external Chrome keeps its existing ownership behavior.
- No provider, browser launch, service restart, scheduler mutation, or live
  acceptance is performed by this source-repair lane.

## Stop Conditions

- Stop if the only viable implementation requires killing or adopting an
  unverified process by PID.
- Stop if registry matching cannot distinguish an old owned launch from its
  replacement without a schema migration wider than this issue.
- Stop before installed-runtime or provider effects; those require a separate
  explicit acceptance gate.

## Current Next Action

Complete diff and planning hygiene, publish the implementation checkpoint, and
open the issue-linked PR for canonical integration.
