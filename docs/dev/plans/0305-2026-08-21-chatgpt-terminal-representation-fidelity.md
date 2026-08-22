# ChatGPT Terminal Representation Fidelity | 0305-2026-08-21

State: OPEN
Lane: P01
Operational state: P1 DIAGNOSED / PROVIDER_FREE RED NEXT

## Stable Objective

Ensure AuraCall cannot silently prefer a substantively different copied
Markdown representation over the later stable final DOM response, while
preserving Markdown when the two representations differ only by formatting.

## Current State

- Plan 0304 live-proved exactly one LitScout request, fresh terminal response
  capture in 26.6 seconds, correct controller stage/action, unchanged canonical
  state, and exact terminal cleanup.
- The emitted answer reported `1 keep` while canonical Session 68 has `12 keep`.
  That one-character loss makes the live answer incorrect and internally
  inconsistent with `150 total` and `138 remove`.
- Local `runBrowserMode` prefers copied Markdown and replaces it from the final
  DOM only when the DOM is at least 12 characters longer (or 75 percent longer).
  A small substantive disagreement is retained. Remote browser mode already
  prefers a different final DOM value when it is equal or longer.
- The live artifacts do not persist both pre-reconciliation representations, so
  copied-Markdown corruption is a source-grounded hypothesis rather than a
  proven attribution. Provider-free fixtures must prove the vulnerable decision
  before any implementation.
- Plan 0304's install, restart, and live-call budgets are consumed. This plan
  starts with zero install, restart, browser, provider, LitScout, or Graphiti
  effect authority.

## Planning Metadata

- Parent: Plan 0304 virtualized turn boundary.
- Critical-path owner/lane: `/root` /
  `p0305_chatgpt_terminal_representation_fidelity`.
- Branch: `fix/plan0302-chatgpt-timeout-signal-cleanup`; integration remains
  blocked until complete live acceptance.
- Target: `main` only after accepted source, installed, and one-call live proof.
- Expected write set: one shared browser representation-reconciliation seam,
  local and remote browser callers, focused tests, this plan, `ROADMAP.md`,
  `RUNBOOK.md`, journals, and bounded receipts.
- Parallel work: none. The representation decision and evidence are one
  serialized critical path.

## Required Work

1. Preserve Plan 0304's exact one-call, zero-write, terminal-cleanup receipt and
   do not reinterpret the wrong count as accepted.
2. Add deterministic RED for stable final DOM text containing `12 keep` against
   copied Markdown containing `1 keep`; prove current local policy emits the
   substantively different Markdown.
3. Factor one shared local/remote reconciliation contract. Preserve copied
   Markdown only when its rendered plain text is semantically equivalent to the
   stable DOM; otherwise prefer the stable DOM text.
4. Prove ordinary Markdown emphasis, inline code, links, lists, and whitespace
   remain equivalent, while changed digits, words, omissions, prompt echoes,
   stale snapshots, and empty values fail closed.
5. Add bounded mismatch evidence using only source choice, lengths, and hashes;
   do not persist prompt, answer, tool, approval, query, or fragment text in
   diagnostics.
6. Run focused/affected/full provider-free tests, typecheck, zero-warning scoped
   lint, build, CodeGraph, planning audit, and diff hygiene; push source before
   any installed transition.
7. Only after source acceptance, freeze a distinct installed/live packet. Any
   future LitScout call is a new bounded acceptance, never a retry of Plan 0304.

## Non-Goals

- No generic factual verifier, LitScout-specific parser in AuraCall, controller
  change, research action, Analyze, GraphRAG, drafting, or Graphiti write.
- No replay of Plan 0304, automatic resubmission, tool-result mutation, raw CDP
  mutation, broad process cleanup, install, restart, or live prompt in the
  provider-free slice.
- No silent loss of Markdown solely to make representations byte-identical.

## Acceptance Criteria

- `TRF-R1`: RED proves a one-character copied-Markdown loss defeats the current
  local large-delta heuristic.
- `TRF-R2`: one shared reconciler serves local and remote browser modes.
- `TRF-R3`: formatting-only Markdown differences preserve Markdown and align
  plain text to the stable DOM.
- `TRF-R4`: any substantive digit, word, or omission difference selects the
  stable DOM and records only bounded mismatch metadata.
- `TRF-R5`: prompt echo, stale identity, tool/approval exclusion, timeout,
  signal, cleanup, and operation ownership regressions remain green.
- `TRF-R6`: pushed source passes all provider-free acceptance gates.
- `TRF-R7`: a later installed/live packet returns canonical Session 68 counts
  after exactly one new read-only call and zero canonical mutation.

## Bounds And Stops

- One source implementation attempt plus at most one evidence-backed repair.
- Zero install, restart, live prompt, provider call, browser mutation, or
  LitScout call before pushed source acceptance and a new durable gate.
- Stop if the final stable DOM cannot be distinguished from a stale or prompt
  representation without weakening the Plan 0304 boundary.
- A future Send, if separately gated, has zero retry.

## Definition Of Done

AuraCall preserves formatting when copied Markdown and stable DOM mean the same
thing, emits the stable terminal content whenever they disagree substantively,
and proves the installed behavior once with correct canonical LitScout counts.
