# Issue453 — shared exclusive-group admission policy

Source base: `b509d45fa52a605d0ba647554decf6d2344dad73`.
Worker branch: `feat/grok-repair-453-20261025`. Scope: approved Plan0457 ticket453.

The registry now owns one private `blocksExclusiveGroupAdmission` policy used by
`reserve`, `acquire` and `acquireProcess`. It retains fenced-state qualification,
exact exclusive group and ownership scope, and active/retiring/unknown-effect
custody. Callers retain their existing self-exclusion, ordering, conflict kind,
cloned conflict evidence and process qualification. File-backed locking and
publication are unchanged. No public behavior or operator workflow changes.

## Rule to public coverage

- The existing registry suite had no direct exclusive-group coverage. One bounded
  parameterized contract now exercises each public admission path against active,
  retiring, idle unknown-effect, settled idle, another group, another account and
  a runtime-profile alias. Active/retiring/unknown and alias custody return the
  exact `workload-owned` blocking target; settled/group/account controls admit.
  All lease states are established through the public lifecycle. Three named
  tests cover21 scenarios; expectations are literal policy outcomes.
- Existing `enforces browser and account ownership across AuraCall runtime
  profiles` and exact target/workload tests retain the wider ownership boundaries.
- Existing OS PID, separate SDK instance, dead-owner restart and live-follow child
  handoff cases retain process-binding and adoption behavior. The one-process
  reservation case retains the `process-owned` conflict.
- Existing `persists uniqueness atomically across file-backed registry instances`
  retains concurrent cross-instance admission, restart persistence and profile
  control ordering. The underlying locked write path is untouched; no new stress
  or private-helper assertions were added.
- Existing unknown-idle reacquisition, fenced retirement, stale claims and
  configured utility/traffic authority tests retain the public downstream seams.

## Focused validation

Baseline, before extraction: `pnpm vitest run
 tests/browser-service/tabLeaseRegistry.test.ts --maxWorkers=1` passed25 tests,
including the new contract. This is behavior-preserving maintenance; no defect
red is claimed.

After extraction: `pnpm vitest run
 tests/browser-service/tabLeaseRegistry.test.ts
 tests/browser-service/tabLeaseRestartReconciliation.test.ts
 tests/browser/configuredProviderTrafficAuthority.test.ts
 tests/browser/configuredChatgptUtilityAffinity.test.ts --maxWorkers=1`:
4 files,49 tests passed in6.21seconds (registry25, restart5, traffic5, utility14).
No retries or provider/native requests.

`pnpm typecheck` (`tsc --noEmit`): passed. Compiler execution was serialized.
`pnpm exec biome lint packages/browser-service/src/service/tabLeaseRegistry.ts
 tests/browser-service/tabLeaseRegistry.test.ts`: passed; the repository config
selects only the test file because `packages/` is outside its includes.
`git diff --check`: passed.

An additional explicit source-lint comparison using byte-identical temporary
copies and the root lint rules found the same baseline and repaired diagnostics:
three existing `noUndeclaredVariables` reports on `typeof left` in `sameWorkload`
and one existing `noUnnecessaryConditions` warning in `actionCountKey`; none is
in the extraction. These are outside the configured lint surface and unchanged.
An earlier broad temporary lint config aborted with a Biome stack overflow; the
bounded-copy comparison completed and did not change repository configuration.

CodeGraph initialized the isolated worktree and explored the registry/public
callers before editing. No central journal, ledger, domain authority or issue
state was edited. Primary owns integration and final intended-main acceptance.
Memory disposition: `forbidden`; Plan0457 explicitly prohibits memory writes.
