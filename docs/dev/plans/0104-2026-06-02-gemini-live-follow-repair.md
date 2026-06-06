# Gemini Live-Follow Repair Plan | 0104-2026-06-02

State: CLOSED
Lane: P01
Closed: 2026-06-02
Final posture: Bounded-Only Enabled

## Purpose

Repair Gemini live follow so it can be re-enabled without unsolicited
`gemini.google.com/app` churn, system-Gem cycling, or leftover managed browser
windows. Plan 0103 proved the immediate containment posture: the old indefinite
Gemini live-follow completion is paused, one bounded metadata-only proof
completed cleanly, and the leftover managed Gemini browser was stopped. Plan
0104 is the implementation slice that turns those findings into durable
runtime behavior.

The target is not "resume the old operation and watch." The target is a safer
Gemini live-follow contract: explicit bounded resume semantics, provider
isolation, read-only browser behavior, owned-Gem filtering, automatic browser
cleanup, and installed proof that routine service activity does not reopen or
refresh Gemini when no bounded Gemini work is requested.

## Current State

- `auracall-api.service` is installed and active on the user runtime.
- Old Gemini live-follow completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remains
  `status=paused`, `mode=live_follow`, `sweepMode=steady_follow`,
  `passCount=10`.
- Plan 0103 bounded proof completion
  `acctmirror_completion_95f9e4af-cd01-402f-bc5c-0141a1e3a927` completed one
  `steady_follow` / `metadata_only` pass with `projects=0`,
  `conversations=71`, and no materialization.
- DevTools during Plan 0103 showed Gemini `/app` and `/gems/view`, but did not
  show `/gem/chess-champ`, `/gem/brainstormer`, or `/gem/storybook`.
- The Plan 0103 bounded pass left a managed Gemini browser process open until
  the operator stopped PID `79889`; that cleanup must become a runtime
  guarantee, not an operator habit.
- Manual `resume` currently requeues and launches the same live-follow
  completion, which is too broad for Gemini repair proof or cautious
  re-enablement.
- `api scheduler-diagnostics` auth has been repaired and installed, so
  diagnostics can be used as a preflight/readback gate for this plan.

## Scope

- Add or tighten Gemini live-follow controls so the operator can run one
  bounded live-follow refresh without resuming an indefinite loop.
- Ensure paused live-follow completions remain inert across service restart,
  scheduler diagnostics, status readback, and unrelated provider work.
- Add browser lifecycle cleanup for completed bounded Gemini provider work.
  For this repair path, an explicit account-mirror cleanup request overrides
  generic runtime `keepBrowser`; debug retention must use a path that does not
  request bounded cleanup.
- Make Gemini read-only collection avoid model selector interactions and avoid
  write/edit surfaces.
- Treat `/gems/view` as an opportunistic index only:
  - enumerate only editable, user-owned Gems;
  - skip Google/system Gems and third-party Gems;
  - never click through non-editable Gem cards for live-follow metadata.
- Make provider isolation visible:
  - ChatGPT account-library jobs must not trigger Gemini browser work;
  - Gemini live-follow jobs must not overlap with account-library browser work;
  - scheduler diagnostics must explain wait/blocked/paused states before
    browser launch.
- Prove the repair in the installed user runtime before changing Gemini's
  operating posture.

## Non-Goals

- Do not resume
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` as the proof
  path.
- Do not enable broad Gemini full-sweep materialization.
- Do not enable automatic Gemini artifact materialization.
- Do not change the retired frontend.
- Do not add provider-specific hacks to generic browser-service code unless the
  pattern is proven generic.
- Do not auto-click Gemini model selectors, edit buttons, or non-owned Gem
  cards during read-only live-follow work.

## Work Tracks

### Track 1 | Resume Contract And Controls

Status: completed.

- Audit existing completion control commands and API routes for `pause`,
  `resume`, `cancel`, bounded `mirror-complete`, and scheduler reconciliation.
- Add one explicit operator-safe path for Gemini:
  - either a new bounded resume command/control;
  - or a documented "create fresh bounded completion from paused target"
    command that preserves the old operation as paused.
- Ensure the existing `resume` path is clearly documented as indefinite for
  live-follow completions, or guarded from being used accidentally on Gemini
  paused live-follow operations.
- Add tests proving a paused Gemini live-follow completion does not move to
  queued/running through restart, diagnostics, status, or unrelated provider
  work.

Acceptance evidence:

- There is an explicit bounded Gemini resume/refresh path with
  `maxPasses=1` support.
- The old indefinite completion remains paused unless an operator deliberately
  chooses the indefinite resume control.
- Tests cover paused inertness and bounded Gemini control behavior.

### Track 2 | Browser Lifecycle Cleanup

Status: completed.

- Trace how Gemini browser sessions are acquired, reused, and released for
  account-mirror refreshes.
- Add post-terminal cleanup for bounded Gemini provider work:
  - close or release the managed Gemini browser when the operation created it;
  - make account-mirror cleanup requests authoritative over generic runtime
    `keepBrowser`;
  - make cleanup failure visible in completion or scheduler diagnostics.
- Add tests around terminal bounded completion cleanup and runtime
  `keepBrowser` interaction.

Acceptance evidence:

- A bounded Gemini completion that reaches terminal state does not leave a
  managed Gemini browser process running by default.
- If a browser remains open, diagnostics expose the reason.
- Installed proof includes a process scan after terminal completion.

### Track 3 | Read-Only Gemini Navigation Discipline

Status: completed.

- Audit Gemini adapter read paths for model selector usage, direct `/app/<id>`
  navigation, `/gems/view` handling, and edit/write surfaces.
- Make read-only live-follow collection use the lowest-churn path:
  - attach/reuse current Gemini surface where safe;
  - avoid model selector operations;
  - avoid direct conversation retargeting unless the command explicitly needs
    detail materialization;
  - stop on CAPTCHA/sorry/human-verification pages.
- Add mutation diagnostics for Gemini read-only runs so the proof can show
  whether model selectors, edit surfaces, or direct Gem pages were touched.

Acceptance evidence:

- Focused tests prove read-only Gemini live-follow does not call model
  selector helpers.
- Scheduler diagnostics or completion evidence reports zero model-selector
  mutations for the bounded proof.
- Gemini human-verification remains a hard stop, not a retry loop.

### Track 4 | Owned-Gem Filtering Hardening

Status: completed.

- Strengthen Gemini Gem scraping around `/gems/view`:
  - require a user-owned editable signal before treating a Gem as a project;
  - explicitly reject non-editable system/Google/third-party Gem rows;
  - record skipped Gem evidence without clicking through the skipped cards.
- Add fixture tests for the observed Google/system Gems:
  - `https://gemini.google.com/gem/chess-champ`;
  - `https://gemini.google.com/gem/brainstormer`;
  - `https://gemini.google.com/gem/storybook`.
- Ensure retained cached Gemini projects from older runs do not resurrect
  non-owned Gems as live-follow targets.

Acceptance evidence:

- System Gem fixture rows are skipped as non-editable/non-owned.
- Bounded proof reports `projects=0` unless user-owned editable Gems are
  actually present.
- No bounded proof opens `/gem/chess-champ`, `/gem/brainstormer`, or
  `/gem/storybook`.

### Track 5 | Provider Isolation And Scheduler Gates

Status: completed for bounded Gemini proof; indefinite automatic live follow
remains paused.

- Verify foreground/backpressure gates cover resumed completions, fresh bounded
  completions, scheduler reconciliation, and active ChatGPT account-library
  jobs.
- Add or tighten a provider-work isolation gate so Gemini browser work cannot
  start while account-library materialization is queued/running, and
  account-library work cannot hide behind active Gemini browser work.
- Make scheduler diagnostics state explicit enough to answer:
  - why Gemini is paused;
  - whether it would be eligible if unpaused;
  - whether foreground/browser work is blocking it;
  - whether provider guard or browser mutation evidence exists.

Acceptance evidence:

- Tests cover ChatGPT/Gemini cross-provider isolation.
- Installed diagnostics show paused, blocked, delayed, or eligible state before
  any browser launch.
- No unrelated provider action opens Gemini.

### Track 6 | Installed Proof And Operating Decision

Status: completed.

- Reinstall user runtime and API service after code changes.
- Keep the old indefinite Gemini completion paused throughout the proof.
- Run exactly one repaired bounded Gemini live-follow proof:
  - provider: `gemini`;
  - runtime profile: `auracall-gemini-pro`;
  - sweep mode: `steady_follow`;
  - materialization policy: `metadata_only`;
  - max passes: `1`.
- Observe DevTools targets only as needed to prove no system-Gem cycling and no
  model selector interactions.
- Confirm terminal completion, scheduler diagnostics, and process cleanup.
- Decide final posture:
  - **Paused** if cleanup or navigation proof is still ambiguous;
  - **Bounded-Only Enabled** if bounded manual Gemini live-follow is repaired
    but indefinite live follow remains too broad;
  - **Live-Follow Enabled** only if indefinite resume semantics are narrowed,
    cleanup is automatic, provider isolation is proven, and read-only Gemini
    navigation is clean.

Acceptance evidence:

- Installed proof has one terminal repaired bounded Gemini completion.
- Old indefinite completion remains paused unless the plan explicitly chooses
  to cancel or replace it.
- No managed Gemini browser process remains after terminal proof.
- `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md` record the repair and final operating posture.

## Critical Path

1. Implement bounded Gemini resume/control semantics.
2. Add automatic bounded-run browser cleanup.
3. Harden read-only Gemini navigation and owned-Gem filtering.
4. Add provider-isolation scheduler gates and diagnostics.
5. Run focused tests and build.
6. Install user runtime/service and run one repaired bounded Gemini proof.
7. Record final posture and close the plan.

## Parallelizable Work

- Resume/control audit can run in parallel with Gemini adapter read-path audit.
- Owned-Gem fixture coverage can run in parallel with browser lifecycle cleanup
  design.
- Scheduler diagnostics wording can be drafted while tests run, but final docs
  must wait for installed proof.

## Definition Of Done

- Plan 0104 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- The old indefinite Gemini live-follow completion stays paused during repair.
- A bounded Gemini repair path exists and is covered by tests.
- Bounded Gemini browser work cleans up the managed browser by default.
- Read-only Gemini live-follow does not use model selector/edit surfaces.
- Non-owned Google/system Gems are skipped without click-through.
- Provider-isolation diagnostics are explicit before browser launch.
- Focused tests, typecheck, build, install, installed bounded proof, and
  `git diff --check` pass.

## Closure Evidence

- The old indefinite Gemini live-follow completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remained
  `status=paused`, `mode=live_follow`, `sweepMode=steady_follow`,
  `passCount=10`, and `completedAt=null` before and after the installed
  bounded proof.
- Fresh bounded repaired proof completion
  `acctmirror_completion_21a7a85d-4f30-48fd-b5df-3ed478dcd085` completed one
  `gemini/auracall-gemini-pro` `steady_follow` / `metadata_only` pass with
  `passCount=1`, `projects=0`, `conversations=71`, `artifacts=0`, `files=0`,
  and `media=0`.
- The bounded proof recorded
  `lastRefresh.browserLifecycle.cleanupRequested=true`,
  `status=terminated`, `pid=2327`, and managed profile
  `/home/ecochran76/.auracall/browser-profiles/gemini-stealthcdp/gemini`.
  The post-terminal process scan showed no managed Gemini browser process and
  no `gemini.google.com` process.
- The first installed proof after the initial cleanup patch exposed the bug:
  completion `acctmirror_completion_cc8b99ce-5f44-4031-a13a-32c300130590`
  completed but reported `browserLifecycle.status=skipped_keep_browser`
  because runtime `keepBrowser` defeated bounded cleanup. The final fix makes
  `cleanupManagedBrowserAfterRefresh=true` authoritative for bounded
  account-mirror cleanup.
- Scheduler diagnostics before proof showed `active=[]`, `providerGuard=null`,
  and `browserMutations.total=0`; post-proof diagnostics again showed
  `active=[]`, `providerGuard=null`, and `browserMutations.total=0`.
- DevTools evidence from the bounded safety pass immediately preceding this
  repair showed Gemini targets at `/app` and `/gems/view`, with no
  `/gem/chess-champ`, `/gem/brainstormer`, or `/gem/storybook` target.
  Plan 0104 hardened the adapter so those system Gem IDs are rejected before
  project/editability treatment.
- Focused validation passed:
  - `pnpm vitest run tests/accountMirror/completionService.test.ts
    tests/accountMirror/refreshService.test.ts
    tests/browser/geminiAdapter.test.ts --maxWorkers 1`
  - `pnpm exec biome lint src/accountMirror/completionService.ts
    src/accountMirror/refreshService.ts src/browser/providers/geminiAdapter.ts
    tests/accountMirror/completionService.test.ts
    tests/accountMirror/refreshService.test.ts
    tests/browser/geminiAdapter.test.ts`
  - `pnpm exec tsc --noEmit`
  - `pnpm run build`
  - `pnpm run install:user-runtime`
  - `pnpm run install:user-api-service`

Final operating decision: bounded Gemini live-follow repair is good enough for
explicit one-pass operator work. Do not resume the old indefinite Gemini
live-follow completion yet; indefinite automatic Gemini live follow remains
too broad until a separate plan narrows resume semantics further or replaces
the old completion.
