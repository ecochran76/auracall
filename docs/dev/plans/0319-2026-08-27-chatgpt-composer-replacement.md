# ChatGPT composer replacement and exact-turn proof | 0319-2026-08-27

State: OPEN
Operational state: LIVE_ACCEPTED_INTEGRATION_PENDING
Lane: P12
Branch: fix/plan0319-chatgpt-composer-replacement
Target: main
Revision: 2 | 2026-08-27

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
- Retained-CDP comparison then localized the divergence: reading `innerText` from
  a detached clone collapsed every block boundary (`Session 73.Conduct...`) even
  though the live composer displayed the exact paragraphs. The final repair
  traverses the live composer, skips only protected app-pill subtrees, and emits
  explicit block boundaries before equality normalization.
- The first scored submission after installation did commit, but the verifier
  rejected it because the committed user-turn container appended ChatGPT's
  presentation-only `Show more` button text. A second observed attempt then
  restored the first conversation and committed the same prompt again, producing
  two exact 2,549-character rendered user turns in conversation
  `6a90a894-c3a4-83e9-adc7-602e5761a4c4` and a visible provider
  `too many requests` warning.
- The active run was cancelled before approving the LitScout action. Authoritative
  Session 73 readback remained `gather_ready` with zero members, the unchanged
  execution token, and zero new receipts/provider calls. The exact owned Chrome
  tree on port 9222 was closed.
- The next provider-free repair reads committed authored text by walking the live
  turn DOM while excluding buttons/turn controls. Focused tests pass 11/11,
  typecheck passes, and the production build passes. The repair was installed at
  source/runtime SHA-256
  `316b6a678315c08e5c4a4202958cd49ae0ece90c2aa90e4d4f0505a94decb557`;
  the API returned healthy with zero restarts.
- One fresh run created conversation
  `6a90b04b-c77c-83ea-97d5-dfa59a279c42`. Direct retained-CDP readback proved
  exactly one user turn and exact normalized equality with the intended
  2,548-character assembled prompt. No rate-limit warning or duplicate submit
  appeared.
- ChatGPT actively used LitScout across three research cycles: 12 external calls
  with USD 0.018 estimated usage, 108 session members, 42 active works, 66
  removals, 39 keeps, 3 priorities, 19 evidence assessments, and completed
  enrichment jobs. Session 73 stopped honestly at `evidence_gap_review` because
  patent-provider economics could not establish a hard-cap estimate and the
  patent sources therefore remained outside the LitScout Work corpus.
- ChatGPT nevertheless produced a substantive 2,736-word feasibility proposal.
  A separate terminal-output defect selected the visible 55-character
  `Connection interrupted` banner over the substantively different 22,227-
  character writing block. The full block was recovered through the retained
  CDP session and preserved beside the AuraCall session metadata. That adjacent
  extractor defect is not a composer-replacement acceptance failure and requires
  a bounded successor slice.
- Browser port 9222 is closed, the pre-existing account-mirror completion is
  resumed, and no further provider submission is authorized in this plan.
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

## Acceptance Readback

- `CPR-R1` through `CPR-R5`: PASS. Regression, exact replacement/equality,
  provider-free gates, installed parity, and service health are recorded in the
  branch history and acceptance receipt.
- `CPR-R6`: PASS for the composer lane. One exact turn produced attributable
  LitScout effects and a recovered proposal; browser and background ownership
  were restored. The persisted LitScout terminal state and the AuraCall output
  extractor defect are explicit rather than masked.
- Integration and push remain the only Plan 0319 closeout gate.

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
