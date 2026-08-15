# ChatGPT Tool Approval Policy | 0286-2026-08-15

State: CLOSED
Lane: P01

## Stable Objective

Keep automated ChatGPT conversations moving when a selected third-party tool
pauses for approval, while clicking only the operator-selected exact action:
`Allow once` or `Always allow`.

## Current State

- Provider-free source candidate `4ce634c5` adds the explicit policy across
  CLI, config/schema resolution, browser profiles, stored execution, and both
  local and remote response-wait paths.
- The action requires one visible surface with exact paired `Allow once` and
  `Always allow` controls, uses trusted pointer input, confirms disappearance,
  and retains the retry fence only while a click is unconfirmed.
- No browser, provider, install, service, scheduler, or completion-control
  effect ran. Current ChatGPT DOM compatibility remains a separate live gate.

## Execution Contract

1. Add one explicit ChatGPT tool-approval preference with a fail-closed manual
   default and exact `allow-once` / `always-allow` opt-ins.
2. Reproduce the approval pause through the provider action interface before
   changing runtime behavior.
3. Detect only a visible approval surface containing the exact paired actions,
   click only the configured action through trusted pointer input, and reject
   ambiguous, repeated, or unconfirmed attempts.
4. Invoke the provider action from the existing post-submit passive response
   probe without weakening target fencing or the `Answer now` prohibition.
5. Propagate the preference through CLI, config schema/resolution, stored team
   execution, browser profiles, and operator docs.
6. Run focused tests, affected suites, typecheck, build, scoped lint, CodeGraph
   readback, diff hygiene, and planning audits.

## Non-Goals And Hard Stops

- No browser launch, live DOM inspection, prompt submission, connector/tool
  invocation, tool approval, install, service restart, or scheduler/completion
  control in this provider-free slice.
- No generic auto-consent behavior and no matching on broad words such as
  `allow`, `approve`, or `continue` alone.
- Never click ChatGPT's `Answer now` button.
- `always-allow` is never inferred from a tool selection, prior provider state,
  or an `allow-once` preference.

## Acceptance Criteria

- [x] Default/manual mode detects a tool approval and fails fast with an
  actionable operator message without clicking.
- [x] `allow-once` clicks only exact `Allow once`; `always-allow` clicks only
  exact `Always allow`.
- [x] Unrelated dialogs, incomplete/ambiguous approval surfaces, hidden
  controls, and `Answer now` remain untouched.
- [x] A click must be confirmed by surface disappearance; the same approval is
  never clicked twice in one browser run.
- [x] CLI/config/profile/stored-run preference propagation is provider-free
  tested and documented.
- [x] Focused and affected validation, typecheck, build, lint, CodeGraph,
  planning audits, and diff hygiene pass.

## Effect Budget

- `max_browser_launches: 0`
- `max_live_dom_inspections: 0`
- `max_prompt_submissions: 0`
- `max_tool_or_connector_invocations: 0`
- `max_tool_approval_clicks: 0`
- `max_user_runtime_installs: 0`
- `max_service_restarts: 0`
- `max_scheduler_or_completion_controls: 0`

## Definition Of Done

This plan is provider-free accepted at source candidate `4ce634c5`. The affected
gate passes 238 tests; typecheck, production build, scoped lint, current
CodeGraph readback, plan-library validation, and diff hygiene pass. The commits
are pushed together at closeout. One separately authorized live canary remains
required to prove the current ChatGPT DOM matches the provider-free fixture.
