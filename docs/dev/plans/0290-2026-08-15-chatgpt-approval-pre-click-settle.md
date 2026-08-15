# ChatGPT Approval Pre-Click Settle And Two-Approval Canary | 0290-2026-08-15

State: OPEN
Disposition: ACTIVE
Lane: P01

## Stable Objective

Repair the first-approval no-op exposed by Plan 0289, then prove that one
AuraCall ChatGPT prompt can handle two sequential third-party tool approvals
with exact `Allow once`, without persistent consent, `Answer now`, or any
LitScout write.

## Current State

- Plan 0289 exhausted its sole live attempt and closed failed-safe. One trusted
  pointer sequence used the approval coordinates from initial detection, but
  the same enabled surface remained visible through confirmation.
- Retained DOM showed one exact enabled `Allow once` button and no ambiguity.
  The evidence supports a pre-click settle/stale-coordinate class but does not
  prove it; a provider-free regression must establish the intended repair.
- The approval handler already fails closed on ambiguity and unconfirmed
  disappearance, never clicks `Answer now`, and remains active for the entire
  response wait so later approvals are eligible.
- LitScout targets, cancellation state, canonical writes, services, browser
  ownership, tabs, and locks remained unchanged after the failed canary.

## Execution Contract

1. Add one provider-free public-seam regression proving that the handler waits
   briefly, re-probes the same exact approval fingerprint/action, and dispatches
   its single trusted pointer sequence at the fresh coordinates.
2. Fail closed without a pointer action if the approval changes or becomes
   ambiguous before dispatch; if it disappears independently, report no action.
3. Run the focused and affected provider-free validation, typecheck, build,
   scoped lint, current CodeGraph readback, planning audit, and diff hygiene;
   commit and push the repair before live work.
4. Submit exactly one successor prompt through AuraCall runtime profile
   `wsl-chrome-3`, its exact managed/browser profiles, Chat/current model, and
   developer app `Corel33t`, with approval policy `allow-once`.
5. The prompt may call only `project_source_ingest_job_cancel`, exactly twice
   and sequentially, with these fresh deliberately nonexistent targets:
   - A: slug `plan0290-multi-approval-a-nonexistent-20260815`, job
     `psi_plan0290_a_nonexistent_20260815`
   - B: slug `plan0290-multi-approval-b-nonexistent-20260815`, job
     `psi_plan0290_b_nonexistent_20260815`
6. Each call must surface and log one exact `Allow once`; each surface must
   disappear before the next call proceeds. After both not-found results,
   ChatGPT must return exact token `LITSCOUT_TWO_ALLOW_ONCE_SETTLED_OK`.
7. Inspect retained DOM, exact LitScout installed/DB state, service/browser
   identity, tabs, and operation locks; close only the exact owned canary tab.

## Non-Goals And Hard Stops

- No second click on one approval, install, service restart, scheduler/
  completion/materialization control, app/OAuth mutation, generic search or
  browse, successful job cancellation, LitScout canonical write,
  `always-allow`, or `Answer now`.
- Stop on CAPTCHA/human verification, identity mismatch, unknown ownership,
  unexpected tool or arguments, ambiguous or changed pre-click approval,
  unconfirmed disappearance, unexpected mutation, or prompt uncertainty.
- No prompt retry and no second live canary under this plan.

## Acceptance Criteria

- [ ] A red-to-green provider-free regression proves fresh-coordinate dispatch
  after a stable pre-click re-probe.
- [ ] Provider-free coverage proves changed/ambiguous surfaces dispatch zero
  pointer events; all focused and affected validation passes.
- [ ] One prompt submits exactly once and invokes only the two frozen calls.
- [ ] AuraCall logs exact `Allow once` twice, in sequence, with confirmed
  disappearance after each approval.
- [ ] The final response is exactly `LITSCOUT_TWO_ALLOW_ONCE_SETTLED_OK`.
- [ ] `Always allow`, `Answer now`, and duplicate approval clicks remain zero.
- [ ] Both exact project/job/operator-action targets remain absent; cancelled
  and cancel-requested jobs remain zero; LitScout canonical writes remain zero.
- [ ] Exact cleanup, durable receipt, planning/docs audits, commit, and origin
  reconciliation pass.

## Effect Budget

- `max_provider_free_repair_cycles: 1`
- `max_live_canary_attempts: 1`
- `max_prompt_submissions: 1`
- `max_litscout_connector_calls: 2`
- `max_tool_approval_clicks: 2`
- `max_clicks_per_approval_surface: 1`
- `approval_policy: allow-once`
- `max_live_retries: 0`
- `max_installs: 0`
- `max_service_restarts: 0`
- `max_scheduler_or_completion_controls: 0`
- `max_litscout_canonical_writes: 0`

## Definition Of Done

Completion requires the provider-free settle/fresh-coordinate repair plus
current live evidence for two sequential approvals in one response wait, the
exact terminal token, zero excluded effects, and exact cleanup. A second
unconfirmed click or provider-free behavior alone is insufficient.
