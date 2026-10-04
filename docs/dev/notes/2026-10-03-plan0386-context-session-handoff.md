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

## Final installed control and actual ChatGPT facade correction

PR 175 merged at 2d57e3a2d192009a46e3f800749a4591acec6798 and was installed.
Canonical/installed LlmService SHA-256:
74d0da25cf51aad5d43aedcdd28a73e7ba0dfdcdde430ff01a0946e66858e3b0.
Repair cycle 5, probe 8 ran 2026-10-04T01:50:53.303Z through
2026-10-04T01:52:49.534Z. Fresh read succeeded in 10681 ms, completed
2026-10-04T01:51:17.673Z. PDF reused with its prior verified digest; ZIP again
recorded Bounded incremental control timeout before download. No unchanged
repeat ran. Zero warnings observed under the same observer coverage described
above. First-pass page-target network window: 175 requests, one Document;
whole observer window including proof: 230 requests, two Documents.
Proof telemetry records one Page.navigate. First-pass telemetry records one
target attach, Page.enable=1, Runtime.enable=1, Runtime.evaluate=7, no mouse
input, no Page.navigate/reload. Downloads attempted/succeeded/failed all zero.
These counts do not represent all-target HTTP traffic.

Browser.close ran; fresh OS census has zero exact browser processes. Proof
lease 72f8a5c7-2c15-446e-82e6-c2770f0c2632 released as preserved; read lease
8ba06329-c628-4bd1-9a37-317b79fda58d released by runtime maintenance as
already-missing. Receipt/harness: /tmp/auracall-repair-cycle5-incremental.{json,mjs}.
All five repair cycles are now consumed; eight historical individual probes
remain separate history. No further provider control is authorized by this loop.

The base-service regression was insufficient for this installed path. The
actual ChatgptService wraps getConversationContext in runWithUtilityAffinity,
which makes another options copy for an explicit target. Returning session
custody from the base method reached that wrapper's copy, not the artifact
materializer's options. The regression now uses createLlmService('chatgpt')
in tab-affinity mode with the real facade and a provider-retention fixture.
It failed in 340 ms even with PR 175 present. Returning custody from the
explicit-target utility wrapper made the same test pass in 294 ms. It asserts
file production, zero duplicate cooldown sleeps, and one session close.
This fixes the actual service topology without weakening the governor.

This final facade correction is source-only: no installation or extra live
attempt follows the failed fifth control. Incremental ZIP capture and unchanged
repeat remain unaccepted. Gate D is open, scheduler paused, issue 165 open.

Temporary diagnostic scripts were moved to /tmp/auracall-plan0386-debug/
with private directory permissions; the JSON receipts remain at their recorded
/tmp paths. No temporary instrumentation remains in product or test code.

Final source-only facade validation: 198 focused tests in eight files pass,
including ChatgptService, actual-facade custody, context/files, proof custody,
recorded ZIP replay, lifecycle, traffic authority and history jobs. Typecheck,
build, scoped Biome, plan audit and diff check pass. No retry or live acceptance
is inferred from this local result.
