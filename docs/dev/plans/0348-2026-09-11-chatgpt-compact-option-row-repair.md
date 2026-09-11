# ChatGPT Compact Option Row Repair | 0348-2026-09-11

State: CLOSED
Lane: P41
Operational state: INTEGRATION_READY
Branch: fix/plan0348-chatgpt-compact-option-row
Target: main
Integration: merge
Revision: 2 | 2026-09-11

## Stable Objective

Reproduce and repair P40's exact provider-free selector gap: current compact
`6Pro` appears in the option inventory but is treated as submenu/navigation
rather than a terminal selectable premium-model row.

## Current State

- Published `main` is clean and equal to origin at `b8ac05622`; P40's terminal
  live receipt is integrated.
- P40 installed exact source bytes and matched identity, then spent one prompt
  attempt with zero Sends. Trigger admission found `6Pro`, but option selection
  timed out while continuing to list `6Pro`.
- Source inspection shows terminal-option handling treats any matching row with
  an `aria-expanded` attribute as a submenu. The existing compact-row fixture
  has no such attribute, so it does not exercise the live shape.
- This lane is provider-free. The installed artifact fetch and any second live
  prompt remain prohibited until a successor lane after integration.
- Adding `aria-expanded="false"` to the existing compact `6Pro` option fixture
  reproduced P40 exactly: the selector clicked once, misclassified the row as
  navigation, then returned `option-not-found`.
- The repair classifies the matched row first. Known terminal model families
  settle even with submenu-like attributes, while explicit `Model ...` and
  unclassified submenu rows retain recursive navigation.
- Published checkpoint `c6b839c1e` passes 21/21 focused and 353/353 affected
  tests, typecheck, production build, scoped lint, and diff hygiene. No install,
  browser, provider, artifact, conversation, or runtime-control effect ran.

## Execution Graph

1. Publish this plan and P41 registration from exact current `main`.
2. Make the existing compact `6Pro` fixture reproduce the live submenu-like
   attribute shape and prove RED without changing semantic intent.
3. Distinguish real model-family rows from true navigation rows using existing
   normalized classification; keep nested model navigation working.
4. Run focused and affected tests, typecheck, build, lint, audits, and diff
   hygiene; document and integrate the exact provider-free repair.

## Acceptance Criteria

- `COR-R1`: an executable fixture with compact `6Pro` and submenu-like
  attributes fails before the fix and then completes exact selection once.
- `COR-R2`: raw observed `6Pro` remains distinct from desired `6 Pro`; `6Power`,
  generic `Pro`, effort controls, and true nested navigation remain rejected or
  navigated as before.
- `COR-R3`: affected tests, typecheck, build, lint, architecture/plan checks,
  and Git publication pass with no installed/browser/provider/runtime effect.
- `COR-R4`: plan/lane/roadmap/runbook/journal state says a new installed/live
  successor is still required.

## Bounds And Hard Stops

- One implementation attempt and one closed-world provider-free verification.
- No install, service change, browser launch/attachment/navigation, live DOM,
  prompt, Send, artifact fetch, recovered-conversation access, retry, fallback,
  or runtime control.
- Never click `Answer now`; do not broaden semantic matching or weaken mode,
  identity, ownership, hostile-state, or post-effect guards.

## Definition Of Done

COR-R1 through COR-R4 are provider-free accepted and integrated; one separately
bounded installed/live successor remains before the end-to-end goal can close.
