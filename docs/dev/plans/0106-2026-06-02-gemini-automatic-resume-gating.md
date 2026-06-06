# Gemini Automatic Resume Gating Plan | 0106-2026-06-02

State: CLOSED
Lane: P01

## Purpose

Prevent legacy Gemini live-follow completions from re-entering broad automatic
browser work after the left-rail repair. Plan 0105 proved bounded rail
retrieval, but the old indefinite Gemini completion was intentionally left
paused. AuraCall must not let startup recovery or a plain operator resume turn
that legacy metadata-only completion back into `/app` churn or unbounded
materialization work.

## Current State

- Plan 0105 closed as **Bounded Rail Retrieval Enabled**.
- Bounded Gemini proof
  `acctmirror_completion_c96ff20c-c1d2-4299-8209-f5ab76652351` selected real
  left-rail conversations, found artifact/file/media candidates, and
  materialized one retrievable Gemini asset.
- Legacy indefinite Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remains paused
  at `passCount=10` with stale metadata-only evidence.
- Completion service startup currently resumes all runnable persisted
  completions without provider-specific safety gates.
- Completion service operator resume currently requeues any paused completion
  without validating whether the policy is still safe for the provider.
- Scheduler diagnostics are currently occupied by ChatGPT work, so Gemini must
  not be reintroduced as background browser churn while ChatGPT catch-up is
  active.

## Scope

- Add an explicit Gemini resume-safety classifier for account-mirror
  completions.
- Block automatic startup resume for unsafe legacy Gemini live-follow
  completions:
  - provider is `gemini`;
  - mode is `live_follow`;
  - `maxPasses` is `null`;
  - materialization policy is missing or `metadata_only`;
  - current evidence does not show Plan 0105-style productive left-rail route
    progress.
- Block plain operator resume for the same unsafe legacy shape.
- Preserve explicit bounded Gemini work and upgraded materialization policies.
- Record lifecycle/error evidence when a resume is blocked so operators can
  see why the completion stayed inert.
- Update the roadmap/runbook/journal/fixes log with the new automatic-resume
  posture.

## Non-Goals

- Do not resume the old indefinite Gemini completion as this plan's proof path.
- Do not reopen uncapped Gemini live follow.
- Do not change the retired frontend.
- Do not add Gemini timeout parking as the primary mitigation.
- Do not weaken ChatGPT scheduler/materialization behavior.

## Work Tracks

### Track 1 | Resume Safety Contract

Status: completed.

- Define the unsafe legacy Gemini completion shape.
- Define the allowed shapes:
  - bounded Gemini completions;
  - upgraded full/recent missing-asset policies with materialization caps;
  - completions whose latest route-progress evidence selected real left-rail
    conversations without shell-only churn.
- Add lifecycle event names for automatic and operator resume blocks.

Acceptance evidence:

- Unit tests prove startup recovery does not launch an unsafe legacy Gemini
  completion.
- Unit tests prove operator resume keeps the same completion paused with an
  actionable error.

### Track 2 | Startup Recovery Gate

Status: completed.

- Apply the safety contract before `resumeActiveOperations` launches a
  persisted completion.
- Leave unsafe legacy Gemini completions paused instead of repeatedly trying to
  launch them on future API startups.
- Preserve normal startup recovery for ChatGPT and bounded Gemini work.

Acceptance evidence:

- Existing ChatGPT startup-resume behavior remains covered.
- Focused Gemini test proves `requestRefresh` is not called for the blocked
  legacy completion.

### Track 3 | Operator Resume Gate

Status: completed.

- Apply the same safety contract to `control({ action: 'resume' })`.
- Return the updated paused operation instead of launching the browser.
- Make the error code stable enough for CLI/API readback.

Acceptance evidence:

- Focused test proves plain resume returns `status=paused` and does not launch.
- The error identifies that a bounded or upgraded Gemini policy is required.

### Track 4 | Installed Runtime Proof

Status: completed.

- Run focused tests for completion service resume gating.
- Rebuild and reinstall the user runtime if code changes.
- Restart or read the installed API service and verify:
  - old Gemini completion remains paused;
  - no managed Gemini browser process is created by automatic recovery;
  - scheduler diagnostics remain free of Gemini browser mutations.

Acceptance evidence:

- Command evidence records the focused test run.
- Installed readback records the old completion's paused status and blocked or
  inert posture.
- Process scan shows no managed Gemini browser process.

## Exit Criteria

- Plan 0106 is closed only after startup and operator resume paths enforce the
  Gemini safety contract in code and tests.
- `ROADMAP.md` names the new posture as **Gemini Automatic Resume Gated**.
- `RUNBOOK.md`, `docs/dev/dev-journal.md`, and `docs/dev-fixes-log.md` capture
  the durable lesson: bounded rail retrieval is enabled, but legacy indefinite
  Gemini live-follow completions require upgrade/replacement before resume.

## Closeout

Closed as **Gemini Automatic Resume Gated**.

Implemented:

- `createAccountMirrorCompletionService` now blocks automatic startup resume
  for unsafe legacy Gemini live-follow completions before launching refresh
  work.
- `control({ action: 'resume' })` now blocks plain operator resume for the same
  legacy Gemini shape.
- Blocked completions remain `status=paused`, clear `nextAttemptAt`, record
  `error.code=gemini_live_follow_resume_blocked`, and append either
  `automatic_resume_blocked` or `operator_resume_blocked`.
- Safe shapes remain available: bounded Gemini work, capped upgraded
  retrieval policies, and live-follow operations with productive left-rail
  route-progress evidence.

Validation:

- `pnpm vitest run tests/accountMirror/completionService.test.ts` passed with
  28 tests.
- `pnpm run typecheck` passed.
- `pnpm run build` passed.
- `pnpm run install:user-runtime-service` passed.

Installed proof:

- `auracall-api.service` restarted on the installed user runtime as PID
  `74408`.
- Legacy Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remained
  `status=paused`, `mode=live_follow`, `materializationPolicy=metadata_only`,
  and `passCount=10` after startup.
- Scheduler diagnostics stayed on active ChatGPT completion
  `acctmirror_completion_445ecb7e-f853-4bab-8672-c08b16c46109` with
  `browserMutations.total=0`.
- Installed operator resume against the legacy Gemini completion returned
  `status=paused`, `nextAttemptAt=null`,
  `error.code=gemini_live_follow_resume_blocked`, and lifecycle event
  `operator_resume_blocked`.
- Post-resume process scan showed no managed Gemini browser process.
