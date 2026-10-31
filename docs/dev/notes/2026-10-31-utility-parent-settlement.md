# Utility parent settlement diagnosis and repair

Source checkpoint: c5351194282e2c90555aec7c17ddb5dadfec9072, main-based fix/repeated-utility-lease. Initial investigation started from installed-source familyc9d182957; only the isolated repair was rebased onto current main, preserving unrelated attachment/diagnostic work. Conflicts were documentation headers, resolved by adding only this packet's text to main. Product source/test bytes remained identical through the rebase.

## Feedback and minimization

One unattended command: `pnpm vitest run tests/browser/utilityParentSettlement.test.ts --maxWorkers=1`.

Before repair:2failed/2passed,1.89s total/23ms body. Budget-off and genuinely unfinished-request controls pass. Budget-on and completed-request cases fail on the second sequential read:

```
Caused by: Error: Live-follow crawler lease acquisition failed: process-owned.
```

After repair:4/4pass,1.88s total/18ms body. No Chrome, credentials, timeouts, HTTP or concurrency is needed to reproduce. The budget-off/on pair changes only request budgeting; this is the correct public call pattern and exact original error. Earlier provisional two-utility expectations were rejected against the deliberate one-utility-tab-per-process contract, not turned into a policy change. Initial local fixture setup errors and the rejected shared-filter attempt remain in private diagnostic logs.

## Cause and repair

The utility's interaction governor still held its read reservation in started state when owned-request reconciliation scanned same-operation records. That scanner correctly treats unfinished actions conservatively, but the utility had not yet settled its own completed parent. It therefore marked the parent/lease outcome-unknown and returned the read result; the next call was refused. Retained helper metadata/ledger matches this pattern: the final unknown interaction is a read-only parent and there are no separate backend-request records. Raw state and IDs remain private.

Move the existing governor.close before backend request reconciliation within utility settlement. A genuine unfinished backend request still marks the lease unknown and blocks reacquisition. The shared request authority, registry, warning/admission rules and one-utility-tab-per-process contract are unchanged. An initial request-class filter was explicitly rejected after five active-action safety regressions; it is absent from the final diff. The root cause is ordering, not missing tab capacity.

## Final validation

Primary, Linux/WSL Node24.18.0, dependencies reused from the pinned workstation installation; no hosted runner coverage or paid CI. Source-only change, no release cut.

- Eight affected files: utilityParentSettlement, backendRequestAdmission, configuredChatgptUtilityAffinity, configuredChatgptUtilityAffinity.production, chatgptAffinityExecutor, configuredProviderTrafficAuthority, liveFollowTabCoordinator and tabAffinityCoexistence. `pnpm vitest run <those test paths> --maxWorkers=1`:181/181pass, no failures/skips. Vitest75.53s; external time74.21wall/20.06CPU/maxRSS345492KiB. Includes the five previously failing safety cases.
- `pnpm run typecheck`:pass, full TypeScript project.
- `pnpm exec biome check src/browser/configuredChatgptUtilityAffinity.ts tests/browser/utilityParentSettlement.test.ts`:pass, no fixes/diagnostics.
- `git diff --check`:pass; no DEBUG-utility instrumentation. Provisional fixtures moved to a clearly marked private diagnosis-debug directory, not production tests. Focused feedback and final affected suite both re-exercise the original failing call pattern.

No product runtime, browser process, OAuth grant, provider source or saved lease was changed. The source fix is not installation/native-acceptance proof. Existing poisoned leases require separate qualified reconciliation; no fence was cleared automatically. Native connector reauthorization remains pending. Shared custody is the published source branch/PR; all worktrees and dependent refs retained.

Planning validation: `pnpm plans:audit` exits1 with69existing errors. A clean archive of exact origin/main run through the same auditor produces the identical69finding strings; no new findings, and the new plan is accepted. The source-main plan serial0475 was already occupied, so this packet was renamed0476 during integration without resetting the investigation. This is a qualified unchanged baseline, not an all-green library audit.
