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
