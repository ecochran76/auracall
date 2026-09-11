# Final Live Acceptance | 0350-2026-09-11

State: OPEN
Lane: P43
Operational state: PREFLIGHT
Branch: ops/plan0350-final-live-acceptance
Target: main
Integration: merge
Revision: 1 | 2026-09-11

## Stable Objective

Adopt P42's already source-identical installed runtime, capture one complete
unpiped identity receipt, then spend the untouched one-prompt and one-artifact-
fetch budgets to close compact `6Pro` and genuine-PDF live acceptance.

## Current State

- Published main is `d9df098fe`. P42 installed the same source code at exact
  523-file normalized hash `569ad132...`; its only failure was truncating piped
  identity JSON. It issued zero prompts, Sends, fetches, or retries.
- Runtime custody is six paused completions, zero queued/running/idle-waiting,
  service PID `51128` with zero restarts, and Chrome PID `71128` on `45015`.
- This lane performs no install. It must re-prove current installed parity and
  runtime custody, then capture identity output directly without a pipe.

## Acceptance Criteria

- `FLA-R1`: current main build and installed runtime retain exact 523-file hash
  parity; service/browser/completion custody is stable.
- `FLA-R2`: one unpiped identity smoke exits 0, matches account/browser
  ownership, and launches no browser.
- `FLA-R3`: one explicit premium prompt selects compact `6Pro`, records its raw
  observed label, Sends at most once, and returns exactly
  `AURACALL_P43_6PRO_OK_20260911` with no retry/fallback.
- `FLA-R4`: one read-only recovered-conversation fetch materializes Markdown,
  DOCX, and a genuine distinct PDF with correct extension, MIME, and signature.
- `FLA-R5`: redacted receipt and canonical planning/Git state integrate the
  result; successful live acceptance closes the end-to-end goal.

## Bounds And Hard Stops

- No install. Exactly one identity smoke, one prompt attempt with at most one
  Send, and one artifact fetch after prompt success. No retries or fallback.
- Never click `Answer now`; stop on CAPTCHA, identity/ownership ambiguity,
  active completion, or post-effect uncertainty.
- Recovered conversation is read-only. No mutation, regeneration, retry,
  deletion, broad status, scheduler/completion/materialization control, Skill,
  developer-app response, or unrelated inspection.

## Definition Of Done

FLA-R1 through FLA-R5 are accepted, integrated, and the goal closes, or exact
terminal evidence continues under a bounded successor.
