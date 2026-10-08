# Plan0386 guard reload qualification — 2026-10-08

The existing cache-persistence round-trip case now composes persistence, a newly opened dual cache store, work-state normalization, freshness derivation and the frontier planner. Its deferred row retains the eligibility horizon across an epoch change. At `2026-04-29T13:59:59.999Z` it must return `defer / retry_not_before`; at the exact `14:00:00.000Z` horizon it must return `visit_once / detail_or_index_changed`. A final cache read asserts the same retained work state, including physical counters and checkpoint metadata.

Seam: `createCacheStore` plus `createAccountMirrorPersistence`, consumed by `planAccountMirrorChangeFrontier`. This extends the maintained round-trip fixture rather than adding a parallel fixture or product change. Temporary-store cleanup remains in its existing `finally` block. All 99 selected persistence/planner/completion tests pass, with typecheck and touched-file lint:

```sh
pnpm vitest run tests/accountMirror/cachePersistence.test.ts tests/accountMirror/changeFrontierPlanner.test.ts tests/accountMirror/completionService.test.ts
pnpm run typecheck
pnpm exec biome lint tests/accountMirror/cachePersistence.test.ts
```

This qualifies the persisted horizon and planner boundary. It does not establish the complete normal collector/completion/worker run with G excluded from every physical effect. The [prior review](2026-10-07-plan0386-acceptance-review.md) S3 therefore remains `needs_evidence` at that wider scope. Changed-index positive, quiet-complete repeat and dependent scheduler acceptance also remain open.

## Composed guarded-only control

The hash-bound [probe](2026-10-08-plan0386-guard-composed.mjs) and [result](2026-10-08-plan0386-guard-composed.json) now add the guarded-only normal unscoped path on installed canonical5b05f5371. It writes G to a temporary dual cache, records a future retry horizon, reopens the store, and passes its reloaded state through the real collector and completion service. A real materialization service is present behind a counted creation boundary, with provider callbacks that fail if invoked. One normal steady-follow collector pass returns `defer / retry_not_before`; completion creates no child despite injected positive local backlog. Conversation work, snapshot refresh, resolution/download and child-creation counters are all zero. The persisted state remains unchanged.

```sh
node docs/dev/notes/2026-10-08-plan0386-guard-composed.mjs
```

The probe verifies hashes for its eleven installed modules before creating temporary state, and cleans up only its own temporary directory. It uses fixture identity and injected provider client callbacks; it does not call the live API or browse. Initial harness failures omitted refresh completeness metadata; correcting that fixture completed the probe without a product patch. Those failures do not constitute a production defect or red-green source repair.

This establishes the composed guarded-only negative path in addition to the maintained exact-horizon checks. A mixed A/B/C/G pass and live guard behavior remain outside this observation; do not substitute this probe for changed/quiet live acceptance.
