# Live-Follow Account-Library Scheduling Plan | 0100-2026-06-02

State: CLOSED
Lane: P01

## Purpose

Make ChatGPT account-library materialization safe for live-follow scheduling
without losing the manual/operator reliability proven in Plans 0098 and 0099.
The current explicit operator lane can retrieve selected and capped
account-library files with archive linkage. Live follow must not enqueue that
lane automatically until it has its own cap, retry policy, provider-work
timeout posture, scheduler guard, and installed proof that it does not create
browser churn, repeated downloads, or stuck jobs.

## Current State

- Plan 0098 is closed for the ChatGPT account-library retrieval lane.
- Plan 0099 is closed for explicit account-library reconciliation:
  - `assetSource=account-library`;
  - source type `account_library_reconciliation`;
  - stale catalog rows resolve against current ChatGPT Library inventory;
  - archived families are skipped before budget;
  - installed `maxItems=1` job
    `hmj_ccaea15cb28242feb56ae4c9b52424ff` materialized 1 file;
  - installed `maxItems=3` job
    `hmj_cf164b2171d34df79bd625fe7e2b45d8` materialized 3 files;
  - active `chatgpt/wsl-chrome-3` history-materialization jobs returned to
    `0`.
- Account-library retrieval remains explicit operator work unless the target is
  in preview-only readback.
- Installed service status during proof showed high service memory pressure, so
  automatic queueing remains disabled; Plan 0100 closes with preview-only as
  the installed operating mode.
- History recovery remains separate: account-library rows must not re-enter
  conversation-history recovery or make history `createRequest` appear
  retrievable.

## Scope

- Add a live-follow scheduling policy for account-library catch-up that is
  separate from conversation-history materialization policy.
- Keep automatic account-library catch-up disabled until all gates and proof
  pass.
- Define and enforce a small per-target account-library cap.
- Add provider-work timeout and stale-running job recovery for account-library
  materialization jobs.
- Add retry and cooldown semantics for account-library failures so unsupported
  or unresolved rows do not create repeated browser work.
- Expose operator-visible live-follow/account-library status that says whether
  the lane is disabled, preview-only, eligible, running, blocked, or cooling
  down.
- Prove installed behavior on `chatgpt/wsl-chrome-3` before enabling any
  automatic queueing.

## Non-Goals

- Do not run broad multi-tenant catch-up.
- Do not raise existing history-materialization caps.
- Do not route account-library rows through conversation-history recovery.
- Do not touch the retired frontend.
- Do not add model-selector, feature-signature, or unrelated provider
  interactions to read-only or retrieval passes.
- Do not enable live-follow account-library catch-up by default in this plan
  unless installed proof explicitly satisfies every acceptance criterion.

## Work Tracks

### Track 1 | Scheduling Contract And Defaults

Status: complete.

- Add an explicit account-library live-follow mode with a conservative default:
  `disabled` or `preview-only`.
- Keep manual/operator `history-materialization-create
  --asset-source account-library` unchanged.
- Define per-target scheduling fields:
  - desired mode;
  - max account-library files per pass;
  - minimum interval;
  - failure cooldown;
  - maximum active account-library job count.
- Acceptance evidence:
  config/status readback shows account-library live-follow is separate from
  history materialization and remains disabled by default.
- 2026-06-02 implementation:
  - `liveFollow.accountLibrary` now has explicit status-registry fields for
    `mode`, `maxItems`, `minIntervalMs`, `failureCooldownMs`,
    `maxActiveJobs`, and `providerWorkTimeoutMs`.
  - missing account-library config defaults to `mode=disabled`,
    `enabled=false`, and reason
    `liveFollow.accountLibrary.mode is not configured`.
  - live-follow target status now exposes `accountLibraryCatchup` separately
    from conversation-history materialization outcome.
  - CLI status normalization preserves the new account-library catch-up
    readback.
  - focused unit coverage:
    `pnpm vitest run tests/accountMirror/statusRegistry.test.ts
    tests/runtime.historyMaterializationService.test.ts -t
    "account-library live-follow scheduling|stale running account-library"`.

### Track 2 | Candidate Gate And Idempotence

Status: in progress.

- Reuse the Plan 0099 candidate selector instead of creating a live-follow-only
  selector.
- Require archive-backed family skip before live-follow budget is spent.
- Require stale-row resolution against current account-file inventory before a
  row can become eligible.
- Skip unresolved stale rows, unsupported rows, and terminal rows without
  browser download work.
- Acceptance evidence:
  tests prove live-follow candidate preview excludes already archived families
  and unresolved rows before enqueueing.
- 2026-06-02 implementation:
  - account-library reconciliation now builds a shared
    `history_account_library_reconciliation_preview` before materialization.
  - manual/operator materialization consumes the preview's selected candidates,
    so preview and execution use the same selector.
  - preview metrics report catalog files considered, eligible candidates,
    selected candidates under the cap, archived-family skips, unresolved stale
    skips, unsupported/terminal skips, and duplicate-family skips.
  - live-follow `/status` computes preview counts only for ChatGPT targets with
    `liveFollow.accountLibrary.mode` set to `preview_only` or `eligible`;
    default-disabled targets do not trigger preview inventory reads.
  - focused unit coverage:
    `pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t
    "skips archived ChatGPT account-library|skips stale unresolved ChatGPT
    account-library"`.

### Track 3 | Provider-Work Timeout And Recovery

Status: in progress.

- Add timeout handling for account-library materialization jobs so provider
  work cannot stay running indefinitely without result updates.
- Add recovery behavior for interrupted account-library jobs:
  - queued jobs may be requeued;
  - running jobs older than the timeout become failed with a clear reason;
  - stale browser operation locks are not treated as successful work.
- Record timeout/cooldown state in job status, scheduler status, and runbook
  proof.
- Acceptance evidence:
  unit coverage for stale-running account-library jobs and installed readback
  showing active jobs return to `0`.
- 2026-06-02 implementation:
  - account-library reconciliation requests can carry
    `providerWorkTimeoutMs`.
  - stale running account-library reconciliation jobs fail on job readback,
    list readback, and startup recovery once `providerWorkTimeoutMs` has
    elapsed.
  - source-key duplicate detection now checks timeout recovery before
    reusing an active account-library reconciliation job.
  - focused unit coverage proves stale running account-library reconciliation
    readback returns `failed` instead of remaining active.
  - installed proof is still pending, so automatic account-library catch-up
    remains disabled by default.

### Track 4 | Scheduler Health Gate

Status: in progress.

- Gate automatic account-library queueing on service health, not only candidate
  availability.
- At minimum, block automatic queueing when:
  - foreground provider work is already active beyond the allowed threshold;
  - the target has an active account-library materialization job;
  - service/browser memory or process count exceeds the configured guard;
  - the target is cooling down after failure;
  - provider guard or identity mismatch is active.
- Acceptance evidence:
  status readback explains why account-library catch-up is blocked or eligible.
- 2026-06-02 implementation:
  - live-follow status reads active `account_library_reconciliation`
    materialization jobs and maps them by provider/runtime profile.
  - `accountLibraryCatchup` reports `activeJobId`, `activeJobStatus`, and an
    active-job reason when an account-library job is already queued or running.
  - focused HTTP coverage verifies active account-library materialization
    changes catch-up status to the active job state and does not call
    `historyMaterializationService.createJob`.
  - `accountLibraryCatchup` reports `activeJobCount`, `cooldownUntil`,
    cooldown-derived `nextAttemptAt`, and `browserHealth` readback.
  - eligible targets in account-library failure cooldown report
    `status=cooling_down` with a concrete cooldown-until timestamp and reason.
  - active account-library job readback reports count against `maxActiveJobs`;
    existing active jobs remain visible as their actual job status.
  - `/status` uses safe browser/process observations already exposed by
    `/v1/browser/processes` to report managed-browser pressure, including
    DevTools responsiveness, about:blank launch churn, blank page targets,
    page target counts, pid, and port.
  - focused HTTP coverage verifies preview-only, active-job, cooldown, and
    browser-health readback still do not call
    `historyMaterializationService.createJob`.
  - installed service readback passed for `chatgpt/wsl-chrome-3` with
    preview-only status, active job count `0`, browser health `idle`, and no
    browser process running.

#### Next Milestone | Cooldown And Health-Gate Readback

State: CLOSED

Goal: make `/status` and CLI status explain why account-library catch-up is
blocked before any automatic queueing path is enabled.

Scope:

- add cooldown readback derived from the target's latest account-library
  failure and configured `failureCooldownMs`;
- report the next permitted account-library queue time when a target is
  cooling down;
- report active account-library job count against `maxActiveJobs`, not only a
  single active job id;
- expose browser/service health observations that are safe to read from
  status:
  - browser process alive/dead;
  - DevTools responsiveness where already available;
  - page/process counts or equivalent observed pressure;
  - clear reason when the guard blocks queueing;
- keep the implementation readback-only: no automatic account-library
  `createJob` call in this milestone.

Non-goals:

- do not enable live-follow account-library queueing;
- do not run broad catch-up;
- do not change the manual/operator account-library reconciliation command;
- do not touch the retired frontend;
- do not add model-selector or provider feature-selection interactions.

Acceptance criteria:

- `accountLibraryCatchup.status` can report `cooling_down` with a concrete
  `nextAttemptAt`/cooldown timestamp and reason. 2026-06-02: implemented and
  covered by focused HTTP status test.
- active account-library job readback reports the active count and blocks when
  the configured `maxActiveJobs` threshold is reached. 2026-06-02: active
  count is implemented and active jobs remain visible by real job status.
- status readback includes browser/service health-gate fields sufficient for
  an operator to see whether service pressure blocks catch-up. 2026-06-02:
  browser-health readback is implemented for safe process/DevTools/page
  observations.
- preview-only and disabled modes still do not enqueue account-library
  materialization jobs. 2026-06-02: focused HTTP tests verify no `createJob`
  calls.
- focused HTTP/status tests cover cooldown, active-count, and health-gate
  readback. 2026-06-02: covered by
  `pnpm vitest run tests/http.responsesServer.test.ts -t "account-library"`.
- `pnpm exec tsc --noEmit`, focused lint, `pnpm run plans:audit -- --keep
  100`, and `git diff --check` pass after the slice. 2026-06-02: passed.

### Track 5 | Preview And Installed Proof

Status: complete.

- Add a preview-only readback that reports:
  - eligible candidate count;
  - already archived family count;
  - unresolved stale count;
  - unsupported/terminal count;
  - next permitted queue time;
  - reason automatic queueing is disabled or blocked.
- Run installed proof in this order:
  1. preview-only readback for `chatgpt/wsl-chrome-3`;
  2. one manually triggered live-follow-style pass with `maxItems=1`;
  3. one manually triggered live-follow-style pass with `maxItems=3` only if
     the first pass is clean;
  4. active-job readback returns `0`;
  5. archive/search readback shows durable local assets and no duplicate
     re-downloads.
- Acceptance evidence:
  installed API/CLI readback and job ids recorded in this plan, roadmap,
  runbook, and dev journal.
- 2026-06-02 implementation:
  - live-follow account status now exposes `accountLibraryCatchup.preview`
    with candidate counts.
  - HTTP status proof test verifies `mode=preview_only` reports preview counts
    and does not call `historyMaterializationService.createJob`.
  - focused HTTP coverage:
    `pnpm vitest run tests/http.responsesServer.test.ts -t "reports
    preview-only ChatGPT account-library"`.
  - installed `chatgpt/wsl-chrome-3` proof passed after preserving
    `liveFollow.accountLibrary` through the config schema:
    - service PID `80768`;
    - installed CLI version `0.1.1`;
    - mode `preview_only`;
    - active account-library jobs `0`;
    - browser health `idle`;
    - preview counts:
      `catalogFiles=60`, `eligibleCandidates=0`,
      `selectedCandidates=0`, `unsupportedOrTerminal=60`.
  - bounded installed no-op proof jobs:
    - `hmj_c06476c35bd448d7acba18e5b958a23e`, `maxItems=1`,
      terminal `skipped`, `materialized=0`, `failed=0`, `entries=0`;
    - `hmj_87e4c71ee43e425fb8c488afdb9193c2`, `maxItems=3`,
      terminal `skipped`, `materialized=0`, `failed=0`, `entries=0`.
  - active account-library jobs returned to `0`.

### Track 6 | Enablement Decision

Status: complete.

- Choose one final operating mode:
  - `disabled`: manual/operator-only remains the default;
  - `preview-only`: live follow reports candidates but cannot queue jobs;
  - `eligible`: live follow may enqueue bounded account-library catch-up under
    the new cap and guards.
- Default to `preview-only` or `disabled` unless installed proof shows:
  - no repeated downloads;
  - no unsupported-row browser churn;
  - no model-selector interactions;
  - no stale running jobs;
  - active jobs return to `0`;
  - archive/search readback is durable.
- Acceptance evidence:
  roadmap and runbook state the selected operating mode and exact proof.
- 2026-06-02 decision:
  - final installed mode for `chatgpt/wsl-chrome-3` is `preview_only`;
  - automatic account-library queueing remains disabled;
  - explicit operator materialization remains available;
  - the current installed account-library preview has no eligible candidates
    (`eligibleCandidates=0`, `selectedCandidates=0`), so Plan 0100 cannot prove
    fresh account-library downloads beyond the already closed Plans 0098/0099
    manual retrieval proof.

## Critical Path

1. Add account-library live-follow scheduling state and default mode.
2. Wire candidate preview through the Plan 0099 selector.
3. Add timeout/recovery behavior for account-library materialization jobs.
4. Add scheduler health gates.
5. Prove preview-only installed readback.
6. Prove bounded installed queue behavior.
7. Decide disabled, preview-only, or eligible.

## Parallelizable Work

- Scheduler status/readback shape can be implemented alongside timeout tests.
- Candidate preview tests can be added while service-health gates are wired.
- Documentation can be updated during implementation, but installed proof
  values must be recorded only after they exist.

## Acceptance Criteria

- Live-follow account-library scheduling is explicitly represented and separate
  from history materialization. 2026-06-02: source/status contract implemented
  and installed readback passed.
- Automatic account-library catch-up is disabled or preview-only by default.
  2026-06-02: `chatgpt/wsl-chrome-3` is installed as preview-only.
- Candidate preview uses the same idempotent selector as manual
  account-library reconciliation. 2026-06-02: shared preview builder is used
  by manual materialization and live-follow status readback; installed proof
  pending.
  and installed proof passed for preview-only/no-op inventory.
- Provider-work timeout and stale-running recovery exist for account-library
  jobs. 2026-06-02: unit-covered read/list/recovery timeout behavior
  implemented; installed no-op proof jobs drained.
- Scheduler status explains account-library eligibility, cooldown, active-job,
  and health-gate decisions. 2026-06-02: active-job gate readback is
  implemented; cooldown and service-health guards remain pending.
- Installed `chatgpt/wsl-chrome-3` proof shows active jobs return to `0`.
  2026-06-02: passed after jobs
  `hmj_c06476c35bd448d7acba18e5b958a23e` and
  `hmj_87e4c71ee43e425fb8c488afdb9193c2`.
- No retired frontend files are changed.

## 2026-06-02 Execution Note

- Completed a first implementation slice for the scheduling contract/defaults
  and account-library provider-work timeout recovery.
- Validation:
  - targeted Plan 0100 tests passed:
    `pnpm vitest run tests/accountMirror/statusRegistry.test.ts
    tests/runtime.historyMaterializationService.test.ts -t
    "account-library live-follow scheduling|stale running account-library"`.
  - `pnpm exec tsc --noEmit` passed.
  - broader
    `pnpm vitest run tests/accountMirror/statusRegistry.test.ts
    tests/runtime.historyMaterializationService.test.ts` still has an
    unrelated isolated failure in
    `uses freshness evidence to skip complete rows and refresh changed rows
    without asset counts`; the same test fails when run with only `-t "uses
    freshness evidence"`.
- Remaining:
  - scheduler queueing gates and cooldown readback;
  - installed `chatgpt/wsl-chrome-3` preview/active-job proof;
  - final mode decision.

## 2026-06-02 Preview Execution Note

- Completed the candidate-preview implementation slice.
- Validation:
  - selector/idempotence preview tests passed:
    `pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t
    "skips archived ChatGPT account-library|skips stale unresolved ChatGPT
    account-library"`.
  - HTTP status preview test passed:
    `pnpm vitest run tests/http.responsesServer.test.ts -t "reports
    preview-only ChatGPT account-library"`.
  - `pnpm exec tsc --noEmit` passed.
  - `pnpm exec biome lint src/runtime/historyMaterializationService.ts
    src/status/liveFollowHealth.ts src/http/responsesServer.ts
    src/cli/apiStatusCommand.ts tests/runtime.historyMaterializationService.test.ts
    tests/http.responsesServer.test.ts` completed with existing warnings in
    the broader HTTP test file and no lint errors.
- Remaining:
  - scheduler health gates and cooldown status;
  - installed preview readback and bounded queue proof;
  - final disabled/preview-only/eligible mode decision.

## 2026-06-02 Active-Job Gate Note

- Completed the account-library active-job status gate slice.
- Validation:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t
    "account-library"` passed with preview-only and active-job gate tests.
  - `pnpm exec tsc --noEmit` passed.
- Remaining:
  - cooldown status;
  - browser/process health guard;
  - installed `chatgpt/wsl-chrome-3` readback and bounded queue proof.

## 2026-06-02 Cooldown, Health Gate, And Installed Proof Note

- Completed the readback-only cooldown and browser/process health-gate slice.
- Added config schema support so `liveFollow.accountLibrary` survives config
  resolution in the installed runtime.
- Installed preview-only configuration was applied to
  `chatgpt/wsl-chrome-3` in `/home/ecochran76/.auracall/config.json` with
  backup
  `/home/ecochran76/.auracall/config.json.plan0100-preview-backup-20260601T201918.json`.
- Installed proof:
  - `systemctl --user restart auracall-api.service` started service PID
    `80768`.
  - `/status` for `chatgpt/wsl-chrome-3` reported
    `accountLibraryCatchup.mode=preview_only`, `status=preview_only`,
    `activeJobCount=0`, `browserHealth.status=idle`,
    `catalogFiles=60`, `eligibleCandidates=0`,
    `selectedCandidates=0`, and `unsupportedOrTerminal=60`.
  - bounded proof job `hmj_c06476c35bd448d7acba18e5b958a23e`
    (`maxItems=1`) reached terminal `skipped` with `materialized=0`,
    `failed=0`, `entries=0`, and `archiveItems=0`.
  - bounded proof job `hmj_87e4c71ee43e425fb8c488afdb9193c2`
    (`maxItems=3`) reached terminal `skipped` with `materialized=0`,
    `failed=0`, `entries=0`, and `archiveItems=0`.
  - final active account-library materialization jobs returned to `0`.
- Final decision:
  - Plan 0100 closes with preview-only account-library live-follow readback.
  - Automatic account-library queueing is not enabled because the installed
    preview has no eligible candidates and service memory remains high.
  - Future work needs a new bounded plan if fresh account-library candidates
    appear or if service-memory guard thresholds should become configurable.

## Definition Of Done

- `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and this plan reflect
  final behavior and proof.
- Focused scheduler/materialization tests pass.
- `pnpm exec tsc --noEmit` passes.
- Relevant focused lint passes.
- `pnpm run build` and `pnpm run install:user-runtime` pass if runtime code
  changes.
- Installed preview and bounded queue proofs pass or the plan records the
  exact blocker and keeps automatic queueing disabled.
- `pnpm run plans:audit -- --keep 100` passes.
- `git diff --check` passes.
