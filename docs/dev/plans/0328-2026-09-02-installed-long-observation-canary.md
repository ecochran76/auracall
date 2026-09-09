# Installed Long-Observation Recovery Canary | 0328-2026-09-02

State: CLOSED
Lane: P21
Operational state: INSTALLED_LIVE_ACCEPTED
Branch: ops/plan0328-installed-timeout-canary
Target: main
Integration: merge
Revision: 3 | 2026-09-02

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
- The first and only originally authorized prompt ran once after an exact
  identity smoke. At the 45-second observation deadline ChatGPT exposed a
  visible `Stop answering` control but had not mounted an assistant turn or
  readable text. AuraCall persisted terminal error even though read-only DOM
  inspection later recovered all 1,500 requested lines and the sentinel from
  the same completed turn without resend.
- That receipt proves the merged classifier was too narrow before the first
  assistant node. A TDD repair now accepts only the positive combination of
  `no-assistant-turn`, zero assistant text, visible Stop, no completion, and no
  dialog. Tool-approval and other zero-text states remain terminal.
- The focused CLI/browser packet passes 55 tests plus typecheck, production
  build, scoped zero-warning lint, diff hygiene, and a zero-error plan audit.
  The full suite passes 3,041 tests in 324 files; its sole failure is the known
  stale raw-DevTools allowlist entry for an existing non-mutating approval
  observation script. A second, distinct zero-retry canary is permitted only
  after committing, installing, and proving byte parity for this repair.
- The second distinct prompt allowance is now exhausted. Its 30-second expiry
  correctly persisted the Session/model run as running with the recovery
  reason and the same target ID. The first read-only reattach selected that
  target and observed active generation, but its later timeout fallback used a
  stale synthetic `WEB:...` runtime route instead of the real progress `/c/`
  URL and navigated away. The attach process was stopped without Send, Stop,
  retry, or any other provider mutation.
- Two further red/green contracts now reconcile only the URL and conversation
  fields from a validated same-provider progress `/c/<id>` URL while preserving
  the exact target/port. They cover future timeout persistence and recovery of
  already-stranded Sessions. One remedial read-only reattach to the existing
  second conversation is pending after commit, install, and parity proof; no
  further prompt is allowed.
- The revision 3 affected packet passes 88 tests plus typecheck, production
  build, scoped zero-warning lint, diff hygiene, and the zero-error plan audit.
  The earlier full-suite evidence remains 3,041 passed with only its documented
  unrelated allowlist mismatch.
- Checkpoint `ac851379` is published and its three affected installed modules
  are byte-identical. The API remained PID `98408` with zero restarts and the
  transferred Chrome remained PID `1933` on port `45015`.
- The remedial read-only attach reconciled the real progress conversation,
  recovered exactly 1,800 numbered lines plus the terminal sentinel, and
  marked the same Session completed with 18,634 output tokens. No Send, Stop,
  retry, scheduler, completion, materialization, or skill action occurred.
  The operation-lock root is empty and the pre-existing Chrome remains healthy.

## Execution Graph

1. Run one read-only exact-account identity smoke on AuraCall runtime profile
   and browser profile `wsl-chrome-3`.
2. Record the first deterministic long-output Chat prompt's fail-closed live
   receipt and completed same-turn readback without retrying it.
3. Repair the pre-answer active-generation classifier provider-free, validate,
   install once, and prove installed byte parity without restarting the API.
4. Submit one distinct deterministic long-output Chat prompt with a bounded
   observer timeout and zero retries.
5. Require the persisted Session/model state to remain running with
   `observation_expired_generation_active`, exact browser target and
   conversation identity, and bounded progress instrumentation.
6. Record the stale-runtime fallback failure, repair exact progress/runtime
   identity reconciliation provider-free, and install that repair once.
7. Reattach read-only to the already-created second conversation and recover
   the same turn without invoking the prompt runner or causing another Send.
8. Preserve the pre-existing Chrome process, release the foreground operation,
   and record installed/live evidence before integrating the receipt.

## Acceptance Criteria

- `ILC-R1`: installed source parity is exact for the affected modules and the
  API is not restarted.
- `ILC-R2`: no prompt is retried; at most two distinct canary prompts are
  submitted on the expected ChatGPT account, with the second permitted only
  after the live-found repair is installed. No scheduler, completion,
  materialization, or skill action occurs.
- `ILC-R3`: observer expiry during positive active generation persists
  `observation_expired_generation_active` with exact turn/browser evidence.
- `ILC-R4`: read-only Session recovery returns the same submitted turn without
  another Send.
- `ILC-R5`: the exact pre-existing PID/port remain healthy and no operation
  lock or false shutdown ownership remains after recovery.

## Bounds

- One identity smoke, at most two distinct prompts, zero prompt retries, and
  at most two read-only Session recovery attempts for the second canary. Both
  prompt allowances and the first recovery attempt are exhausted. The second
  recovery is remedial, may run only after the identity repair is installed,
  and must use the already-recorded progress conversation; no prompt may be
  replayed.
- Normal Chat mode with current-model selection. Never click `Answer now`.
- CAPTCHA, verification, identity mismatch, ambiguous target, or missing
  positive active-generation evidence is a hard stop.
- No API restart, scheduler/completion/materialization control, skill lifecycle
  action, or unrelated browser cleanup.

## Definition Of Done

All five criteria have current installed/live evidence for the repaired
runtime, both prompt outcomes are durable, and the result is integrated before
Skill CRUD implementation begins.

## Acceptance Receipt

- `ILC-R1`: ACCEPTED — installed parity is exact; API PID/restart count did not
  change.
- `ILC-R2`: ACCEPTED — two distinct prompts total, zero retries, and no
  scheduler/completion/materialization/skill effect.
- `ILC-R3`: ACCEPTED — the second timeout persisted running with
  `observation_expired_generation_active`, visible Stop, zero assistant text,
  and exact target/progress evidence.
- `ILC-R4`: ACCEPTED — installed read-only recovery returned the same 1,800-line
  response and sentinel without another Send.
- `ILC-R5`: ACCEPTED — PID `1933`, port `45015`, API PID `98408`, and empty
  operation-lock state remained stable.
