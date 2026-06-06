# ChatGPT Account-Library Scheduler Health Plan | 0102-2026-06-02

State: CLOSED
Lane: P01

## Purpose

Move ChatGPT account-library catch-up from proven manual/operator
materialization toward safe automatic scheduling. Plan 0101 proved capped
Library file retrieval through installed manual jobs, but left automatic
queueing in `preview_only` because one same-budget follow-up job spent about
98 seconds in `queued` before starting. Plan 0102 is the scheduler/job
lifecycle hardening slice: make queued-job latency observable, make active
source reuse semantics explicit, prove archived families are skipped before
browser work, and only then decide whether `chatgpt/wsl-chrome-3` can move
from `preview_only` to a narrow eligible mode.

## Current State

- Plan 0101 is closed.
- Installed `chatgpt/wsl-chrome-3` account-library live follow remains
  `preview_only`.
- Installed browser health is non-blocking:
  - `browserHealth.status=observed`;
  - `reason=null`;
  - `launchCommandHasBlankArg=true`;
  - `openBlankPageCount=0`.
- Manual/operator account-library jobs are proven:
  - `hmj_0391838191ce4bfebe5f5001ecb68cee` materialized 1 file;
  - `hmj_02ccb145fd024c85a56919aad71ca731` materialized the next file, not a
    duplicate, but sat queued for about 98 seconds before starting;
  - `hmj_d1cf6ea905864ff9b3259e026d95cff5` materialized 3 files.
- Final Plan 0101 installed preview reported:
  - `catalogFiles=60`;
  - `eligibleCandidates=21`;
  - `selectedCandidates=3`;
  - `archivedFamilies=13`;
  - `unresolvedStale=11`;
  - `unsupportedOrTerminal=12`;
  - `duplicateFamilies=3`;
  - `activeJobCount=0`.

## Scope

- Add or tighten scheduler/job lifecycle observability for
  `account_library_reconciliation` jobs.
- Make queued-job age, start latency, active-source reuse, and stuck-queued
  recovery visible to `/status`, job list/readback, or scheduler history.
- Prove duplicate manual requests either:
  - reuse an active queued/running job; or
  - create a new job only after the prior source has reached terminal state
    and selection advances to a new unarchived family.
- Prove queued account-library jobs start within a bounded service-owned
  latency budget or are reported as blocked/stale with an exact reason.
- Prove archived account-library families remain skipped before browser work
  under scheduler-owned and manual paths.
- Decide whether the next mode for `chatgpt/wsl-chrome-3` should remain
  `preview_only` or move to a narrow eligible automatic mode.

## Non-Goals

- Do not run broad multi-tenant catch-up.
- Do not enable automatic account-library queueing before scheduler-health
  proof passes.
- Do not raise conversation-history materialization caps.
- Do not route account-library rows through conversation-history recovery.
- Do not touch or patch the retired frontend.
- Do not use ChatGPT model selector, feature signatures, or unrelated provider
  controls.
- Do not mask queued-job latency by restarting the API unless the plan records
  the exact stuck condition first.

## Work Tracks

### Track 1 | Queue Lifecycle Audit

Status: implemented, installed proof collected.

- Inspect `createHistoryMaterializationService` scheduling and queue behavior
  for account-library jobs.
- Identify why Plan 0101 job `hmj_02ccb145fd024c85a56919aad71ca731` could
  remain queued for about 98 seconds while no active job was visible after the
  prior pass completed.
- Audit:
  - `scheduledJobIds` behavior;
  - in-process queue serialization;
  - active-source reuse key boundaries;
  - startup/recovery behavior;
  - timeout behavior for queued versus running jobs;
  - `/status` active-job mapping.

Acceptance evidence:

- The Plan 0101 98-second queue delay is now classifiable instead of hidden:
  readback exposes queued age, queued-to-start latency, dispatch state, and
  stale reason. The installed duplicate smoke showed normal dispatch with
  `queuedToStartLatencyMs=93` for
  `hmj_c92fb4d717504e539f982ab4e9817ba0`; the earlier Plan 0101 observation
  was missing scheduler observability, not proven duplicate browser work.
- Focused coverage now covers healthy queued, stale queued, running, terminal,
  duplicate active-source readback, and `/status` active job projection.

### Track 2 | Queue Observability And Recovery Contract

Status: implemented, installed proof collected.

- Add or tighten job readback fields needed by operators:
  - queued age;
  - queued-to-start latency;
  - scheduler dispatch state;
  - active-source reuse reason;
  - stale queued threshold and reason.
- Ensure `/status` account-library catch-up reports a queued job as active
  with enough context to distinguish healthy queued, delayed, stale, blocked,
  and running provider work.
- Ensure job list/readback can recover or classify stale queued jobs without
  creating duplicate browser work.

Acceptance evidence:

- Job create/read/list surfaces now include `scheduler` diagnostics:
  `state`, `dispatchState`, `queuedAgeMs`, `runAgeMs`,
  `queuedToStartLatencyMs`, `stale`, and `staleReason`.
- `/status` now projects `accountLibraryCatchup.activeJobScheduler` while an
  account-library job is queued or running.
- Installed `/status` during
  `hmj_c92fb4d717504e539f982ab4e9817ba0` reported
  `activeJobCount=1`, `activeJobStatus=running`,
  `activeJobScheduler.state=running`, `dispatchState=running`,
  `runAgeMs=36875`, `queuedToStartLatencyMs=93`, and `stale=false`.
- Post-terminal `/status` reported `activeJobId=null`,
  `activeJobStatus=null`, `activeJobCount=0`, and
  `activeJobScheduler=null`.

### Track 3 | Duplicate Request Semantics

Status: implemented, installed proof collected.

- Define exact behavior for duplicate manual/operator requests:
  - same `sourceKey` while active: return `reused=true` and dispatch/re-dispatch
    the active job if needed;
  - same flags after terminal: create a new job but select the next unarchived
    family because archived-family skip runs before budget spend;
  - different `maxItems`: create a distinct source key and job.
- Cover the Plan 0101 replay case explicitly in tests.
- Keep `force=false` as the default proof path.

Acceptance evidence:

- Duplicate active request reuse is implemented and installed-proven. The
  first installed create returned queued job
  `hmj_c92fb4d717504e539f982ab4e9817ba0`; the immediate second create returned
  the same id with `reused=true` and
  `reuseReason="active sourceKey is already running"`.
- Job readback clearly explains active reuse and reports scheduler latency.
- Terminal replay archived-family advancement is installed-proven. After
  `hmj_84685715fc4d489683a98e10bdf3598a` materialized provider id
  `86252cdb-9827-5faa-880a-b962936e12c7`, the same-flags replay
  `hmj_3af768aaf46540a88f75993fdd43690c` selected and materialized a
  different provider id, `cb2c2ccf-5069-520d-a4ea-c9a1e6234339`.

### Track 4 | Installed Scheduler Smoke

Status: implemented, installed proof collected.

- Keep live follow configured as `preview_only` until the implementation
  tracks pass.
- Run installed manual smokes first:
  - duplicate active request reuse without browser duplication;
  - terminal replay advancing to the next unarchived family;
  - active jobs returning to `0`;
  - `/status` reporting queue/running/terminal state accurately.
- If and only if manual scheduler-health proof passes, run one narrow
  automatic-mode smoke on `chatgpt/wsl-chrome-3` with:
  - account-library only;
  - `assetKinds=[files]`;
  - `maxItems=1`;
  - `force=false`;
  - one active job maximum;
  - explicit cooldown and timeout readback.

Acceptance evidence:

- Installed API/job readback captured queued, running, terminal, and drained
  states for manual account-library jobs.
- The account-library download-capture blocker was fixed by trying the
  authenticated ChatGPT backend file-download endpoint from the page context
  before falling back to UI row/menu clicks.
- Installed `maxItems=1` job
  `hmj_84685715fc4d489683a98e10bdf3598a` succeeded with `materialized=1`,
  `failed=0`, provider id `86252cdb-9827-5faa-880a-b962936e12c7`, size
  `64339`, checksum
  `240dc883402f537c5fbe62106baedeb4aa9e536b3dee11a085514bf38329be36`, and
  archive item
  `history-file:chatgpt:eric.cochran_soylei.com:account-library:86252cdb-9827-5faa-880a-b962936e12c7`.
- Same-flags replay job
  `hmj_3af768aaf46540a88f75993fdd43690c` succeeded with `materialized=1`,
  `failed=0`, provider id `cb2c2ccf-5069-520d-a4ea-c9a1e6234339`, size
  `61165`, checksum
  `1d14bd84bf23c9c3165d751467b853dfdb049d87cdcb57bad538101b87b96889`, and
  archive item
  `history-file:chatgpt:eric.cochran_soylei.com:account-library:cb2c2ccf-5069-520d-a4ea-c9a1e6234339`.
- Automatic smoke was not attempted. During this continuation, operator
  observation reported unexplained Gemini `/app` page launching/refreshing.
  AuraCall API logs did not show Gemini activity, but this counts as enough
  provider/browser ambiguity to keep account-library automatic queueing
  `preview_only` for this plan.

### Track 5 | Enablement Decision

Status: decided.

- Decide final operating mode:
  - keep `preview_only` if queue lifecycle still has ambiguity;
  - move to a narrow eligible mode only if queue observability, active-source
    reuse, latency bounds, cooldown, timeout, and installed proof all pass;
  - revert to disabled if browser/provider instability appears.
- Update `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and this plan
  with:
  - final mode;
  - exact installed readback;
  - job ids;
  - active-job drain proof;
  - next bounded slice.

Acceptance evidence:

- Final decision: keep `chatgpt/wsl-chrome-3` account-library live follow in
  `preview_only`. Do not enable automatic account-library queueing in this
  plan.
- Reason: scheduler and manual materialization proof passed, but the operator
  observed unrelated Gemini `/app` browser churn during the same continuation.
  No Gemini activity was found in recent AuraCall API logs, but the safe
  enablement decision is to leave automatic account-library queueing disabled
  until a dedicated automatic-mode slice can isolate provider/browser activity.
- Next unblocker: open a separate narrow automatic-mode proof plan that first
  confirms no unrelated provider launches occur, then temporarily enables only
  `chatgpt/wsl-chrome-3` account-library files with `maxItems=1` and proves
  active-job drain.

## Critical Path

1. Audit queue lifecycle and explain Plan 0101 queued latency.
2. Add or tighten queued-job observability/recovery contract.
3. Prove duplicate active-source semantics in tests.
4. Install/restart user runtime if code changes.
5. Run installed manual scheduler-health smoke.
6. Decide whether one narrow automatic-mode smoke is allowed.
7. Record final mode and update roadmap/runbook/journal.

## Parallelizable Work

- Unit tests for duplicate request semantics can run while status/readback
  fields are implemented.
- Documentation updates can be drafted while installed smoke commands run, but
  final proof values must be filled only after installed evidence exists.
- Archive/preview readback and active-job list readback can run in parallel
  after each terminal job.

## Acceptance Criteria

- [x] Queue lifecycle audit explains the Plan 0101 queued latency.
- [x] Queued-job status exposes age, start latency or stale reason, and
  scheduler state clearly enough for operator diagnosis.
- [x] Duplicate active account-library request returns `reused=true` or
  otherwise has an explicit reason why it is a distinct job.
- [x] Terminal replay with the same flags does not re-download an archived
  family.
- [x] Archived-family skip happens before browser work and before budget spend
  in focused coverage.
- [x] Installed `/status` and job list/readback agree on active job count.
- [x] Active account-library jobs return to `0` after proof.
- [x] Automatic account-library queueing remains disabled/preview-only unless
  the narrow automatic smoke acceptance criteria pass.
- [x] No retired frontend changes.
- [x] No model-selector or unrelated provider interaction.

## Definition Of Done

- This plan is updated with final proof and set to `CLOSED` or left `OPEN`
  with a precise blocker.
- `ROADMAP.md`, `RUNBOOK.md`, and `docs/dev/dev-journal.md` reflect the final
  state.
- Focused tests cover:
  - duplicate active account-library job reuse;
  - queued-job stale/recovery readback;
  - terminal replay archived-family skip;
  - `/status` active queued/running account-library job projection.
- `pnpm exec tsc --noEmit` passes.
- Relevant focused lint passes or reports only pre-existing warning debt.
- `pnpm run build` and user-runtime/API install pass if runtime code changes.
- Installed `/status`, job readback, active-job readback, and archive/preview
  readback are recorded.
- `pnpm run plans:audit -- --keep 102` passes.
- `git diff --check` passes.

## Installed Evidence | 2026-06-02

- Installed runtime/API:
  - `pnpm run build` passed.
  - `pnpm run install:user-runtime` passed.
  - `pnpm run install:user-api-service` passed.
  - `systemctl --user restart auracall-api.service` completed.
  - `systemctl --user is-active auracall-api.service` returned `active`.
  - `/home/ecochran76/.local/bin/auracall --version` returned `0.1.1`.
- Baseline `/status` for `chatgpt/wsl-chrome-3`:
  - `mode=preview_only`;
  - `activeJobCount=0`;
  - `activeJobScheduler=null`;
  - `browserHealth.status=observed`;
  - `openBlankPageCount=0`;
  - `catalogFiles=60`;
  - `eligibleCandidates=21`;
  - `selectedCandidates=3`;
  - `archivedFamilies=13`.
- Duplicate active-source proof:
  - first create queued
    `hmj_c92fb4d717504e539f982ab4e9817ba0` with
    `scheduler.state=queued`, `dispatchState=scheduled`, and
    `queuedAgeMs=70`;
  - immediate second create reused the same job with `reused=true`,
    `reuseReason="active sourceKey is already running"`,
    `scheduler.state=running`, `dispatchState=running`, and
    `queuedToStartLatencyMs=93`.
- `/status` active projection proof:
  - while the same job was running, `/status` reported
    `activeJobId=hmj_c92fb4d717504e539f982ab4e9817ba0`,
    `activeJobStatus=running`, `activeJobCount=1`,
    `activeJobScheduler.state=running`,
    `activeJobScheduler.dispatchState=running`,
    `activeJobScheduler.runAgeMs=36875`,
    `activeJobScheduler.queuedToStartLatencyMs=93`, and
    `activeJobScheduler.stale=false`.
- Materialization proof after direct backend file-download capture:
  - `hmj_84685715fc4d489683a98e10bdf3598a` terminal state was `succeeded`;
    metrics were `materialized=1`, `failed=0`, `skipped=0`, and
    `duplicateAliases=0`.
  - It materialized provider id
    `86252cdb-9827-5faa-880a-b962936e12c7` to
    `/home/ecochran76/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/account-files/files/86252cdb-9827-5faa-880a-b962936e12c7/2025-08-01 Nacu Eric SoyLei Update and License Negotiation Transcript.docx2025-08-01 Nacu Eric SoyLei Update and License Negotiation Transcript.docxMay 20May 2062.8 KB`.
  - Size was `64339`, checksum was
    `240dc883402f537c5fbe62106baedeb4aa9e536b3dee11a085514bf38329be36`, and
    archive item id was
    `history-file:chatgpt:eric.cochran_soylei.com:account-library:86252cdb-9827-5faa-880a-b962936e12c7`.
- Terminal replay proof:
  - Same-flags replay job
    `hmj_3af768aaf46540a88f75993fdd43690c` terminal state was `succeeded`;
    metrics were `materialized=1`, `failed=0`, `skipped=0`, and
    `duplicateAliases=0`.
  - It selected a different provider id,
    `cb2c2ccf-5069-520d-a4ea-c9a1e6234339`, proving the archived family from
    the prior success was skipped before browser work.
  - Size was `61165`, checksum was
    `1d14bd84bf23c9c3165d751467b853dfdb049d87cdcb57bad538101b87b96889`, and
    archive item id was
    `history-file:chatgpt:eric.cochran_soylei.com:account-library:cb2c2ccf-5069-520d-a4ea-c9a1e6234339`.
- Drain proof:
  - after `hmj_84685715fc4d489683a98e10bdf3598a`, `/status` reported
    `activeJobId=null`, `activeJobStatus=null`, `activeJobCount=0`,
    `activeJobScheduler=null`, `eligibleCandidates=20`, and
    `archivedFamilies=14`.
  - after `hmj_3af768aaf46540a88f75993fdd43690c`, `/status` reported
    `activeJobId=null`,
    `activeJobStatus=null`, `activeJobCount=0`, and
    `activeJobScheduler=null`, `eligibleCandidates=19`, and
    `archivedFamilies=15`.
- Gemini observation:
  - During continuation, the operator observed unrelated Gemini `/app` page
    launching/refreshing.
  - Recent `auracall-api.service` journal and
    `/home/ecochran76/.auracall/logs/api-18095.log` checks found no Gemini or
    `/app/` entries from the AuraCall API service.
  - The final operating decision remains `preview_only` until automatic-mode
    proof can isolate provider/browser activity.

## Validation | 2026-06-02

- `pnpm vitest run tests/runtime.historyMaterializationService.test.ts -t
  "re-dispatches a persisted queued duplicate|classifies stale queued
  account-library|marks stale running account-library|skips archived ChatGPT
  account-library"` passed.
- `pnpm vitest run tests/http.responsesServer.test.ts -t "reports active
  account-library materialization jobs as a catch-up gate|reports preview-only
  ChatGPT account-library catch-up counts|does not block account-library
  catch-up on launch about:blank"` passed.
- `pnpm vitest run tests/cli/apiHistoryMaterializationCommand.test.ts
  tests/cli/apiStatusCommand.test.ts tests/mcp.historyMaterialization.test.ts`
  passed.
- `pnpm vitest run tests/browser/chatgptAdapter.test.ts -t "Library row file
  ids|download"` passed.
- `pnpm exec biome lint src/browser/providers/chatgptAdapter.ts` passed.
- `pnpm exec biome lint src/runtime/historyMaterializationService.ts
  src/status/liveFollowHealth.ts src/http/responsesServer.ts
  src/cli/apiHistoryMaterializationCommand.ts src/cli/apiStatusCommand.ts
  src/mcp/tools/historyMaterialization.ts
  tests/runtime.historyMaterializationService.test.ts
  tests/http.responsesServer.test.ts tests/mcp.historyMaterialization.test.ts`
  passed with existing warning-level `noNonNullAssertion` debt in older HTTP
  test sections.
- `pnpm exec tsc --noEmit` passed.
- `pnpm run build` passed.
