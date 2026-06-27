# Live-Follow Detail Completeness Guard | 0146-2026-06-27

State: CLOSED
Lane: P01

## Purpose

Fix the Plan 0145 follow-up risk where account-mirror frontier evidence can
promote an attempted conversation detail scan into durable
`detailCompleteness="complete"` even when the provider context read failed or
returned only an incomplete chunk.

## Current State

- Plan 0145 added the reverse-mtime freshness frontier and proved reduced
  detail churn on the installed ChatGPT SoyLei lane.
- The collector now records attempted scans separately from complete detail
  observations.
- Final conversation metadata annotation only writes
  `detailCompleteness="complete"` when the bounded detail inventory records both
  successful conversation file inventory and a complete context read.
- A regression test covers the previous false-positive path where file
  inventory succeeded but context read returned `null`.

## Problem Statement

The frontier must only skip old rows when cached evidence proves detail and
manifest freshness. Treating an attempted scan as complete can make a later
steady-follow pass skip a row whose context was never actually read, defeating
the cache catch-up guarantee that Plan 0145 explicitly preserved.

## Scope

- Tighten ChatGPT/Gemini/Grok account-mirror detail inventory annotation so
  `detailObservedAt`, `manifestObservedAt`, and
  `detailCompleteness="complete"` are written only after a complete context read
  and successful conversation file inventory read for that conversation.
- Keep tolerated read failures non-fatal, but leave those conversations
  stale/partial for future frontier selection.
- Add focused regression coverage for a file-list success paired with a context
  read failure.

## Non-Goals

- Do not change reverse-mtime frontier selection semantics.
- Do not change provider pacing, cooldown, or guard behavior.
- Do not run a new ChatGPT live proof unless focused validation shows this
  code-level repair needs installed evidence.

## Acceptance

- [x] A scanned conversation with successful file inventory but failed/null
  context read is not annotated with `metadata.detailCompleteness="complete"`.
- [x] A scanned conversation with successful file inventory and complete
  context read is still annotated with `detailObservedAt`,
  `manifestObservedAt`, and `detailCompleteness="complete"`.
- [x] Focused unit tests cover both the regression and retained happy path.
- [x] Typecheck and scoped lint pass for touched collector/test files.

## Validation Plan

- `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm vitest run tests/accountMirror/conversationFreshnessFrontier.test.ts tests/accountMirror/refreshService.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome check src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts`
- `pnpm run plans:audit -- --keep 146`

## Closeout

- Changed the final metadata annotation to use only
  `inventoryProgress.detailObservedConversationIds`, not raw
  `scannedConversationIds`.
- Changed bounded conversation inventory so detail-observed evidence is emitted
  only after conversation file inventory succeeds and context read completes
  without an outstanding chunk cursor.
- Added regression coverage for the context-null case and retained happy-path
  progress evidence.
- Validation passed:
  - `pnpm vitest run tests/accountMirror/chatgptMetadataCollector.test.ts`;
  - `pnpm vitest run tests/accountMirror/conversationFreshnessFrontier.test.ts tests/accountMirror/refreshService.test.ts`;
  - `pnpm exec tsc --noEmit --pretty false`;
  - `pnpm exec biome check src/accountMirror/chatgptMetadataCollector.ts tests/accountMirror/chatgptMetadataCollector.test.ts`;
  - `pnpm run plans:audit -- --keep 146`.

## Definition Of Done

Plan 0146 closes when attempted scans can no longer create durable complete
detail freshness without a complete context read, the focused regression tests
pass, and the roadmap/runbook/dev journal/fix log record the repair.
