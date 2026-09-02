# Installed Long-Observation Recovery Canary | 0328-2026-09-02

State: OPEN
Lane: P21
Operational state: INSTALLED_PARITY_ACCEPTED_LIVE_CANARY_READY
Branch: ops/plan0328-installed-timeout-canary
Target: main
Integration: merge
Revision: 1 | 2026-09-02

## Stable Objective

Prove the installed Plan 0326 timeout and instrumentation repair on the exact
`wsl-chrome-3` ChatGPT account with one bounded long response whose AuraCall
observation lease expires while generation remains active, followed by
read-only recovery of the same turn without another Send.

## Current State

- Plan 0326 is merged into `main` and its focused provider-free packet passes
  27 tests plus typecheck in the current checkout.
- One authorized `pnpm run install:user-runtime` completed without restarting
  the API. Installed `observationLease.js`, `sessionRunner.js`, and
  `browser/index.js` are byte-identical to the current build and contain
  `observation_expired_generation_active`.
- API PID `98408` remains active with zero restarts. The operator-transferred
  exact managed Chrome remains PID `1933` on DevTools port `45015`.
- No live prompt has run in this lane.

## Execution Graph

1. Run one read-only exact-account identity smoke on AuraCall runtime profile
   and browser profile `wsl-chrome-3`.
2. Submit one deterministic long-output Chat prompt with a bounded observer
   timeout and zero retries.
3. Require the persisted Session/model state to remain running with
   `observation_expired_generation_active`, exact browser target and
   conversation identity, and bounded progress instrumentation.
4. Reattach read-only to that exact Session and recover the same turn without
   invoking the prompt runner or causing another Send.
5. Preserve the pre-existing Chrome process, release the foreground operation,
   and record installed/live evidence before integrating the receipt.

## Acceptance Criteria

- `ILC-R1`: installed source parity is exact for the affected modules and the
  API is not restarted.
- `ILC-R2`: exactly one prompt is submitted on the expected ChatGPT account;
  no retry, scheduler, completion, materialization, or skill action occurs.
- `ILC-R3`: observer expiry during positive active generation persists
  `observation_expired_generation_active` with exact turn/browser evidence.
- `ILC-R4`: read-only Session recovery returns the same submitted turn without
  another Send.
- `ILC-R5`: the exact pre-existing PID/port remain healthy and no operation
  lock or false shutdown ownership remains after recovery.

## Bounds

- One identity smoke, one prompt, zero prompt retries, and one read-only
  Session recovery attempt.
- Normal Chat mode with current-model selection. Never click `Answer now`.
- CAPTCHA, verification, identity mismatch, ambiguous target, or missing
  positive active-generation evidence is a hard stop.
- No API restart, scheduler/completion/materialization control, skill lifecycle
  action, or unrelated browser cleanup.

## Definition Of Done

All five criteria have current installed/live evidence, the receipt is durable,
and the result is integrated before Skill CRUD implementation begins.
