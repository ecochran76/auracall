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
