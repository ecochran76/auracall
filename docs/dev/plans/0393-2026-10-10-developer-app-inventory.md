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

## Corrective item IQ2 | 2026-10-22

Owner: ecochran76. Branch: fix/app-refresh-settings-budget. State: CLOSED.
Roadmap home: P87 existing developer-app inventory/tool refresh.

An authorized in-place refresh stopped before activation because its settings
reader allowed8seconds while backend admission could legitimately delay the
settings response longer. The exact owned lease recorded175 minute-budget
denials; same-tab diagnostic reload subsequently loaded correct app settings.
The pre-activation failure is retained; no refresh effect or calendar write is
claimed from that attempt.

Use8seconds plus the configured backend-admission wait allowance for the before
and after settings reads. Preserve the enclosing operation deadline and check
caller cancellation during polling. Keep exact account/app/endpoint/connection
and consent checks. No request-rate/cooldown change, app replacement, automatic
consent or ambiguous-effect replay.

Public refreshTools regression went RED for settings ready at20seconds under a
60-second allowance; cancellation also went RED by waiting20seconds after abort.
The repair passes101 focused/adjacent tests run with one worker, full typecheck,
compiled build and scoped lint. Unconfigured/exhausted budgets still stop before
click; cancellation stops promptly; existing identity/change guards remain.
Parallel test runs showed timing-sensitive fixture failures, so passing evidence
is explicitly the sequential suite. Installed qualification is pending.

Done when one installed in-place refresh preserves identity/connection and
returns the refreshed catalog, or an attributable live blocker is recorded.
The original ChatGPT calendar test remains a subsequent integration gate.

### Read-only navigation readiness

The first installed IQ2 qualification stopped earlier in readState, before the
refresh method: root document readiness exceeded a separate10-second window.
A public readState fixture using the real navigation helper reproduced the exact
root-navigation error with20-second readiness under a60-second allowance.
Inventory navigation/reload and exact refresh-settings navigation now receive
the same configured admission allowance. Other helper callers retain their
10-second default. The ignored preliminary settings-content wait is removed;
the stronger settings reader still requires a unique enabled Refresh tools
control and connected-account state, followed by exact endpoint/app checks.
Enclosing command deadline remains unchanged. 102 sequential tests, typecheck,
compiled build and scoped lint pass (external CDP naming warnings only).
No refresh activation or calendar write occurred in this failed qualification.


## IQ2 bounded closeout — 2026-10-23 UTC

PR371 merged470902bf7 after132 combined readiness/ledger tests passed. Installed
refresh3 reached activation and an attributable catalog response. Preservation
snapshot comparison remained unconfirmed; subsequent exact settings matched the
pre-refresh baseline. No ambiguous refresh was replayed, and no full-refresh
acceptance is claimed. This satisfies the packet's recorded-live-blocker stop
condition. The catalog already exposed the calendar tools; the operator completed
the disposable calendar create/rename/delete/status test successfully through
ChatGPT afterward. Independent HTTP429 warning diagnosis/PR372 remains separate.
Both clean integrated repair worktrees are closed, preserved branches remain, and
root main is anchored on canonical source. No further live effects in closeout.
