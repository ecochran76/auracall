# Architecture Deepening Campaign | 0291-2026-08-15

State: CLOSED
Lane: P01

## Stable Objective

Sequentially implement all four deepening opportunities selected from the
2026-08-15 Aura-Call architecture review:

1. browser launch resolution
2. provider prompt execution
3. one history materialization attempt
4. the browser acceptance harness

The primary agent remains the orchestrator. Subagents provide detailed design,
implementation, testing, and one independent campaign audit. The campaign may
run at most one audit/repair cycle. Only an unresolved High-severity audit
finding blocks completion; lower-severity unresolved findings are retained as
durable notes.

## Current State

- The visual architecture report is published at Previews session
  `a24fd8aff377` and records four evidence-backed candidates.
- CodeGraph is healthy with 905 indexed files and no reported pending sync.
- Candidate 1 is provider-free accepted. Fifteen current production
  function/method callers cross one immutable browser launch plan seam; the C1
  checkpoint had sixteen before C3 removed a superseded caller. The old
  launch-context helpers and the config/profile-resolution cycle are removed.
- Candidate 2 is provider-free accepted. One base `LlmService.runPrompt(...)`
  lifecycle dispatches all three provider adapters; ChatGPT no longer
  reconstructs browser options or detours through `runBrowserMode()`.
- Candidate 3 is provider-free accepted. One internal attempt executor owns a
  selected conversation handoff through refresh/provider work, compatibility-
  safe verification, awaited Account Mirror evidence persistence, phase/result
  projection, durable receipt construction, and receipt-derived budget/guard
  accounting.
- Candidate 4 is provider-free accepted. ChatGPT and Grok now use one locally
  substitutable harness for AuraCall process execution, per-command deadlines,
  output/exit projection, JSON diagnostics, optional version-1 state, and final
  evidence serialization.
- Candidate 4 design reconciliation selected one narrow common-use-first
  `browserAcceptanceHarness` module. It owns synchronous AuraCall command
  execution, deadlines, exact output/exit/JSON contracts, optional version-1
  acceptance state, and final evidence serialization. Provider phase logic,
  retries, cleanup decisions, assertions, CLI presentation, and summary fields
  remain in the ChatGPT and Grok scripts. A proposed workflow/state-machine
  layer was rejected as premature, and the minimal whole-run callback design
  was rejected because it would move provider lifecycle ownership across the
  seam.
- Candidate 4 focused tests pass 7/7; both safe help smokes, typecheck, build,
  scoped zero-warning Biome lint, diff hygiene, and current CodeGraph readback
  pass. Independent testing found no High defect. Dynamic provider-level
  PASS/FAIL/cleanup and CLI-over-resume coverage remains a nonblocking test gap;
  no live acceptance command ran.
- Candidates 1 through 4 have validated checkpoints. No live browser/provider
  or installed/runtime state was changed.
- The sole campaign audit is complete with zero High findings, one retained
  Medium C4 dynamic-orchestration test gap, and one Low evidence-counter drift
  reconciled in closeout docs. One documentation-only reconciliation pass was
  used; no code repair cycle ran. The integrated provider-free rerun passes 322
  files and 2,922 tests with 65 live/PTY tests skipped by design.

## Domain Language

- `CONTEXT.md` is the canonical glossary for AuraCall runtime profile, browser
  profile, source browser profile, managed browser profile, provider binding,
  browser launch plan, provider prompt, materialization attempt, and acceptance
  run.
- Architecture discussion uses module, interface, implementation, depth, seam,
  adapter, leverage, and locality.

## Execution Graph

Critical path is serialized:

`C1 launch resolution -> C2 provider prompt -> C3 materialization attempt -> C4 acceptance harness -> one audit/repair cycle -> integration validation`

Within each candidate, bounded planning and testing work may fan out before
joining the critical path. Intended active-agent concurrency is four including
the primary orchestrator. Subagents must not spawn children.

## Work Units

### C1 | Browser Launch Resolution

- Deepen the existing in-process seam so callers obtain one browser launch
  plan without knowing mutable merge or normalization order.
- Preserve current runtime selection, provider targeting, browser profile,
  source browser profile, managed browser profile, and launch behavior.
- Use vertical TDD through the public resolution interface.

### C2 | Provider Prompt Execution

- Deepen the existing three-adapter seam so provider-prompt lifecycle,
  authorization propagation, and result projection have one locality.
- Keep provider-specific DOM workflow in provider adapters and preserve the
  ChatGPT `Answer now` prohibition.
- Do not move volatile workflow logic into configuration.

### C3 | History Materialization Attempt

- Deepen one complete materialization attempt so selection, refresh,
  provider work, verification, persistence, and receipt semantics have one
  locality.
- Keep provider browser behavior behind existing adapters and preserve
  eligible/selected/materialized observability and fail-closed ordering.
- Do not run live materialization, scheduler, or completion controls.

### C4 | Browser Acceptance Harness

- Deepen one local-substitutable harness for process lifecycle, deadlines,
  output parsing, resume state, and evidence assembly.
- Keep ChatGPT and Grok phase declarations and assertions in their provider
  adapters.
- Preserve existing command behavior and operator evidence.

## TDD And Validation Contract

- Use one vertical tracer at a time: one public-interface behavior from red to
  green before adding the next.
- Tests assert observable behavior and survive internal implementation changes.
- Targeted tests run after each tracer; affected suites, typecheck, build,
  scoped lint, CodeGraph readback, planning audit, and diff hygiene run before
  each candidate checkpoint.
- Live browser/provider work, runtime installation, service restart, scheduler
  control, and completion control remain excluded unless a later exact user
  authorization explicitly adds them.

## Agent Contract

- Primary orchestrator owns authority, design reconciliation, critical-path
  selection, integration, finding disposition, commits, pushes, and completion.
- Planning agents return radically different interface designs and do not edit.
- Execution agents receive exact file ownership and implement only the selected
  design.
- Testing agents independently run the frozen validation packet and return
  command evidence; they do not repair.
- One final audit agent performs the sole `drift_discovery` pass over the full
  campaign. If the primary accepts findings, at most one repair pass follows.

## Audit And Repair Bound

- `max_review_discovery_passes: 1`
- `max_review_rework_cycles: 1`
- `blocking_severity: High`
- Unresolved High findings block the affected acceptance criterion.
- Unresolved Medium, Low, and informational findings are recorded in one dated
  note and do not block campaign completion.
- Audit findings must include criterion, evidence, consequence, reproducer,
  confidence, severity, and suggested disposition.

## Non-Goals

- No new provider, public endpoint, CLI alias, or operator workflow.
- No live browser/provider action, install, restart, scheduler/completion
  control, or external publication beyond normal source push.
- No broad service-volatility migration or provider DOM rewrite.
- No weakening of account identity, browser ownership, approval, captcha, or
  fail-closed gates.
- No repeated audit discovery or open-ended repair loop.

## Acceptance Criteria

- [x] C1 callers obtain one browser launch plan through the deepened interface,
  with current semantics and focused/affected validation green.
- [x] C2 provider prompt execution has one deep seam across ChatGPT, Gemini,
  and Grok while provider-specific workflow remains adapter-local.
- [x] C3 one materialization attempt owns its observable lifecycle and receipt
  semantics without weakening fail-closed behavior.
- [x] C4 ChatGPT and Grok acceptance runs share one deep harness while retaining
  provider-specific phase behavior.
- [x] Subagent planning, execution, and testing receipts are reconciled for
  every candidate.
- [x] The sole campaign audit is complete; every accepted High finding is
  repaired and verified or the affected criterion remains blocked.
- [x] Lower-severity unresolved findings, if any, are retained in a dated note.
- [x] Targeted and integration validation, CodeGraph, docs, plan audit, diff
  hygiene, commit history, and origin readback agree with the final state.

## Definition Of Done

All four candidates are implemented sequentially and verified against their
public interfaces. The one allowed audit/repair cycle is closed, no unresolved
High finding remains, non-High findings are retained as notes, and source,
tests, docs, commits, and origin agree. Green tests or a completed audit alone
do not substitute for requirement-by-requirement current-state proof.
