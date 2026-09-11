# ChatGPT Live Findings Provider-Free Repair | 0342-2026-09-11

State: CLOSED
Lane: P35
Operational state: PROVIDER_FREE_ACCEPTED_INTEGRATED
Branch: fix/plan0342-chatgpt-live-findings
Target: main
Integration: merge
Revision: 4 | 2026-09-11

## Stable Objective

Repair the four Plan 0341 failures owned by the foreground ChatGPT CLI/browser
path—identity-smoke process exit, current `6 Pro` selector triggering,
provider-observed model persistence, and complete per-artifact async
settlement—using provider-free fixtures and executable contract tests.

## Current State

- Published `main` is clean and local/remote equal at
  `25c1bf5ac8882a3126eda88437ba85c1598d237c`.
- P34 proved source/install parity and one successful current-model attachment
  turn, but full acceptance was withheld. Its receipt is
  `docs/dev/notes/2026-09-11-plan0341-installed-live-verification.json`.
- `profile identity-smoke --json` produced a complete exact-identity report but
  retained automation handles and did not return control to the shell.
- The live model menu visibly contained exact `6 Pro`, while the generic model
  selection expression failed before upload or Send against its current
  slider/menu trigger shape.
- The successful installed prompt result carried `observedModel` through the
  browser return type, but the ordinary CLI Session omitted it from persisted
  metadata.
- The single artifact-fetch command exited normally and preserved existing
  files, but two sequential exports ended with CDP `Promise was collected`.
- P08 owns aggregate `/status` memory/latency. This plan must not change that
  endpoint, scheduler/completion state, or service runtime.
- Graphiti is healthy but returned no relevant AuraCall memory cloud. The
  current repository, P34 receipt, source, and tests are authoritative.
  CodeGraph is unavailable in this session, so exact native source reads are
  the documented fallback.

## Execution Graph

Owner: primary agent. No delegated workers; the four source tracks are
independently testable but converge through the shared CLI/browser gate.

1. Publish this plan and P35 lane from exact current main.
2. Add RED provider-free executable tests for each exact P34 failure.
3. Bound identity-smoke browser-probe cleanup and command exit without forcing
   persistent managed Chrome to close.
4. Admit the current ChatGPT animated slider/menu trigger only through narrow
   exact role/label/visibility semantics and retain existing selectors.
5. Carry `observedModel` from browser execution into ordinary CLI Session
   metadata and prove null/absent behavior for non-browser paths.
6. Settle every artifact export before reusing or closing its scoped provider
   session; surface real per-entry errors without retrying committed provider
   effects or weakening existing-file preservation.
7. Run focused/adjacent tests, typecheck, scoped lint, production build,
   architecture checks, planning/lane audits, and diff hygiene; integrate only
   if every provider-free criterion passes.

## Acceptance Criteria

- `PFR-R1`: executable identity-smoke fixture prints its complete JSON result,
  releases the browser-operation/client handles, exits normally inside a
  bounded caller window, and leaves a persistent managed Chrome owner alive.
- `PFR-R2`: the production selector expression discovers and activates the
  current visible `6 Pro` slider/menu trigger with exact selection readback,
  while hidden, ambiguous, Work-only, thinking-time, and unrelated menu
  surfaces remain rejected.
- `PFR-R3`: an ordinary browser CLI run persists requested/desired and
  provider-observed model identities separately in Session metadata; null or
  unavailable observations are not invented.
- `PFR-R4`: a three-artifact fixture settles Markdown, DOCX, and PDF transfers
  independently without `Promise was collected`, closes/rebinds scoped browser
  resources only after each awaited transfer, retains successful files, and
  reports genuine per-artifact failures without an unsafe retry.
- `PFR-R5`: no provider, browser, install, service, scheduler, completion,
  materialization-control, or recovered-conversation effect occurs.
- `PFR-R6`: current docs, focused tests, typecheck, build, scoped lint,
  architecture checks, planning/goal/lane audits, Git parity, and integration
  receipts agree with the implementation and preserve inherited findings.

## Bounds And Non-Goals

- Provider-free source, tests, fixtures, and docs only. Do not invoke the
  installed launcher against a provider, attach to or navigate a browser,
  install/restart a runtime service, or fetch any real conversation artifact.
- Never prompt, retry, recreate, rename, delete, or otherwise mutate recovered
  conversation `6aa368bc-43c4-83ea-8d98-964264dd4340`.
- Do not change `/status`, P08, P16, P18, P29, scheduler/completion controls,
  provider pacing, or general retry ceilings.
- Keep Chat/Work/thinking selector separation intact. Never add broad text-only
  matching and never add automation for ChatGPT's `Answer now` control.
- At most two implementation attempts and one closed-world remediation pass.

## Definition Of Done

All four P34-owned failures have provider-free RED/GREEN execution evidence,
the affected broader suite and static gates pass, P35 is integrated through the
documented merge path, and installed/live adoption remains explicitly separate.

## Revision 2 Validation Checkpoint

- Provider-free implementation checkpoint:
  `f3a0915b8bf1b6cfe9ec5e1de9119abc514a038a`, published with exact
  local/remote topic parity.
- `PFR-R1` passes through a real child-process fixture that retains an interval,
  prints completion, and exits normally within two seconds.
- `PFR-R2` passes through the exact injected browser expression: it discovers
  the bundled animated trigger, clicks visible composer-scoped `6 Pro`, reads
  the checked `6 Pro` menu row, and retains Power/High/generic-Pro negatives.
- `PFR-R3` passes at both browser-session return and ordinary CLI Session-store
  boundaries. Existing null behavior remains unchanged.
- `PFR-R4` passes with three distinct Markdown, DOCX, and PDF candidates whose
  scoped sessions are absent before each transfer and closed in transfer order.
- Affected validation passes 374 tests with one existing skip; typecheck,
  production build, scoped Biome lint, architecture structure test, diff check,
  goal-only audit, and plan-library audit pass.
- The exact-branch lane audit retains only inherited P08/P16 findings and the
  expected P35 pre-integration catalog absence. No provider/runtime effect ran.

## Revision 3 Integration Receipt

- Merged the exact published topic non-fast-forward into `main` at
  `d80613c4fb40d33a6126baa41a504d3e6700c61a`.
- The merged result again passes 374 affected tests with one existing skip,
  typecheck, production build, scoped lint, and the prompt-lifecycle
  architecture guard.
- All provider-free criteria are accepted and P35 is closed. Installed-runtime
  refresh and live adoption remain separate work requiring separate authority.

## Revision 4 Custody Closeout

- The published topic tip `44ea3e793882dbe4aba07f554ae53c68ee9ef1c1`
  is ancestral to published `main`, clean, equal to its remote, and owned by no
  process working directory.
- Removed the local P35 worktree and local branch without force. Generated
  ignored `dist/` and `node_modules/` copies were removed with the worktree;
  remote recovery ref `origin/fix/plan0342-chatgpt-live-findings` remains.
