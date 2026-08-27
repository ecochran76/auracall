# CDP-observed ChatGPT approval recovery | 0318-2026-08-27

State: OPEN
Lane: P11
Branch: fix/plan0318-cdp-observed-chatgpt-approval
Target: main
Revision: 2 | 2026-08-27

## Stable Objective

Make ChatGPT connected-app approval behavior directly observable and reliably
actionable by AuraCall on the exact `wsl-chrome-3` DevTools target, then prove
the repair by resuming LitScout Project 15 / Session 73 through its materialized
research action without reconnecting OAuth or creating replacement research
state.

## Current State

- Plan 0317 is integrated and installed. Its deliberately nonexistent
  mutation canary passed exact DOM-bound `Always allow` activation.
- LitScout Plan 0459 subsequently failed on a real
  `research_action_execute` card under both `always-allow` and `allow-once`.
  OAuth remained healthy, but AuraCall reported that the exact visible card did
  not disappear and LitScout received no executor call.
- The existing probe reports a synthetic activation boolean immediately after
  calling `HTMLElement.click()`. It does not preserve the exact target/control
  ancestry, hit-test result, interaction events, disabled/style state, or a
  timestamped post-action DOM transition.
- Final Plan 0459 cleanup left no experiment Chrome process. AuraCall API and
  LitScout hosted services remain healthy.
- The exact live P11 trace found the adjacent missing state: ChatGPT initially
  rendered the verified `Allow once` control disabled while its safety check
  ran, then enabled the same control about 30 seconds later. Direct CDP
  activation on the enabled control emitted one trusted pointer/click sequence,
  removed the card, and produced successful LitScout receipt
  `rar_da1ff16f021fc98bc1744257d6619d46` with zero provider calls.
- The source repair now waits up to 60 seconds for that same exact settled
  card/control to become enabled; identity, ambiguity, hit-test, one-click, and
  `Answer now` fences remain unchanged.

## Authority And Bounds

- The operator explicitly requires instrumentation plus direct agentic
  manipulation and observation through the Chrome DevTools port.
- One critical-path owner, no subagents. P08 remains a separate lane with no
  expected write overlap.
- Expected write set: ChatGPT approval action/instrumentation source, focused
  tests, one bounded live observer/control helper if required, operator docs,
  Plan 0318, roadmap/runbook/journal/active-lane records, and durable receipts.
- Use the existing AuraCall runtime profile `wsl-chrome-3`, account, LitScout
  app, OAuth client, Project 15, Session 73, and ChatGPT conversation. Do not
  create another Project/Session or refresh, replace, reinstall, disconnect, or
  reconnect the app.
- Preserve the prior experiment ceiling: at most 40 total external provider
  calls and USD 25 positive marginal spend across the research continuation;
  the Plan 0459 baseline consumed zero. No submission, publication, filing,
  outreach, messaging, or other third-party communication.
- One primary live continuation and at most one changed-tactic retry after a
  proven pre-effect or exactly reconciled outcome. Never activate `Answer now`.
- Direct CDP activation is limited to one exact visible enabled
  `Allow once`/`Always allow` control whose card, conversation URL, target ID,
  account, app, Project, Session, and materialized action token have all been
  observed. Record before/activation/after evidence and stop on ambiguity,
  account drift, CAPTCHA, or human verification.

## Falsifiable Hypotheses

1. The selected node is not the effective interactive control; bounded
   ancestry and hit-test evidence will identify the real target.
2. Synthetic `HTMLElement.click()` is dispatched but ignored because the live
   control requires a trusted pointer sequence; event and DOM-transition
   evidence will distinguish this from a missed target.
3. The approval succeeds but AuraCall's one-second confirmation observes a
   stable conversation-turn root rather than the approval-card/control
   instance; exact control identity and a longer transition trace will expose
   the replacement.
4. ChatGPT rejects or replaces the action for a reason unrelated to the click;
   the direct trace will retain the visible card/error transition while the
   LitScout invocation ledger stays quiet.

## Execution Graph

1. Freeze the current Plan 0459 failure and exact live target as a regression
   contract.
2. Add timestamped, bounded CDP approval observations: exact card/control
   identity, ancestry, attributes, geometry, hit test, focus, event receipt,
   and post-action state transitions without recording unrelated page text.
3. Add provider-free tests that prove the observation contract and preserve
   manual, ambiguity, one-click, changed-card, paired-label, and `Answer now`
   fences.
4. Validate, commit, and install the instrumented checkpoint at an idle
   browser-operation boundary. If the exact direct trace discovers one
   adjacent approval-state defect, apply and install that final bounded repair
   without another provider submission, then prove source/installed parity.
5. Resume the exact ChatGPT conversation. Observe the card directly through
   its DevTools port and let the instrumented handler act. If it stalls and all
   exact gates remain true, directly activate the same verified control once
   through CDP and observe the transition to LitScout invocation or a typed
   provider failure.
6. Reconcile the invocation log, canonical Session state, provider/spend
   effects, browser ownership, and services. Apply only the smallest
   evidence-justified repair and rerun within the frozen bound if needed.

## Acceptance Criteria

- `COR-R1`: one durable trace binds every approval observation to exact target,
  conversation, card, control, action label, monotonic timestamp, and bounded
  DOM/event state.
- `COR-R2`: provider-free tests prove the trace adds no broad text matching,
  DOM mutation, second click, ambiguity tolerance, or `Answer now` path.
- `COR-R3`: source and installed artifacts are byte-identical and relevant
  focused/affected tests, typecheck, scoped lint, build, plan audit, and diff
  hygiene pass.
- `COR-R4`: one live continuation is observed directly through the actual
  Chrome DevTools port; any direct agent action names the exact control and
  records the before/after transition.
- `COR-R5`: LitScout effects and OAuth/consent states are independently
  reconciled. Success requires the materialized executor to reach LitScout;
  card disappearance alone is insufficient.
- `COR-R6`: terminal browser/process/lock ownership and repository custody are
  exact, with no prohibited external effect.

## Non-Goals

- No OAuth lifetime change, token copying, app replacement, or new connector.
- No generic approval bypass, arbitrary page click, blanket JavaScript
  execution, DOM rewriting, `Answer now`, or hidden retry loop.
- No LitScout controller, research-content, provider-economics, P08 status, or
  account-mirror policy change.

## Definition Of Done

Plan 0318 closes when the exact live card transition and downstream LitScout
effect are directly observed, the causal approval behavior is repaired or
truthfully isolated, all runtime ownership is reconciled, and the validated
source plus durable evidence are integrated and pushed.
