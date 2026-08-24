# Scheduler-Isolated Live-Follow Cooldown Canary | 0312-2026-08-24

State: CLOSED
Lane: P05
Operational state: TERMINAL_HARD_STOP / C4 / INTEGRATED
Branch: ops/plan0312-scheduler-isolated-live-follow-canary
Target: main
Integration: merge
Revision: 3 | 2026-08-24

## Stable Objective

Establish durable account-mirror scheduler isolation, then run one exact
zero-retry `chatgpt/wsl-chrome-3` completion pass that proves the installed
Plan 0310 cooldown-abort repair without autonomous completion fanout. Restore
normal scheduling only after a clean terminal canary and exact cleanup.

## Terminal State

- Plan and P05 custody were published on canonical `main` through `a894156a`
  before effects. The seven-file provider-free ChatGPT contract gate passed
  135 tests.
- One supported scheduler `pause` returned `ok=true` and established
  `enabled=true`, `dryRun=false`, `state=paused`, `paused=true`. No scheduler
  pass or autonomous completion started afterward.
- One exact `run-one-pass` on completion
  `acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41` queued the
  frozen parent with force ceiling 2. Its initial eligibility checks deferred
  first for failure backoff and then foreground work; no second control ran.
- The provider operation launched exact managed browser PID `63902` on port
  45015 under API PID `57888`. The parent failed at
  `2026-08-24T15:53:14.132Z` with `Timed out waiting for predicate after
  587ms`, released its provider-work lease, remained at pass 1, and created no
  fresh materialization child. No provider guard was raised.
- The failed parent left Chrome PID `63902` listening for more than the
  30-minute observation ceiling despite zero active target jobs. Exact orphan
  cleanup sent one SIGTERM only to PID `63902`; the process and port 45015 then
  disappeared. API PID `57888` remained active/running with `NRestarts=0`.
- Classification is `C4_hard_stop`: predicate failure prevented the canary
  pass, and terminal cleanup did not occur within the bounded envelope. The
  scheduler remains durably paused; conditional resume was not entered.

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

## Acceptance Result And Effect Accounting

- `SILF-R1`: accepted. Canonical plan/custody checkpoint `a894156a` preceded
  all runtime effects.
- `SILF-R2`: accepted. One pause established durable execute-mode isolation;
  no autonomous completion or child fanout followed.
- `SILF-R3`: rejected. The one control was consumed, but the parent failed at
  pass 1 before advancement and created zero fresh children.
- `SILF-R4` and `SILF-R5`: not accepted. The intended materialization child
  never existed; the exact new blocker is a 587 ms predicate timeout before
  pass advancement, followed by a retained owned browser.
- `SILF-R6`: accepted for the hard-stop path. Scheduler resume remained `0/1`,
  the scheduler is paused, exact orphan cleanup succeeded, and service/runtime
  ownership is reconciled.
- Effects: scheduler pauses `1/1`; scheduler resumes `0/1`; completion controls
  `1/1`; pass advances `0/1`; fresh children `0/1`; retries `0`; exact orphan
  SIGTERM cleanup `1`; installs/restarts/config edits/scheduler run-once/
  completion creates/prompts/manual browser mutations/`Answer now` actions/
  direct runtime edits all `0`.
- Exact remaining gate: provider-free diagnosis must localize the sub-second
  predicate timeout and why failed completion cleanup retained the managed
  browser after provider-work release. Plan 0312 grants no retry or successor
  live effect.
- Durable receipts: terminal checkpoint `193fd1e8` merged to `main` through
  `f133601e`; P05 custody is integrated without changing the C4 result.
