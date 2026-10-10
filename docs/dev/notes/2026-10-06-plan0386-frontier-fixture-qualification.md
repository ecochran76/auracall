# Plan0386 frontier fixture qualification

Source: 5cceb03e0, fresh allowance of five live journeys on wsl-chrome-3.
Existing focused run: 295 tests / 8 files, plus persistence/freshness/metrics
16 tests / 3 files. All 311 existing tests pass; primary ran both without retries.
The strengthened durable deferred-horizon case adds one test: 312 distinct
tests across 11 files. The 9-test persistence rerun, typecheck, and touched-file
lint pass.
Provider-free fixtures use temporary stores and injected provider responses;
these tests do not prove installed provider outcomes.

| Criterion / role | Existing executable evidence | Qualification limit |
| --- | --- | --- |
| B changed index selects detail; A complete stays quiet | chatgptMetadataCollector: selects only changed rows; makes deterministic planner authoritative; skips fresh zero-project/library reads | Real collector with injected provider; no real download |
| One physical visit supplies detail and refs | conversationVisitBundle: binds receipt; rejects multiple navigations; collector coalesced context read | Synthetic CDP counters; live custody remains required |
| Child reuses collector snapshot | historyMaterializationService: does not refresh snapshot already refreshed; completionService: automatic child reuse IDs | Child creation and worker tested at existing separate seams |
| Transfer cap preserves C deferred/partial | historyMaterializationService: counts only new transfers against maxItems, 0/1/2 cases | Pending five assets and deferred evidence asserted; no production-cache mutation |
| A retained bytes and completed family evidence | historyMaterializationService: preserves historical assets before maxItems1 | Reads real temporary prior file after reconciliation |
| G guard/retry horizon | changeFrontierPlanner: retry horizon and provider-guard cases; state and cache round trips | Durable deferred horizon coverage strengthened below |
| Restart-safe epoch/checkpoint | cachePersistence: same/next epoch, visit receipt, non-visit decision; completionService disk round trip | Real temporary dual cache and completion store |
| No early retry / stable-key resume | planner: retry horizon, exact keyset checkpoint, absent-key safe restart | Deterministic planner assertions |
| Admission and guard containment | historyMaterializationService: stops reconciliation on guard; collector guard and persisted guard tests | Live observer and runtime hard stops remain required |

No duplicate end-to-end implementation was introduced to fabricate a green
fixture. Existing component assertions are mapped without calling them one
combined live proof. Durable deferred retry horizon is the one identified
coverage gap now qualified with the existing real-store round-trip fixture.

Live preflight: API28526, zero restarts, scheduler/all16 completions paused,
zero active/idle/retiring leases, profile-bound guard clear; no owned browser.
Installed collector/completion/store hashes match canonical built artifacts;
source between installed 6f4224e7e and current main is documentation-only.
Graphiti healthy; bounded atlas search returned no useful AuraCall evidence.
CodeGraph reports this worktree unindexed; native file/source fallback used.

Live fixture issue: catalog labels all331 rows incomplete (131 missing-assets,
59 partial, 141 stale). Previously captured JSON bytes remain readable, but its
row still has unknown asset completeness. Do not treat a readable single asset
as proof that its conversation is complete. Root-index qualification through the
normal authenticated refresh API is planned as journey1, before selecting live
B or claiming changed-frontier acceptance. It has no worker or new transfer.
Freeze index/epoch differences and select genuine changed/missing work from its
result; do not alter timestamps, delete caches, or send provider prompts.

## Journey 1: admission denial, no acceptance claim

The normal refresh API returned HTTP500:
`Provider traffic governor is required before physical action: provider:chatgpt:connect-tab.`
The request was root-conversations, steady_follow, explicitRefresh true,
collectorTimeoutMs600000, with no limit/guard bypass. Counted one of five.
No normal completion or child was created. Observer: zero attachments, samples,
requests, documents and downloads; no observer warnings or errors. A fresh
OS census found no Chrome root for the exact managed browser directory.
The retained JSON remains 22744 bytes with its previously frozen checksum.

Source diagnosis: refreshService only creates live-follow affinity when
`request.liveFollowOperationId` is supplied (lines334-356); the public refresh
route does not supply it (responsesServer3055 onward). Its collector governor
therefore remains absent. Existing refresh tests qualify the affinity-bearing
completion path, including admission bounds, using injected collectors; they
do not qualify the installed standalone refresh route. This is an entry-point
qualification failure, not evidence that changed-frontier selection failed.

The frozen admission-denial stop applies. Four journeys remain numerically
unused; they are not permission to retry after the stop. Changed B and quiet
complete A/B remain unqualified; no installed positive/quiet matrix is claimed.
Next bounded execution should use the normal unscoped completion seam after
the stop is explicitly cleared. No production governor bypass or source repair
was attempted in this qualification slice.

Final API readback: scheduler paused, all16 existing completions paused,
active leases0 and idle leases1. Native process census found no owned Chrome
root. The idle registry lease is retained as a cleanup limitation; no manual
lease release, service restart or browser cleanup was performed. Graphiti
memory disposition: unavailable, because focused discovery supplied no
qualified AuraCall group; machine-readable non-write receipt recorded.

## Journey 2 and qualified handoff defect

The operator cleared the first stop with “continue”; normal unscoped completion
ran on wsl-chrome-3. The account session matched and the index gained three
rows with one existing row changed. Automatic child settled skipped, one
selected candidate, zero transfers and duplicates. It chose a conversation
outside the collector's eleven reusable references, with a new snapshot.
One original target was retained, but physical census expanded from one to
three pages. Parent paused; child already running was observed to terminal.
A later new native Chrome root has unattributed custody. Do not call cleanup
accepted. Three journeys remain unused under the new custody stop.

Curated expected/observed matrix and cleanup limitations:
`docs/dev/notes/2026-10-06-plan0386-frontier-journey2.json`.

A real completion-service fixture now includes unscoped steady-follow and
qualified quiet-frontier variants. Initial test setup lacked its backlog
reader; that timeout was corrected before qualification. RED then directly
showed absent child conversationIds. A second RED showed an empty frontier
starting account-wide work. The repair binds ChatGPT steady-follow children
to the nonempty collector detail/retained-reference union and withholds the
child for a qualified empty frontier. Explicit scope takes precedence; full
sweep and other providers retain existing selection rules.

Final focused run: 171 tests across completionService and
historyMaterializationService pass, no retries. This includes two additional
variants in the existing fixture. Typecheck and touched-file lint pass. Earlier 312-test
qualification remains separate; no combined live acceptance is inferred.
The repair is source-only until integration, installation and a cleared live
gate. Physical-page fanout and post-cleanup custody are not fixed by this
child-scope change.

## Installed repair and continuation readback

PR221 merge 286451280 installs the qualified frontier child restriction and
empty-frontier suppression. Source repair validation is 171 focused tests in
completionService/historyMaterializationService plus typecheck and touched lint;
it does not mean all original 312 checks were rerun on the final merge.
Journey3/4 curated receipts separately qualify exact child frontier equality,
zero child snapshot refreshes, matching account identity, one observed page,
two valid nonempty DOCX captures and matching cached archive responses. Journey4
continues the still-partial row with maxItems1, retaining the first file and
previous JSON bytes/hash/mtime. The deferred horizon is durable and the follow
waits for its ordinary eligibility. Provider-free G assertions remain separate
from live quiet-complete and isolated changed-index proof, which remain open.
The navigation timing limitation in journey4 prevents a claim of zero physical
browser effects before its child work boundary. No guard was observed live;
containment remains provider-free evidence, not a manufactured live guard.
