# LitScout Tool Approval Live Canary | 0287-2026-08-15

State: OPEN
Disposition: LIVE CANARY AUTHORIZED
Lane: P01

## Stable Objective

Prove the pushed ChatGPT third-party tool-approval policy against one real,
read-only LitScout call using the operator-selected safe preference
`allow-once`.

## Current State

- Plan 0286 closed provider-free at implementation commit `4ce634c5` and
  closeout commit `aa71b887`; both are pushed to `origin/main`.
- The last installed inventory proved the LitScout developer app `Corel33t`
  enabled on AuraCall runtime profile `wsl-chrome-3`, but current browser,
  account, ownership, and selector state must still pass the live command's
  fail-closed gates.
- The new handler is not installed into the user runtime. This canary executes
  the pushed source directly with `pnpm tsx bin/auracall.ts`; no install or
  service restart is authorized.

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

- [ ] Opening gate is committed and pushed before browser access.
- [ ] Exactly one prompt is submitted with `allow-once`; no retry occurs.
- [ ] Runtime evidence reports exact `Allow once` and the approval surface is
  confirmed gone without clicking `Always allow` or `Answer now`.
- [ ] ChatGPT returns exact token `LITSCOUT_ALLOW_ONCE_OK` after only one
  read-only LitScout `auth_session` call.
- [ ] Cleanup/lease evidence passes and every excluded control or mutation
  remains zero.
- [ ] Terminal evidence, audits, commit, and push bind the accepted or
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

The plan closes after the sole command reaches one terminal accepted or
failed-safe result, cleanup is proven, and the exact outcome is committed and
pushed. Success proves only this current LitScout `allow-once` surface; it does
not authorize `always-allow`, broader tools, or unattended scheduler use.
