# LitScout Discovery-Aware Readback Acceptance | 0307-2026-08-21

State: OPEN
Lane: P01
Operational state: P0 FROZEN DISCOVERY-AWARE LIVE GATE / EXACT PREFLIGHT NEXT

## Stable Objective

Complete the remaining end-to-end AuraCall/LitScout acceptance by permitting
ChatGPT's transport-only lazy tool discovery and then making exactly one
read-only `research_continue` call for Session 68, while preserving all accepted
terminal-fidelity, browser-ownership, zero-mutation, and cleanup guarantees.

## Current State

- Plan 0306's source, installed fixture, and one real browser run accept the
  history-materialization ownership repair. The run completed in 15.2 seconds
  with exact cleanup and no Chrome/CDP loss.
- That run made zero LitScout calls because its frozen prompt simultaneously
  required `research_continue` and prohibited the separate lazy tool-discovery
  call needed to expose it. The model stopped rather than violating the bound.
- Plan 0304 previously proved the current provider path can perform one
  transport-discovery call followed by exactly one `research_continue` request.
  Its LitScout request-log count advanced `48 -> 49` with zero canonical
  mutation. Therefore the observed Plan 0306 blocker is a prompt/gate contract
  defect, not current evidence for another AuraCall source defect.
- Installed runtime remains byte-exact to accepted product `929aec97`; no new
  install or API restart is required or authorized. This plan permits one
  distinct discovery-aware submission and zero retries after fresh exact
  preflight.
- Gate receipt:
  `docs/dev/notes/2026-08-21-plan0307-discovery-aware-live-gate.json`.

## Planning Metadata

- Parent: Plan 0306 history-materialization browser ownership.
- Critical-path owner/lane: `/root` / `p0307_litscout_discovery_aware_readback`.
- Branch: `fix/plan0302-chatgpt-timeout-signal-cleanup`.
- Target: `main` only after one accepted discovery-aware live receipt closes
  the carried readback criterion.
- Expected write set: this plan, roadmap, runbook, journal, and bounded gate /
  result receipts. Product source is out of scope unless new deterministic
  evidence disproves the prompt-contract diagnosis.
- Parallel work: none. One frozen live call and its reconciliation are the
  serialized critical path.

## Required Work

1. Preserve Plan 0306's zero-retry disposition; do not resubmit its prompt.
2. Freeze a new prompt that permits only transport discovery needed to expose
   LitScout `research_continue`, then requires exactly one substantive LitScout
   call and forbids every other tool/action/retry.
3. Before Send, prove clean pushed source, exact installed parity, healthy API,
   idle account-mirror completion/materialization, idle exact browser operation,
   idle managed Chrome/DevTools state, canonical DB contract, and exact Session
   68 plus LitScout request-log baseline.
4. Submit once with `allow-once`; never approve or execute a LitScout research
   action. Stop after any terminal outcome and reconcile without resubmission.
5. Accept only exact `150 = 12 + 138`, one new read-only LitScout request, zero
   exact-action/corpus mutation, terminal session/model completion, and exact
   runtime cleanup.

## Non-Goals

- No AuraCall or LitScout product-code change unless deterministic evidence
  disproves the prompt-contract diagnosis.
- No install, API restart, research action approval/execution, provider call by
  LitScout, positive or unknown spend, Analyze, drafting, GraphRAG, Graphiti
  write, scheduler control, completion cancellation, or browser cleanup command.
- No persistent tool consent and no second prompt.

## Acceptance Criteria

- `DAR-R1`: the frozen prompt explicitly distinguishes permitted transport-only
  discovery from exactly one substantive LitScout `research_continue` call.
- `DAR-R2`: fresh preflight proves exact installed/runtime, browser ownership,
  and canonical Session 68 baselines without mutation.
- `DAR-R3`: one submission produces exactly one new LitScout
  `CallToolRequest`, zero research actions/provider effects, and no retry.
- `DAR-R4`: the terminal JSON reports exact canonical fields and verifies
  `150 = 12 + 138` with `counts_consistent: true`.
- `DAR-R5`: AuraCall session/model terminalize completed and no foreground,
  browser-operation, managed Chrome, completion, or history-materialization
  residue remains.
- `DAR-R6`: one durable result receipt closes the carried Plan 0306 readback
  criterion and states whether the overall AuraCall/LitScout goal is accepted.

## Bounds And Stops

- One live submission, zero retries, zero installs, and zero API restarts.
- Stop before Send on any source/upstream drift, installed mismatch, canonical
  DB ambiguity, active completion/materialization, exact operation owner,
  managed Chrome/DevTools activity, or Session/request-log ambiguity.
- Stop after any live terminal outcome. Reconcile durable AuraCall and LitScout
  state without another prompt.
- If the provider still cannot expose `research_continue` after explicitly
  permitted discovery, preserve the receipt and diagnose provider/tool inventory
  under a new bounded successor; do not reinterpret that result as permission
  to widen tools or repeat the call.

## Definition Of Done

One discovery-aware AuraCall browser submission returns exact canonical Session
68 state after exactly one read-only LitScout request, changes no canonical or
research state, terminalizes cleanly, and leaves no browser/runtime residue.
