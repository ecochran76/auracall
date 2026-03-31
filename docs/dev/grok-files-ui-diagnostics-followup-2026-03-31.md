# Grok Files UI Diagnostics Follow-up

Date: 2026-03-31
Status: complete

## Goal

Extend the existing browser-service-owned `withUiDiagnostics(...)` adoption into
Grok's file-management surfaces before adding any more provider-local selector
workarounds.

## Why this is the current working set

The package-level diagnostics helpers already exist. The next useful work is not
another extraction; it is adopting those helpers on the remaining fragile Grok
file surfaces so failures arrive with immediate UI evidence:

- account `/files` row actions
- project `Sources -> Personal files` modal open/list/upload/delete/save flows

This keeps the adapter policy consistent with the current browser-service
backlog:

- keep trigger/button scoring provider-local unless it repeats on another real
surface/provider
- reuse package-owned diagnostics and interaction helpers first
- prefer scoped evidence over another ad hoc selector fallback

## Code surfaces

- `src/browser/providers/grokAdapter.ts`
- `docs/dev/browser-automation-playbook.md`
- `docs/dev/browser-service-tools.md`
- `AGENTS.md`
- `RUNBOOK.md`
- `docs/dev/dev-journal.md`
- `docs/dev-fixes-log.md`

## Acceptance target

When these Grok file flows fail, the thrown error should already include scoped
UI diagnostics for the relevant page/modal state:

- account file delete
- project files list
- project file upload
- project file delete

The diagnostics should include the relevant modal/page roots, candidate row
selectors, and visible action buttons without inventing new provider-local
recovery logic.

## Completion

- Completed: 2026-03-31
- Result: Wrapped `listAccountFiles`, `uploadAccountFiles`, and `deleteAccountFile`
  with `withUiDiagnostics(...)` including `account files` root/candidate/button
  context; wrapped `listProjectFiles`, `uploadProjectFiles`, and `deleteProjectFile`
  with scoped project modal/tab source context; kept existing behavior and waits
  unchanged.
- Verification: `pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1`
  passed.
- Note: `pnpm run check` currently fails on an unrelated preexisting
  `tests/browser/browserService.test.ts` typecheck issue (`ResolvedBrowserConfig.target`
  is missing).

## Verification to run on the real dev box

```sh
pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser-service/ui.test.ts --maxWorkers 1
pnpm run check
```

Recommended live follow-ups on the authenticated WSL Grok profile:

```sh
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files --target grok --refresh
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files list <projectId> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files add <projectId> <file> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts projects files remove <projectId> <file> --target grok
DISPLAY=:0.0 ORACLE_NO_BANNER=1 NODE_NO_WARNINGS=1 pnpm tsx bin/auracall.ts files remove <fileId> --target grok
```

## Non-goals

- no new browser-service extraction in this slice
- no new trigger-scoring abstraction
- no new retry/sleep behavior beyond existing helpers
