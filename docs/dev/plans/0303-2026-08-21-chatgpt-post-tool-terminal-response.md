# ChatGPT Post-Tool Terminal Response | 0303-2026-08-21

State: OPEN
Lane: P01
Operational state: P6 INSTALLED ACCEPTED / LIVE PROMPT READY_NOT_RUN

## Stable Objective

Make AuraCall distinguish and reliably terminalize a ChatGPT connected-app
turn after the tool request has completed: return the final assistant answer
when it exists, or preserve bounded evidence that proves which provider/UI
state prevented an answer, without replaying the tool, weakening approval
guards, or sacrificing Plan 0302's live-accepted cleanup.

## Current State

- Plan 0302 fixed the original orphaning defect. Its installed 900-second live
  timeout terminalized the exact session/model, closed its owned browser,
  released its exact operation, and left the API healthy.
- The same run submitted once and LitScout processed exactly one read-only
  `research_continue` request about 34 seconds later. Canonical LitScout
  receipts, corpus membership, controller state, and provider-call counts did
  not change.
- AuraCall received no terminal assistant output before the absolute deadline.
  Current durable evidence cannot distinguish whether ChatGPT never emitted
  final prose after the tool result or emitted a terminal surface that the
  assistant extractor did not recognize.
- Current extraction races the assistant DOM observer with a snapshot poller,
  requires non-empty normalized assistant text at or after the submitted-turn
  boundary, and has no durable abort-time classification for a tool-completed
  turn with no captured prose.
- Plan 0302's install, restart, and live-submit bounds are consumed. This
  successor begins source-first and authorizes no prompt, provider call,
  install, restart, or browser mutation at activation.
- Deterministic RED reproduced the exact unsafe extraction shape: one assistant
  turn contained an earlier LitScout approval card and later final prose, and
  the old primary extractor returned the approval text. The fixture failed
  `1` test with `5` passing before implementation.
- The repair evaluates the newest eligible assistant turn by selector priority,
  chooses the last safe prose candidate, and excludes approval/tool-card
  content in both the primary and markdown-fallback extractors. Tool-only
  turns return no answer.
- Before timeout closes DevTools, one bounded 750 ms passive probe now records
  only state/count/boolean data and a query-free origin/path: eligible turn,
  answer character count, generation/completion visibility, current-turn
  approval count, and dialog visibility. It never persists answer, tool,
  approval, user, query, or fragment text. That annotation is retained on the
  typed timeout/cancellation reason and persisted to terminal session/model
  metadata.
- Pushed source `28da74e5` is upstream-exact. Focused expression tests pass
  `10/10`; the affected browser/CLI lane passes `1,030/1,030` with one opt-in
  skip; serial full provider-free validation passes `2,952/2,952` with 65
  opt-in skips. Typecheck, zero-warning scoped lint, production build, diff
  checks, and current CodeGraph at 908 files / 17,117 nodes / 58,490 edges
  pass. No install, restart, browser, provider, LitScout, or Graphiti effect
  occurred in the source packet.
- Source receipt:
  `docs/dev/notes/2026-08-21-plan0303-post-tool-response-source-acceptance.json`.
  The next serialized gate is an exact idle/runtime check followed by the one
  bounded installed packet; no live prompt precedes installed fixture proof.
- At an exact idle boundary with zero operation records and no
  `wsl-chrome-3` browser owner, the plan's one install completed at
  `2026-08-22T00:39:09.805Z` and its one API restart produced healthy PID
  `6690` with `NRestarts=0`. Installed assistant-response, browser-index, and
  session-runner artifacts are byte-exact with the accepted build.
- The first installed fixture harness used a guessed conversation selector and
  therefore saw zero turns; it did not reach the product assertion and caused
  no runtime/provider effect. One bounded correction imported
  `CONVERSATION_TURN_SELECTOR` from the installed package. The corrected packet
  returned the later final prose after an earlier tool card, returned `null`
  for a tool-only turn, and classified that turn as
  `tool-approval-visible` with zero answer characters and no query/tool text.
- Installed receipt and frozen one-submit boundary:
  `docs/dev/notes/2026-08-21-plan0303-installed-fixtures-live-gate.json`.
  No live prompt has been submitted. The remaining gate is one exact
  Session-68 read-only `research_continue` submission after fresh canonical
  LitScout and runtime preflight.

## Planning Metadata

- Parent: Plan 0302 overall timeout and signal cleanup.
- Cross-repo evidence: LitScout Plan 0436 terminal receipt and unchanged
  canonical Session-68 state recorded in the Plan-0302 installed/live receipt.
- Critical-path owner/lane: `/root` /
  `p0303_chatgpt_post_tool_terminal_response`.
- Branch: `fix/plan0302-chatgpt-timeout-signal-cleanup` until a source repair
  packet is proven; integration remains blocked.
- Target: `main` only after a complete successor acceptance.
- Expected write set: assistant response observation/extraction and browser-run
  diagnostic seams, focused tests/fixtures, this plan, `ROADMAP.md`,
  `RUNBOOK.md`, `docs/dev/dev-journal.md`, `docs/dev-fixes-log.md`, and source/
  installed/live receipts.
- Parallel work: none. The live evidence, extractor semantics, and cleanup
  lifecycle are coupled and remain one serialized lane.

## Required Work

1. Preserve Plan 0302's pushed source, installed byte identity, exact live
   terminal receipt, one-call/zero-write LitScout evidence, and zero-retry
   boundary.
2. Use current CodeGraph flow/impact context for assistant observation,
   snapshot extraction, approval handling, and abort cleanup. Separate proven
   facts from hypotheses about provider generation versus extractor drift.
3. Add deterministic fixtures for a submitted turn that contains tool UI or a
   tool-result transition before final assistant prose, plus a terminal
   no-prose/stalled state. Prove current behavior cannot provide an actionable
   terminal classification for the latter.
4. Implement the smallest provider-owned response-progress seam that:
   - returns final assistant prose exactly once when it becomes available;
   - never treats tool-card text, user text, stale prior-turn text, approval
     labels, or arbitrary status text as the assistant answer;
   - captures a bounded final passive observation before owned timeout cleanup
     so a no-answer failure reports useful phase/state evidence;
   - preserves the single overall abort owner and exact cleanup semantics from
     Plan 0302.
5. Run focused/affected/full provider-free tests, typecheck, build, scoped
   zero-warning lint, current CodeGraph, plan audit, and diff hygiene. Commit
   and push source before any runtime transition.
6. Only after source acceptance, freeze an installed/live packet with one
   user-runtime install, at most one required API restart, deterministic
   installed fixtures, and one distinct read-only LitScout submission. The
   prompt may call only `research_continue` for Session 68 and may not approve
   or execute the recommended saturation action.
7. Reconcile terminal AuraCall output/session/browser/operation state and
   unchanged LitScout receipts/corpus/controller. Integrate only if a terminal
   answer is returned and all cleanup/zero-write evidence agrees.

## Non-Goals

- No retry under Plan 0302, no replay of completed LitScout actions, and no
  saturation approval/execution, enrichment, Analyze, GraphRAG, drafting, or
  Graphiti write.
- No inference that a tool request implies final assistant prose, and no use of
  tool-card or approval text as the answer.
- No weakening of exact-card approval, account identity, conversation binding,
  model/mode, profile lock, deadline, or cleanup guards.
- No raw CDP mutation, arbitrary process kill, broad stale-state cleanup,
  profile reseed, OAuth widening, positive/unknown spend, release, or publish.

## Acceptance Criteria

- `PTR-R1`: deterministic post-tool fixtures preserve the submitted-turn
  boundary and return only non-empty final assistant prose from the correct
  assistant turn.
- `PTR-R2`: tool cards, approval controls, tool-result status, stale assistant
  text, and user text cannot satisfy answer extraction.
- `PTR-R3`: a no-prose timeout persists a bounded passive diagnostic that
  distinguishes observed assistant turn/progress, stop/completion visibility,
  approval/blocking surface, URL/turn boundary, and final extractor state.
- `PTR-R4`: diagnostic capture is passive, secret-safe, bounded, and cannot
  outlive or bypass Plan 0302's absolute deadline and cleanup grace.
- `PTR-R5`: timeout, SIGINT/SIGTERM, late completion, operation release, and
  terminal session/model regressions from Plan 0302 remain green.
- `PTR-R6`: pushed source passes focused/affected/full provider-free tests,
  typecheck, build, scoped lint, CodeGraph, planning audit, and diff hygiene.
- `PTR-R7`: a separately frozen installed packet is byte-exact and its
  provider-free fixtures prove both final-answer and no-answer classifications.
- `PTR-R8`: one distinct no-write LitScout turn returns a terminal assistant
  answer, terminalizes all exact AuraCall state, and leaves canonical LitScout
  receipts, 150/12/138 corpus, `evidence_gap_review`, and zero-write boundary
  unchanged.

## Bounds And Stops

- One source implementation attempt plus at most one evidence-backed repair.
- Zero install, API restart, live prompt, provider call, or browser mutation
  before pushed source acceptance and a durable installed/live packet update.
- The later installed/live packet may authorize one install, at most one API
  restart, one provider-free positive fixture, one provider-free no-answer
  fixture, and one new read-only LitScout prompt submission with zero retry.
- Stop before implementation if no provider-free fixture can distinguish
  terminal assistant prose from tool/approval/status content.
- Stop after any future live Send without retry on ambiguous UI, approval,
  output, browser, operation, or canonical LitScout state.

## Definition Of Done

AuraCall returns the correct terminal assistant answer after one LitScout tool
request or fails with a durable, bounded post-tool state classification, while
preserving the one-deadline/one-cleanup contract and proving one installed
read-only LitScout turn end to end with no canonical research write or replay.
