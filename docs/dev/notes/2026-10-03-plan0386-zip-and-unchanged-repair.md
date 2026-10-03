# Plan 0386 ZIP control and unchanged-artifact repair (#165)

Progress: outcome_progress; efficiency regression reproduced and repaired locally.
Installed controls: 5/5 used. Scheduler remains paused. No additional provider
control ran after the unchanged-work failure. Goal acceptance is still open.

## Installed ZIP control 4

Installed single-artifact LlmService path used the current cached ZIP artifact
`download-dom:message-8:0`, exact filename `Bailey_FY27_Proposal_With_Figures.zip`,
and URI `chatgpt://download-button/message-8/0` from the conversation cache for
`6ab6d340-89e4-83ea-9990-d8fb278993e6`. No archive item existed for this ZIP;
the test called installed product code directly rather than synthesizing one.
Identity matched eric.cochran@soylei.com before transfer.

Control ran 2026-10-03T21:36:34.371Z–21:37:09.397Z. File is 1,721,645 bytes,
SHA-256 `c463e95ddac8fc739d5f5865986d63a33add63ff87696ec57a06be43bf8a46dc`,
matching the original successful agentic control. ZIP CRC test passed and its
single entry is Bailey_FY27_Proposal_With_Figures.docx.
Product telemetry: Input.dispatchMouseEvent=3, Browser.setDownloadBehavior=1,
Page.navigate=1, no recorded reload, one attempted/successful download.
File location: ~/.auracall/cache/validation/plan0386-cycle4-zip/.

A Network observer counted 200 requests and two Document requests in its
window. That aggregate is contaminated by the overlapping next job and is not
a clean ZIP-only traffic measurement. Method telemetry is specific to control 4.
The private /tmp harness and receipt are ephemeral; this note retains the exact
artifact input, installed path, resulting checksum and measured limitations.

## Installed unchanged control 5

Job `hmj_e02679d8002b49088543931ba2d19248`, force=false, artifacts only,
maxItems=1, refreshSnapshot=false. It started 21:36:54.259Z and completed
21:37:28.561Z, both 2026-10-03 UTC. It redownloaded the previously verified PDF,
with unchanged checksum d5b9b70647bb6ed38c83431ee2476501a4cd33f333203df8713b64828378cf08.
Six more mouse events and one download make the efficiency failure explicit.

The primary queued this check before control 4 had completed. Cancellation
returned HTTP 409 because it had already started. This sequencing mistake
prevents a claim of serialized provider-traffic acceptance. Fresh final OS
census found zero exact-profile Chrome processes. Preserve the failed check;
do not reinterpret succeeded file transfer as successful incremental behavior.
Authoritative full job is in ~/.auracall/runtime/archive/history-materialization-jobs/index.json.

## Local diagnosis and repair

The real materializeConversationArtifacts loop read attachment cache but always
invoked the provider. It also limited candidates before cache reuse, allowing
old assets to monopolize a one-transfer budget. History request force was not
passed separately to this loop.

A provider-free regression invokes the real service repeatedly, with real local
files and JsonCacheStore: first artifact, unchanged repeat, one added artifact,
unchanged repeat, explicit force, same-size corruption, deleted file, and absent
current evidence. Before repair the unchanged repeat called the provider again.
After repair unchanged repeats make zero materializer calls and the new artifact
is fetched exactly once within maxItems=1. The test also proves force bypasses
reuse and missing/corrupt files are fetched again.

Reuse requires matching artifact ID/name/URI, readable nonempty regular file,
matching stored size and matching retained checksum when present. Legacy files
without a checksum establish a local digest on first reuse; that cannot prove
their historical bytes against a missing prior digest. Fresh real transfers now
retain a checksum. Same-ID/name/URI provider content replacement remains outside
this proof; callers can use force when source revision evidence is unavailable.

Context refresh remains independent. Reused files appear as cached-provider-file
in the fetch manifest and do not consume the provider transfer budget.
No prompt or new provider asset was generated for this test.

Validation: focused 163 tests passed (artifact files, context, history service,
conversation freshness frontier); scoped Biome lint passed. Typecheck, production build, planning audit and diff hygiene also passed.

Remaining acceptance: install/integration of this cache repair; one serialized
installed unchanged/new-asset proof and isolated request counts. Five controls
are already recorded, so this slice does not silently open another live retry.
Scheduler resume remains separate from these repairs.

## Integration checkpoint

Repair commit e3494c4c2 is pushed and PR #171 is published:
https://github.com/ecochran76/auracall/pull/171 . Initial forge readback was
MERGEABLE/CLEAN with no reported CI checks. Subsequent published-diff and
review/status reads stalled; a bounded 20-second read timed out. The primary
terminated its own stalled read command before its following merge command
could execute. No merge or installed deployment is claimed. Preserve the root
worktree belonging to the separate CDP-endpoint lane. Next action is forge
readback, published diff self-check, merge and exact-canonical installation,
followed by reconciliation of the remaining live-control boundary.
