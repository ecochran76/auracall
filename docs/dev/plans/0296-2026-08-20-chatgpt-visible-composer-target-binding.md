# ChatGPT Visible Composer Target Binding | 0296-2026-08-20

State: OPEN
Lane: P01
Operational state: SOURCE ACCEPTED / INSTALL PENDING

## Stable Objective

Bind ChatGPT prompt focus, insertion fallback, and pre-Send verification to one
visible, enabled, composer-owned input so a broad hidden or unrelated textarea
cannot absorb the prompt while AuraCall verifies a different node.

## Current State

- Installed Plan 0295 cleared the local-upload surface defect in LitScout's
  unchanged Experiment 9 successor.
- The sole successor invocation uploaded through the repaired path, then
  stopped before Send with `prompt-not-in-composer`; its model log is empty and
  the governed LitScout state and spend are unchanged.
- `submitPrompt(...)` focuses the first `querySelector(...)` match from a list
  where broad textarea fallbacks precede exact current composer nodes, but its
  fallback and verification read only `#prompt-textarea` or
  `textarea[name="prompt-textarea"]`. Focus and verification therefore do not
  share target identity.
- The expression contract and a behavior-level `submitPrompt(...)` regression
  now prove that the exact marked target can be the sole prompt-bearing node
  through pre-Send verification and successful commit detection.

## Selected Design

- Prefer current exact composer selectors before broad textarea fallbacks in
  both the provider defaults and bundled service manifest.
- Enumerate every selector match and accept only a visible, enabled input owned
  by a composer surface.
- Mark the exact focused node for this submission and use that same node for
  insertion fallback and pre-Send verification, while retaining the existing
  primary/fallback reads for compatibility.
- Keep all existing prompt-presence, truncation, attachment, send, and commit
  checks fail-closed.

## TDD And Validation

1. Add an exported expression-contract regression and prove it RED because the
   visible composer-target seam does not exist.
2. Implement the narrow target-binding repair and prove the focused regression
   GREEN.
3. Run affected prompt/provider/browser suites, typecheck, build, scoped lint,
   full provider-free tests, planning audits, and diff hygiene under an
   isolated AuraCall home.
4. Commit and push accepted source before one user-runtime convergence.
5. Return exact installed parity to LitScout; any next Experiment 9 invocation
   remains governed by a separate successor packet.

## Source Acceptance

- Focused prompt/provider regressions pass `11/11`; the wider related gate
  passes after adding the behavior regression, and typecheck and build pass.
- The full functional suite passed `323` files and `2,931` tests with `65`
  opt-in/live tests skipped before the final test-only regression was added.
- Scoped Biome reports only the pre-existing `__test__` naming warning; the
  plan-library audit reports zero validation errors and diff hygiene passes.
- During the full suite, one test path escaped the disposable home and opened
  canonical-profile Chrome PID `50790`. That exact test-owned process was
  terminated without touching the separate scheduler-owned browser. This is
  retained as a test-isolation gap; it did not issue an AuraCall prompt or
  change the repair's provider-free source assertions.

## Non-Goals

- No raw CDP inspection, manual Chrome, prompt edits, attachment weakening,
  automatic Send retry, model/tool/approval change, or LitScout action from
  this plan.
- No reliance on a hidden textarea, generic document-wide contenteditable, or
  post-Send inference as a substitute for pre-Send prompt verification.

## Acceptance Criteria

- [x] The focused expression contract is RED before implementation and GREEN
  after it.
- [x] Exact composer selectors precede broad fallbacks in source and manifest.
- [x] Focus rejects hidden, disabled, and non-composer candidates.
- [x] Fallback and verification use the exact focused target.
- [x] Affected and full functional validation pass; the unrelated full-suite
  canonical-home isolation escape is retained above.
- [ ] Pushed source and installed runtime are byte-exact for touched runtime
  modules.

## Definition Of Done

AuraCall cannot report prompt absence merely because it inserted into a
different selector candidate than it verified, the repair is provider-free
accepted and installed, and LitScout receives a clean exact-runtime boundary
for its separately governed same-Experiment-9 successor.
