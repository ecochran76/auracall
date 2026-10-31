# Plan0470 — Preserve conversation-list recovery constraints

State: CLOSED
Owner: primary agent
Branch: fix/chatgpt-list-recovery-options
Target: origin/main
Base: 563faa1a7e0e2cb5b334398c245f092c273689e8

## Current State

Source and authorized installed acceptance are complete. PR512 merged at
57df62b52f88affdf28486f456af23be3d3c2fc9. CLI/MCP/API now select the immutable
user-runtime-list-recovery-79cb4ac9b prefix built from source79cb4ac9b.
All658compiled files match; installed public regressions pass2cases, fresh MCP
initializes65tools and exits cleanly, CLI reports0.1.1. API3345379serves status,
desktops and console200. Scheduler pause,23paused completion identities/states,
config/environment bytes and four native browser generations are preserved.
Previous prefix/wrappers remain rollback evidence. No browser restart or provider
prompt was used. CI was excluded by operator direction.
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

## Installed qualification boundary

The public regressions execute the installed compiled adapter against an external
Chrome transport fixture. Initial Vitest dependency externalization bypassed the
fixture and caused a loopback attachment timeout; explicitly inlining installed
modules corrected the harness without changing production. Both cases then pass.
The pre-promotion status allowance of3s was too short;30s readback verified the
baseline before any wrapper change. Promotion restarts only the API, from
PID1559161to3345379. No claim follows that live concurrent429s are resolved;
pagination and shared in-flight listing work remain separate follow-ups.
