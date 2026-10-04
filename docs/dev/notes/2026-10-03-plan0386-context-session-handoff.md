# Plan 0386: context-session handoff and installed proof repair

## Installed repair cycle 4, probe 7

PR 174 merged at a310ad9ab48ff91edd2ddde21b9d3b9cfca26fa0 and was installed
from the owned canonical worktree. Canonical and installed LlmService hashes:
81847449dbd703a44947fb7fff5cc41ff547e68e35a6cd452a6990734cce87ee.
Scheduler was paused; foreground requests zero. Remote View MCP transport was
closed; installed desktop 4 launcher retained the exact managed stealth browser.

Control started 2026-10-04T01:39:57.784Z, terminal
2026-10-04T01:41:55.877Z. It used the same direct installed service sequence
as probe 6: identity proof, fresh context, cached PDF plus unresolved ZIP,
force=false, maxItems=1, preserved interaction governor, single visit.
An independent DOM warning observer ran before proof through five seconds
after the materializer returned. It detected no warning. Its coverage was
visible alerts/dialogs, verification frames/title; this is not an all-surface
warning guarantee. No prompt or scheduler resume ran.

The identity-proof lease was released before the fresh read acquired a new
lease. Fresh context succeeded in 11066 ms, lastStage complete, errorCode null,
completedAt 2026-10-04T01:40:22.981Z. This is live evidence that the prior
read failure was removed by the proof-custody repair; the original exception
remains unavailable, so exact historical causality still rests on the replay.

The control failed later. PDF cache reuse verified 2132164 bytes and SHA-256
d5b9b70647bb6ed38c83431ee2476501a4cd33f333203df8713b64828378cf08.
The ZIP manifest records `Bounded incremental control timeout`; no download was
attempted, and the unchanged repeat did not run. Materializer telemetry:
one target attach, Page.enable=1, Runtime.enable=1, Runtime.evaluate=7,
zero mouse events, no recorded Page.navigate/reload. The page-target network
observer counted 178 requests and one Document request during the first pass;
that window excludes identity-proof setup and is not an all-target HTTP census.
The proof began on ChatGPT home and navigated to the selected conversation.

Browser.close ran in finally. Fresh OS census found zero exact managed browser
processes. The fresh-read lease 6a6da726-0e33-42de-b08b-3e678aab8753 was later
released by runtime maintenance; a scoped cleanup check found it already released.
Private harness/receipt: /tmp/auracall-repair-cycle4-incremental.{mjs,json}.
No provider retry ran after failure. Gate D remains open and issue 165 stays open.

## Repair cycle 5 local reproduction

getConversationContext creates a deadline-scoped options copy. The provider
retains its session on that copy, but the method did not return custody to the
supplied session-enabled options. Artifact transfer consequently saw no session
and attempted a second conversation-read admission. A real LlmService/JsonCacheStore
loop with the actual interaction governor and adapter admission helper reproduces
this in 32 ms using an injected clock. The provider seam retains a session as
the adapter does. Before the fix the selected file is absent and the session
cannot be reached by transfer; after the fix the file is written, no cooldown
sleep occurs, and the session closes exactly once.

Command: pnpm vitest run tests/browser/llmServiceFiles.test.ts -t 'fresh context hands'

The fix synchronizes the scoped session back to the caller's options in finally,
including removal after abort. Existing caller ownership and traffic governor
remain in force. It does not shorten cooldowns or widen provider deadlines.
At this source checkpoint no cycle-5 installed control has run.

Local validation: 184 focused tests, typecheck, build, scoped Biome, plan audit
and diff check pass. The red test took 32 ms, green 27 ms before broader checks.
