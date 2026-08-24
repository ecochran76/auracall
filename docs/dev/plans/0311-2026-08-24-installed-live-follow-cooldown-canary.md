# Installed Live-Follow Cooldown Canary | 0311-2026-08-24

State: CLOSED
Lane: P04
Operational state: TERMINAL_HARD_STOP / C4 / INTEGRATED
Branch: ops/plan0311-installed-live-follow-canary
Target: main
Integration: merge
Revision: 3 | 2026-08-24

## Stable Objective

Install the accepted Plan 0310 live-follow cooldown-abort repair into the
user-scoped AuraCall runtime, restart the one owned API service, and run one
exact zero-retry `wsl-chrome-3` live-follow canary that proves the repaired
deadline and cancellation semantics under installed provider work.

## Terminal State

- The one authorized `pnpm run install:user-runtime-service` completed with
  exit zero. It replaced API PID `78882` with active/running PID `57888` at
  2026-08-24 09:16:43 CDT, `NRestarts=0`, and HTTP 200 on `/status` at port
  18095. Installed AuraCall reports `0.1.1`.
- Source and installed SHA-256 values match exactly for all four repaired
  modules: interaction governor `28128a4a...a4737a1d4`, LLM service
  `9954cff5...a36bed49`, ChatGPT adapter `2ca264fa...ee70139`, and history
  materialization service `7af53fa1...da859f`.
- The frozen completion
  `acctmirror_completion_d383abe4-f12e-4763-81da-402a9443ed41` remained blocked
  at pass 1 with null force ceiling, no provider guard, and old child
  `hmj_c2936e24ae094be39284b197759b94ab`; no new child was attached to it.
- Before the authorized manual control, the enabled scheduler autonomously
  created substitute completion
  `acctmirror_completion_85756c59-a414-45b3-bdac-766fb586595a` for the same
  `chatgpt/wsl-chrome-3` target. It started at `2026-08-24T14:16:51.385Z`, was
  running at pass 0 with no provider guard or materialization child, and owned
  Chrome PID `60513` on port 45015 under the new API PID.
- Unexpected completion fanout and nonterminal provider work are frozen hard
  stops. The manual `run-one-pass` was withheld; the autonomous completion was
  not substituted, cancelled, paused, or otherwise controlled.
- Final read-only reconciliation found the autonomous completion at
  `idle_waiting`, pass 1, and its child
  `hmj_ab7c103aa06745598ac46b73fb2dd353` running from
  `2026-08-24T14:22:37.735Z`. API PID `57888` and its exact Chrome child PID
  `60513` / port 45015 remained healthy/owned; neither is orphan cleanup scope.

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

## Acceptance Result And Effect Accounting

- Classification: `C4_hard_stop` due to post-restart autonomous completion
  fanout before the frozen manual-control gate.
- `ILFC-R1`: accepted. Plan checkpoint `e1bd2f09` and P04 custody checkpoint
  `5eccd0c2` were published before effects.
- `ILFC-R2`: accepted. Exactly one install and one API restart produced healthy
  PID `57888` and exact four-module installed parity.
- `ILFC-R3`: not entered. Completion controls `0/1`, pass advances attributable
  to this packet `0/1`, and fresh children attributable to this packet `0/1`.
- `ILFC-R4` and `ILFC-R5`: not entered. The intended canary did not start, so
  no claim is made about installed provider-read liveness or backlog yield.
- `ILFC-R6`: accepted for the terminal hard-stop state: service, scheduler,
  target/substitute completions, jobs, process ownership, Git, plan, and lane
  receipts are reconciled without a retry or unauthorized control. The final
  autonomous child remains running and is reported, not adopted as canary work.
- Effects: installs `1/1`; API restarts `1/1`; manual completion controls `0/1`;
  retries `0`; scheduler controls `0`; other completion controls `0`; prompts
  `0`; manual browser mutations `0`; `Answer now` actions `0`; direct runtime
  edits `0`; cleanup mutations `0` because the browser remained owned by the
  autonomous API work rather than orphaned.
- Exact remaining gate: any successor installed canary must explicitly own a
  scheduler-isolation boundary before service restart and then re-freeze one
  completion after restart. This plan grants no such control or another canary.
- Durable receipts: terminal checkpoint `725b0433` merged to `main` through
  `0a54b7b5`; P04 catalog custody is integrated without changing the C4 result.

## Definition Of Done

- All six criteria have current installed/runtime evidence or the packet closes
  honestly under `C3`/`C4` with the exact remaining blocker.
- Effect accounting is exact and no background action is misattributed to this
  packet.
- Plan, roadmap, runbook, journal, lane catalog, Git refs, and remote readback
  match the terminal state.
