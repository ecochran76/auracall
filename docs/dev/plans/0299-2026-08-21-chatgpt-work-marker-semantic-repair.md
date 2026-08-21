# ChatGPT Work Marker Semantic Repair | 0299-2026-08-21

State: OPEN
Lane: P01
Operational state: DIAGNOSED / IMPLEMENTATION NOT STARTED

## Stable Objective

Replace the false ChatGPT Work-marker classifier with semantics that accept the
exact established Chat conversation while preserving explicit, fail-closed
Work proof.

## Current State

- Plan 0297's provider-free and isolated installed probes passed, but live
  LitScout Plan 0433 rejected an ordinary Chat conversation before Send.
- Exact target `A2A704...` had the enabled `#prompt-textarea`, no Chat/Work
  radios, and one `[data-animated-slider-trigger=true]` whose text was `High`.
- That selector is shared by Chat's thinking-level control and cannot prove
  Work mode. The installed product is therefore not live-accepted for implicit
  Chat despite source/install parity.

## Required Work

1. Capture bounded, read-only exact DOM evidence from known Chat and known Work
   conversations under the managed profile without prompt or provider effects.
2. Define a Work-specific proof that does not reuse the thinking-level slider;
   if none exists on established routes, keep Work explicit and do not use a
   negative pseudo-marker to classify Chat.
3. Add RED provider-free fixtures for Chat-with-High and the actual Work surface.
4. Implement the smallest provider-local classifier correction.
5. Run focused/broad tests, build, lint, plan audit, install parity, and one
   separately governed no-prompt live mode probe for both Chat and Work.

## Non-Goals

- No prompt Send, connector/provider call, account bypass, Work inference,
  browser restart, or LitScout action.

## Acceptance Criteria

- [ ] Ordinary Chat with a visible High thinking control is accepted.
- [ ] Work remains explicit and fail-closed from live-observed semantics.
- [ ] Source and installed validation pass.
- [ ] Separate live no-prompt Chat and Work probes pass before handoff.

## Definition Of Done

The installed classifier has live-proven Chat/Work semantics and no longer
mistakes a thinking-level control for Work mode.
