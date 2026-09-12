# ChatGPT App Security Approval Exposure | 0352-2026-09-12

State: OPEN
Lane: P45
Operational state: PROVIDER_FREE_REPAIR_ACTIVE
Branch: fix/plan0352-chatgpt-security-approval
Target: main
Integration: merge
Revision: 1 | 2026-09-12

## Stable Objective

Detect ChatGPT's single-action app-security approval dialog and expose it
through AuraCall's shared response/approval lifecycle during developer-app test
submissions, without weakening exact-surface matching or silently granting a
persistent approval.

## Current State

- A user-continued LitScout conversation exposed the current dialog:
  `Allow ChatGPT to use LitScout?`, one `Allow` action, and a
  `Suspicious Instruction` warning.
- AuraCall's current approval probe recognizes only a visible pair of
  `Allow once` and `Always allow` controls, so it cannot classify this surface.
- `apps test --submit` deliberately returns at `prompt_submitted`; Plan 0323
  already records that terminal response and approval observation must reuse
  the shared high-level lifecycle instead of duplicating a watcher in the
  developer-app adapter.
- After the operator manually approved the ChatGPT dialog, LitScout received
  one `research_action_execute` invocation and rejected it during pre-effect
  validation. The canonical exact-action execution/attempt/receipt counts and
  Session 129 membership count did not increase; no automatic retry is allowed.

## Execution Graph

1. Add a live-shaped provider-free fixture that fails under the paired-action-
   only probe and proves conservative recognition of the exact security dialog.
2. Add a developer-app fixture that requires submission to select the shared
   assistant-response lifecycle rather than the early submitted boundary.
3. Extend exact-surface typing, manual exposure, and allow-once handling while
   making `always-allow` fail closed on the one-time-only surface.
4. Run focused approval/developer-app/CLI tests, affected tests, typecheck,
   production build, scoped lint, plan audit, and diff hygiene.
5. Record provider-free evidence. Installation and any new ChatGPT/LitScout
   action remain a separately authorized successor gate.

## Acceptance Criteria

- `ASA-R1`: the exact visible app-security dialog with heading, warning, and
  one `Allow` control is classified as one approval-required surface; generic
  single-Allow dialogs remain unmatched.
- `ASA-R2`: manual policy emits an actionable approval-required error carrying
  the surface kind and exact action label without clicking.
- `ASA-R3`: allow-once may activate the exact `Allow` control; always-allow
  refuses to downgrade persistent consent to a one-time approval.
- `ASA-R4`: developer-app test submission uses the existing shared response and
  approval lifecycle and retains exact ecosystem mention/current-model routing.
- `ASA-R5`: provider-free validation and governance checks pass with no install,
  browser mutation, provider call, LitScout retry, or canonical data effect.

## Bounds And Hard Stops

- Source, tests, and governing documentation only.
- No installed-runtime refresh, ChatGPT Send, approval click, LitScout action,
  provider request, retry, scheduler/completion control, or unrelated browser
  cleanup.
- Preserve the rejected exact-action token as terminal evidence; never reuse it.
- Do not add a provider-adapter-local response watcher.

## Definition Of Done

ASA-R1 through ASA-R5 are provider-free accepted and the exact bounded repair
is ready for integration. Installed/live acceptance remains explicitly open.
