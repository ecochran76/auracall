# ChatGPT Two Sequential LitScout Approvals | 0289-2026-08-15

State: CLOSED
Disposition: LIVE_CANARY_FAILED_SAFE
Lane: P01

## Stable Objective

Prove that one AuraCall ChatGPT prompt can handle two sequential third-party
tool approval pauses with exact `Allow once`, without persistent consent,
`Answer now`, or any LitScout write.

## Current State

- Plan 0288 live-proved one exact `Allow once` and closed `LIVE_ACCEPTED` at
  pushed commit `b5c2fcf8`.
- Current source creates one approval handler for the entire post-submit
  response wait. It probes on every passive DOM poll and releases a confirmed
  surface fingerprint so a later approval, including identical visible text,
  remains eligible.
- The focused regression explicitly calls one handler twice with the same
  fingerprint and passes both approvals. A current two-approval live proof is
  the sole remaining criterion for this plan.
- The sole live prompt submitted once and reached the first exact Corel33t
  approval surface. AuraCall dispatched one trusted pointer sequence, but the
  same surface remained visible through the one-second confirmation window;
  it failed closed with `chatgpt-tool-approval-not-confirmed` before connector
  dispatch, the second approval, or the expected token.
- Retained DOM showed one enabled `Allow once` button whose center resolved to
  its child span, with pointer events enabled. This is evidence for a
  provider-surface settle/no-op class, not permission for an identical retry.
- LitScout post-readback and cleanup passed with every target, cancellation,
  write, restart, tab, and lock exclusion preserved. Durable receipt:
  `docs/dev/notes/2026-08-15-plan0289-two-sequential-approval-failed-safe.json`.

## Execution Contract

1. Run the focused approval regression and preflight exact AuraCall runtime
   profile `wsl-chrome-3`, managed browser profile
   `~/.auracall/browser-profiles/wsl-chrome-3/chatgpt`, browser profile
   `Default`, Chat/current model, and developer app `Corel33t`.
2. Submit exactly one prompt with policy `allow-once`.
3. The prompt may call only `project_source_ingest_job_cancel`, exactly twice
   and sequentially, with these exact deliberately nonexistent targets:
   - A: slug `plan0289-multi-approval-a-nonexistent-20260815`, job
     `psi_plan0289_a_nonexistent_20260815`
   - B: slug `plan0289-multi-approval-b-nonexistent-20260815`, job
     `psi_plan0289_b_nonexistent_20260815`
4. Each call must surface and log one exact `Allow once`; each approval surface
   must disappear before the next call proceeds.
5. After both expected not-found results, ChatGPT must return exact token
   `LITSCOUT_TWO_ALLOW_ONCE_OK`.
6. Inspect retained DOM, LitScout installed/DB state, service/browser identity,
   tabs, and operation locks; close only the exact owned canary tab.

## Non-Goals And Hard Stops

- No install, service restart, scheduler/completion/materialization control,
  app/OAuth mutation, generic search/browse, successful job cancellation,
  LitScout canonical write, `always-allow`, or `Answer now`.
- Stop on CAPTCHA/human verification, identity mismatch, unknown ownership,
  unexpected tool or arguments, ambiguous simultaneous approvals, unconfirmed
  disappearance, unexpected mutation, or prompt-submission uncertainty.
- No prompt retry and no second live canary under this plan.

## Acceptance Criteria

- [x] Current provider-free repeated-approval regression passes.
- [ ] One prompt submits exactly once and invokes only the two frozen calls.
- [ ] AuraCall logs exact `Allow once` twice, in sequence, with confirmed
  disappearance after each approval.
- [ ] The final response is exactly `LITSCOUT_TWO_ALLOW_ONCE_OK`.
- [ ] `Always allow` and `Answer now` clicks remain zero.
- [ ] Both exact project/job/operator-action targets remain absent; cancelled
  and cancel-requested jobs remain zero; LitScout canonical writes remain zero.
- [ ] Exact cleanup, durable receipt, planning/docs audits, commit, and origin
  reconciliation pass.

## Effect Budget

- `max_live_canary_attempts: 1`
- `max_prompt_submissions: 1`
- `max_litscout_connector_calls: 2`
- `max_tool_approval_clicks: 2`
- `approval_policy: allow-once`
- `max_live_retries: 0`
- `max_installs: 0`
- `max_service_restarts: 0`
- `max_scheduler_or_completion_controls: 0`
- `max_litscout_canonical_writes: 0`

## Definition Of Done

Completion requires current live evidence for two sequential approvals in one
response wait, the exact terminal token, zero excluded effects, and exact
cleanup. Provider-free behavior alone is insufficient. This plan exhausted its
sole live attempt without meeting completion; a successor must first add a
provider-free pre-click settle/fresh-coordinate repair.
