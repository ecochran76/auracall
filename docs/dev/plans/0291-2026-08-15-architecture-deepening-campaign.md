# Architecture Deepening Campaign | 0291-2026-08-15

State: OPEN
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
- CodeGraph is healthy with 898 indexed files and no reported pending sync.
- Candidate 1 is provider-free accepted. Sixteen production function/method
  callers now cross one immutable browser launch plan seam; the superseded
  launch-context helpers and the config/profile-resolution cycle are removed.
- Candidate 2, provider prompt execution, is the active critical-path unit.
- Candidate 2 aligns with BrowserService Roadmap Phase 4: Gemini and Grok use
  the planned provider-prompt path while ChatGPT reconstructs browser options
  and detours through `runBrowserMode()`.
- Candidate 3 has observed call-order and receipt coupling across history
  materialization, provider materializers, archive persistence, and Account
  Mirror planning.
- Candidate 4 has observed process/timeout/JSON/state duplication in the
  ChatGPT and Grok acceptance runs.
- Candidate 1 source, tests, and governing docs are ready for their validated
  checkpoint commit. No live browser/provider or installed/runtime state was
  changed.

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
- [ ] C2 provider prompt execution has one deep seam across ChatGPT, Gemini,
  and Grok while provider-specific workflow remains adapter-local.
- [ ] C3 one materialization attempt owns its observable lifecycle and receipt
  semantics without weakening fail-closed behavior.
- [ ] C4 ChatGPT and Grok acceptance runs share one deep harness while retaining
  provider-specific phase behavior.
- [ ] Subagent planning, execution, and testing receipts are reconciled for
  every candidate.
- [ ] The sole campaign audit is complete; every accepted High finding is
  repaired and verified or the affected criterion remains blocked.
- [ ] Lower-severity unresolved findings, if any, are retained in a dated note.
- [ ] Targeted and integration validation, CodeGraph, docs, plan audit, diff
  hygiene, commit history, and origin readback agree with the final state.

## Definition Of Done

All four candidates are implemented sequentially and verified against their
public interfaces. The one allowed audit/repair cycle is closed, no unresolved
High finding remains, non-High findings are retained as notes, and source,
tests, docs, commits, and origin agree. Green tests or a completed audit alone
do not substitute for requirement-by-requirement current-state proof.
