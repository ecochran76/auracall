# Plan0462 — Bound developer-app selection and expose utility waits

State: OPEN
Execution: SOURCE_QUALIFIED_DIAGNOSTIC_RUNNING
Branch: fix/issue427-app-terminal-errors
Target: main
Work item: issue427 follow-up diagnosis
Base: ce1408024

## Current State

Operator invoked diagnosing-bugs after installed947739740selection/refresh
returned no output within external180/240second cutoffs. Those are observations,
not proven internal deadlocks. Initially provider-free. One later authorized installed read-only verbose selection
probe identifies the original wait stage; no prompt, catalog refresh or runtime
activation. Its pending status is recorded in the diagnosis receipt.
An isolated installed-source replay and current-main replay both fail the same
read-only selection deadline test; identical list control passes. An earlier
progress-callback probe passed and is retained as negative evidence.

## Scope and finite acceptance

1. Public CLI operation with a non-resolving external inventory proves read-only
   app selection returns a staged timeout and closes its adapter; list is control.
2. Preserve configured backend capacity allowance and submitted response lifecycle.
3. Verify actual CLI stderr reports waits for read-only selection and in-place
   refresh rather than silently awaiting admission. Reuse the existing CLI-action
   harness if it reaches this seam; otherwise report the missing seam.
4. Record causes separately: source unbounded selection is reproducible; actual
   live stalled await and refresh non-result cause remain unqualified without
   stage evidence. No provider-wide or browser-restart claim.

Done when focused original/minimal regressions and applicable source checks pass,
with exact red/green commands and a bounded diagnosis receipt. Installation/live
acceptance and any unrelated Grok/source changes remain separate.

## Ownership and order

Primary, one serialized source lane in a dedicated worktree. Expected writes:
CLI developer-app operation/action, focused tests, domain/docs and this plan.
No subagent or overlapping edit to the operator's Grok documentation checkout.
Freeze red -> compare action/deadline and cleanup controls -> minimum fix ->
original source scenario and regression -> cleanup. No broad refactor.

## Source qualification

95focused checks pass; typecheck, TypeScript compile and scoped lint pass.
[Diagnosis receipt](../notes/2026-10-26-issue427-utility-diagnosis.json) preserves
negative control, red runs, hypotheses and exact green commands. No debug logging
or throwaway source harness remains; the public CLI fixtures are regressions.
The original installed read-only diagnostic runs separately; it does not qualify
the patched runtime, which is not installed. No further source repair is inferred
from a pending live operation.

## Live diagnostic handoff

One installed947739740read-only --verbose selection command started at
2026-10-27T02:21:17Z with0prompts,0catalog refreshes and1300second outer bound
(including600second queue budget). Its latest stage is inventory after identity
and attachment. Source repair remains uninstalled. PID1865739and status under
~/.auracall/diagnostics/issue427-20261026/probe-status.json. Inspect only bounded
stage/error metadata; never retry unknown effect/cleanup or reset ownership.
The actual live nested wait remains unqualified until a terminal receipt or a
more precise trace exists; do not call the refresh allowance a deadlock.
