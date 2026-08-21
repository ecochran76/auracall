# ChatGPT Local Upload Surface Independence | 0295-2026-08-20

State: CLOSED
Lane: P01

## Stable Objective

Allow AuraCall to upload local files through ChatGPT's exact native
`Add photos & files` surface when the unrelated provider-library row is absent,
while retaining fail-closed checks for the local action and unrestricted
`#upload-files` input.

## Current State

- LitScout Experiment 9's sole post-recovery AuraCall invocation reached the
  authenticated ChatGPT Project workbench and stopped before any file transfer
  or Send action with `library-action-not-found`.
- The resolver currently couples local-upload readiness to both the local file
  action and the independent `Add from library` action, although local upload
  consumes only the former plus `#upload-files`.
- No new conversation, provider request, LitScout action, spend, response,
  output artifact, or grade occurred. A fresh experiment attempt remains owned
  by LitScout's separate successor gate after this repair is installed.

## Selected Design

- Keep the existing workbench-surface resolver as the single seam for local
  attachment readiness.
- Require exactly one `Add photos & files` / `Upload from computer` row and one
  unrestricted, multiple `#upload-files` input.
- Record the exact `Add from library` row when present, but make it optional
  metadata because that provider drawer is not used by local upload.
- Preserve fail-closed results for missing/ambiguous/restricted local inputs and
  missing local-file actions.

## TDD And Validation

1. Change one public resolver regression to express that a valid local-upload
   surface remains ready without the provider-library row; confirm RED.
2. Make only the library-row dependency optional; confirm GREEN.
3. Run the focused attachment packet, affected browser tests, typecheck, build,
   scoped lint, plan audit, full provider-free suite, and diff hygiene.
4. Commit and push the source candidate before one install and one API restart.
5. Prove installed/source parity and return control to LitScout for one freshly
   authorized Experiment 9 attempt.

## Non-Goals

- No weakening of the local action or unrestricted input contract.
- No selector broadening, generic file-input fallback, raw CDP, manual Chrome,
  provider-library automation, prompt change, tool-approval change, or grading
  change.
- No Experiment 9 submission from this AuraCall plan.

## Acceptance Criteria

- [x] Exact regression is RED before the repair and GREEN after it.
- [x] Local upload remains fail-closed when its own row or input contract drifts.
- [x] Affected and full provider-free validation pass.
- [x] Source candidate is committed and pushed before installation.
- [x] Installed runtime matches accepted source and passes a provider-free
  local-surface probe.

## Validation Evidence

- The exact public resolver regression first received
  `{ status: 'library-action-not-found' }` instead of the expected ready result
  when the exact local row and unrestricted input were present without the
  provider-library row. It passes after the repair with `libraryLabel: null`.
- The affected attachment packet passes 4 files and 55 tests with one unrelated
  test skipped. The full provider-free suite passes 323 files and 2,929 tests,
  with 21 files and 65 opt-in/live tests skipped by design.
- Typecheck, production build, scoped zero-warning lint, plan audit across 295
  plans, diff hygiene, and disposable-browser isolation pass.
- README already describes the correct interface: the exact local row and
  unrestricted input are required, while `Add from library` is separate.
- Source candidate `22adc893` is committed on
  `fix/plan0295-chatgpt-local-upload-surface`, pushed, and upstream-exact before
  any installation or provider action.
- Main and the feature branch are pushed at `ec1859ee`; one user-runtime
  install and API restart produced healthy PID `84336`. Source and installed
  resolver JavaScript share SHA-256
  `5a9a6741c45b97086a12e0627804b759355e5ae2e953caa73c5b237eb4b19354`,
  and the installed probe accepts the local surface without a library row
  while retaining restricted-input and missing-local-action failures.

## Installed Runtime Activation

- Activation is frozen against pushed source candidate `22adc893`. Exactly one
  user-runtime install and one API restart are now authorized. They authorize
  no browser navigation, provider request, or Experiment 9 retry.
- Installed acceptance requires source/installed JavaScript hash parity, a
  provider-free resolver probe, healthy service readback, and no foreign
  browser owner. Pre-install AuraCall control-plane readback reports the prior
  `wsl-chrome-3` browser absent and its latest completion terminal with provider
  work released; the fresh LitScout gate must recover that exact managed
  browser profile through AuraCall before retry.

## Definition Of Done

AuraCall no longer rejects a valid local-upload surface solely because the
separate provider-library row is absent, all local-upload safeguards remain
enforced, and the accepted repair is installed for LitScout's fresh governed
Experiment 9 attempt.
