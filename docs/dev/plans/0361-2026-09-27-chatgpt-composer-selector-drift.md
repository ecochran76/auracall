# Plan 0361 | ChatGPT Composer Selector Drift

State: CLOSED

## Current State

GitHub issue `ecochran76/auracall#90` records the current ChatGPT composer
markup regression. The provider-free repair and one bounded installed
`wsl-chrome-3` acceptance run are complete on
`fix/chatgpt-selector-drift`; pull-request integration into canonical `main`
is the remaining custody gate.

## Scope

- Accept the current `.composer-home-top-menu` root and plain button rows while
  retaining legacy menu fallbacks.
- Select the visible composer-local `Add files and more` trigger when stale or
  hidden matches coexist.
- Recognize DOM-confirmed connected-app mentions during selection and exact
  prompt verification.
- Preserve rejection of unrelated retained user text and the existing
  fail-closed `Connect` boundary.
- Add focused provider-free regressions and document the durable selector
  lesson.

## Non-goals

- Changing tab-affinity, live-follow, scheduler, or soak semantics owned by
  issue 49 / Plan 0360.
- Broad ChatGPT selector refactoring or a new generic menu framework.
- Retrying or expanding the completed live provider run.
- Enabling, authorizing, or reconnecting a third-party app.

## Acceptance Criteria

- Current and legacy composer menu shapes are covered by deterministic tests.
- Prompt verification ignores only a DOM-confirmed app mention and continues
  to reject retained drafts.
- Focused tests, TypeScript typecheck, production build, diff hygiene, plan
  wiring, published-diff self-check, and repository CI pass.
- The change is linked to issue 90 and integrated only through a pull request
  into canonical `main`.

## Validation Evidence

- `pnpm vitest run tests/browser/chatgptComposerTool.test.ts tests/browser/chatgptAttachmentComposer.test.ts tests/browser/promptComposer.test.ts`: 45 passed.
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- Bounded installed acceptance on `wsl-chrome-3`: GitHub app mention selected,
  exact normalized prompt verified, one Send, and one completed response at
  `https://chatgpt.com/c/6ab97929-59ac-83ea-b295-e6f9e8234f76`.
- The earlier full-suite run retained unrelated environment and timing
  failures; no failure implicated the repaired files after their focused
  regressions passed.

## Definition of Done

The bounded source, tests, and documentation are published on the issue-backed
branch; the published diff is self-checked; repository CI is green; PR review
has no unresolved blocker; and the PR merges into canonical `main`.
