# ChatGPT Overall Timeout And Signal Cleanup | 0302-2026-08-21

State: OPEN
Lane: P01
Operational state: P0 ACTIVATION

## Stable Objective

Make an installed AuraCall ChatGPT browser run obey one real wall-clock
deadline and terminalize its exact session, model, managed browser, and shared
browser-operation ownership on timeout, SIGINT, or SIGTERM, so a connected-app
LitScout turn cannot leave false `running` state or permanently block the same
AuraCall runtime profile after the controlling CLI exits.

## Current State

- Plan 0301's minimal lock-lifetime repair is live-proven. During LitScout Plan
  0436, foreground PID `83793` retained exact operation
  `e9fc1c49-79a4-4b3c-8aeb-1e3a7ab3adc2`; the scheduler's exact
  `wsl-chrome-3` attempt at `2026-08-21T21:35:48.244Z` was rejected as
  `refresh-blocked` / `account_mirror_browser_operation_busy`.
- LitScout executed the approved Work-2897 enrichment exactly once under
  receipt `rar_d402c6c23d9910ca523b0ca52d8fa5c0`. Its fulltext job completed
  with zero yield, and one final read-only continuation advanced Session 68 to
  `evidence_gap_review`. Enrichment replay and saturation execution are outside
  this plan.
- The AuraCall run started at `2026-08-21T21:34:52.981Z` with configured
  `--timeout 60m`, but remained nonterminal after that ceiling. One normal
  controlling-terminal SIGINT at approximately 65 minutes ended PID `83793`
  without persisting a terminal session/model result or configured output.
- Exact owned residue remains: Chrome PID `85939` for managed browser profile
  `wsl-chrome-3/chatgpt`; the operation file still names dead owner PID
  `83793`; session `litscout-profile-lock-live-acceptance` and model
  `gpt-5.6-sol` remain `running` with `completedAt=null`.
- API PID `23839` remains active on loopback port `18095` with
  `systemd NRestarts=0`. The stale operation continues to reject scheduler
  attempts, so cleanup is an observed operational blocker rather than cosmetic
  metadata drift.
- LitScout's terminal receipt is
  `docs/dev/validation/0436-auracall-timeout-cleanup-terminal.json` on pushed
  branch `plan/0436-auracall-post-submit-lock-live-acceptance` at `6c0e99b6`.

## Planning Metadata

- Parent: Plan 0301 post-submit profile-lock repair.
- Cross-repo predecessor: LitScout Plan 0436 terminal receipt at pushed commit
  `6c0e99b6`.
- Critical-path owner/lane: `/root` /
  `p0302_chatgpt_timeout_signal_cleanup`.
- Branch: `fix/plan0302-chatgpt-timeout-signal-cleanup`.
- Target: `main` through the repo's normal short-lived feature-branch path.
- Integration method: fast-forward only after source, installed, and live
  acceptance; otherwise retain the pushed branch as explicit custody.
- Base checkpoint: `e5917183ed38fb1a8cc10073289040d6a23048e2`.
- Expected write set: CLI/session orchestration, browser cancellation/cleanup
  seams, focused tests, operator docs, this plan, `ROADMAP.md`, `RUNBOOK.md`,
  `docs/dev/dev-journal.md`, `docs/dev-fixes-log.md`, and durable source/
  installed/live receipts.
- Dependencies: accepted Plan-0301 lock semantics and the exact Plan-0436
  residue named above.
- Overlaps: no concurrent or delegated lane exists; stale runtime ownership is
  reconciled serially by this lane.
- Parallel work: none. Diagnosis, cleanup design, implementation, installation,
  and live acceptance touch one coupled lifecycle and stay serialized.

## Required Work

1. Preserve the Plan-0436 receipt, one-time LitScout effect, and exact dead
   owner/browser/session/operation evidence before cleanup.
2. Use current CodeGraph flow/impact context to trace `--timeout` from CLI
   parsing through session execution into `runBrowserMode`, and trace SIGINT /
   SIGTERM from process handling into session/model persistence, browser close
   or intentional retention, and browser-operation release.
3. Add deterministic regressions that are RED on current source for:
   - one overall wall-clock deadline that spans browser launch, prompt submit,
     connected-app approval cycles, response wait, and answer extraction;
   - timeout cancellation that releases exact browser-operation ownership,
     applies the configured browser-preservation policy, and persists one
     terminal session/model result;
   - SIGINT/SIGTERM cleanup that awaits the same idempotent terminalization
     seam instead of exiting directly and bypassing `finally` cleanup;
   - repeated terminal signals or late async completion that cannot overwrite
     the first terminal result or release another owner's operation.
4. Implement the smallest shared lifecycle repair that satisfies those tests.
   Use one abort/deadline owner and one idempotent terminal-cleanup seam; do not
   add a provider-specific watchdog, raw file deletion, or a second lock.
5. Reconcile only the exact Plan-0436 residue through a supported repaired
   surface after proving dead owner PID, session id, managed browser profile,
   Chrome PID, and operation id still match. Preserve unrelated browsers,
   operations, sessions, scheduler state, and account-mirror jobs.
6. Run focused and affected tests, typecheck, scoped zero-warning lint, build,
   isolated full provider-free tests, current CodeGraph, planning audit, and
   diff hygiene. Commit and push the source candidate.
7. At an exact idle boundary, install once and restart the AuraCall API at most
   once if the installed/API module set requires it. Prove pushed/source/
   installed affected-byte parity and healthy runtime identity.
8. Run deterministic installed timeout and signal-cleanup probes with a
   disposable AuraCall home or exact non-provider harness. They must prove
   bounded elapsed time, terminal session/model status, browser policy, and
   empty operation ownership without a real LitScout effect.
9. Run one distinct installed ChatGPT/LitScout acceptance using the existing
   `wsl-chrome-3` managed browser profile and retained conversation. The prompt
   may authenticate and call only read-only `research_continue` for Session 68,
   report the current `evidence_gap_review` state, and return. It may not
   execute enrichment, saturation, Analyze, GraphRAG, drafting, or Graphiti.
10. Reconcile the final AuraCall output/session/browser/operation/runtime and
    unchanged LitScout receipts/corpus/controller, close both plan authorities,
    commit/push, and integrate only if all stated acceptance evidence agrees.

## Non-Goals

- No retry or replay of Session-68 search, downselection, enrichment approval,
  enrichment execution, or fulltext work; no saturation acceptance or second
  research write.
- No selector, composer-mode, model-selection, exact-card fingerprint, approval
  action, account identity, connected-app OAuth, or scheduler policy change.
- No manual operation-file deletion, broad stale-state sweep, arbitrary Chrome
  kill, managed browser profile reseed, browser-account switch, or raw CDP
  mutation.
- No new daemon, queue, operation dispatcher, session store, provider-specific
  watchdog, or parallel cleanup path.
- No positive or unknown spend, Analyze, GraphRAG, drafting, declaration work,
  Graphiti write, filing, publication, signature, or third-party communication.
- No release, tag, npm publication, dependency upgrade, or unrelated runtime
  cleanup.

## Critical Path

1. `P0`: push this frozen activation and exact residue/authority boundary.
2. `P1`: obtain CodeGraph flow/impact context and deterministic timeout/signal
   RED evidence before implementation.
3. `P2`: implement one shared abort plus idempotent terminalization seam and
   prove focused/affected GREEN.
4. `P3`: safely reconcile the exact Plan-0436 residue through the repaired
   supported path and prove unrelated state unchanged.
5. `P4`: complete provider-free source acceptance, docs, receipt, commit/push,
   and source/remote audit.
6. `P5`: install once, restart at most once, prove byte/runtime parity, and run
   installed deterministic timeout/signal probes.
7. `P6`: run one no-write LitScout connected-app readback and reconcile all
   terminal and canonical state.
8. `P7`: close/integrate only when source, installed runtime, live terminal
   behavior, repositories, remotes, and zero-write LitScout evidence agree.

## Acceptance Criteria

- `TSC-R1`: one absolute deadline begins before provider execution and cannot
  be reset by response polls, tool-approval cards, navigation, or extraction.
- `TSC-R2`: timeout aborts in-flight browser work and resolves within a bounded
  cleanup grace period with a stable typed timeout result.
- `TSC-R3`: SIGINT and SIGTERM use the same awaited, idempotent cleanup seam;
  the first signal terminalizes, a repeated signal cannot double-release or
  overwrite state, and process exit does not bypass `finally` cleanup.
- `TSC-R4`: every timeout/signal terminal path persists session and model as a
  terminal state with `completedAt`, error/cancellation reason, and no false
  output; late async completion cannot resurrect `running` or claim success.
- `TSC-R5`: exact browser-operation ownership is removed only for the owning
  operation; the managed browser is closed or retained exactly according to
  configured policy; unrelated profiles/processes/operations are unchanged.
- `TSC-R6`: the exact Plan-0436 residue is reconciled without raw deletion,
  broad cleanup, LitScout replay, or scheduler-control mutation.
- `TSC-R7`: focused/affected/full provider-free tests, typecheck, build, scoped
  lint, current CodeGraph, planning audit, and diff hygiene pass on pushed
  source.
- `TSC-R8`: installed affected artifacts are byte-exact with pushed source;
  deterministic installed timeout and signal probes finish inside their bounds
  with terminal state and empty owned operation residue.
- `TSC-R9`: one installed no-write LitScout connected-app turn returns a
  terminal AuraCall answer; canonical LitScout receipts, 150/12/138 corpus,
  `evidence_gap_review` state, and next action remain unchanged.
- `TSC-R10`: intended branches/remotes are clean and exact at closure, and no
  source test, healthy API, or successful LitScout side effect is substituted
  for terminal installed acceptance.

## Bounds And Stops

- One implementation attempt plus at most one evidence-backed repair.
- One exact stale-residue reconciliation after installed/source proof; no raw
  deletion and no unrelated session/browser/operation cleanup.
- One user-runtime install and at most one API restart.
- One installed timeout probe and one installed signal probe, both provider-free
  and disposable/exactly owned.
- One new live LitScout read-only prompt submission, zero retry, resubmission,
  regenerate, write action, or completed-action replay.
- Stop before mutation on source/install/remote/runtime/profile/account/
  conversation/residue identity drift, ambiguous ownership, human verification,
  unknown spend, or any need to weaken existing lock/approval/account guards.
- Stop after the live Send without retry if the UI, tool disposition, browser,
  terminal output, or canonical LitScout state is ambiguous. Read durable local
  state only; do not submit a second prompt or research action.

## Definition Of Done

AuraCall enforces one real overall deadline across a connected-app ChatGPT run,
awaits the same idempotent terminal cleanup on timeout and process signals,
persists terminal session/model state, releases only exact owned browser state,
and proves those semantics in source, installed deterministic probes, and one
installed no-write LitScout turn that returns a terminal answer while canonical
LitScout state and receipts remain unchanged.
