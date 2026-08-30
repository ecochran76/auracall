# ChatGPT developer-app submit selection | 0323-2026-08-30

State: OPEN
Lane: P16
Operational state: IMPLEMENTING
Branch: fix/plan0323-developer-app-mention
Target: main
Integration: merge
Revision: 3 | 2026-08-30

## Current State

- Provider-free RED reproduced the stale `composerTool: "LitScout"` routing.
- GREEN reuses exact ecosystem-mention selection with retained state and
  removes the inherited built-in composer-tool field before normal dispatch.
- The first installed pre-auth probe committed one exact user turn, but
  ChatGPT returned `plugin_not_found` and LitScout received zero calls. Exact
  settings inspection exposed the missing `Connection -> Connect` state; the
  operator-authorized OAuth flow completed and current inventory now reports
  the replacement LitScout app `ACTIVE`.
- That committed turn also exposed one verifier defect: ChatGPT presents the
  retained ecosystem pill label as a prefix to authored user text. The bounded
  repair excludes only the exact ecosystem-mention pill from committed-turn
  text, matching the existing composer-preservation boundary.
- Focused developer-app, CLI, prompt-replacement, committed-turn, and composer
  tests pass `74/74`; typecheck, production build, and scoped Biome pass with
  one unchanged naming-convention warning on the existing `__test__` export.
- The first post-OAuth no-submit selection exposed a second current-DOM edge:
  deleting an ecosystem pill can unwrap it into literal `@LitScout` text.
  Provider-free RED/GREEN now proves one bounded second select-all/backspace
  pass clears that residual text while ordinary composers stop after one pass.
  The widened six-file packet passes `72/72`, with typecheck, production build,
  scoped Biome, and the plan-library audit also green.
- A pre-experiment audit found that the submit test's fixed
  `prompt_submitted` boundary would release AuraCall before its ordinary
  response watcher could service third-party tool approvals. An explicit
  `--wait-for-response` mode now retains normal assistant-response completion
  and tool-approval handling, while submit-only remains the default. Its
  approval policy is explicit and bounded to `manual` or `allow-once`; the
  experiment selects `allow-once` and never grants durable approval.
- Reinstall/source-runtime parity and one governed terminal-response validation
  through LitScout Experiment 18 remain pending.

## Stable Objective

Make an authorized `apps test --submit` preserve the exact selected ChatGPT
developer app through prompt replacement and Send by using the same verified
ecosystem-mention path as the existing no-submit selection smoke.

## Evidence And Cause

- A newly refreshed, enabled private LitScout app passes the no-submit
  selection smoke with exact app identity.
- The submit path fails before Send with `did not stay selected after
  activation` and reports the same LitScout label in the built-in composer
  workbench.
- `selectForTest` selects an ecosystem mention and verifies its plugin/app ID.
  `submitTest` instead sets `browser.composerTool` and routes the app name
  through the built-in composer-tool selector.
- Exact composer replacement already preserves connected-app pills, so the
  app-submit seam should stage and verify the app mention before handing the
  prompt to the normal runner.

## Execution Graph

1. RED-test that submit stages and verifies the exact ecosystem mention and
   does not set a built-in `composerTool`.
2. Reuse the existing mention selector and exact app-identity verifier in
   `submitTest`; preserve current-model selection and normal prompt dispatch.
3. Clear an atomic ecosystem mention with at most two verified deletion passes,
   then run focused developer-app, composer-replacement, and ChatGPT prompt tests,
   then typecheck and build.
4. Add an opt-in terminal-response mode that keeps the ordinary ChatGPT
   response and tool-approval watcher active; preserve `prompt_submitted` as
   the default.
5. Install the exact candidate and use separately governed LitScout Experiment
   18 as the one terminal-response live validation. Do not consume an extra
   research Send merely to duplicate the submit proof.

## Acceptance Criteria

- `DAS-R1`: provider-free RED/GREEN proves submit uses an exact verified
  ecosystem mention and leaves `browser.composerTool` unset.
- `DAS-R2`: prompt replacement retains the connected-app pill and focused
  developer-app/composer/ChatGPT prompt contracts pass, including the atomic
  pill-to-literal cleanup transition.
- `DAS-R3`: typecheck, build, and source/installed parity pass.
- `DAS-R4`: provider-free RED/GREEN proves the opt-in terminal mode requests
  `assistant_response`, forwards its bounded timeout, and returns the captured
  terminal response while leaving submit-only behavior unchanged; an explicit
  `allow-once` policy reaches the ordinary response watcher.
- `DAS-R5`: one authorized live Experiment 18 Send proves exact app selection,
  continued tool approvals, and terminal response capture on the expected
  account; its LitScout effects are governed and audited by Plan 0477.

## Bounds

- One source implementation plus evidence-driven composer and terminal-watcher
  repairs.
- One install and one Plan-0477-governed experiment Send.
- No app recreation, OAuth reconnect, scheduler mutation, unrelated browser
  cleanup, or extra canary Send.

## Definition Of Done

All five criteria have current evidence and the repaired app-submit path has
completed separately governed LitScout Experiment 18 without an extra canary
Send.
