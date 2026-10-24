# Plan0450 | Account-page startup diagnostics

State: CLOSED
Issue: https://github.com/ecochran76/auracall/issues/384
Owner: Eric Cochran / Codex
Branch: fix/chatgpt-account-readiness

## Scope

Report a visible main-page account-load failure instead of generic missing model/mode controls. Read-only classification only: no reload, authentication reset, warning clearance, retry, provider prompt or deployment. The source packet does not resolve the provider account-load cause. Related pending-approval issue377 remains separate.

## Evidence and acceptance

A retained failed tab had no editor/model control and a main heading saying We couldn’t load your account. One authorized reload in the preceding runtime packet restored the page; it does not prove expired login or the network cause. Installed detector replay reproduced button-missing; an account-specific assertion failed. Public model/mode regressions both failed before repair. The first classifier incorrectly expected could-not to-load wording; the real captured contraction test remained red until corrected.

- Three focused files pass 55/55 tests: chatgptStartupAccountError, modelSelection, chatgptComposerMode.
- Typecheck `pnpm exec tsc --noEmit` passes.
- Original captured-page replay through real source model detection now returns CHATGPT_ACCOUNT_LOAD_ERROR, using virtual waiting and no provider.
- Hidden, quoted and healthy heading cases retain generic missing-control diagnostics; successful selector paths are unchanged.
- No debug instrumentation added to product code. Private diagnostic harnesses remain outside Git.

## Definition of done

Source repair and tests qualify; focused diff and remote PR readback establish custody. Installed qualification and provider recovery remain open under issue384.

## Memory assessment

Current captured evidence and source were sufficient; no additional historical discovery needed. Source-backed closeout will record exactly one memory disposition.
