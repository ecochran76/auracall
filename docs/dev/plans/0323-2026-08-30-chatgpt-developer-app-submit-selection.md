# ChatGPT developer-app submit selection | 0323-2026-08-30

State: OPEN
Lane: P16
Operational state: IMPLEMENTING
Branch: fix/plan0323-developer-app-mention
Target: main
Integration: merge
Revision: 1 | 2026-08-30

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
- Reinstall/source-runtime parity and the final no-research authenticated
  canary remain pending.

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
3. Run focused developer-app, composer-replacement, and ChatGPT prompt tests,
   then typecheck and build.
4. Install the exact candidate and run one no-research LitScout `auth_session`
   canary. Return the browser to the LitScout experiment only if the canary
   proves the expected account and no project/session/provider effects.

## Acceptance Criteria

- `DAS-R1`: provider-free RED/GREEN proves submit uses an exact verified
  ecosystem mention and leaves `browser.composerTool` unset.
- `DAS-R2`: prompt replacement retains the connected-app pill and focused
  developer-app/composer/ChatGPT prompt contracts pass.
- `DAS-R3`: typecheck, build, and source/installed parity pass.
- `DAS-R4`: one authorized live `auth_session` canary submits once, invokes
  LitScout once, returns the expected authenticated account, and creates no
  project, session, or external-provider effect.

## Bounds

- One source implementation plus one evidence-driven repair.
- One install and one no-research canary.
- No research, project/session mutation, provider request, app recreation,
  OAuth reconnect, scheduler mutation, or unrelated browser cleanup.

## Definition Of Done

All four criteria have current evidence and the repaired app-submit path is
ready to stage the separately governed LitScout Experiment 16.
