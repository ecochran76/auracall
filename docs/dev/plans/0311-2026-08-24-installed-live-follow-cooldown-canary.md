# Installed Live-Follow Cooldown Canary | 0311-2026-08-24

State: OPEN
Lane: P04
Operational state: ACTIVE / INSTALLED-EFFECT
Branch: ops/plan0311-installed-live-follow-canary
Target: main
Integration: merge
Revision: 1 | 2026-08-24

## Stable Objective

Install the accepted Plan 0310 live-follow cooldown-abort repair into the
user-scoped AuraCall runtime, restart the one owned API service, and run one
exact zero-retry `wsl-chrome-3` live-follow canary that proves the repaired
deadline and cancellation semantics under installed provider work.

## Current State

- Source `main == origin/main == ccac5c0ee48991ae9a8fc4c1cca2a39f388a2c60`;
  Plan 0310 source checkpoint `c1da8609` merged through `828bb3f8`.
- Installed AuraCall reports `0.1.1`; `auracall-api.service` is active/running
  as PID `78882`, started 2026-08-23 21:14:08 CDT on port 18095.
- The configured scheduler is enabled, execute-mode, scheduled, and not
  operator-paused. No scheduler control is authorized in this packet.
- Exact target completion
  `acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41` is blocked at
  pass 1 with `account_mirror_materialization_failed` and a null force ceiling.
- Its latest old-runtime child
  `hmj_c2936e24ae094be39284b197759b94ab` ran once from 13:56:14Z to 14:05:56Z,
  failed terminally with 0 materialized / 3 skipped / 4 failed, and left zero
  active `chatgpt/wsl-chrome-3` history jobs.
- Managed browser profile `wsl-chrome-3/chatgpt` is currently owned by the API
  service at PID 73391 / port 45015. Installation must wait for a terminal,
  non-provider-working boundary; the service restart may close this exact child.

## Authority And Effect Budget

- The operator's `ok go` authorizes the recommended installed-effect packet.
- Authorized: one `pnpm run install:user-runtime-service`, which comprises one
  user-runtime install and one owned `auracall-api.service` restart; one exact
  `run-one-pass` control on the frozen completion; at most one pass advance and
  one fresh history-materialization child; read-only monitoring and exact owned
  browser cleanup only if the product path leaves it orphaned.
- Excluded: retry, second install, second restart, scheduler control, any other
  completion control, guard/config/account-library change, direct runtime-state
  edit, prompt/composer action, manual navigation, browser-tools mutation,
  `Answer now`, substitute target/job, or broad live-follow resume.
- Critical-path owner: `/root`; serialized work only, no subagents.

## Execution Packet

1. Publish this frozen gate and P04 custody before effects.
2. Re-read exact source/remote state, service PID, scheduler state, completion,
   active history jobs, provider guard, managed browser ownership, and installed
   file hashes. Stop on nonterminal provider work or identity/guard ambiguity.
3. Run `pnpm run install:user-runtime-service` exactly once. Require a new
   active/running API PID, `NRestarts=0`, port 18095 health, and byte parity for
   the repaired installed JavaScript modules against the current build.
4. Re-read the exact completion and require pass 1, blocked/idle state, null
   force ceiling, zero active history jobs, and no provider guard.
5. Invoke exactly once:
   `auracall api mirror-completion-control acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41 run-one-pass --port 18095 --timeout-ms 15000 --json`.
6. Bind the returned pass and sole fresh child. Monitor only that parent/child,
   service, guard, scheduler readback, and owned browser until terminal, with a
   30-minute observation ceiling and no retry.
7. Classify the canary, record exact receipts and cleanup, then close/integrate
   docs without another provider effect.

## Acceptance Criteria

- `ILFC-R1`: plan and P04 custody are published before effects.
- `ILFC-R2`: exactly one install and one service restart yield current-build
  installed parity and a healthy new API PID.
- `ILFC-R3`: exactly one completion control advances no farther than pass 2 and
  creates no more than one fresh child.
- `ILFC-R4`: the fresh child settles terminally without a conversation-context
  timeout, detached cooldown symptom, provider guard, identity mismatch,
  CAPTCHA, or human-verification surface.
- `ILFC-R5`: terminal result and promoted receipts distinguish clean useful
  progress, clean no-yield, or a new exact blocker; no retry masks the outcome.
- `ILFC-R6`: final process/listener, service, scheduler, completion, active-job,
  Git, plan, and lane evidence is reconciled and published.

## Bounds And Hard Stops

- Installs: 1; API restarts: 1; completion controls: 1; pass advances: 1;
  fresh children: 1; canary attempts: 1; retries: 0; scheduler controls: 0;
  other completion controls: 0; prompts: 0; manual browser mutations: 0;
  `Answer now` actions: 0; direct runtime-state edits: 0.
- Observation ceiling: 30 minutes after the one control. Poll read-only state
  at 30-60 second cadence; unchanged in-progress state is expected.
- Stop on source/remote drift, nonterminal provider work before install,
  service restart/fault after the owned restart, active-job overlap, unexpected
  child fanout, pass 3, provider guard/cooldown bypass need, identity mismatch,
  CAPTCHA/human verification, or any need to weaken a safety control.

## Terminal Classification

1. `C1_clean_useful_progress`: pass 2 and one child settle with failed count
   zero and at least one materialized asset/checksum.
2. `C2_clean_no_yield`: pass 2 and one child settle with failed count zero but
   no new materialized asset; installed liveness is proved, backlog yield is not.
3. `C3_new_exact_blocker`: the one child or parent fails/skips terminally for a
   reason other than the repaired timeout/cooldown collision; record and stop.
4. `C4_hard_stop`: a safety boundary triggers before or during the canary;
   preserve evidence and stop without retry.

## Definition Of Done

- All six criteria have current installed/runtime evidence or the packet closes
  honestly under `C3`/`C4` with the exact remaining blocker.
- Effect accounting is exact and no background action is misattributed to this
  packet.
- Plan, roadmap, runbook, journal, lane catalog, Git refs, and remote readback
  match the terminal state.
