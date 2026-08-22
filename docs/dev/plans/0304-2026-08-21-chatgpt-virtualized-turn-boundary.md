# ChatGPT Virtualized Turn Boundary | 0304-2026-08-21

State: OPEN
Lane: P01
Operational state: P6 SOURCE ACCEPTED / INSTALLED GATE NEXT

## Stable Objective

Make AuraCall recognize only the fresh assistant turn belonging to its submitted
prompt even when ChatGPT virtualizes, removes, or reindexes conversation DOM
nodes after a connected-app tool call, while preserving exact stale-response,
tool-card, approval, deadline, lock, and cleanup safeguards.

## Current State

- Plan 0303's one live prompt submitted once and LitScout processed exactly one
  read-only `research_continue` request. Canonical Session 68 remained at ten
  receipts and 150 memberships: 12 keep, 138 remove.
- AuraCall safely timed out and persisted a bounded terminal classification,
  but returned no assistant answer.
- The terminal diagnostic recorded `turnCount=12` and `minTurnIndex=15`.
  Source tracing shows `submitPrompt` returned 16 committed turn nodes and
  `runBrowserMode` converted that to an absolute assistant floor of 15. Later
  ChatGPT DOM virtualization mounted only 12 turn nodes, so the observer,
  poller, snapshot, recovery, and abort-time progress paths all excluded the
  new assistant turn by position.
- The pre-submit code already captures the last assistant text, message ID, and
  turn ID, but those stable values are used only after positional polling has
  returned. They are not part of the response-observation boundary.
- Plan 0303's install, restart, and live-submit bounds are consumed. This plan
  begins provider-free and authorizes no install, restart, browser mutation,
  provider call, or LitScout call at activation.
- Pushed source `571514c9` replaces the absolute response floor with one shared
  positional-plus-stable-identity boundary. It rejects matching baseline text
  even if virtualization reindexes the DOM identity, and keeps approval cards
  and tool-only turns ineligible.
- Deterministic virtualization fixtures pass `13/13`; the focused browser seam
  passes `76/76` with one skip. Full serial provider-free validation passes
  `2,956/2,956` across 323 files with 65 live-only skips. Typecheck, scoped
  zero-warning lint, production build, diff hygiene, and current CodeGraph at
  908 files / 17,125 nodes / 58,552 edges pass.
- Source receipt:
  `docs/dev/notes/2026-08-21-plan0304-virtualized-boundary-source-acceptance.json`.
  No install, restart, browser/provider/LitScout call, or Graphiti write has
  occurred in Plan 0304. The installed/live packet remains separately gated.

## Planning Metadata

- Parent: Plan 0303 post-tool terminal response.
- Critical-path owner/lane: `/root` /
  `p0304_chatgpt_virtualized_turn_boundary`.
- Branch: `fix/plan0302-chatgpt-timeout-signal-cleanup`; integration remains
  blocked until complete live acceptance.
- Target: `main` only after accepted source, installed, and one-call live proof.
- Expected write set: `src/browser/actions/assistantResponse.ts`,
  `src/browser/index.ts`, `src/browser/pageActions.ts`, focused browser/CLI
  tests, this plan, `ROADMAP.md`, `RUNBOOK.md`, `docs/dev/dev-journal.md`,
  `docs/dev-fixes-log.md`, and bounded validation receipts.
- Parallel work: none. Boundary semantics, extraction, and live acceptance are
  one serialized critical path.

## Required Work

1. Preserve Plan 0303's exact live receipt, one-call/zero-write LitScout state,
   terminal cleanup, and no-retry outcome.
2. Add deterministic RED fixtures where prompt commit observes 16 turns, later
   DOM virtualization exposes 12, and the new assistant turn contains an
   earlier tool card plus later final prose.
3. Replace the count-only response floor with a stable boundary that carries
   the pre-submit assistant message ID, turn ID, and bounded text fingerprint
   alongside the positional hint. Position remains the fast path; stable
   identity becomes authoritative when the DOM shrinks or reindexes.
4. Prove same-identity stale assistant content, earlier turns, user content,
   approval/tool cards, tool-only turns, and arbitrary status text remain
   ineligible.
5. Extend passive progress metadata with a bounded boundary-state field so a
   timeout distinguishes positional eligibility from stable-identity recovery
   without persisting prompt, answer, tool, approval, query, or fragment text.
6. Run focused and affected provider-free tests, full serial validation,
   typecheck, zero-warning scoped lint, build, current CodeGraph, planning audit,
   and diff hygiene. Commit and push source before any runtime transition.
7. Only after source acceptance, freeze one installed packet with at most one
   install/restart, byte parity, installed virtualization fixtures, and one new
   no-write LitScout prompt. Reconcile exact terminal output, cleanup, and
   unchanged canonical state. Do not retry after Send.

## Non-Goals

- No replay of Plan 0303, saturation acceptance, enrichment, Analyze, GraphRAG,
  drafting, Graphiti write, OAuth widening, or positive/unknown spend.
- No acceptance of a newest DOM node solely because its array index changed.
- No weakening of stale-response identity, exact approval handling,
  conversation/account/model binding, operation ownership, or one-deadline
  cleanup.
- No raw CDP mutation, arbitrary process kill, broad runtime cleanup, profile
  reseed, release, or publication.

## Acceptance Criteria

- `VTB-R1`: deterministic RED proves an absolute `minTurnIndex` loses a fresh
  assistant response when mounted turn count shrinks below the committed count.
- `VTB-R2`: one stable response-boundary contract is shared by observer,
  snapshot poller, recovery, final refresh, and terminal progress capture.
- `VTB-R3`: a fresh stable assistant identity remains eligible across DOM
  shrink/reindex and returns only the later safe final prose.
- `VTB-R4`: the baseline identity/text, stale prior assistant turns, user text,
  approval/tool content, and tool-only turns remain ineligible.
- `VTB-R5`: timeout/signal/late-completion/operation-release regressions remain
  green and progress metadata stays bounded and text-free.
- `VTB-R6`: pushed source passes focused/affected/full provider-free tests,
  typecheck, build, scoped lint, CodeGraph, planning audit, and diff hygiene.
- `VTB-R7`: installed artifacts are byte-exact and installed virtualization
  fixtures prove fresh/stale/no-answer behavior before live work.
- `VTB-R8`: one distinct no-write LitScout turn makes exactly one
  `research_continue` call, returns the terminal assistant answer, terminalizes
  all AuraCall state, and leaves Session 68 receipts/corpus/controller unchanged.

## Bounds And Stops

- One source implementation attempt plus at most one evidence-backed repair.
- Zero install, restart, live prompt, provider call, or browser mutation before
  pushed source acceptance and a durable installed/live gate.
- The later installed packet may authorize one install, at most one API restart,
  three provider-free boundary fixtures, and one read-only LitScout prompt with
  zero retry.
- Stop before implementation if no deterministic fixture can distinguish a
  fresh stable assistant identity from the baseline after DOM shrink.
- Stop after the future live Send on any ambiguity; reconcile without retry.

## Definition Of Done

AuraCall returns the correct fresh terminal assistant answer after exactly one
LitScout tool request despite ChatGPT DOM virtualization, preserves all stale/
tool/approval exclusions and terminal cleanup guarantees, and proves the
installed behavior once end to end with zero canonical LitScout mutation.

## Source Acceptance Status

- `VTB-R1`: accepted by the retained `12 < 15` RED and the deterministic
  provider-free virtualization fixture.
- `VTB-R2`: accepted in source; the same boundary object reaches observer,
  poller, recovery, reload, final refresh, and terminal progress capture.
- `VTB-R3`: accepted in source by fresh stable message/turn identity fixtures.
- `VTB-R4`: accepted in source for baseline identity, baseline text under a
  changed DOM identity, approval/tool-only content, and user/stale exclusions.
- `VTB-R5`: accepted provider-free; timeout, signal, reattach, approval, and
  browser-mode regressions remain green and progress evidence is text-free.
- `VTB-R6`: accepted and pushed at `571514c9`.
- `VTB-R7` and `VTB-R8`: pending the separately frozen installed/live packet.
