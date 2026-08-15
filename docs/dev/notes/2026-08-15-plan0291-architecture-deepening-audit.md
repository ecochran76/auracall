# Plan 0291 Architecture Deepening Audit Notes

Date: 2026-08-15
Audit: sole `drift_discovery` pass
Blocking threshold: unresolved High
Outcome: zero High findings; no code repair cycle

## Retained Medium | C4 provider-main dynamic coverage

- Criterion: preserve exact command, state, evidence, provider phase,
  assertion, retry, and cleanup behavior through the shared acceptance harness.
- Evidence: the six harness tests dynamically cover command construction,
  deadlines, output/exit projection, JSON, version-1 state, and finalization;
  the structural test proves provider locality. They do not dynamically execute
  ChatGPT/Grok PASS, FAIL, cleanup, or ChatGPT CLI-over-resume orchestration.
- Consequence: future drift in `mergeArgsWithAcceptanceState`,
  `bestEffortCleanup`, provider summary presentation, or checkpoint timing
  could escape this focused packet.
- Reproducer: `pnpm vitest run tests/scripts.browserAcceptanceHarness.test.ts
  tests/scripts.browserAcceptanceStructure.test.ts` passes all seven tests
  without entering provider-main orchestration.
- Disposition: nonblocking backlog. Prefer an injected provider-main seam in a
  later test-only slice; do not invoke a live acceptance run to close this gap.

## Retained Low | Formatter/import-order scope

- `pnpm exec biome lint` over all five C4 files is clean. The broader
  `pnpm exec biome check` reports fixable whole-file formatting/import-order
  drift because the two long-standing acceptance scripts use a style that
  differs from the current formatter defaults.
- Disposition: nonblocking hygiene backlog. Avoid a noisy whole-file rewrite in
  this architecture slice.

## Reconciled Low | Historical evidence counters

- The audit found Plan 0291's 902-file CodeGraph snapshot and an unqualified
  16-caller C1 count stale against the integrated tree.
- Closeout docs now report 905 indexed files and 15 current production callers,
  while preserving that C1 had 16 callers at its own checkpoint before C3
  removed a superseded caller.
