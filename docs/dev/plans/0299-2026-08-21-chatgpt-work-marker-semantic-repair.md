# ChatGPT Work Marker Semantic Repair | 0299-2026-08-21

State: CLOSED
Lane: P01
Operational state: INSTALLED ACCEPTED / NO-PROMPT LIVE PROVEN

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
- Bounded no-prompt DOM inspection proved established Work instead has a
  visible active current-route conversation link with an exact descendant
  `Work` badge. Chat lacks that badge even while showing `High`.
- Provider-free RED/GREEN removes the shared slider from mode classification,
  accepts Chat-with-High, accepts explicit Work from the positive badge, and
  rejects implicit Chat on that Work route. Source and installed validation are
  green, and separate installed no-prompt Chat and Work probes passed.

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

- [x] Ordinary Chat with a visible High thinking control is accepted.
- [x] Work remains explicit and fail-closed from live-observed semantics.
- [x] Source and installed validation pass.
- [x] Separate live no-prompt Chat and Work probes pass before handoff.

## Source Verification

- Evidence:
  `docs/dev/notes/2026-08-21-plan0299-chat-work-mode-dom-evidence.json`
- Focused affected gate: 9 files, `309/309` passed.
- Full provider-free suite: 323 files passed, 21 skipped; `2,940` tests passed,
  65 skipped.
- `pnpm run typecheck`, `pnpm run build`, scoped Biome lint, CodeGraph readback,
  plan audit (`299` keep, zero validation errors), and `git diff --check` pass.

## Installed Verification

- Pushed feature/main source commit: `cf12ddfa`.
- Built and installed
  `dist/src/browser/actions/chatgptComposerMode.js` are byte-exact at SHA-256
  `3b76e2b896b76888705d61edbe9e1c653e81d4c6f63747d32bde65e1ce4a069f`.
- One idle-boundary install restarted the API healthy at PID `35083` while
  preserving authenticated Chrome PID `49689` / port `45015`; the browser root
  retained `--password-store=basic --use-mock-keychain`.
- The installed expression returned `already-selected / chat` on the known
  ordinary Chat route and `switched / work` on the separate known Work route.
  The Work probe performed one composer-mode switch but no prompt insertion,
  Send, model call, connector call, or canonical write.
- Exact probe-tab cleanup left one authenticated `https://chatgpt.com/` tab and
  preserved the retained browser. Completion and history-materialization active
  counts were zero at admission. At closeout the resumed scheduler had naturally
  started one `wsl-chrome-3` `backfill_history` completion while materialization
  remained zero; the plan took no scheduler/completion control action.

## Definition Of Done

The installed classifier has live-proven Chat/Work semantics and no longer
mistakes a thinking-level control for Work mode.
