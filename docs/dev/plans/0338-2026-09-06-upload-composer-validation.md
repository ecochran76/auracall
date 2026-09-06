# Upload Composer Validation And Handoff Coverage | 0338-2026-09-06

State: OPEN
Lane: P31
Branch: fix/plan0338-upload-composer-validation
Target: main
Integration: merge
Revision: 1 | 2026-09-06

## Stable Objective

Resolve the two browser-review follow-ups on current main: inactive composer
forms must not authorize upload fallback, and explicit-model handoffs must
retain coverage alongside omitted selectors.

## Current State

- Baseline `14e77ae23` already contains current-model preservation and the
  composer-local upload fallback; do not replay the obsolete recovery branch.
- Actual DOM inventory accepts hidden forms and the model handoff fixture
  exercises only an omitted selector. R1 and R2 are the frozen findings.

## Execution Graph

Primary agent owns serialized implementation and integration. Independent
provider-free checks may batch; no subagents.

1. Publish plan and canonical lane wiring.
2. Add actual inventory-expression fixtures for hidden/ambiguous composers and
   valid hidden input with visible editor/trigger; prove failure before repair.
3. Require unique visible composer ownership for the label-drift fallback,
   respect explicit popover ownership when present, and retain upload input
   uniqueness and restriction checks. Parameterize the real handoff service
   test for omitted and explicit semantic selectors.
4. Run focused/adjacent attachment, composer, handoff and approval contracts,
   typecheck, build, touched lint and planning audits. Review only R1/R2 plus
   regressions introduced by this repair; one bounded correction if necessary.
5. Update operator docs and journal, integrate and publish, verify exact remote
   parity, and remove this clean temporary worktree after process checks.

## Acceptance Criteria

- UC1: hidden/inactive or ambiguous composer ownership fails closed when local
  upload row labels drift; valid visible composer with hidden input succeeds.
- UC2: test executes production inventory expression and detects UC1 before
  repair; hidden fallback textarea does not mask a visible editor.
- UC3: omitted handoff selector retains current strategy; explicit selector
  propagates desired model, effort, and select strategy through real adapter.
- UC4: focused/adjacent tests, typecheck/build, scoped lint, planning and catalog
  audits pass; documentation and published main match the implemented behavior.

## Bounds

Provider-free source/test/documentation work only. No upload, prompt, browser
launch, installed-runtime adoption, service restart, scheduler or model change.
Do not alter unrelated active lanes or the WIP recovery branch. At most two
implementation/verification attempts before evidence-driven local replanning.

## Definition Of Done

Both findings are resolved on published main with passing public-seam evidence,
operator documentation, clean Git custody and the temporary worktree closed.
