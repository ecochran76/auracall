# Plan 0386 canonical cache-reuse installation and cycle 3 control (#165)

Progress: outcome_progress for canonical install and verified cache reuse;
new-asset transfer and unchanged-repeat installed acceptance remain open.
Scheduler remains paused. One installed scenario ran for this repair; no retry.

## Authority and counter reconciliation

The stored operator goal says up to five repair cycles, with one installed
control per repair and a stop on failed verification. Prior notes incorrectly
used the number of individual probes as the repair-cycle limit. Preserve those
probe counters as history: five earlier probes were run across the trusted
pointer/single-visit repair and the viewer-scope repair, including host recovery
and supplemental ZIP/unchanged checks. Cache reuse is repair cycle 3/5. Its
serialized scenario is probe 6; it does not silently reset either count.

## Merge and installation

PR https://github.com/ecochran76/auracall/pull/171 merged through the canonical
workflow at 6e2b3478057c6959079d2abf40e89a1177b969f9. The owned detached canonical
worktree was freshly anchored to origin/main at that SHA, then installed with
pnpm run install:user-runtime-service. API service is active.
Canonical and installed LlmService SHA-256 both equal
48901c09d273f32df5eca46f6bb46361ca567367eb75d21b0fefd4ba4aa26ec9.
Canonical and installed history materialization service SHA-256 both equal
c58452dea03594f56722122b67c2bf1a4c1ab71b63e25ece0fb3a10e3f04aff0.
API readback confirmed scheduler state/posture paused and no foreground request.
The unrelated root worktree/CDP-endpoint lane was preserved.

## Installed scenario

Direct installed LlmService.materializeConversationArtifacts, using the real
cache store and provider path, selected only the cached PDF artifact
`download-dom:message-1:0` and unresolved ZIP `download-dom:message-8:0`.
Conversation: 6ab6d340-89e4-83ea-9990-d8fb278993e6.
maxItems=1, force=false, context refresh=true, single-conversation-visit=true,
120-second abort bound. Runtime/browser profile wsl-chrome-3; identity matched
eric.cochran@soylei.com. No prompt or scheduler resume occurred.
Remote View MCP transport was closed; installed Remote View exec on ordinary
desktop 4 retained the exact managed stealth Chromium browser instead.

Start 2026-10-03T22:26:58.963Z; terminal 2026-10-03T22:28:54.047Z.
The scenario failed. PDF was reused with materializationMethod=cached-provider-file,
2,132,164 bytes and SHA-256
d5b9b70647bb6ed38c83431ee2476501a4cd33f333203df8713b64828378cf08.
Manifest records ZIP status error with exact reason
`Bounded incremental control timeout`. No verified ZIP was produced by this
scenario. Only after reading that manifest should the harness's outer
`Exact cached/new asset pair missing` assertion be interpreted.

Method counters: one verified cache reuse, one provider invocation, one target
attachment, Page.enable=1, Runtime.enable=1. Downloads attempted/succeeded/failed
all zero, no pointer events, no recorded Page.navigate/reload. Network observer
counted 146 requests, one Document request in the scenario window; it is not
an all-target HTTP capture. New-transfer behavior cannot be accepted from these
counts. The second unchanged pass did not run after the first failed assertion.
The outer timeout does not identify the underlying stalled operation, and this
manual installed harness is distinct from a queued history-materialization job.
An independent warning observer was not present before submission, so full
Plan0386 Gate D warning-window acceptance is also withheld.

Exact managed browser was closed via CDP Browser.close in finally. Fresh OS
census found zero exact-profile Chrome processes; no SIGKILL-pending children.
Artifact manifest is in ~/.auracall/cache/providers/chatgpt/eric.cochran@soylei.com/
conversation-attachments/6ab6d340-89e4-83ea-9990-d8fb278993e6/artifact-fetch-manifest.json.
Private /tmp harness/receipt paths are ephemeral; this note preserves selected
input, installed identity, outcome and relevant counters.

Next: provider-free diagnosis of the stalled scenario, comparing its ownership,
traffic and readiness options with the successful queued product path. Avoid
attributing an outer harness timeout to the cache repair without a tight repro.
No additional provider control is run on this failed checkpoint. Gate D and
scheduler-resume decision remain open; issue 165 is not closed.
