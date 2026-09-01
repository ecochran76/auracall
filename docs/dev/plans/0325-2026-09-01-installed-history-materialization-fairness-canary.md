# Installed History Materialization Fairness Canary | 0325-2026-09-01

State: OPEN
Lane: P18
Operational state: BLOCKED_ON_HUMAN_VERIFICATION_CLEARANCE
Branch: main
Target: main
Integration: direct
Revision: 1 | 2026-09-01

## Stable Objective

Adopt integrated Plan 0324 into the installed user runtime and prove one
bounded zero-retry `wsl-chrome-3` live-follow pass advances materialization
work without resuming continuous live follow.

## Current State

- Plan 0324 is integrated on `main` at merge receipt `87fec070` and its full
  provider-free integration gate passes.
- Installed AuraCall remains source-divergent from Plan 0324. API service PID
  `98408` is active with zero restarts.
- ChatGPT AuraCall runtime profiles `default` and `wsl-chrome-3` remain
  operator-paused with zero active history-materialization jobs and clear
  target provider guards.
- The distinct Gemini AuraCall runtime profile `auracall-gemini-pro` has a
  persisted `manual_clear_required` / `google-sorry` provider guard. This is a
  hard stop for install, restart, and automated browser work until a human
  clears the page.

## Execution Graph

1. A human clears the exact `auracall-gemini-pro` Google unusual-traffic page.
2. Re-read all provider guards, active completions/jobs, exact managed-browser
   processes, API ownership, and scheduler/background-drain posture.
3. From a clean gate, run one supported user-runtime install and API-service
   restart, then prove installed source checksums match `main` and the service
   is healthy without a restart loop.
4. Run one `run_one_pass` action for the existing `wsl-chrome-3` completion,
   with no retry. Verify terminal job receipts use concrete transfer budget,
   rotate beyond prior retryable fronts, and leave continuous live follow
   paused.
5. Re-read exact process ownership, completion status, asset/backlog metrics,
   and service restart count; record the durable acceptance receipt.

## Acceptance Criteria

- `IHMF-R1`: installed history-materialization and completion-service source is
  byte-identical to the integrated `main` build.
- `IHMF-R2`: exactly one supported install/restart occurs from clean ownership,
  and the API returns healthy with no restart loop.
- `IHMF-R3`: one and only one `wsl-chrome-3` bounded pass runs without retry;
  its durable job evidence shows fair candidate advancement and concrete-only
  transfer-budget accounting.
- `IHMF-R4`: `default` and `wsl-chrome-3` continuous live follow remain paused,
  no human-verification surface is automated, and exact owned browser cleanup
  is proven after the canary.

## Bounds

- Do not clear or bypass a provider guard automatically.
- Do not resume continuous live follow for either exact ChatGPT target.
- At most one supported runtime install/service restart and one
  `wsl-chrome-3` run-one-pass action; zero automatic retries.
- Stop on any active pass/job, unknown ownership, exact managed-browser
  presence before adoption, CAPTCHA/human verification, identity mismatch,
  provider guard, or service restart loop.
- Do not delete or rewrite archive, catalog, job, or account-mirror evidence.

## Definition Of Done

All four criteria have current installed and durable runtime evidence, the
bounded canary is terminal, continuous live follow remains paused, and the
installed source and service identities are recorded.

## Exact Unblocker

A human must clear the existing Google unusual-traffic page for
`auracall-gemini-pro`; afterward, re-run the full pre-effect gate before any
install, restart, or browser action.
