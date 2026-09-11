# ChatGPT Deep Research Reliability | 0340-2026-09-11

State: OPEN
Lane: P33
Operational state: INTEGRATION_READY
Branch: fix/plan0340-chatgpt-deep-research-reliability
Target: main
Integration: merge
Revision: 1 | 2026-09-11

## Stable Objective

Make current ChatGPT Deep Research submissions truthful and retry-safe across
model/depth resolution, attachment-bearing prompt commitment, post-effect
provider failures, and artifact-fetch command cleanup without replaying the
recovered provider job.

## Current State

- The September 10 provider run created conversation
  `6aa368bc-43c4-83ea-8d98-964264dd4340`, completed one 32,081-character Deep
  Research report, and materialized Markdown, DOCX, and PDF. That conversation
  and those recovered artifacts are authoritative; the prompt must not be
  retried or recreated.
- Current `main` already contains the durable `chatgpt:premium` GPT-6 selector
  foundation from Plan 0332 and installed survey evidence from Plan 0333. The
  later provider surface relabelled the active control to `6 Pro`, while the
  incident metadata still recorded the requested `GPT-5.6 Sol`; observed and
  requested model provenance remain conflated.
- Profile-derived `thinkingTime` cannot be explicitly omitted for one run. The
  inherited Sol depth therefore attempted a removed or changed Thinking-time
  dropdown and failed before submission until the run used current-model
  strategy without explicit depth.
- The prompt verifier saw a unique post-baseline user turn, intact prompt body,
  assistant/tool activity, and a cleared composer, but rejected exact equality
  because provider-owned attachment/tool chrome surrounded the rendered prompt.
- A later `Too many requests` surface terminalized the local Session and wrote
  cooldown state after the provider effect was already observed, making naive
  retry guidance unsafe.
- `conversations artifacts fetch` completed all materialization output but kept
  a transient CLI/browser client resource alive until `SIGINT`; the separately
  owned persistent browser remained healthy.
- This branch starts from current published `main` at `96d29b01c`. The
  catalog-only audit has inherited findings for P08 missing its claimed
  worktree and P16 using the non-schema `INTEGRATED_NO_WORKTREE` custody value;
  this lane does not rewrite unrelated custody.
- Planning checkpoint `7bb342219` is published on the exact P33 remote branch.
- Provider-free implementation checkpoint `5f8ed9ffd` is published on that
  branch with local/remote parity.
- P16/P18 overlap is reconciled without consuming either lane's remaining
  authority. P16's shared high-level response lifecycle remains authoritative
  and its rejected provider-local watcher stays removed. P18 remains paused;
  P33 performs no install, restart, browser, provider, or canary action, and
  P18 must re-anchor to then-current `main` before any future resumption.
- The provider-free implementation satisfies DRR-R1 through DRR-R5. The
  affected suite passes 245 tests with one existing skip; typecheck and the
  production build pass against the frozen lockfile dependency graph. Scoped
  lint reports no errors and only three inherited findings in the pre-existing
  prompt/session files. Goal governance passes; the active planning audit still
  reports P16's two inherited missing roadmap/runbook links, while lane audit
  retains P08/P16 custody findings and the expected pre-integration P33 catalog
  absence.

## Execution Graph

Owner: primary agent. The critical path is serialized; independent
provider-free test files may run together after each vertical repair.

1. Publish this plan and P33 lane registration from current `origin/main`.
2. Freeze current label/provenance and explicit depth-omission behavior at the
   CLI/config/request/session seams, then implement the smallest compatible
   repair on top of the durable selector schema.
3. Freeze the exact attachment-rendered prompt-commit incident at the production
   verifier seam. Accept only one unique post-baseline turn whose normalized
   authored prompt is intact and whose extra text is classified provider chrome;
   preserve exact ordinary-turn and duplicate-submit fences.
4. Carry prompt-commit effect evidence through the browser/session failure path.
   Classify failures as `pre_effect`, `effect_observed`, or `unknown`; reconcile
   observed effects before cooldown/retry guidance so later rate limiting cannot
   erase a known submission.
5. Freeze the artifact-fetch successful-output hang at the command lifecycle
   seam, release transient client resources, and preserve `keepBrowser`
   ownership for the persistent managed browser.
6. Update user/operator docs and durable lessons, run focused/affected
   provider-free tests, typecheck, production build, scoped lint, planning and
   lane audits, and diff hygiene. Run no live/provider canary in this plan.

## Acceptance Criteria

- `DRR-R1`: the durable premium selector recognizes the current `6 Pro` picker
  label, and Session/result metadata records requested selection separately from
  provider-observed current-model evidence.
- `DRR-R2`: one public CLI invocation can explicitly omit every inherited
  ChatGPT thinking-depth value without changing the saved AuraCall runtime or
  browser profile; ordinary inheritance and explicit depth selection remain
  unchanged.
- `DRR-R3`: an attachment-bearing unique post-baseline user turn with an intact
  normalized prompt body and only recognized provider chrome commits exactly
  once; ambiguous, duplicate, altered-body, pre-baseline, and ordinary
  non-exact cases remain fail-closed.
- `DRR-R4`: submission failures expose `pre_effect`, `effect_observed`, or
  `unknown` from current evidence. An observed conversation/new user turn,
  assistant turn, or tool activity suppresses retry-safe guidance and cannot be
  overwritten by a later rate-limit dialog or cooldown write.
- `DRR-R5`: successful `conversations artifacts fetch` settles and exits after
  materialization while preserving a separately owned persistent browser under
  `keepBrowser`; cleanup also remains bounded on failure.
- `DRR-R6`: focused and affected provider-free tests, typecheck, build, scoped
  lint, plan/goal/lane audits, and diff hygiene pass with exact inherited audit
  findings recorded rather than hidden.

## Bounds

- Provider-free source, tests, and documentation only. No prompt, upload,
  model/depth selection, browser launch/navigation, provider call, runtime
  install, service restart, scheduler/completion control, or live canary.
- Never retry, recreate, or otherwise mutate recovered conversation
  `6aa368bc-43c4-83ea-8d98-964264dd4340`.
- Preserve the `Answer now` prohibition, exact account/runtime/browser-profile
  authority, new-turn boundary, one-Send fence, and existing current-model
  behavior.
- Keep provider-specific rendered-turn heuristics in the ChatGPT adapter or
  prompt-commit seam; do not generalize attachment chrome to other providers
  without evidence.
- Do not absorb P08, P16, P18, or P29 work. Reconcile overlap with P16 before
  integration and leave unrelated catalog findings visible.
- One implementation pass plus one evidence-driven correction pass before
  local replanning.

## Definition Of Done

All six criteria have current provider-free evidence on this branch; docs and
lane state match the implemented behavior; the branch is published with a
recoverable checkpoint; no provider or installed-runtime effect occurred; and
any install/live canary remains a separately authorized successor.

## Provider-Free Acceptance

- DRR-R1: accepted through selector, picker-return, runtime/session type, and
  configured-executor metadata coverage.
- DRR-R2: accepted through inherited-depth omission and conflicting-flag tests
  plus user/operator documentation.
- DRR-R3: accepted through attachment-aware commit and unrecognized-extra-text
  fail-closed regressions.
- DRR-R4: accepted through effect propagation, cooldown suppression, and
  no-retry tests.
- DRR-R5: accepted through the existing scoped-session cleanup plus the CLI
  post-output force-exit lifecycle regression.
- DRR-R6: affected tests, frozen-lockfile typecheck, production build, scoped
  lint, goal audit, diff hygiene, and exact inherited audit findings recorded.
