# ChatGPT Implicit Chat Conversation Mode | 0297-2026-08-21

State: CLOSED
Lane: P01
Operational state: SOURCE AND INSTALL ACCEPTED / LIVE WORK-MARKER ASSUMPTION INVALID

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
- The first installed successor still stopped before Send. Post-stop CDP
  readback found the exact enabled composer on both resulting conversation
  tabs, proving the implicit-Chat predicate was installed but evaluated before
  the React composer mounted.

## Selected Design

- Add a provider-free regression for the exact existing-conversation DOM:
  visible ChatGPT prompt editor, no explicit mode controls, and no Work marker.
- Treat that narrow surface as already-selected Chat only.
- Poll that exact surface for at most 10 seconds so a normal conversation
  render can settle; stop immediately when a visible Work marker appears.
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
- Focused mode coverage passes `12/12`; the five-file affected ChatGPT/browser
  packet passes `211/211`.
- Typecheck, production build, scoped Biome, CodeGraph blast-radius readback,
  and the 297-plan library audit all pass.
- The full provider-free suite passed `321` files / `2,933` tests and skipped
  `65` opt-in/live tests. Two unrelated timing assertions failed under parallel
  load; each exact test passed immediately in isolated rerun. No test-owned
  browser process remained.
- No browser/provider invocation, prompt, connector call, or LitScout effect
  occurred during source implementation and validation. The first installed
  acceptance invocation stopped before Send and is terminal; it is not reused.

## Installed Acceptance

- Commit `c0af02d4` is pushed to `origin/main`.
- The built and installed composer-mode artifacts are byte-exact at SHA-256
  `eccf5cbe0319ea62474b4546fce85a54ca036e285cf068cf8dc815fb2b0f9419`.
- The installed artifact contains the bounded 10-second composer-mount wait.
- An isolated installed-expression probe mounted the exact enabled ChatGPT
  editor after 250 ms and returned `already-selected` Chat. The probe created
  and closed only its own `about:blank` target and made no provider call.

## Live Rejection

- A later exact-conversation run disproved the Work-marker assumption. On an
  ordinary Chat conversation, `[data-animated-slider-trigger=true]` was the
  visible `High` thinking-level control, not a Work-mode marker.
- The exact enabled editor was present and no Chat/Work radios were exposed,
  but the installed classifier rejected implicit Chat before Send.
- Plan 0299 owns corrected mode semantics and must include live Chat plus Work
  acceptance before any LitScout successor consumes them.

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
- [x] The implicit-Chat predicate tolerates bounded delayed composer mounting.
- [x] Work remains fail-closed without an explicit selected/available control.
- [x] Source validation passes and the installed runtime is byte-exact before
  any separately governed LitScout successor invocation.

## Definition Of Done

AuraCall can safely recognize an established Chat conversation without a
rendered mode selector, retains explicit Work proof, and hands LitScout an
installed, validated runtime boundary for one separately governed successor.
