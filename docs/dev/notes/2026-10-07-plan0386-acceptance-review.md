# Plan0386 acceptance review — 2026-10-07

## Scope and validation

Serial primary review, closed world: fixed base `6a07668e481ef6cb46f816a8e8a2dcca63f25337` through tip `6de2811071285c09abfcbab1f57ad1b6ba1c7a46`. The comparison point was stated as the default after the optional scope question received no answer. The reviewed tree equals the PR230 merge tree `c1248c2616e5ea6fc8557a6b195235698e452ea7`. Diff: 33 files, two product source files, three test files; remaining changes are documentation and receipts.

Authority: [Plan0386](../plans/0386-2026-10-01-chatgpt-materialization-surface-repair.md), changed-frontier acceptance criteria at lines 748–830. This review does not change those criteria or authorize provider work. The ten-journey allowance is exhausted.

Fresh provider-free validation: `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts tests/accountMirror/changeFrontierPlanner.test.ts tests/accountMirror/cachePersistence.test.ts tests/accountMirror/completionService.test.ts tests/runtime.historyMaterializationService.test.ts` — **260 tests, five files passed**, 4.73 seconds. These checks qualify component seams; they do not establish live acceptance.

## Standards

**Accepted findings: zero.** The completion service restricts steady ChatGPT child work to the collector's fresh and retained frontier and suppresses a child for a qualified empty frontier. Explicit scope, full sweep and other providers retain their existing behavior. Worker retry rotation remains inside selected IDs and matches provider, runtime profile and asset kinds. Endpoint-missing outcomes become failed/retryable without inventing routeability proof.

The relevant tests cover the changed behavior, including retry ordering with force enabled and disabled. No reproducible defect justifies another source patch or a duplicate test. Repository architecture favors retaining these existing seams. No unrelated refactoring is recommended.

## Spec

**S1 — blocking Plan closeout: isolated changed-index acceptance is missing.** Plan lines 783–787 require a genuine independently changed B epoch, exclusion of already complete A, one governed B visit, retained references without child snapshots, a newly readable missing asset, and unchanged A bytes/hash/mtime. Journeys 11–15 all retained fingerprint `sha256:76881dbbcceecc45725e8fffc7548bd1` and partial/deferred status. Their five successful captures establish continuation and integrity, but cannot qualify the B epoch transition.

**S2 — blocking Plan closeout: quiet-complete repeat is missing.** Plan lines 788–792 require a normal unscoped repeat over complete A/B with zero conversation navigation, snapshots, resolution and downloads, plus stable manifest/archive counts and identities. The completion-service quiet-frontier test uses injected collector results; it proves child suppression, not the composed live repeat. Skipped jobs alone do not meet this criterion.

**S3 — needs_evidence: composed guard/reload observation.** Cooldown admission and temporary-store persistence tests pass. The report does not establish a composed normal collector/completion/worker run with a persisted G horizon and zero pre-horizon effects. This is an evidence limit, not a demonstrated guard defect. Earlier child navigation before `providerWorkNotBefore` does not independently establish a G-horizon violation.

The deferred C criterion has positive capped-continuation receipts, zero child snapshot refreshes and retained-file integrity. Complete inventory remains unproven. Scheduler acceptance remains a separate gate after changed/quiet acceptance.

## Next bounded packet

A cache-only read at `2026-10-07T18:03:17.050Z`, with provider detection disabled, found 348 rows and 23 metadata-complete candidates (see companion census). This replaces the earlier no-complete-candidate observation for fixture selection only. Metadata completeness does not prove locally readable assets, current provider state, or unchanged integrity.

First qualify one complete A using existing durable manifests, archive identities and local bytes, and locate an independently changed B with attributable before/after index evidence. Preserve the source artifacts and qualify C/G alongside them. Stop if these roles cannot be established without provider effects. Once qualified, obtain a fresh finite allowance for the normal unscoped changed run and quiet repeat. Do not synthesize B with prompts/uploads, reset caches, substitute explicit scope, or reuse the exhausted allowance. Plan0386 remains **OPEN**.
