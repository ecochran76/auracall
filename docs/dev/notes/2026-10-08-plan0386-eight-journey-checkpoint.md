# Plan0386 eight-journey checkpoint — 2026-10-08

Plan0386 remains **OPEN**. Two reproduced source defects are merged and installed. Journeys7/8 have two verified positive file captures. The original changed-index/quiet-complete matrix and dependent scheduler acceptance are not established by those results.

## Landed and installed

- PR232, merge `c9ccbe2026f3ea742ae9e0cd56012342cc2e773d`: single-visit context reads reuse an already ready same-project conversation even when its URL contains a project title slug. Wrong-project navigation remains governed. Public context-read regression fails without the repair; 351 affected tests, typecheck and touched lint pass.
- PR233, merge/current installed source `5b05f5371a6de1cca103d35145dc51a076d8131f`: freeze the one-row traffic budget for the same normalized persisted cursor row that the reader consumes. The existing continuation fixture reproduces the exact `detail/page_navigate at limit 0` failure before the repair. 159 affected tests, typecheck and touched lint pass.
- The installed adapter SHA is `3d6e87e881a046fc2962feef423353b7daffb1e958e776e214f556e4af42da03`; collector SHA is `3c96978926273d9a078b3d689b56c5491c1526b6358316a346493d846c2ccb90`. Canonical and installed module bytes match. The source is installed from the isolated canonical worktree, preserving unrelated dirty work in the original checkout.
- The selected browser-family display was repaired from unavailable `:923` to responsive `:0.0`. Custom Chromium binary and other browser-family semantics were preserved. The first successful fresh startup verifies the environment repair separately from source behavior.

## Fresh allowance

The [control ledger](2026-10-08-plan0386-eight-journey-control.json) owns all charges. Journey3 remains charged even though it resumed an already running child; it is not refunded. Historical exhausted allowances remain separate.

| Journey | Observed outcome |
|---|---|
| 1 | DevTools startup failed; deterministic display diagnosis and repair followed. |
| 2 | One-page root collection added one index row. The original monitor paused before a late child, which later settled skipped. |
| 3 | Conservatively charged resume of that existing child; no new child. |
| 4 | Repeated detail navigation limit1 denial; child terminal skipped, zero transfers. |
| 5 | Installed route repair; resumed row denied at limit0 because its budget key selected row zero. Child terminal skipped, zero transfers. |
| 6 | Installed cursor repair; successful resumed context read, one detail document and same-project slug reuse. Child reused its snapshot and skipped because no materializable artifact was exposed. |
| 7 | Previously failing first conversation now read successfully. Automatic child captured 6,172 readable Markdown bytes, with matching local/job/archive hash, one manifest entry, one observed download and zero child snapshots. |
| 8 | Second previously failing conversation now read successfully. Child captured 10,860 readable Markdown bytes, matching local/job/archive hash, one download and zero snapshots. Journey7 and original baseline assets remain unchanged. |

Journeys6–8 exercise both repairs on installed source. Their identities match; each observation has one physical page and one collector conversation document. Early observer and terminal-monitor gaps are retained in individual receipts, not represented as continuous coverage. A successful skipped job is not quiet acceptance.

## Requirement audit

| Requirement | Evidence and disposition |
|---|---|
| Complete readable A | Local research qualifies three cached assets with matching archive bytes. All retain their original size/hash/mtime through journey8. A is outside the current normal root sample, so this alone does not prove a sampled quiet-complete row. |
| Independently changed B with missing local asset | The root index adds genuine row `6ac76440-d80c-83e9-8b84-df32c009247d`; existing fingerprints do not change. Its missing downloadable asset is unqualified. Journey7's positive conversation was not independently index-changed and had no frozen pre-journey absence snapshot. **OPEN**. |
| One governed visit and retained child references | Journeys6–8 show one collector detail document, semantic slug reuse and zero child snapshots on installed source. Proven for those rows, not the unqualified B role. |
| Positive readable bytes and archive | Journey7: 6,172 UTF-8 Markdown bytes, SHA `465fe0e181aaea03f524abb3a076e05bd2843bc85be62a171399454e6e210ebc`; archive HTTP200 returns the same bytes. The manifest matches path, size and MIME type; its schema has no checksum field. |
| Quiet complete A/B repeat | Journey8 preserves journey7 bytes, manifest identities/counts and archive bytes, but no qualifying normal unscoped complete A/B repeat has been observed. Positive capture or preservation of an out-of-sample A cannot substitute. **OPEN**. |
| C cap and continuation | Prior accepted capped-continuation receipts remain valid. Fresh journeys7/8 each obey maxItems1 and transfer one distinct artifact without changing prior assets. |
| G persistence and eligibility | Existing round-trip fixture now composes reopening the temporary store and exact before/at-horizon planning. 99 selected persistence/planner/completion tests pass. A hash-bound guarded-only probe runs the real collector/completion with materialization service available, excludes G and creates no child; effect sentinels remain zero. Full mixed A/B/C/G and completion-state reload evidence remain **needs_evidence**. |
| Scheduler continuation | Not executed; it remains dependent on changed/quiet acceptance. Global scheduling stays paused. **OPEN**. |

## Next boundary

Do not begin a ninth journey from this allowance. Preserve the parent and scheduler pauses, terminal children, files, manifests and raw observations. Before a renewed provider attempt, qualify an independently changed B with attributable locally missing work and a complete sampled A, then freeze the normal unscoped changed/quiet controls. Keep the scheduler control dependent. No provider content creation, forced refresh, cache erasure or budget relaxation can manufacture those roles.

The installed `ask-matt` entrypoint was not found in the advertised catalog or bounded local skill search. The available research, diagnosing-bugs and TDD workflows were used. Each production repair has a directly observed failing test; no source-only result is treated as Plan completion.

## Terminal checkpoint

Eight of eight charged journeys are terminal; zero remain. The two verified captures total 17,032 bytes. API7729 has zero restarts since the successor reload. All 17 active-list completion records are operator-paused; queued/running/idle-waiting counts are zero. There are zero active materialization jobs, held leases/controls, exact managed browser roots or processes for the custom Chromium binary. Provider guard is clear, and the global scheduler remains paused. All three original baseline assets still match size/hash/mtime and HTTP200 archive bytes. Journey7's file, manifest identities/count and archive bytes also remain unchanged after journey8.

[Final machine-readable readback](2026-10-08-plan0386-final-readback.json) and [validation receipt](2026-10-08-plan0386-validation.json) preserve the evidence. The checkpoint is before the 12:40 UTC control deadline and original 12:45:23 UTC two-hour limit. The goal remains incomplete; no plan-close or goal-complete claim is made.

Memory disposition: **unavailable**. Focused discovery did not identify a qualified AuraCall group; no Graphiti write was attempted.
