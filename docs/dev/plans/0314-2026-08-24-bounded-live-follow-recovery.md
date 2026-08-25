# Bounded Live-Follow Recovery | 0314-2026-08-24

State: OPEN
Lane: P07
Operational state: PROVIDER_FREE_ACCEPTED / INTEGRATION_PENDING
Branch: fix/plan0314-bounded-live-follow-recovery
Target: main
Integration: merge
Revision: 2 | 2026-08-25

## Stable Objective

Get ChatGPT `wsl-chrome-3` live follow running again by replacing the accidental
zero-retry terminal with explicit, bounded, diagnosis-driven retry semantics,
installing the validated repair, proving one successful controlled pass, and
then restoring normal scheduled operation.

## Current State

- Canonical source is clean and published at `a932f3b6`; Plan 0313 repaired the
  provider-local sidebar timeout fallback and forced-pass browser cleanup.
- The installed runtime is stale: its completion-service and ChatGPT-adapter
  JavaScript hashes differ from current `dist`.
- API PID `57888` is systemd-active with zero restarts but operationally
  unhealthy: both installed CLI status and direct `/status` timed out without
  bytes. It uses about 1.5 GiB RSS plus 73 MiB swap.
- Scheduler control is durably paused. Exact managed-browser port 45015 is
  closed and no exact `wsl-chrome-3/chatgpt` managed browser process exists.
- Exact completion
  `acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41` is failed at
  pass 1 with force ceiling 2 and the pre-repair 587 ms predicate error.
- Provider-free source checkpoint `776556bf` admits blocked or failed terminal
  live follow through `run_one_pass` for exactly one additional pass. Bounded,
  completed, and cancelled terminal operations remain closed.
- Fresh validation passes 102/102 affected tests, typecheck, scoped Biome,
  production build, CodeGraph status, plan-library and goal-policy audits, and
  diff hygiene. Installed adoption and live proof have not yet run.

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
