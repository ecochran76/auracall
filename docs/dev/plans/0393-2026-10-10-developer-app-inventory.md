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

## Corrective diagnosis IQ1 | 2026-10-22

Owner: ecochran76. Branch: fix/installed-plugin-query. State: IN_PROGRESS.
The original endpoint-removal hypothesis was disproven: same-tab diagnostic
reload receives installed200 after CLI exit. A speculative installed-query
fallback was tested, then withdrawn from source and restored out of the runtime;
it did not establish the original failure's cause. No provider prompt or app
mutation was submitted.

Live boundary logs show Network.enable and location reads returning, then
navigation waits inside ProviderTrafficGovernor.begin's interaction pacing.
The runtime profile's live-follow policy sets renavigationCooldownMs=120000,
pageRefreshCooldownMs=120000 and maxBrowserInteractionsPerMinute=6.
LlmService.resolveBrowserInteractionGovernor applies these settings to foreground
utility operations too. The shortened 90/100/180-second diagnostic wrappers
could expire before the navigation sequence completed; they do not prove a
browser deadlock or failed login. The candidate second-client warning deadlock
belongs to another workflow and was rejected for this caller.

One original installed apps-list run is now allowed its full native timeout.
Stop condition: record that outcome and the exact remaining integration gate.
No cooldown reduction, warning bypass, speculative source change or calendar
mutation belongs to this diagnosis. Original runtime hashes and rollback
custody are preserved privately; temporary diagnostic hooks are removed.

### Full-budget result

The unmodified installed list completed inventory, then exited1 in cleanup with
`Provider observer cleanup failed.` and cleanupunknown. Configured pacing
explains the apparent hang; observer cleanup is a separate real failure.
`mutationAudit.ts` aggregates backend-admission and warning-observer disposal
errors. The generic JSON result hides the attributable leaf. One bounded
read-only capture now projects native AggregateError.errors/Error.cause privately
at the existing CLI formatter, with automatic module restoration on exit.
A qualified file-completion continuation is registered. No prompt/calendar write
has been sent. Do not suppress unknown cleanup or infer source acceptance from
inventory completion. Next: identify leaf error and reproduce its exact ordering
at tests/browser/backendRequestAdmission.test.ts before proposing a fix.
