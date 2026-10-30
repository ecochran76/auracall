# Plan0466 — Qualify the ID-less Chat composer fallback

State: CLOSED
Lane: P76
Branch: fix/chatgpt-idless-composer
Target: main
Integration: merge

## Current State

Installed selector replay rejects an ID-less visible editable textbox with no
mode controls; adding the legacy ID passes. The exact failure capture records
zero legacy editors and one visible editable textbox. Earlier read-only control
capture records an ID-less ProseMirror editor. These are structural observations,
not a complete failure-time DOM. No live browser currently matches the managed
profile; do not launch or recover it just for this provider-free diagnosis.

## Scope and acceptance

Primary serialized owner. Write set: composer mode selector and focused tests,
this plan, roadmap/runbook, CONTEXT, testing docs and fix/journal receipts.
Reproduce with exact installed expression and actual offline Chrome CSS DOM;
freeze regressions before changing source. Accept one visible enabled ID-less
ProseMirror textbox after the existing bounded wait, preserving explicit Work
checks, no-editor, hidden/disabled, unrelated-editor and ambiguity refusals.
No provider prompts, runtime deployment, app lifecycle change, or general composer
refactor. No independent parallel lane: single coupled selector/test write set.

## Definition of Done

Original and minimized source replays pass; regression and adjacent focused tests,
typecheck, compile and scoped lint pass. Record historical-cause limits and exact
source custody. Installed/live acceptance is separate and not claimed. Preserve
previous approved diagnostic instrumentation in the installed runtime until
separately qualified removal; introduce no new production debug logs.


## Source closeout

[Diagnosis receipt](../notes/2026-10-30-idless-composer-diagnosis.json).
77focused checks pass; typecheck, TypeScript compilation, scoped Biome and diff
hygiene pass. Real offline Chrome CSS replay is red on installed code and green
on corrected source. A first dist replay failed only because plain tsc does not
copy bundled configs; source-tsx replay then exercised the same production
expression successfully. That harness packaging error is retained privately.
Planning audit retains exactly the base's68errors, no new errors.
No runtime installed, no live prompt, no service/browser recovery. Closed finite
source packet; review/integration and live acceptance remain separate.
