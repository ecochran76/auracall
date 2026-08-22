# History Materialization Managed-Browser Ownership | 0306-2026-08-21

State: OPEN
Lane: P01
Operational state: P1 DIAGNOSED / PROVIDER_FREE RED NEXT

## Stable Objective

Prevent account-mirror history materialization or its cleanup from sharing or
terminating a managed Chrome profile while a foreground AuraCall run owns that
profile, and prevent foreground adoption until background provider work and
cleanup have released the same durable operation fence.

## Current State

- Plan 0305 source and installed representation-fidelity acceptance passed.
- Its sole live submission adopted retained Chrome PID `67609` after the
  refresh browser-operation file released, while account-mirror completion
  `acctmirror_completion_31aee97a...` still held provider work.
- History materialization `hmj_49687afe...` ended at `02:12:12.153Z`; the
  Chrome scope ended at `02:12:13`, exactly when the foreground run lost CDP.
- Current `cleanupHistoryMaterializationManagedBrowser` enumerates and kills
  every PID matching the managed profile. `createHistoryMaterializationService`
  invokes that cleanup after provider work, but the history service never
  acquires the shared file-backed browser-operation dispatcher.
- The in-process provider-work coordinator and foreground-pressure counter do
  not protect an independent foreground CLI process. The durable
  `browser-operations` fence is the cross-process authority.
- Plan 0306 starts with zero install, restart, browser, provider, LitScout, or
  Graphiti effect authority.

## Planning Metadata

- Parent: Plan 0305 terminal representation fidelity.
- Critical-path owner/lane: `/root` / `p0306_history_materialization_browser_ownership`.
- Branch: `fix/plan0302-chatgpt-timeout-signal-cleanup`; integration remains
  blocked until Plan 0305's terminal-fidelity acceptance can be repeated under
  a separately frozen successor gate.
- Target: `main` only after accepted source, installed, and one-call live proof.
- Expected write set: history materialization service, shared browser-operation
  wiring, focused completion/history/dispatcher tests, this plan, roadmap,
  runbook, journal, and bounded receipts.
- Parallel work: none. Lock lifetime and cleanup ordering are one serialized
  ownership contract.

## Required Work

1. Preserve the failed live receipt and uncertainty; do not retry Plan 0305.
2. Add deterministic RED reproducing the false-idle window: background history
   provider work remains active after refresh, foreground acquisition must stay
   blocked, and cleanup must finish before background release.
3. Route the full history-materialization browser-backed provider-work window,
   including success/failure cleanup, through the same file-backed
   managed-profile/service operation used by foreground browser mode.
4. Route stale-running recovery cleanup through the same fence. Never enumerate
   or terminate profile PIDs while another operation owns the exact profile.
5. Keep provider-free/injected paths deterministic; do not launch Chrome or
   invoke providers in tests.
6. Prove ordering for success, failure, stale recovery, busy foreground,
   release-after-cleanup, and unrelated-profile independence.
7. Run focused/affected/full provider-free tests, typecheck, scoped zero-warning
   lint, build, CodeGraph, planning audit, and diff hygiene; push source before
   any installed transition.
8. Only after source acceptance, freeze a distinct installed/live packet. Any
   future LitScout call is a new acceptance and never a retry of Plan 0305.

## Non-Goals

- No LitScout controller change, research action, Analyze, GraphRAG, drafting,
  Graphiti write, generic process cleanup, or account-mirror policy expansion.
- No removal of provider-work coordination or foreground-pressure signaling;
  the durable operation fence complements those in-process controls.
- No install, restart, live prompt, provider call, or browser launch in the
  provider-free slice.

## Acceptance Criteria

- `HMO-R1`: RED proves history cleanup can terminate a profile after a
  foreground owner acquires the prematurely released durable operation.
- `HMO-R2`: browser-backed history provider work and cleanup hold one exact
  file-backed managed-profile/service operation from entry through cleanup.
- `HMO-R3`: foreground acquisition is blocked for the full background window
  and succeeds only after cleanup and release.
- `HMO-R4`: success, failure, and stale-recovery cleanup cannot kill a PID owned
  by another exact-profile operation.
- `HMO-R5`: unrelated profiles remain independent and provider-free regressions
  remain green.
- `HMO-R6`: pushed source passes all provider-free acceptance gates.
- `HMO-R7`: a later installed/live packet returns exact canonical Session 68
  counts after one new read-only call, zero canonical mutation, and exact
  terminal cleanup.

## Bounds And Stops

- One source implementation attempt plus at most one evidence-backed repair.
- Zero install, restart, live prompt, provider call, browser mutation, LitScout
  call, or Graphiti write before pushed source acceptance and a new durable gate.
- Stop if the exact managed-profile key cannot be derived without weakening
  profile/account binding or if cleanup ordering cannot be made deterministic.
- A future Send, if separately gated, has zero retry.

## Definition Of Done

History materialization and its cleanup hold the same durable exact-profile
operation used by foreground AuraCall, no cleanup path can kill a browser owned
by another operation, and one later installed acceptance returns faithful
canonical LitScout state without mutation.
