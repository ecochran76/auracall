# ChatGPT composer replacement and exact-turn proof | 0319-2026-08-27

State: OPEN
Operational state: PROVIDER_FREE_REPAIR_ACTIVE
Lane: P12
Branch: fix/plan0319-chatgpt-composer-replacement
Target: main
Revision: 1 | 2026-08-27

## Stable Objective

Prevent AuraCall from appending a new prompt to retained ChatGPT composer text,
prove the newly committed user turn exactly matches the requested prompt, install
the repair byte-identically, and only then rerun the bounded Frakktal/LitScout
research-to-draft experiment.

## Current State

- The first scored experiment is invalid. AuraCall metadata held only the new
  2,548-character prompt, but the live ChatGPT user turn concatenated two stale
  drafts before it. ChatGPT consequently executed the first obsolete canary.
- Source diagnosis reproduced both accepting defects: `submitPrompt` inserts at
  the current selection without clearing user text, and both composer/commit
  checks accept containment instead of equality.
- Focused RED failed in two cases, then passed after exact composer replacement
  and exact normalized committed-turn checks. The first installed no-send attempt
  then correctly rejected
  ChatGPT's rich-text rendering of the exact assembled markdown; it produced no
  conversation or LitScout call. The adjacent repair now treats only bounded
  markdown/list presentation differences as equivalent and records mismatch
  hashes plus the first normalized divergence.
- P08 remains active in its own worktree. It has no expected source overlap with
  this prompt-composer lane.

## Authority And Bounds

- One critical-path owner; no subagents.
- Expected write set: prompt composer source/tests, this plan, roadmap/runbook,
  developer journal, active-lane catalog, and one durable acceptance receipt.
- Preserve the existing `wsl-chrome-3` authenticated browser profile and LitScout
  Project 15 / Session 73. Do not reconnect OAuth, replace the app, create a new
  LitScout project/session, or activate `Answer now`.
- Provider-free validation precedes one installed-runtime update. The experiment
  rerun is one distinct fresh prompt/session attempt with direct CDP observation.
- Preserve the research ceiling of 32 external calls and USD 25. No publication,
  filing, outreach, messaging, or other third-party communication.

## Execution Graph

1. Freeze the concatenated live user turn as the defect contract and reproduce
   containment acceptance in focused tests.
2. Clear user-authored text on the exact focused target while preserving selected
   connected-app pills; fail closed if clearing or exact pre-send readback fails.
3. Require the newly committed user turn to equal the requested prompt after
   presentation-only normalization; remove containment/fallback success paths.
4. Run focused and affected provider-free gates, typecheck, scoped lint, build,
   plan audit, CodeGraph readback, and diff hygiene.
5. Commit, install once at an idle runtime boundary, restart the owned API service,
   and prove source/installed byte parity plus service health.
6. Run one fresh scored experiment with direct CDP observation, reconcile the
   exact ChatGPT turn and LitScout effects, restore pre-existing background
   ownership, and grade the work product.

## Acceptance Criteria

- `CPR-R1`: a deterministic regression begins with stale composer text and fails
  under the prior containment behavior.
- `CPR-R2`: the exact focused target has no user-authored text before insertion;
  selected app pills remain intact and ambiguous/failed clearing stops before Send.
- `CPR-R3`: pre-send readback and the newly committed user turn both exactly match
  the requested prompt after bounded normalization; containment is insufficient.
- `CPR-R4`: focused/affected tests, typecheck, scoped lint, build, planning audit,
  CodeGraph readback, and diff hygiene pass.
- `CPR-R5`: committed source and installed runtime are byte-identical and the API
  returns healthy before the rerun.
- `CPR-R6`: one fresh rerun contains only the intended prompt, produces attributable
  LitScout research/writing evidence or a typed failure, and leaves browser,
  background-completion, OAuth, provider-spend, and repository custody reconciled.

## Non-Goals

- No generic DOM rewrite, app-pill removal, broad selector expansion, OAuth or
  consent-policy change, model/mode change, or ChatGPT UI redesign.
- No LitScout research-controller, corpus, provider-economics, or drafting-policy
  source change.
- No retry loop or reuse of the invalid concatenated conversation as scored output.

## Definition Of Done

Plan 0319 closes only when all six acceptance criteria are satisfied, the repaired
runtime has completed one distinct fresh experiment, exact effects and ownership
are reconciled, and the validated lane is integrated and pushed.
