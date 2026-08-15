# ChatGPT Tool Approval Policy | 0286-2026-08-15

State: OPEN
Lane: P01

## Stable Objective

Keep automated ChatGPT conversations moving when a selected third-party tool
pauses for approval, while clicking only the operator-selected exact action:
`Allow once` or `Always allow`.

## Current State

- ChatGPT response waiting already performs a bounded passive DOM probe while
  the active conversation is generating.
- AuraCall does not currently classify ChatGPT tool-approval surfaces, so a
  tool-backed conversation can wait until the overall browser timeout.
- Provider-free source, tests, config, and docs are authorized. Browser launch,
  prompt submission, provider mutation, install, and service restart are not.

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

- [ ] Default/manual mode detects a tool approval and fails fast with an
  actionable operator message without clicking.
- [ ] `allow-once` clicks only exact `Allow once`; `always-allow` clicks only
  exact `Always allow`.
- [ ] Unrelated dialogs, incomplete/ambiguous approval surfaces, hidden
  controls, and `Answer now` remain untouched.
- [ ] A click must be confirmed by surface disappearance; the same approval is
  never clicked twice in one browser run.
- [ ] CLI/config/profile/stored-run preference propagation is provider-free
  tested and documented.
- [ ] Focused and affected validation, typecheck, build, lint, CodeGraph,
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

This plan closes when the exact preference contract is provider-free validated,
documented, committed, and pushed. One separately authorized live canary remains
required to prove the current ChatGPT DOM matches the provider-free fixture.
