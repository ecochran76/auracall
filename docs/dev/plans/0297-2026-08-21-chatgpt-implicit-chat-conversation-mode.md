# ChatGPT Implicit Chat Conversation Mode | 0297-2026-08-21

State: OPEN
Lane: P01
Operational state: SOURCE ACCEPTED / INSTALL PENDING

## Stable Objective

Allow AuraCall to use an established ChatGPT Chat conversation whose loaded
composer is valid but whose current UI omits the Chat/Work mode control, while
keeping explicit Work selection and ambiguous surfaces fail-closed.

## Current State

- LitScout's governed Experiment 9 enrichment-resume invocation stopped before
  Send with `Unable to find the ChatGPT Chat mode control.`
- Authoritative LitScout readback proves the controller remains at
  `enrichment_planning`, the prior search/downselection receipts remain latest,
  and the failed invocation created no model, connector, provider, or session
  effect.
- A bounded AuraCall-owned browser diagnostic loaded the exact existing
  conversation and observed a visible `#prompt-textarea[role="textbox"]` with
  `aria-label="Chat with ChatGPT"`, but no visible Chat/Work radio, menu trigger,
  or menu item.
- The shared composer-mode expression currently returns `mode-not-found` when
  both explicit control variants are absent, regardless of composer readiness.

## Selected Design

- Add a provider-free regression for the exact existing-conversation DOM:
  visible ChatGPT prompt editor, no explicit mode controls, and no Work marker.
- Treat that narrow surface as already-selected Chat only.
- Preserve existing explicit radio/menu selection behavior.
- Keep implicit Work forbidden and reject any surface carrying a visible Work
  marker when no explicit mode control can prove the requested state.

## TDD And Validation

1. Prove the exact implicit-Chat regression RED against the installed source
   contract.
2. Implement the smallest provider-local expression change and prove the
   regression GREEN.
3. Run the focused mode tests, affected ChatGPT/browser tests, typecheck, build,
   scoped lint, planning audit, and diff hygiene.
4. Commit and push accepted source, converge the user runtime once, and verify
   exact installed parity before returning control to LitScout.

## Source Acceptance

- The exact established-conversation regression failed RED with
  `mode-not-found` and passes GREEN after the narrow implicit-Chat seam.
- Focused mode coverage passes `11/11`; the five-file affected ChatGPT/browser
  packet passes `211/211`.
- Typecheck, production build, scoped Biome, CodeGraph blast-radius readback,
  and the 297-plan library audit all pass.
- The full provider-free suite passed `321` files / `2,933` tests and skipped
  `65` opt-in/live tests. Two unrelated timing assertions failed under parallel
  load; each exact test passed immediately in isolated rerun. No test-owned
  browser process remained.
- No browser/provider invocation, prompt, connector call, or LitScout effect
  occurred during source implementation and validation.

## Non-Goals

- No prompt Send, connector call, LitScout mutation, search/downselection
  replay, Work-mode inference, selector weakening outside ChatGPT, or manual
  canonical-profile browser takeover from this repair plan.
- No assumption that a generic textarea or contenteditable proves Chat mode.

## Acceptance Criteria

- [x] The exact established-conversation regression is RED before the repair
  and GREEN after it.
- [x] Explicit Chat/Work controls retain their current behavior.
- [x] Only a visible, enabled, ChatGPT-specific prompt editor with no visible
  Work marker qualifies for implicit Chat.
- [x] Work remains fail-closed without an explicit selected/available control.
- [ ] Source validation passes and the installed runtime is byte-exact before
  any separately governed LitScout successor invocation.

## Definition Of Done

AuraCall can safely recognize an established Chat conversation without a
rendered mode selector, retains explicit Work proof, and hands LitScout an
installed, validated runtime boundary for one separately governed successor.
