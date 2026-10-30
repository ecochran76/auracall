# Plan0471 — Bounded ChatGPT conversation pagination

State: CLOSED
Owner: primary agent
Branch: fix/chatgpt-list-pagination
Target: origin/main
Base: 057b8a2426f3c055a0cbaa9b68176a2f3deef5ad

## Current State

Source implementation, public regressions and final local checks are complete. This follows the Plan0469 audit and installed Plan0470 recovery fix.
No merge, deployment, browser interaction or shared in-flight listing work here.

## Contract and seam

Use public createChatgptAdapter().listConversations with simulated external Chrome
transport and virtual time. Keep real authorization, DOM response normalization,
pagination, recovery and retry. Preserve first-observed ID order across changing
DOM windows, deduplicate IDs, refresh fields on repeated observations, and cap
stored/output rows at the requested limit. Progress means newly observed IDs,
not the current rendered row count. Reuse the initial listing observation before
scrolling. Preserve existing scroll/no-progress bounds. Cancellation during a
wait or stalled read/scroll must settle with the caller's original reason and
must not schedule another history command or reinterpret the reason as recovery.

No provider request, prompt, warning clearance, ownership change, rate-limit
change, permanent inventory cache, cross-workflow sharing, install or restart.
Already-issued browser commands cannot be undone by local cancellation.

## TDD evidence

Command: pnpm exec vitest run tests/browser/chatgptConversationPagination.test.ts --maxWorkers=1.

1. Changing two-row windows beyond five scrolls returned only f,g instead of
   a through h. A bounded map accumulates rows; its growing ID count establishes
   progress. The regression then passed.
2. The public operation emitted two unchanged initial rail reads. Passing the
   existing observation into history removed one; two scroll/read rounds now
   require five observed CDP operations instead of six in this fixture.
3. Cancellation during a wait missed the two-millisecond virtual deadline.
   Signal-aware waits and admission checks stopped subsequent reads and disposed
   the timer; the original reason is retained.
4. Stalled read and scroll cases remained pending after caller cancellation.
   The existing abort-race helper now bounds those waits. Neither case schedules
   another scroll after cancellation; both pass.
5. One review finding: a cancellation reason reading Connection failed entered
   recovery/retry, missed the deadline and produced an unhandled rejection on
   the old retry path. Abort checks before error classification and list retry
   make that reason terminal. Its regression passes without unhandled errors.

Row-limit, overshoot and no-progress controls retain bounded behavior. Exact
red/green logs and the frozen source patch are in operator-private run artifacts.
No source mutation or special test-only production seam manufactured these reds.

## Review and validation

One primary serial review, fixed base above. Standards: AGENTS.md, CONTEXT.md,
code-discovery/runtime-proof docs and policies0008/0011/0018/0029; no accepted
findings. Spec: this contract and Plan0469 pagination findings; one accepted P2
cancellation-classification finding, addressed by a public red/green regression.
Closed-world remediation only; no additional broad discovery or refactoring.

Local focused validation (Linux/WSL, Node22 toolchain, virtual time, one worker):
- pnpm exec vitest run tests/browser/chatgptConversationPagination.test.ts tests/browser/chatgptConversationListRecovery.test.ts tests/browser/chatgptAdapter.test.ts tests/browser/chatgptProofSession.test.ts --maxWorkers=1:216passed,4files,9.19s.
- pnpm exec tsc --noEmit:pass.
- pnpm exec biome lint src/browser/providers/chatgptAdapter.ts tests/browser/chatgptConversationPagination.test.ts:pass.
- pnpm exec biome check tests/browser/chatgptConversationPagination.test.ts:pass.
- git diff --check:pass.
Hosted GitHub Actions skipped under operator cost policy; passing local checks
satisfy validation. This focused Linux transport-fixture selection does not cover
hosted matrix platforms, a comprehensive suite, installed runtime or real provider
network behavior. CI exclusion does not establish merge/deployment acceptance.
Installed/live coverage and real HTTP savings are not established by this packet.
