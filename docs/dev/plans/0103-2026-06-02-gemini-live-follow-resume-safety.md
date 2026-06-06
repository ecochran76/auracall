# Gemini Live-Follow Resume Safety Plan | 0103-2026-06-02

State: CLOSED
Lane: P01

Closed: 2026-06-02
Decision: keep Gemini live follow paused. Do not resume the old indefinite
completion; use fresh bounded Gemini operations until live-follow resume
semantics are narrowed.

## Purpose

Decide whether Gemini live follow can be safely resumed after the churn audit
without reintroducing unsolicited `gemini.google.com/app` or `/gems/view`
activity. The immediate defect is contained: the active Gemini live-follow
completion is paused, the installed API runtime has completion-level
foreground-work backpressure, and the post-restart process scan showed no
managed Gemini browser process. Plan 0103 is the bounded resume-safety slice:
prove the containment holds, validate Gemini provider behavior only under an
explicit bounded command, and decide whether Gemini stays paused, is cancelled,
or is re-enabled with a narrower policy.

## Current State

- `auracall-api.service` is installed and running on the patched user runtime.
- Installed runtime contains the `shouldYieldToForegroundWork` completion hook
  in the account-mirror completion service.
- Active Gemini completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` is
  `status=paused`, `passCount=10`.
- Its last provider refresh ended at `2026-06-02T22:06:29.785Z`.
- A process scan at `2026-06-02 17:12:52 CDT` showed no managed Gemini browser
  process and no `gemini.google.com` process.
- User runtime config still has
  `profiles.auracall-gemini-pro.services.gemini.liveFollow.enabled=true`; the
  active completion is paused by operator control, not by config change.

## Scope

- Audit current installed state before any Gemini browser work:
  - API service PID and runtime version;
  - active account-mirror completions;
  - Gemini process/DevTools targets;
  - account-mirror scheduler state;
  - provider guard state for `gemini/auracall-gemini-pro`.
- Confirm the patched completion foreground-backpressure behavior is installed
  and covered by tests.
- Keep the existing long-lived Gemini live-follow completion paused during all
  discovery and status work.
- Run at most one explicitly bounded Gemini provider pass, only if the
  preflight gates are clean.
- Validate that bounded Gemini work does not cycle through Google/system Gems
  such as `chess-champ`, `brainstormer`, or `storybook`.
- Decide and record one operating posture:
  - keep Gemini live follow paused;
  - cancel the paused completion and leave config enabled only for future
    bounded starts;
  - or re-enable Gemini live follow with a narrower, documented policy and
    proof that it does not churn.

## Non-Goals

- Do not resume the existing indefinite Gemini live-follow completion as the
  first action.
- Do not run broad Gemini full-sweep materialization.
- Do not enable automatic Gemini artifact materialization.
- Do not touch the retired frontend.
- Do not use Gemini model-selection or Gem browsing surfaces for read-only
  metadata checks unless the command explicitly requires them.
- Do not explore or mutate Google/system Gems that are not user-owned
  editable Gems.
- Do not run concurrent ChatGPT and Gemini browser provider work during this
  proof.

## Work Tracks

### Track 1 | Containment Recheck

Status: complete.

- Re-read installed state:
  - `systemctl --user status auracall-api.service`;
  - installed `auracall --version`;
  - active completions list filtered to Gemini;
  - process scan for managed Gemini browser profiles and `gemini.google.com`;
  - scheduler diagnostics for `gemini/auracall-gemini-pro`.
- Confirm completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` remains
  paused and has not advanced beyond `passCount=10`.

Acceptance evidence:

- `auracall-api.service` was active as PID `30880`.
- Completion `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402`
  remained `status=paused`, `mode=live_follow`, `sweepMode=steady_follow`,
  `passCount=10`, with no refresh beyond the recorded pause.
- Before explicit Gemini work there was no managed Gemini browser process.
- Scheduler diagnostics read the installed target after reinstall and reported
  `providerGuard=null`, `browserMutations=null`, and active completion
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` still paused.

### Track 2 | Resume Semantics Guard

Status: complete.

- Audit the completion-control path for `pause`, `resume`, and `cancel`.
- Decide whether operator `resume` is safe enough for live-follow completions
  or whether Plan 0103 needs a narrower "resume one pass" / bounded handoff
  command before any indefinite live-follow resume.
- If code changes are required, keep them narrow:
  - no broad scheduler refactor;
  - no config migration;
  - no provider adapter changes unless the bounded pass proves they are needed.

Acceptance evidence:

- A paused live-follow completion did not resume on restart or status reads.
- The control-path audit showed `resume` sets the same operation back to
  `queued` and launches it, so it resumes the existing live-follow completion
  rather than creating a bounded one-pass handoff.
- Plan 0103 therefore used a fresh bounded completion instead of operator
  `resume`.

### Track 3 | Bounded Gemini Provider Pass

Status: complete.

- Use a bounded one-pass command instead of resuming the existing live-follow
  completion:
  - provider: `gemini`;
  - runtime profile: `auracall-gemini-pro`;
  - sweep mode: `steady_follow`;
  - materialization policy: `metadata_only`;
  - max passes: `1`;
  - no full-sweep materialization.
- Before running, confirm no foreground ChatGPT account-library job is active.
- During the pass, inspect browser targets only as needed to verify the route
  and provider guard state.
- After the pass, verify process state, completion state, and scheduler state.

Acceptance evidence:

- Exactly one bounded Gemini completion was created:
  `acctmirror_completion_95f9e4af-cd01-402f-bc5c-0141a1e3a927`.
- It completed at `2026-06-02T22:37:57.316Z` with `passCount=1`,
  `mode=bounded`, `sweepMode=steady_follow`, and `materializationPolicy=
  metadata_only`.
- Last-refresh counts were `projects=0`, `conversations=71`, `artifacts=0`,
  `files=0`, and `media=0`; no artifact materialization ran.
- The old live-follow completion stayed paused, so no live-follow loop was
  left running.
- The bounded pass left managed Gemini browser PID `79889` open; after
  confirming the bounded completion was terminal and the old completion was
  still paused, PID `79889` was stopped. A follow-up process scan showed no
  managed Gemini browser process.

### Track 4 | Gem Surface Safety

Status: complete.

- Confirm Gemini account-mirror collection does not treat Google/system Gems as
  editable user projects.
- If Gemini opens `/gems/view`, verify the adapter filters non-owned Gems and
  does not click through `chess-champ`, `brainstormer`, `storybook`, or similar
  Google-authored Gems.
- If filtering is missing, patch the provider adapter before any resume
  decision.

Acceptance evidence:

- `/gems/view` was touched during the bounded pass, but the completion
  reported `projects=0`.
- Source audit confirmed Gemini project scraping requires an editable
  `/gems/edit/` row signal before returning project probes.
- Existing regression coverage includes the editable-My-Gems filter behavior.
- DevTools targets during/after the bounded pass did not show
  `/gem/chess-champ`, `/gem/brainstormer`, or `/gem/storybook`.

### Track 5 | Operating Decision

Status: complete.

- Choose the next Gemini posture based on evidence:
  - **Paused** if bounded proof still opens unexpected surfaces or leaves
    browser state ambiguous.
  - **Cancelled** if the old live-follow completion is stale/noisy and future
    Gemini work should start from fresh bounded operations.
  - **Enabled** only if the bounded pass is clean, Gem filtering is proven, and
    live-follow resume semantics are explicit.
- Update `ROADMAP.md`, `RUNBOOK.md`, and `docs/dev/dev-journal.md` with the
  decision and installed evidence.

Acceptance evidence:

- Final posture is **Paused**.
- Installed completion readback showed
  `acctmirror_completion_afdbcd9c-b51e-4144-a31d-54be35e71402` still paused,
  while bounded completion
  `acctmirror_completion_95f9e4af-cd01-402f-bc5c-0141a1e3a927` completed.
- Installed `api scheduler-diagnostics` no longer returned HTTP 401 after the
  patched user runtime was installed and `auracall-api.service` restarted.
- `ROADMAP.md` records the later process/DevTools proof that AuraCall was the
  Gemini browser source and no longer relies on the stale "logs showed no
  source" claim.

## Critical Path

1. Containment recheck.
2. Resume-semantics audit.
3. Bounded one-pass Gemini proof.
4. Gem surface safety review.
5. Operating decision and docs.

## Parallelizable Work

- Source audit for completion-control semantics can run in parallel with
  installed state readback.
- Gemini adapter Gem filtering audit can run in parallel with scheduler and
  completion-state readback.
- Docs can be drafted while validation runs, but final state must wait for
  installed proof.

## Definition Of Done

- Plan 0103 is wired into `ROADMAP.md` and `RUNBOOK.md`.
- The paused Gemini completion and process state were rechecked before any
  provider work.
- The only Gemini provider action was bounded to one explicit pass.
- Gemini non-owned Gem behavior was audited; no provider patch was needed.
- Installed proof records Gemini remains paused.
- Focused tests and `git diff --check` passed for the scheduler-diagnostics
  auth fix.
