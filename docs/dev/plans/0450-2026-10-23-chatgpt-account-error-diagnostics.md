# Plan0450 | Account-page startup diagnostics

State: OPEN
Lane: P450
Branch: fix/chatgpt-account-readiness
Target: main
Integration: merge

## Current State | 2026-10-29 reconciliation

Source checkpoint408ce37dc is qualified in open PR385. The earlier source packet was CLOSED; integration and installed qualification remain OPEN. The provider account-load cause is unresolved. No automatic reload, prompt, auth reset or warning clearance is authorized by this reconciliation.

## 2026-10-30 — Current-main review and findings

PR385 is reconciled with maind5a1293cc at mergee8a40c430, preserving the newer
ID-less composer and private structural diagnostics. One frozen Standards/Spec
review found Standards0 and Spec2/P2: conversation article quotations and fully
transparent headings were incorrectly classified as account-page failures.
A genuine offline DOM probe through both public selectors reproduced six wrong
classifications; ten controls, including the original visible wording, passed.

One bounded findings-TDD phase added exact public negative regressions. The four
article cases failed before article/role=article exclusion and passed afterward;
the two opacity cases then failed before the visibility fix and passed afterward.
88 checks across startup, model, composer, structural capture and app readiness
pass. The original sixteen real-DOM cases are now all green. Source classification
still runs only after missing controls; it never reloads, navigates, clicks recovery,
clears a warning, signs out, retries or sends. Review runs1; findings phases1.

Installed qualification will replay the synthetic page fixtures through the exact
installed public detectors, keeping actual provider outage/recovery and #377/#311
out of scope. No outage is induced and no provider-cause claim is required to
complete the diagnostic contract in #384.

## Preserved execution history

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
