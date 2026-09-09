# ChatGPT developer-app submit selection | 0323-2026-08-30

State: OPEN
Lane: P16
Operational state: SOURCE_INTEGRATED_INSTALLED_VALIDATION_PENDING
Branch: fix/plan0323-developer-app-mention
Target: main
Integration: merge
Revision: 6 | 2026-09-09

## Current State

- The operator authorized the recommended P16 reconciliation on 2026-09-09.
  Published `main` at `d22c7e46f` already contains a newer shared-helper
  implementation of exact ecosystem-mention selection at `a5f777895`; P16 has
  eight branch-only commits and a dry merge reports nine content conflicts.
- Current main is merged into the P16 branch with current main's shared
  mention, Skill, composer, and prompt-lifecycle behavior authoritative. The
  reconciled delta retains the bounded two-pass cleanup needed when deleting an
  app pill unwraps it into literal text, removes inherited `composerTool`
  routing, and binds the submitted request to the current Chat model.
- The broader architecture gate rejected P16's provider-adapter-local
  response/approval watcher. `llmServicePromptStructure.test.ts` requires the
  common response lifecycle to remain outside provider `runPrompt`; the
  response CLI flags, adapter watcher, and associated tests are therefore not
  part of the reconciled source. This is an explicit disposition, not accepted
  response-capture evidence.
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
  `prompt_submitted` boundary releases AuraCall before its ordinary response
  watcher can service third-party tool approvals. P16's attempted inline fix
  duplicated that lifecycle inside the provider adapter and is incompatible
  with the current architectural guard. Response capture remains unaccepted
  until it is routed through the shared high-level lifecycle in a separately
  reviewed slice.
- A later zero-turn launch exposed a second propagation gap: the derived test
  browser carried `modelStrategy: current`, but the lower prompt input omitted
  it and therefore retried the stale configured `gpt-5.2-pro` selector.
  Developer-app submissions now bind `modelStrategy: current` on the prompt
  request itself. The same `52/52` focused packet, typecheck, production build,
  and scoped Biome pass.
- The reconciled focused packet passes 82 tests plus typecheck, including the
  prompt-structure guard. The broader packet passes 214 tests, production
  build, scoped lint with two informational pre-existing findings, typecheck,
  and the zero-error plan audit. Source integrated non-forced at `9cdb92d205`;
  installed-runtime refresh and any separately governed live acceptance are
  recorded during closeout.

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
4. Keep `prompt_submitted` as the developer-app helper boundary. Any future
   terminal-response mode must reuse the shared high-level response and
   approval lifecycle rather than adding it to the provider adapter.
5. Install the exact candidate. Use separately governed LitScout Experiment
   18 as the one terminal-response live validation. Do not consume an extra
   research Send merely to duplicate the submit proof.

## Acceptance Criteria

- `DAS-R1`: provider-free RED/GREEN proves submit uses an exact verified
  ecosystem mention and leaves `browser.composerTool` unset.
- `DAS-R2`: prompt replacement retains the connected-app pill and focused
  developer-app/composer/ChatGPT prompt contracts pass, including the atomic
  pill-to-literal cleanup transition.
- `DAS-R3`: typecheck, build, and source/installed parity pass.
- `DAS-R4`: NOT ACCEPTED. The attempted provider-local terminal mode failed the
  current prompt-structure gate and was removed during reconciliation. A
  successor must route through the shared high-level response lifecycle.
- `DAS-R5`: one authorized live Experiment 18 Send proves exact app selection,
  continued tool approvals, and terminal response capture on the expected
  account; its LitScout effects are governed and audited by Plan 0477.

## Bounds

- One source implementation plus evidence-driven composer and terminal-watcher
  repairs.
- This reconciliation slice permits provider-free source integration and one
  supported installed-runtime refresh after published-main acceptance. It does
  not authorize the Plan-0477-governed experiment Send or any other prompt.
- No app recreation, OAuth reconnect, scheduler mutation, unrelated browser
  cleanup, or extra canary Send.

## Definition Of Done

`DAS-R1` through `DAS-R3` must have current source and installed evidence.
`DAS-R4` and `DAS-R5` remain explicit open acceptance work; neither may be
claimed from this provider-free reconciliation.
