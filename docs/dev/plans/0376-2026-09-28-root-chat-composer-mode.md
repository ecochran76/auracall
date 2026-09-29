# Root Chat Composer-Mode Drift | 0376-2026-09-28

State: CLOSED
Lane: P76
Work item: ecochran76/auracall#125
Source base: `origin/main` at `1398eadd763db1e29d7586b4cf9659fbd2fc69d9`
Branch: `fix/issue-125-root-chat-mode`
Target: `main`
Integration: merge
Blocks: ecochran76/auracall#121 installed acceptance

## Stable Objective

Recognize the current control-less ChatGPT root Chat composer after the bounded
mode-control hydration window without weakening explicit Work selection, active
Work rejection, or the separation between Chat and Work model controls.

## Current State

- Plan 0375 / issue 123 is integrated and proved exact-tab coexistence.
- Its one installed smoke reached the current root composer, verified the
  configured account, and stopped before Send with
  `Unable to find the ChatGPT Chat mode control.`
- The captured page exposed a visible enabled `Ask ChatGPT` textbox and no
  historical Chat/Work control. No prompt was submitted and no retry ran.
- A deterministic provider-free fixture now reproduces the exact root-route
  false negative in under one second. Existing explicit-Work and active-Work
  cases remain the negative safety boundary.

## Ranked Hypotheses

1. The control-less Chat fallback is incorrectly restricted to established
   conversation routes even after root control hydration has fully elapsed.
2. The prompt-editor selector is narrower than the captured current root DOM.
3. A late or active Work marker makes root inference ambiguous and must retain
   the fail-closed outcome.

## Execution Packet

- Owner: primary issue-125 session.
- Expected write surface: composer-mode action, its focused tests, contract
  docs, plan/lane/runbook/journal/fix-log reconciliation.
- Change only the eligibility gate for desired Chat after the existing root
  control wait; do not shorten that wait or infer Work from an editor.
- Validate the root Chat positive case, root Work negative case, active Work
  rejection, adjacent mode/config contracts, typecheck, scoped lint, build,
  diff hygiene, plan audit, and lane reconciliation.
- Provider-free source integration is authorized. No install, browser attach,
  navigation, prompt, Send, service restart, scheduler control, or terminal
  session retry belongs to this packet.

## Non-goals

- Connected-app selection or committed-prompt verification.
- Browser coordination, lease admission, or target provisioning.
- Changing Work model selection or accepting Work without exact evidence.
- Spending issue 121's final connector-plus-wake acceptance.
- Running GitHub Actions.

## Acceptance Criteria

- [x] A deterministic provider-free regression reproduces the captured root
      Chat false negative.
- [x] Root Chat succeeds only after the existing mode-control wait when one
      exact visible enabled prompt editor exists and no active Work marker is
      present.
- [x] Explicit Work remains unavailable without exact Work evidence.
- [x] Active current-route Work evidence continues to reject implicit Chat.
- [x] Focused and adjacent tests, typecheck, scoped lint, build, diff hygiene,
      planning audit, and lane audit pass.
- [x] The validated source repair is merged, issue 125 is closed, and the
      Session 1 handoff is rewritten with the canonical merge receipt.

## Definition Of Done

Issue 125 is closed by an integrated provider-free repair whose regression
matches the installed root-composer failure, all fail-closed Work boundaries
remain green, and issue 121 / PR 122 can rebase onto the canonical fix before
its separately governed installed acceptance.

## Stop Rules

- Do not retry the terminal Plan 0375 smoke.
- Stop on any regression that permits control-less Work or ignores an active
  Work marker.
- No live browser/provider effect is required for this source repair.
