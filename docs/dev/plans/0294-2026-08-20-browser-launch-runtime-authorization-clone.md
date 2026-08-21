# Browser Launch Runtime Authorization Clone Repair | 0294-2026-08-20

State: CLOSED
Lane: P01

## Stable Objective

Allow a normal AuraCall browser run to resolve its immutable launch plan when
the runtime browser configuration carries function-bearing provider-session
authorization, without cloning, freezing, mutating, or weakening that live
authorization object.

## Current State

- LitScout Experiment 9 made one exact AuraCall invocation after its source,
  installed-runtime, database, identity, and completion gates passed.
- AuraCall failed in 54 ms before browser launch because
  `resolveBrowserLaunchPlan` passed the function-bearing
  `providerSessionAuthorization` graph to `structuredClone`.
- No browser navigation, prompt submission, tool call, model response, grade,
  or LitScout canonical effect occurred. Experiment 9 remains unrun.
- A focused public-seam regression reproduces the exact `DataCloneError` and
  passes after excluding the runtime-only authorization capability from the
  immutable launch-policy snapshot.

## Selected Design

- Keep `providerSessionAuthorization` on the live `runBrowserMode` config where
  account identity verification and proof recording consume it.
- Remove only that optional runtime capability from the browser launch-policy
  value before the existing structured clone and deep freeze.
- Preserve all serializable launch/profile/provider fields, input immutability,
  and existing browser selection semantics.

## TDD And Validation

1. Add one public launch-plan regression using a real provider-session
   authorization object and confirm the exact `DataCloneError` RED.
2. Exclude only runtime authorization from the launch snapshot; confirm the
   regression GREEN and the original authorization remains callable.
3. Run the complete launch-plan contract, affected runtime callers,
   provider-session authority tests, typecheck, build, scoped lint, plan audit,
   CodeGraph readback, and diff hygiene.
4. Commit and push the source candidate before any install or live retry.
5. Pause only the exact completion after its owned provider work settles,
   install once, restart once, and prove source/installed/runtime parity before
   returning control to LitScout's separately governed same-Experiment-9
   successor.

## Non-Goals

- No provider, selector, prompt, attachment, tool-approval, or grading change.
- No live Experiment 9 submission from this AuraCall plan.
- No change to provider-session identity proof or authorization enforcement.
- No replacement completion, scheduler change, or unrelated browser-profile
  action.

## Acceptance Criteria

- [x] Exact regression is RED before the repair and GREEN after it.
- [x] Runtime provider-session authorization remains callable and is absent
  only from the immutable launch snapshot.
- [x] Affected provider-free and static validation passes.
- [x] Source candidate is committed and pushed before installation.
- [x] Installed runtime matches the accepted source and preserves the exact
  completion and browser-profile authority.

## Validation Evidence

- The new public-seam test failed with the same `DataCloneError` at
  `clone -> resolveBrowserLaunchPlan` before the repair and passed after it.
- The affected launch/profile/runtime/authority packet passed 8 files and 132
  tests. The full provider-free suite passed 323 files and 2,928 tests, with 21
  files and 65 opt-in/live tests skipped by design.
- Typecheck, production build, scoped zero-warning lint, plan audit across 294
  plans, and diff hygiene pass. No Chrome process used a disposable
  `/tmp/auracall-vitest-*` profile after the suite.
- During validation, the pre-existing exact live-follow completion's owned job
  naturally settled all-failed with zero materializations and four failures.
  The completion correctly became `blocked` and released provider work; the
  test suite did not control or replace it.
- Source candidate `b2db6cbc` is committed on
  `fix/plan0294-browser-launch-plan-function-clone` and matches its pushed
  upstream exactly.

## Installed Runtime Activation

- Activation is frozen against source candidate `b2db6cbc` after its pushed
  readback and all provider-free acceptance gates.
- Exactly one `pnpm run install:user-runtime` from that checkout and one
  `auracall-api.service` restart are authorized.
- The exact live-follow completion is already terminal `blocked` after an
  all-failed owned job and has released provider work; no pause, cancel,
  replacement completion, browser launch, or provider request is authorized by
  this activation.
- Acceptance requires installed metadata/source readback, a new service PID,
  the public regression against installed package bytes, unchanged exact
  completion identity/state, and matching `wsl-chrome-3` browser ownership.

## Installed Runtime Evidence

- Exactly one install completed from the pushed Plan 0294 checkout and exactly
  one API restart produced healthy service PID `40915` with zero restarts.
- Source and installed `browserLaunchPlan.js` both hash to
  `8bf2c8cb5b607e25a7db867ae6c29cf34011ed5fdf4d5e3438dcb7a05f5ac930`.
- A provider-free Node probe imported the installed package and proved launch
  resolution succeeds, authorization is absent from the snapshot, the exact
  input authorization object is preserved, and its authority remains callable.
- Completion `acctmirror_completion_3854720c-d3f9-4e57-99fc-9d6f6d04c710`
  remained the same terminal all-failed record across restart: `blocked`, pass
  2, job `hmj_e9c4fc743d1e4f9c9e84260a9d74f265`, zero materialized, four failed.
  The existing `wsl-chrome-3` Chrome owner remained in place; no browser or
  provider operation was started by installation or validation.

## Definition Of Done

The function-bearing authorization object no longer crashes browser launch
planning, authorization remains live at its actual runtime consumers, source
and installed runtime agree, and the same LitScout Experiment 9 may proceed
only through its fresh request and activation gates. This definition is met.
