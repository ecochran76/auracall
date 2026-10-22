# Plan0393 | Independent app inventory and Developer-mode observation

State: OPEN
Owner: ecochran76
Work item: https://github.com/ecochran76/auracall/issues/225
Branch: fix/issue225-app-inventory
Target: main

## Current State

Installed AuraCall0.1.1 apps list fails after45seconds or reports missing Developer-mode switch, despite authenticated existing-app retrieval. Stage logging reaches complete installed-app response, then Developer-mode discovery fails. Current settings redirects expose no labeled Developer-mode switch. A public adapter replay reproduces the missing-switch failure in2.26seconds with complete synthetic installed inventory. Unrelated root changes remain preserved in an isolated worktree based on591a11824.

## Bounded scope

Return complete app inventory when Developer-mode UI is unavailable; represent that observation as unknown rather than enabled/disabled. Preserve exact account, complete-inventory and affirmative Developer-mode guards for create/replace. Keep genuine browser/navigation failures visible. No app refresh/deletion, auth reset, provider prompts, unrelated runtime changes or broad refactoring.

## Feedback loop and acceptance

`pnpm vitest run tests/browser/chatgptDeveloperAppInventory.test.ts` is RED at the real readState seam: complete inventory currently throws missing-switch error. Rank stale switch prerequisite above incomplete inventory and attachment stall; vary only the Developer-mode observation handling. Require regression GREEN, adjacent CLI/browser gates, typecheck/build/scoped lint, independent Standards/Spec review and linked PR custody. Installed read-only apps list must return exact current account/app inventory without direct fallback before claiming live repair. Keep source, install and live results separate.

## Acceptance

PR248 integrated c629aeb0ca666ee633bd7ff0e1475e6cf29f00b8. Source regression, 79 focused/adjacent tests and installed original command pass; independent Standards/Spec review has zero findings. See [bounded installed receipt](../notes/2026-10-10-plan0393-inventory-acceptance.md). Remote CI supplied no checks. Source and scoped two-module installation are accepted; live create/replace remains untested.

## Corrective item IQ1 | 2026-10-22

Owner: ecochran76. Branch: fix/installed-plugin-query. State: IN_PROGRESS.
The historical acceptance above remains valid for its frontend version. Current
Plugins UI hydrates an account-bound installed React Query collection without
emitting the legacy installed endpoint. Existing-app inventory therefore waits
and returns incomplete despite visible membership.

Repair only existing-app readState: pass the verified account ID to a passive,
bounded, allowlisted query-cache projection. Require the exact five-part key,
success/idle/non-invalidated state, unique collection and exact installed plugin
IDs. Batch catalog metadata never establishes membership. Preserve legacy
network capture, exact app/auth selection, abort cleanup and mutation gates.
Public adapter regression went red (empty/incomplete) before the fix and green
with the actual projection expression executed in a VM fixture. 154 adjacent
tests, full typecheck and compiled build pass. Independent scoped review found
no blocker; primary independently reran the tests. Installed qualification is
pending. Post-create capture and genuinely empty installed collections remain
fail-closed outside this existing-app test repair. No app replacement, account
reset or provider prompt is part of IQ1. Done when the installed original list
returns complete inventory for the exact account and selected existing app.

### Live correction | IQ1 is not the root repair

The first frontend-removal hypothesis was disproven: the same tab loads
`/backend-api/ps/plugins/installed` with HTTP200 after the owned CLI exits.
During the owned run, Plugins displays Failed to fetch and backend resources
fail. Installed IQ1 did not complete the original command; it ended with
owned cleanup unknown. The two-module cache patch was restored to the original
runtime. Keep this branch as a supplemental candidate, not an accepted live
repair. Investigate owned request admission and its first failure before further
provider effects. No prompt or calendar mutation ran.
