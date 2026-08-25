# Bounded Live-Follow Recovery | 0314-2026-08-24

State: CLOSED
Lane: P07
Operational state: LIVE_ACCEPTED / INTEGRATED
Branch: main
Target: main
Integration: merge
Revision: 3 | 2026-08-25

## Stable Objective

Get ChatGPT `wsl-chrome-3` live follow running again by replacing the accidental
zero-retry terminal with explicit, bounded, diagnosis-driven retry semantics,
installing the validated repair, proving one successful controlled pass, and
then restoring normal scheduled operation.

## Current State

- Provider-free repair `776556bf` and documentation checkpoint `51287ed7`
  merged to `main` through `af17fa89`; source and installed completion-service
  and ChatGPT-adapter JavaScript hashes are byte-identical.
- The supported installer replaced API PID `57888` with PID `62038`. The user
  service is active/running with zero restarts and no swap use.
- One exact `run-one-pass` control re-armed completion
  `acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41`. It advanced
  from failed/pass 1 to idle/pass 2, cleared its error and force ceiling, and
  settled materialization job `hmj_543a8a0948774cbb9367b3e40017b814`
  as skipped with zero failures.
- The controlled pass and its completion-owned materialization each cleaned
  the exact managed browser. No process or listener remained for
  `wsl-chrome-3/chatgpt` / port 45015 at the resume gate.
- Scheduler resume ran exactly once at `2026-08-25T14:42:34.211Z`. Its first
  scheduled pass completed at `2026-08-25T14:48:18.960Z` for
  `chatgpt/wsl-chrome-3` with `refresh-completed`, no backpressure, healthy
  posture, and a clean exact-browser teardown.
- Aggregate status is responsive with a 30-second client budget, observed in
  11-22 seconds on the current corpus. The default 5-second CLI budget remains
  a separate performance caveat; narrow completion and scheduler diagnostics
  stayed responsive throughout recovery.

## Authority And Bounds

- The operator authorizes up to ten continuation turns to get live follow
  running again and explicitly rejects zero-retry policy in favor of bounded,
  diagnosis-driven retries.
- One critical-path owner, no subagents.
- At most two install/service-restart attempts. A second is allowed only after
  current health evidence identifies a remediable adoption failure.
- At most three new `run_one_pass` controls on the exact completion. Attempts
  are serialized. Attempt 2 or 3 requires a fresh terminal diagnosis and a
  concrete remediation or changed condition; blind same-state retry is
  forbidden.
- Scheduler stays paused through installed adoption and controlled-pass proof.
  It may be resumed once after a successful pass and clean browser ownership.
- Hard stop on CAPTCHA/human verification, identity conflict, provider guard,
  unknown browser ownership, duplicate same-profile active work, destructive
  recovery need, or a failure class with no reasonable bounded remediation.
- Never click ChatGPT `Answer now`; no prompt/composer action is in scope.

## Execution Graph

1. Publish P07 custody, add RED/GREEN control regression, and integrate the
   smallest failed-live-follow re-arm repair.
2. Install current `main`, restart the user API through the supported installer,
   and prove source/installed byte identity plus responsive status.
3. Re-read exact completion, provider guard, job ownership, browser process,
   and scheduler pause state.
4. Issue controlled attempt 1. Observe to terminal pass outcome and exact
   cleanup; on failure classify and remediate before any bounded retry edge.
5. After one successful pass, resume the scheduler once and verify responsive
   scheduled operation without duplicate same-profile ownership.
6. Record durable runtime evidence, close P07, and leave any unrelated repair
   outside this lane.

## Acceptance Criteria

- `BLFR-R1`: `run_one_pass` re-arms a failed live-follow operation for exactly
  one pass; failed bounded and cancelled operations remain terminal.
- `BLFR-R2`: current source is installed byte-identically and the replacement
  API is responsive with a fresh PID and zero restart loop.
- `BLFR-R3`: the exact completion advances beyond pass 1 under no more than
  three new controls, with diagnosis/remediation evidence between failures.
- `BLFR-R4`: a successful forced pass clears its force ceiling/error, returns
  to the bounded idle state, and leaves no orphan exact managed browser.
- `BLFR-R5`: scheduler resume is performed at most once after R4; current status
  proves unpaused scheduled operation, API responsiveness, and no duplicate
  same-profile active owner.
- `BLFR-R6`: tests, typecheck, lint, build, CodeGraph, plan audit, Git custody,
  runtime identity, attempt accounting, and live-effect accounting agree.

## Non-Goals

- No unbounded automatic retry loop or retry on an unchanged unexplained
  failure.
- No selector broadening, shared predicate weakening, identity repair, CAPTCHA
  automation, provider mutation, prompt, `Answer now`, or materialization
  replay outside completion-owned normal behavior.
- No cleanup of unrelated browser processes, worktrees, branches, or data.

## Definition Of Done

- All six criteria have current source, installed, and runtime evidence.
- Live follow is operational again under the normal scheduler, not merely
  provider-free or installed-ready.
- Retry and restart counters, every diagnosis/remediation transition, and exact
  browser ownership are durably recorded.

## Closeout Evidence

- `BLFR-R1`: focused and affected provider-free coverage passes 102/102;
  bounded failed/blocked and cancelled/completed terminal behavior remains
  closed as specified.
- `BLFR-R2`: one install/restart attempt; PID `62038`, `NRestarts=0`, active and
  running; both installed repair hashes equal current `dist`.
- `BLFR-R3`: one new exact completion control; pass count advanced 1 -> 2 with
  matching ChatGPT identity evidence and no provider guard.
- `BLFR-R4`: completion is `idle_waiting`, `forceRunUntilPassCount=null`,
  `error=null`; materialization settled without failure and exact browser
  ownership cleaned before resume.
- `BLFR-R5`: one scheduler resume; durable control is unpaused and the first
  post-resume pass completed successfully without backpressure or duplicate
  same-profile ownership.
- `BLFR-R6`: tests, typecheck, scoped Biome, build, CodeGraph, plan and goal
  audits, clean Git custody, installed hashes, one restart, one completion
  control, and one scheduler resume agree. P07 is closed and integrated.
