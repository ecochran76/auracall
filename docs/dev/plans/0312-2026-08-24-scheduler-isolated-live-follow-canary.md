# Scheduler-Isolated Live-Follow Cooldown Canary | 0312-2026-08-24

State: OPEN
Lane: P05
Operational state: ACTIVE / INSTALLED-EFFECT
Branch: ops/plan0312-scheduler-isolated-live-follow-canary
Target: main
Integration: merge
Revision: 1 | 2026-08-24

## Stable Objective

Establish durable account-mirror scheduler isolation, then run one exact
zero-retry `chatgpt/wsl-chrome-3` completion pass that proves the installed
Plan 0310 cooldown-abort repair without autonomous completion fanout. Restore
normal scheduling only after a clean terminal canary and exact cleanup.

## Current State

- Source and remote are clean at
  `4b06b401518f91e444bab3652063fc5e7dcf6624`; the user runtime is already
  byte-exact for the four repaired modules and API PID `57888` is healthy with
  `NRestarts=0` on port 18095.
- The scheduler is enabled in execute mode at 600000 ms, scheduled, and not
  paused. The supported isolation control is one local `POST /status` with
  `accountMirrorScheduler.action=pause`; no config edit or restart is required.
- The Plan 0311 autonomous completion
  `acctmirror_completion_85756c59-a414-45b3-bdac-766fb586595a` is terminal
  failed at pass 2. Its two installed-runtime children settled skipped with
  zero failed materializations, but the parent later failed on a separate
  `Timed out waiting for predicate after 800ms` error. It is not this canary.
- Exact target completion
  `acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41` remains blocked
  at pass 1 with null force ceiling, no provider guard, and old-runtime child
  `hmj_c2936e24ae094be39284b197759b94ab` (0 materialized / 3 skipped /
  4 failed). No target job or managed browser is active.

## Authority And Effect Budget

- Operator `ok go` authorizes the recommended scheduler-isolated successor.
- Authorized: one scheduler `pause`; one exact `run-one-pass` control on the
  frozen target; at most one pass advance and one fresh materialization child;
  read-only monitoring for 30 minutes; exact owned browser cleanup only if the
  completed product path leaves an orphan; one scheduler `resume` only after a
  clean `C1` or `C2` result and zero active target jobs/browser owners.
- Excluded: install, service restart, config edit, scheduler `run-once`, second
  pause/resume, completion creation, any other completion control, retry,
  prompt/composer action, manual navigation, browser-tools mutation,
  `Answer now`, substitute completion/job, direct runtime-state edit, or wider
  live-follow control.
- Critical-path owner: `/root`; serialized work only, no subagents.

## Execution Packet

1. Publish this plan and P05 custody on canonical `main`, then create the owned
   topic branch before runtime effects.
2. Re-read Git/source/install parity, API health, scheduler state, exact target,
   active target jobs, provider guard, browser ownership, and process/listener
   state. Stop on drift or nonterminal provider work.
3. POST exactly one scheduler `pause`. Require a successful receipt plus
   `enabled=true`, `dryRun=false`, `state=paused`, `paused=true`, no active
   scheduler pass, and no target browser/job.
4. Re-freeze the exact target at blocked/pass 1, null force ceiling, old child
   `hmj_c2936e24ae094be39284b197759b94ab`, and no provider guard.
5. Invoke exactly once:
   `auracall api mirror-completion-control acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41 run-one-pass --port 18095 --timeout-ms 15000 --json`.
6. Bind the returned pass and sole fresh child. Monitor only that parent/child,
   scheduler, service, guard, and exact managed browser to terminal with no
   retry and a 30-minute ceiling.
7. Classify the result and reconcile exact cleanup. Resume the scheduler once
   only for clean `C1`/`C2`; otherwise leave it durably paused.
8. Publish terminal docs/custody, integrate to `main`, and verify remote parity.

## Acceptance Criteria

- `SILF-R1`: plan and P05 custody are published on canonical `main` before
  effects.
- `SILF-R2`: one pause establishes durable execute-mode scheduler isolation
  before the completion control and prevents autonomous fanout.
- `SILF-R3`: one exact control advances no farther than pass 2 and creates no
  more than one fresh child on the frozen target.
- `SILF-R4`: the child settles without conversation-context timeout, detached
  cooldown symptom, provider guard, identity mismatch, CAPTCHA, or human
  verification.
- `SILF-R5`: terminal evidence distinguishes useful progress, clean no-yield,
  new exact blocker, or hard stop without retry or target substitution.
- `SILF-R6`: scheduler resumes exactly once only after clean acceptance;
  otherwise it remains paused. Final job/browser/service/Git/docs evidence is
  reconciled.

## Bounds And Hard Stops

- Scheduler pauses: 1; scheduler resumes: 1 conditional; completion controls:
  1; pass advances: 1; fresh children: 1; canary attempts: 1; retries: 0;
  installs/restarts/config edits/scheduler run-once/completion creates: 0;
  prompts/manual browser mutations/`Answer now`/direct runtime edits: 0.
- Poll at 30-60 second cadence for at most 30 minutes after the sole control.
- Stop and leave the scheduler paused on source/install drift, pause failure,
  scheduler pass after pause, active-job overlap, autonomous completion/child
  fanout, substitute target, pass 3, service restart/fault, provider guard,
  identity mismatch, CAPTCHA/human verification, ambiguous ownership, or any
  need to weaken a safety control.

## Terminal Classification

1. `C1_clean_useful_progress`: pass 2 and one child settle with failed count
   zero and at least one materialized asset/checksum; cleanup passes; resume.
2. `C2_clean_no_yield`: pass 2 and one child settle with failed count zero but
   no materialized asset; installed liveness is accepted; cleanup passes;
   resume.
3. `C3_new_exact_blocker`: child or parent fails/skips for another exact
   blocker; record it and leave scheduler paused.
4. `C4_hard_stop`: a safety boundary triggers; preserve evidence and leave the
   scheduler paused without retry.

## Definition Of Done

- All six criteria have current installed/runtime evidence or the packet closes
  honestly under `C3`/`C4` with the exact blocker and paused scheduler.
- Effect accounting is exact and no autonomous action is attributed to P05.
- Plan, roadmap, runbook, journal, lane catalog, Git refs, runtime receipts, and
  remote readback agree.

