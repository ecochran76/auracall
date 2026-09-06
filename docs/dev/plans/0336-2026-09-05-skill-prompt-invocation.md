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

`skills run` is implemented and installed. One live canary committed the exact
Skill ID in its user turn and returned an answer. ChatGPT explicitly reported
that the selected SKILL.md was inaccessible; actual Skill execution remains
unaccepted. The detail UI independently shows the Skill installed with source
and supporting files; no review gate or automation domain block was observed.

The first command timed out on prompt-commit equality because the committed
Skill label was counted as user text. The repaired readback excludes inline
pills, preserves ordinary text, and recaptured this exact conversation without
resubmission. Response boundaries now use the pre-submit empty conversation,
not a turn count that may already include the answer. An uncertain outcome
reports the current conversation URL and prohibits retry.

Final focused tests pass 377/377; typecheck/build/planning/diff checks pass.
Scoped lint has no errors and two inherited warnings. Full suite was not rerun.
Receipt: `docs/dev/notes/2026-09-05-plan0336-skill-prompt-live.json`.
Source integration and repaired installed-byte verification remain. The broader
Skill-execution objective is still blocked on model access to the Skill resource.

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
