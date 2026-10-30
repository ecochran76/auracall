# Plan0470 — Preserve conversation-list recovery constraints

State: CLOSED
Owner: primary agent
Branch: fix/chatgpt-list-recovery-options
Target: origin/main
Base: 563faa1a7e0e2cb5b334398c245f092c273689e8

## Current State

Source TDD packet completed; runtime deployment is not part of this packet.
Audit Plan0469 is published on research/chatgpt-list-efficiency-20261030 at
ad1cc6dc0614d40a129996d4722c4cadc98a8119. This bounded repair addresses dropped
recovery options and resulting replay, not pagination or shared listing work.

## Contract and seam

Exercise public createChatgptAdapter().listConversations with a simulated external
Chrome transport; retain real authorization, warning classification, recovery and
retry code. A qualified account-mirror rate-limit warning must return its original
blocking-surface error, perform no recovery/reopen, and not repeat auth-session
reads. A transient listing with navigation forbidden must not reload or reopen.
Pass options to the existing wrapper/reopen helper; preserve ordinary retry policy
outside the qualified account-mirror hard stop. No new provider call, warning
clearance, cache, rate-limit change, installation or browser restart.

## Red and green evidence

Commands use pnpm exec vitest run tests/browser/chatgptConversationListRecovery.test.ts --maxWorkers=1.
Initial fixture lacked browser process provenance and failed authorization; this
was harness setup, not the bug. After correction, the first qualified red reached
8 browser-effect attempts. Forwarding wrapper options removed effects but still
failed with2auth-session reads instead of1. Making the structured account-mirror
rate-limit error terminal made the first case green. Then the transient/no-nav
case failed with4navigate attempts; forwarding and guarding reopen made it green.
Full red/green logs remain in the operator's private session artifacts.

Selected validation:207tests across adapter, public-list recovery and proof-session
suites passed. Full typecheck and scoped lint pass; the new test passes formatting. Existing
source formatting/import diagnostics are unchanged baseline debt. Docs listing
and diff checks pass. No full production build or installed/live run was needed
for this source-only packet.
The regression is hermetic; no installed or live429cause claim follows from it.

## Review

One primary review against the fixed base above, with axes separate. Standards:
AGENTS.md, CONTEXT.md, docs/agents/codex-code-discovery.md, runtime-proof.md and
policies0008/0011/0018/0029; no accepted blocking findings. Spec: this contract,
Plan0469 recovery finding and public red/green evidence; no accepted blocking
findings. No pagination/coalescing refactor or additional discovery round.
