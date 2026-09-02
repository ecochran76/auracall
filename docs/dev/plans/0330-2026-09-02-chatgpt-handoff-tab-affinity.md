# ChatGPT Handoff Tab Affinity | 0330-2026-09-02

State: CLOSED
Lane: P23
Operational state: INTEGRATED_PROVIDER_FREE_ACCEPTED
Branch: fix/plan0330-chatgpt-tab-affinity
Target: main
Integration: merge
Revision: 3 | 2026-09-02

## Stable Objective

Prevent a ChatGPT handoff submission from racing another mutating operation on
the same managed browser profile, and give a new-conversation handoff its own
fresh retained browser tab from preparation through provider commit readback.

## Current State

- The provider-native handoff adapter called `ChatgptService.runPrompt()`
  directly, bypassing the exclusive managed-browser operation acquired by the
  separate `runBrowserMode()` entry path.
- ChatGPT supported retained and disposable tabs, but it had no lifecycle for
  opening a fresh tab and retaining it after prompt submission.
- A deterministic provider-free regression reproduces the dispatcher bypass:
  with a competing same-profile ChatGPT mutation active, handoff submission
  reaches the provider instead of queuing.
- The original checkout contains unrelated P08/P17 reconciliation state and an
  unresolved journal conflict. This lane is isolated in its own worktree and
  must not modify or resolve that custody.
- Commit `de13541f` queues handoff submission on the exact managed
  browser profile, adds the fresh retained-tab lifecycle, preserves the current
  ChatGPT model when no selector is supplied, and accepts the exact
  composer-local upload input after provider label drift.
- The focused packet passes 78 tests. Typecheck, production build, scoped
  zero-warning lint, diff hygiene, and the 329-candidate zero-error plan audit
  pass.
- The isolated comprehensive lane passes 3,058 tests with 65 policy-skipped
  live/TTY tests. Its sole failure is the pre-existing raw-CDP allowlist entry
  for deleted `scripts/observe-chatgpt-tool-approval.ts`, already recorded by
  Plan 0326 and unrelated to this diff.
- Audit found developer-app and Skill CLI browser mutations that do not yet
  share this queue. Their separate retained custody and exact-account mutation
  contracts remain unchanged and are explicit follow-up scope, not an
  unreviewed expansion of P23.
- Merge `1c27bfc3` integrates the accepted provider-free repair into
  canonical `main`. Runtime installation and a live Hagenson handoff retry
  remain explicitly unexecuted.

## Scope

- Acquire one exclusive managed-profile ChatGPT operation around provider-native
  handoff submission and publish queue observations.
- Add a `retain-new` tab lifecycle for a new-conversation handoff.
- Preserve exact existing-conversation targeting when a target conversation is
  explicitly supplied.
- Add focused provider-free regression coverage and operator-facing docs.

## Non-goals

- Concurrent mutating jobs within one managed browser profile.
- A tab-scoped lock protocol or profile-wide versus tab-local lock hierarchy.
- Taking custody of external direct-CDP processes or scripts.
- Editing the retained developer-app or Skill lifecycle lanes.
- Installing runtime code, restarting services, or sending another live prompt.

## Acceptance Criteria

- [x] A handoff submit queues while a competing mutation owns the same managed
      browser profile and does not invoke the provider before acquisition.
- [x] A new-conversation handoff opens and retains a fresh ChatGPT tab.
- [x] An explicit target conversation remains eligible for exact-tab reuse.
- [x] Focused handoff, prompt-service, tab-lifecycle, and dispatcher tests pass.
- [x] Typecheck, production build, scoped lint, diff hygiene, and planning audit
      pass or any unrelated baseline failure is recorded precisely.
- [x] No provider or installed-runtime mutation occurs in this lane.

## Definition of Done

The provider-free implementation and documentation are committed on the topic
branch with red/green evidence and a precise residual-risk statement. Live
handoff retry remains a separate operator effect after integration/install.
