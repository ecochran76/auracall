# Skill Prompt Invocation | 0336-2026-09-05

State: OPEN
Lane: P29
Branch: fix/plan0336-skill-prompt-invocation
Target: main
Integration: merge

## Stable Objective

Select an exact-account, exact-ID Skill and submit one user prompt in the same
owned composer, preserving positive selection through the send boundary.

## Current State

Plan 0334 selection is accepted, but it clears selection before returning.
The subsequent name-based prompt reported Skill not loaded. Implementation
adds `skills run` using the existing operation lock and provider actions.
Focused validation passes 376 tests; build, typecheck, planning and diff checks
pass. Scoped lint has no errors and two inherited warnings. Installed/live
acceptance remains.

## Scope And Bounds

One serialized implementation and focused validation slice, installed adoption,
and one bounded synthetic live prompt on wsl-chrome-3. Ordinary pre-submit
repairs remain in scope. Never retry an uncertain send or click Answer now.
Preserve pre-existing browsers and other worktrees. No Skill CRUD, uploads,
account changes, scheduler changes, service restarts, or release publish.

## Acceptance Criteria

- Exact account, complete inventory, exact ID, confirmation, and bounded prompt
  are required; missing or ambiguous selection fails before Send.
- Chat mode and positive Skill marker are verified in the same tab after prompt
  insertion and before Send. Selection cleanup cannot run between these steps.
- One submission attempt; uncertainty preserves the tab and prohibits retry.
- Existing non-submitting select behavior is unchanged.
- Relevant tests, typecheck, build, lint, and planning checks pass; installed
  bytes match. Live receipt separates response capture from actual Skill use.

## Definition Of Done

Implementation and docs are committed and integrated after validation. Record
whether the live provider loaded the Skill and any exact remaining limitation.
