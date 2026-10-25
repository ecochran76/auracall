# AuraCall final repair range code review

Reviewed:4ffe87be25d53dc5ec309ba011a7b53882f11bcf...92170f6d1bc4b8f3b25a303b8e5f67078f58c769.
Exactcommand:git diff 4ffe87be25d53dc5ec309ba011a7b53882f11bcf...92170f6d1bc4b8f3b25a303b8e5f67078f58c769.
20commits;46files,3554insertions/177deletions. Fullcommitlist and patch saved alongside this report.
This is the newly requested review of the completed repair range, not a continuation/reset of the completed implementation goal.

## Standards

No hard documented-standard breaches identified. One accepted P3 nonblocking_backlog judgment:
possible Duplicated Code in packages/browser-service/src/service/tabLeaseRegistry.ts:458–463,493–496,796–801.
The exclusive-group active/retiring/unknown-effect predicate is repeated in three admission paths.
Architecture policy0008 favors concentrating consequential knowledge; the smell baseline is a heuristic,
not a hard rule. No current divergence was proved. Extract one private predicate during future registry maintenance.

Sources:AGENTS.md,CONTEXT.md,README.md,docs/testing.md,docs/agents/{codex-stack,codex-code-discovery,runtime-proof,domain}.md,
docs/dev/policies/{0008-architecture-guardrails,0009-documentation-change-control,0018-validation-and-handoff,0029-code-testing-discipline}.md.
No CONTRIBUTING or CODING_STANDARDS file found. Tooling-enforced styling excluded.

## Spec

### P1 — Validate browser generation before accepting target-loss evidence

Disposition:blocking. Source:src/browser/grokHistoryContinuation.ts:137–155; generation comparison only runs at157–159.
#442 requires scope/account isolation; docs/grok-mirroring.md:42–43 promises exact browser-generation custody.
The target list is queried through the supplied endpoint. If the saved target is absent, its idle lease is marked lost/released
before comparing stored endpoint/PID fingerprint. Thus absence from a different browser is treated as proof about the original browser.
Controlled reproduction acquired/idled browserA target at localhost:4000/PID111, then requested same query at localhost:4001/PID222.
It was admitted, original lease became released, and a new browserB lease became active. No real browser was involved.
Fix direction:validate stored browser generation before interpreting target absence or changing/releasing the original lease.
Confidence:high; primary independently executed generation-proof.ts with the real file-backed lease registry and isolated home.

### P2 — Relative-time observations make unchanged rows look changed

Disposition:blocking. Source:src/browser/providers/grokHistoryInventory.ts:17–19,400–406,435,282–291.
#443 requires an unchanged account larger than a cycle to avoid archive replay and use an evidenced incremental frontier.
Fingerprint hashes updatedAt exactly, but the DOM reader derives today/yesterday/relative labels from Date.now().
An unchanged relative-only row therefore hashes differently each observation, misses the known frontier, counts as changed,
and repeatedly traverses the unchanged archive using follow continuations. Keeping phase=follow does not make that incremental.
Controlled reproduction used the actual DOM expression with a valid time element containing text today and no absolute datetime,
then the actual inventory collector. At03:00/03:01, timestamps1792897200000/1792897260000 differed; returnedAsChanged=[a],reason=page-limit.
Fix direction:separate unstable relative observation-time estimates from stable row change identity; preserve genuine absolute timestamp changes.
Confidence:high; agent proof and primary rerun persisted as relative-time-proof.ts/log.

The previously repaired loss of later observed rows is fixed in this head; explicit partial/full_sweep limits are not treated as a missing global ordering guarantee.
No other substantiated Spec candidate or scope creep identified.

## Evidence and reconciliation

Independent Standards reviewer:/root/final_range_standards,terminal success; Spec reviewer:/root/final_range_spec,terminal success.
Primary inspected exact changed predicates and both causal paths and independently ran the generation proof and relative-time proof.
Reviewer candidates were reconciled as two Spec blockers and one Standards nonblocking backlog judgment.
Fresh complete issue bodies/comments440–444 are saved as issue-N.json. All remain historically CLOSED; review did not mutate tickets.
CodeGraph query returned stale/missing new symbols; current pinned diff/source supplied final evidence. No index regeneration was needed for known-source reads.
No comprehensive suite or native/provider acceptance run. Both repros use controlled inputs; repository and installed runtime were unchanged.
Artifacts live in user-scoped review storage to preserve the read-only repository state while retaining reproducible evidence.

Memory disposition:forbidden. Developer prohibits memory writes without an explicit request to remember.
Non-write receipt:memory-disposition.json alongside this report. No memory-cloud write authorized.

Standards:1accepted P3 nonblocking concern,no hard breaches. Spec:2accepted blocking findings,highest P1. Fix Spec blockers first.

Recorded:2026-10-25T04:12:54.672136+00:00
