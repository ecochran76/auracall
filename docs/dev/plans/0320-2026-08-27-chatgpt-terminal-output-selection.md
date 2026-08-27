# ChatGPT terminal-output selection | 0320-2026-08-27

State: OPEN
Operational state: SOURCE_GREEN_INSTALL_PENDING
Lane: P13
Branch: fix/plan0320-chatgpt-terminal-output-selection
Target: main
Revision: 1 | 2026-08-27

## Stable Objective

Prevent AuraCall from replacing a complete copied ChatGPT writing block with a
terminal provider-status banner, while preserving stable-DOM precedence for
ordinary substantive response mismatches.

## Current State

- Plan 0319's accepted run captured 55 characters of interruption status in
  both the response text and final DOM, but successful copy extraction returned
  23,210 characters of substantive markdown.
- `reconcileAssistantRepresentations` currently treats every eligible stable DOM
  mismatch as authoritative. The evidence was logged, but the selector returned
  the status banner for both text and markdown.
- The full 2,736-word writing block was recovered through retained CDP and is
  preserved with the AuraCall session. No new provider run is needed to reproduce
  the selection failure.
- The exact 55-versus-23,210 character fixture failed under the prior selector
  and passed after the bounded repair. The selector now requires both captured
  text and final DOM to match the exact normalized interruption status, a longer
  non-status copy, and then preserves that copy for both output representations.
- The complete helper suite passes 13/13; affected reattach and ChatGPT adapter
  coverage passes 209/209. Typecheck, production build, scoped lint, release
  lint, and diff hygiene pass. Installation/parity and final planning audit remain.

## Authority And Bounds

- One critical-path owner; no subagents.
- Expected write set: response-representation helper/test, this plan, roadmap,
  runbook, developer journal, fixes log, active-lane catalog, and one acceptance
  receipt.
- Use the exact incident shape as the RED fixture. No ChatGPT prompt submission,
  LitScout action, OAuth change, browser launch, or research rerun.
- Keep the classifier provider-local and exact enough that ordinary short answers,
  substantive digit/word mismatches, and prompt echoes retain current behavior.

## Execution Graph

1. Add a deterministic regression for interruption-status captured/DOM text and
   a materially larger successful copied-markdown response; prove it fails.
2. Rank and test the selector hypotheses against that fixture and existing
   mismatch/echo cases.
3. Implement the smallest terminal-status eligibility rule at the existing
   representation seam and make the RED green.
4. Run focused and affected provider-free tests, typecheck, scoped lint, build,
   plan audit, CodeGraph readback, and diff hygiene.
5. Commit, install at an idle boundary, prove byte parity and service health,
   record acceptance, integrate, and push.

## Acceptance Criteria

- `TOR-R1`: the exact banner-versus-writing-block fixture fails before repair and
  passes afterward at the production selection seam.
- `TOR-R2`: classified terminal status cannot replace nonempty substantive copied
  markdown; returned text and markdown both preserve the complete content.
- `TOR-R3`: ordinary substantive DOM mismatches, formatting-only equivalence,
  prompt-echo exclusion, and no-copy behavior retain their existing tests.
- `TOR-R4`: focused/affected tests, typecheck, scoped lint, build, planning audit,
  CodeGraph readback, and diff hygiene pass.
- `TOR-R5`: committed source and installed runtime are byte-identical, the API is
  healthy, and no browser/provider/LitScout effect occurred.

## Acceptance Readback

- `TOR-R1` through `TOR-R4`: PASS at the source checkpoint pending commit.
- `TOR-R5`: pending commit, idle install, byte parity, and service readback.

## Non-Goals

- No generic longest-text heuristic, new browser extraction path, terminal wait
  redesign, composer change, tool-approval change, or LitScout/provider-economics
  repair.
- No retry of the Frakktal experiment and no reliance on a live provider to prove
  a deterministic representation-selection defect.

## Definition Of Done

Plan 0320 closes when all five criteria pass, the installed selector is
byte-identical to the accepted commit, runtime ownership is unchanged, and the
validated lane is integrated and pushed.
