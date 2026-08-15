# LitScout Tool Approval Live Canary | 0287-2026-08-15

State: CLOSED
Disposition: LIVE CANARY FAILED SAFE
Lane: P01

## Stable Objective

Prove the pushed ChatGPT third-party tool-approval policy against one real,
read-only LitScout call using the operator-selected safe preference
`allow-once`.

## Current State

- Opening gate `fb1ed232` was pushed before browser access. The source-direct
  command reached the target-plan log and then remained pre-submit until its
  600-second outer guard terminated it.
- No new conversation, approval detection, approval click, connector result,
  or expected token was observed. The canary therefore did not reach the Plan
  0286 handler and closes failed-safe without a provider retry.
- Cleanup passed: API PID 32268 remains active with zero restarts, Chrome PID
  66297 remains the sole port-45015 owner, the browser-operation lease
  directory is empty, and the exact two-page tab census is unchanged.

## Execution Contract

1. Record clean/upstream-exact Git and read-only local service, managed browser
   profile, owner/listener, and operation-lease evidence.
2. Run exactly one Chat-mode prompt on AuraCall runtime profile
   `wsl-chrome-3`, current-model strategy, selected app `Corel33t`, and
   `--browser-chatgpt-tool-approval allow-once`.
3. The prompt may call only LitScout `auth_session` exactly once, perform no
   generic search/browse or LitScout mutation, and return exact token
   `LITSCOUT_ALLOW_ONCE_OK`.
4. Require one observed approval detection, one trusted-pointer selection of
   exact `Allow once`, confirmed surface disappearance, and terminal response.
5. Stop after the first terminal outcome. Do not retry, switch to
   `always-allow`, click `Answer now`, or repair live state in this packet.
6. Read back process/lease cleanup and record the exact outcome in plan,
   roadmap, runbook, journal, and a durable redacted receipt.

## Non-Goals And Hard Stops

- No install, service restart, scheduler/completion/materialization control,
  app/OAuth mutation, LitScout session creation, research continuation,
  search, analysis, action approval/execution, or canonical write.
- No connector other than LitScout and no tool other than `auth_session`.
- Stop on CAPTCHA/human verification, account mismatch, unknown browser
  ownership, missing/ambiguous approval surface, unexpected tool, selector
  drift, unconfirmed click, prompt-submission uncertainty, or any canary error.
- Cleanup is limited to the exact canary-owned process/session. Do not signal
  a scheduler-owned or otherwise unattributed browser.

## Acceptance Criteria

- [x] Opening gate is committed and pushed before browser access.
- [ ] Exactly one prompt is submitted with `allow-once`; no retry occurs.
- [ ] Runtime evidence reports exact `Allow once` and the approval surface is
  confirmed gone without clicking `Always allow` or `Answer now`.
- [ ] ChatGPT returns exact token `LITSCOUT_ALLOW_ONCE_OK` after only one
  read-only LitScout `auth_session` call.
- [x] Cleanup/lease evidence passes and every excluded control or mutation
  remains zero.
- [x] Terminal evidence, audits, commit, and push bind the accepted or
  failed-safe outcome.

## Effect Budget

- `max_browser_prompt_runs: 1`
- `max_prompt_submissions: 1`
- `max_litscout_connector_calls: 1`
- `max_tool_approval_clicks: 1`
- `approval_policy: allow-once`
- `max_retries: 0`
- `max_installs: 0`
- `max_service_restarts: 0`
- `max_scheduler_or_completion_controls: 0`
- `max_litscout_canonical_writes: 0`

## Definition Of Done

The plan closes failed-safe after the sole command reached its outer timeout
before prompt submission and cleanup was proven. The live approval contract is
not accepted. A provider-free successor should bound or skip pre-run cache
identity/feature discovery before any separately authorized second canary.

## Terminal Evidence

- Preflight proved clean/upstream-exact Git, active API PID 32268 with zero
  restarts, sole Chrome PID 66297 on port 45015, and an empty operation-lease
  directory. One inert CLI parse failure rejected `--no-notify` before browser
  access and consumed no live effect.
- The sole actual run emitted only the resolved root target, then held three
  CDP connections without creating a new conversation or emitting browser-run
  progress. The 600-second outer guard ended the process; no provider retry ran.
- A bounded exact-port tab inspection found no CAPTCHA/blocking page and the
  same two pages before and after: retained `LitScout Project Execution` plus
  the root ChatGPT page. No submitted canary conversation exists.
- CodeGraph localizes the pre-run boundary to `buildBrowserContext()`, which
  calls `resolveCacheIdentity()`. Its provider identity and feature-signature
  reads catch rejection but carry no local deadline, so one pending read can
  prevent `runBrowserMode()` and the approval handler from starting.
- Actual effects: one browser command, zero prompt submissions, zero LitScout
  connector calls, zero approval clicks, zero installs/restarts, zero runtime
  controls, and zero LitScout canonical writes. Durable receipt:
  [docs/dev/notes/2026-08-15-plan0287-litscout-allow-once-canary.json](../notes/2026-08-15-plan0287-litscout-allow-once-canary.json).
