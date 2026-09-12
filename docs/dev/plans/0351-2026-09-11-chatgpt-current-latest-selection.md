# ChatGPT Current Latest Selection | 0351-2026-09-11

State: OPEN
Lane: P44
Operational state: PROVIDER_FREE_ACCEPTED_AWAITING_INSTALLED_LIVE
Branch: fix/plan0351-chatgpt-current-latest
Target: main
Integration: merge
Revision: 1 | 2026-09-11

## Stable Objective

Recognize ChatGPT's checked `Latest` row as the current instant-model family,
install the exact repaired runtime, and make one zero-retry LitScout developer-
app attempt without switching models or bypassing any product approval gate.

## Current State

- Exact current `main` is `50939e52b`; the LitScout app and expected account
  qualified without submission immediately before the live attempt.
- The attempt stopped before Send because current-model observation opened the
  picker, saw checked `Latest`, discarded it as an unknown family, and reported
  the configured `gpt-5.6-sol` as though it were an explicit selection request.
- A focused RED fixture expected checked `Latest` to classify as `instant` and
  received `null`. The repair recognizes exact visible/test-id `Latest` in both
  host and browser-evaluated classifiers without clicking a different option.
- Focused validation passes 136/136 tests across model selection, composer,
  developer-app, ecosystem-mention, label, and configuration coverage; scoped
  lint, typecheck, production build, and diff hygiene pass.
- Installation and the one live LitScout attempt remain unspent.

## Execution Graph

1. Publish this bounded plan and P44 registration with the provider-free fix.
2. Install the exact feature-branch runtime and verify installed/source parity.
3. Re-qualify exact account and LitScout app without submission.
4. Submit the frozen LitScout prompt at most once, stop at any approval gate,
   and reconcile CDP evidence, LitScout ledger, and canonical DB independently.
5. Record the terminal result and integrate the exact bounded lane.

## Acceptance Criteria

- `CLS-R1`: checked `Latest` is classified as the instant family under
  `current`, is reported as already selected, and causes no model-row click.
- `CLS-R2`: existing explicit model families, negative lookalikes, nested
  navigation, and developer-app/composer behavior remain green.
- `CLS-R3`: installed runtime matches the published source repair and exact
  account/app qualification passes without submission.
- `CLS-R4`: one frozen LitScout prompt has at most one Send and zero automatic
  retries, with manual tool approval and no approval, ceiling, or stop-condition
  bypass.
- `CLS-R5`: terminal status is reconciled against CDP, the LitScout invocation
  ledger, canonical Project 68 / Session 129 DB state, and provider accounting.

## Bounds And Hard Stops

- One source repair, one supported user-runtime install, one non-submitting
  qualification, and one prompt attempt with at most one Send and zero retries.
- Chat mode, exact LitScout developer app, expected account
  `eric.cochran@soylei.com`, `current` model observation, and manual tool
  approval only.
- Never click `Answer now`; stop at any LitScout/ChatGPT approval, authority,
  identity, ownership, CAPTCHA, hostile-state, or post-effect uncertainty gate.
- No handwritten LitScout query JSON, other apps, ChatGPT web search, scheduler
  or completion controls, unrelated tab cleanup, or recovered-conversation
  mutation.

## Definition Of Done

CLS-R1 through CLS-R5 are recorded with exact terminal evidence and integrated,
whether the one live attempt completes or stops truthfully at a product gate.
