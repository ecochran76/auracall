# ChatGPT Post-Submit Profile Lock | 0301-2026-08-21

State: CLOSED
Lane: P01
Operational state: LOCK LIVE ACCEPTED; TERMINALIZATION FAILED AND SUPERSEDED BY PLAN 0302

## Stable Objective

Keep AuraCall's existing profile-wide browser-operation lock for the complete
owned ChatGPT operation—not merely through Send—so account-mirror refresh and
other same-profile work cannot take the managed browser while a foreground run
is still waiting for a response, handling tool approvals, or extracting its
terminal answer.

## Current State

- LitScout Plan 0436 live-proved this plan's lock repair: the exact same-profile
  scheduler refresh was rejected while foreground PID `83793` retained the
  operation. LitScout executed its approved action once and advanced.
- The AuraCall run then exceeded configured `60m`; one normal SIGINT left its
  Chrome PID, operation record, and session/model state nonterminal. This is a
  distinct deadline/signal-cleanup defect, not a failure of the lock repair.
  Plan 0302 owns it. Plan 0301 closes without claiming its original
  end-to-end terminal-result definition of done.

- Plan 0300's pushed exact-card repair at `fa831b02` is provider-free accepted,
  installed byte-exact, and served by API PID `39605` after one restart.
- The one Plan-0435 LitScout acceptance passed exact conversation, mode, model,
  editor, and Send gates, then errored at `2026-08-21T21:05:54.290Z` with a
  closed-window classification.
- Chrome did not close: managed PID `41732` remained alive and DevTools port
  `36605` remained responsive after the error.
- The durable operation record shows API PID `39605` acquired the same managed
  profile at `21:05:53.526Z` for
  `account-mirror-refresh:chatgpt:wsl-chrome-3`, one second before the
  foreground CLI lost CDP.
- Source diagnosis localizes the ownership gap. `runBrowserMode` acquires the
  shared file-backed managed-profile operation, then the ChatGPT path releases
  it in `onPromptDispatched` and again after `submitOnce`, although it continues
  to use the target for response polling, deep-research handling, tool approval,
  and answer extraction. Final cleanup already has the correct common release
  seam.
- Fresh canonical LitScout readback proves no controller effect reached
  execution: Session 68 remains `enrichment_ready` at 150/12/138 with the same
  approved Work-2897 full-text plan, no enrichment receipt, zero new provider
  calls/spend, and no completed-action replay authority.
- P0 activation is pushed at `b1768213`. The deterministic ownership test was
  RED with the two early release stages present and is GREEN after removing
  only those calls. A real file-backed dispatcher regression proves an
  account-mirror owner cannot acquire the same profile while foreground
  post-submit ownership is active and can acquire after terminal release.
- Focused/affected validation passes `77/77`; typecheck, scoped zero-warning
  lint, production build, and isolated provider-free validation pass (`2,944`
  passed / `65` skipped). CodeGraph is current at 906 files / 17,016 nodes /
  57,845 edges. No install, restart, browser prompt, LitScout action, provider
  call, or Graphiti write occurred. Receipt:
  `docs/dev/notes/2026-08-21-plan0301-post-submit-profile-lock-source-acceptance.json`.
- Source is pushed and upstream-exact at `736556d4`. The plan-owned one install
  and one API restart are consumed; API PID `23839` is active on loopback port
  `18095`, and installed/source `dist/src/browser/index.js` bytes match SHA-256
  `53a9f3ed...c6ea`.
- One harmless installed browser lifecycle run completed exactly once at slug
  `post-submit-lock-canary`. Foreground PID `32312` owned the exact managed
  profile operation during the run; terminal cleanup removed the operation and
  returned the exact requested answer. The model ignored the requested delay
  and completed in 12.5 seconds, so no natural scheduler overlap was observed.
- A second phase of the same installed contention packet imported the installed
  dispatcher and proved the exact account-mirror owner was rejected while the
  foreground operation existed and admitted after release. Temporary state was
  removed. No LitScout action, literature/patent provider call, or Graphiti
  write occurred. Receipt:
  `docs/dev/notes/2026-08-21-plan0301-installed-contention-acceptance.json`.

## Planning Metadata

- Parent: Plan 0300 exact-card acknowledgment repair.
- Cross-repo predecessor: LitScout Plan 0435 terminal receipt
  `docs/dev/validation/0435-auracall-post-submit-lock-terminal.json` in the
  LitScout repository.
- Critical-path owner/lane: `/root` / `p0301_post_submit_profile_lock`.
- Branch/worktree: `fix/plan0301-chatgpt-post-submit-profile-lock` in the primary
  AuraCall worktree.
- Expected write set: `src/browser/index.ts`; focused browser/account-mirror
  regressions; this plan; `ROADMAP.md`; `RUNBOOK.md`; `docs/testing.md`;
  `README.md`; `docs/dev/dev-journal.md`; `docs/dev-fixes-log.md`; one source/
  install acceptance receipt. A distinct LitScout successor owns its prompt,
  live output, and controller receipt.
- Parallel work: none. Diagnosis, RED/GREEN, source acceptance, install/runtime
  transition, contention canary, and real LitScout acceptance remain serialized.

## Required Work

1. Preserve Plan-0435's exact session, operation record, live browser evidence,
   canonical LitScout state, and zero-replay boundary.
2. Add a deterministic regression at the browser-mode ownership seam that is
   RED while the ChatGPT path can release its operation at dispatch/submission
   and GREEN only when the lock remains owned through post-submit work.
3. Retain existing preflight-failure and final-cleanup releases. Do not add a
   second lock, special-case the account mirror, or widen operation classes.
4. Remove only the two early ChatGPT releases and update the historical
   after-Send rationale. `prompt_submitted` completion must still return and
   release through normal cleanup.
5. Prove the file-backed dispatcher prevents a same-profile account-mirror
   acquisition while foreground post-submit work is active, then permits it
   after the foreground run releases.
6. Run focused and affected browser/account-mirror/tool-approval tests,
   typecheck, build, scoped zero-warning lint, isolated full provider-free
   tests, CodeGraph readback, plan audit, and diff hygiene.
7. Commit/push accepted source; at a proven idle and exact-ownership boundary,
   install once and restart the AuraCall API exactly once for this plan. Prove
   pushed/source/installed affected-byte parity and runtime ownership.
8. Run one deterministic installed contention canary without LitScout effects.
   It must show the foreground browser execution owns the exact profile after
   Send and account-mirror work cannot acquire until terminal cleanup.
9. Freeze and push a distinct LitScout plan before one new zero-retry prompt.
   Begin from fresh controller readback, execute only the current approved
   zero-positive-spend action, and reconcile durable receipts before closure.

## Non-Goals

- No new operation-dispatcher abstraction, alternate lock root, lease deletion,
  queue bypass, account-mirror disablement, or broad scheduler refactor.
- No tool-approval selector/fingerprint change beyond Plan 0300, Chat/Work
  semantic change, browser reseed, manual CDP mutation, or arbitrary Chrome
  process termination.
- No replay of Session-68 search, downselection, or enrichment approval; no
  stale-token recovery, direct approval-store write, or positive/unknown spend.
- No Analyze, drafting, GraphRAG, Graphiti write, OAuth widening, filing,
  publication, signature, or third-party communication.
- No release, tag, npm publication, or unrelated runtime cleanup.

## Critical Path

1. `P0`: commit and push this frozen activation before source/test edits.
2. `P1`: prove the deterministic lock-lifetime RED and record hypotheses.
3. `P2`: remove only the two early ChatGPT releases; prove focused GREEN and
   same-profile contention behavior.
4. `P3`: complete provider-free source acceptance, docs, receipt, commit/push,
   and source/remote audit.
5. `P4`: prove an idle exact-ownership boundary, install once, restart once,
   and prove installed/runtime parity.
6. `P5`: run one installed no-LitScout contention canary and reconcile all
   process/profile/operation identities.
7. `P6`: activate a distinct LitScout successor and run one zero-retry real
   acceptance from fresh current controller authority.
8. `P7`: close both repos only when runtime, receipt, corpus/economics, source,
   install, branch, and remote evidence agree.

## Acceptance Criteria

- `PSL-R1`: the deterministic regression is RED on an early post-Send release
  and GREEN only when the ChatGPT operation remains held through post-submit
  work.
- `PSL-R2`: same-profile account-mirror acquisition queues or reports busy
  while the foreground operation is active, then succeeds after final release.
- `PSL-R3`: preflight failures and every terminal success/error path release
  exactly once; `prompt_submitted` does not retain an orphan lock.
- `PSL-R4`: the repair changes only existing lock lifetime and preserves
  operation keys/classes, owner attribution, profile identity, queue/busy
  semantics, exact-card handling, and browser-preservation policy.
- `PSL-R5`: focused/affected/full provider-free tests, typecheck, build, scoped
  lint, CodeGraph, plan audit, and diff hygiene pass on pushed source.
- `PSL-R6`: installed affected artifacts are byte-exact with pushed source; one
  plan-owned API restart returns a healthy exact runtime without unidentified
  browser/process ownership.
- `PSL-R7`: an installed contention canary proves the account mirror cannot
  take the managed profile during the foreground post-submit interval.
  **PASS as a composite installed packet**: real foreground operation lifetime
  and cleanup plus installed exact-owner contention/release passed. Natural
  scheduler overlap was not observed because the model completed too quickly.
- `PSL-R8`: one separately frozen real LitScout run reaches exact-card approval,
  returns a terminal AuraCall result, and reconciles to durable Session-68
  receipts with zero duplicate click, retry, replay, or out-of-envelope effect.
- `PSL-R9`: both repositories and intended remotes are clean/upstream-exact at
  closure, and no green source/runtime health is misreported as live acceptance.

## Bounds And Stops

- One implementation attempt plus at most one evidence-backed repair.
- One user-runtime install and one AuraCall API restart after pushed source
  acceptance in this plan.
- One installed contention canary with no LitScout/controller/provider effect.
- One new LitScout prompt submission under a separately pushed plan; zero
  resubmissions, regenerate, stale-token recovery, or completed-action replay.
- Before cleanup or restart, prove exact PID, command, profile, endpoint, and
  operation ownership. Preserve unrelated or ambiguous processes and browsers.
- Stop before live effects on source/install/remote/runtime/profile/account/
  conversation/controller drift, active ambiguous foreground work, unknown
  spend, or missing exact current action authority.
- Stop after Send without retry on unresolved disposition, duplicate risk,
  profile/target/account drift, or any effect outside the frozen envelope.

## Definition Of Done

AuraCall's existing managed-profile operation remains owned for the full
foreground ChatGPT lifecycle and is released on terminal cleanup; installed
contention proof prevents account-mirror interference; one separately governed
LitScout run returns a terminal result with exact-card and durable-receipt
agreement; and source, runtime, repositories, remotes, corpus, provider calls,
and spend are reconciled.
