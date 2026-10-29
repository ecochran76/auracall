# Grok441 — bounded project history repair

Issue: https://github.com/ecochran76/auracall/issues/441
Plan: [Plan0456](../plans/0456-2026-10-25-grok-review-repair-execution.md)
Source: [SPEC2 review](2026-10-25-grok-full-code-review.md)
Frozen source base: `e1bb4dbc94c5d50dc4f210dbd783cbfb2bbd3b5a`
Worker branch: `feat/grok-repair-441-20261025`

## Behavior and seam

A project listing with `includeHistory: true` now always reads the existing
bounded, positively attributed Chats history inventory, even when the project
page already has mounted rows. Only rows covered by that continuation window
are returned; mounted and open-tab rows cannot consume its limit or impersonate
completed history. Ordinary non-history project listing retains its existing
mounted/open-row behavior. The existing final account proof remains awaited
before transport closure. `foreground-yield` is retained as a whitelisted public
status reason rather than being mislabeled `history-failed`.

The dedicated regression uses `createGrokAdapter().listConversations`, the
actual `readBoundedConversations`, `collectGrokMirrorIndex`, and the account-bound
atomic checkpoint store. Only the external CDP transport is controlled. The
history DOM extraction expression executes against explicit project-membership
and terminal/loading fixture evidence. No internal history/collector function
is mocked. Dialog-opener dispatch and mounted-project scraping are controlled
protocol replies; this test does not claim native UI, provider or opener proof.

## Red and green

Command: `pnpm vitest run tests/browser/grok441ProjectHistory.test.ts --maxWorkers=1`

- Initial red before implementation: 1 failed; nonempty project returned
  `historyCoverage: undefined` instead of bounded project continuation.
- Completed regression against the frozen baseline adapter: 3 failed; missing
  coverage, persisted project cursor remained null, and mounted-only rows were
  returned even when the qualified history was explicitly empty. The current
  adapter source was restored in a `finally` block after this verification.
- Green: 3 passed. Partial project p yields p1/p2, restart yields p3 and reaches
  its qualified visible boundary, then q is visited. Across three isolated
  store/transport cycles visits are `p,p,q,q`, with retained rows p1/p2/p3/q1
  and all three scopes complete. The root is seeded as already complete to
  isolate the reviewed starvation trigger.
- Collector interruption, foreground yield, and failed project read preserve
  the exact project cursor; another account cannot load its checkpoint.
  Public empty/partial/yield/failed coverage and Ops status are checked, with
  no cursor exposed by the status projection.

Affected checks:
`pnpm vitest run tests/browser/grokAdapter.test.ts tests/browser/grokHistoryInventory.test.ts tests/accountMirror/grokIndexBackfill.test.ts tests/accountMirror/grokIndexCoverage.test.ts tests/browser/grok401AdapterCleanup.test.ts --maxWorkers=1`
passed 78 tests across five files.

`pnpm typecheck` passed. Focused Biome lint on the two changed source files and
new regression passed. `git diff --check` passed. All checks are provider-free;
no retry, live provider/browser launch, installation or native acceptance ran.

## Boundaries

This is qualified visible Chats scope coverage, not hidden-history or account-wide
completeness. The separate442 repair owns lazy-history continuation beyond the
fixed page replay horizon; integration must preserve these project assertions
when its shared service/transport path is adopted. This worker does not claim
intended-target integration or issue closure.

Memory disposition: `forbidden` — Plan0456 and the delegated task prohibit memory
writes absent a save request. No Graphiti write was attempted.
