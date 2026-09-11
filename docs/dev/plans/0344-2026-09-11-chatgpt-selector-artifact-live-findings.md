# ChatGPT Selector And Artifact Live-Findings Repair | 0344-2026-09-11

State: OPEN
Lane: P37
Operational state: PROVIDER_FREE_DIAGNOSIS
Branch: fix/plan0344-chatgpt-selector-artifact-live-findings
Target: main
Integration: merge
Revision: 1 | 2026-09-11

## Stable Objective

Repair the two terminal Plan 0343 installed-live findings provider-free: the
explicit Chat `6 Pro` selector timeout before Send and the sequential
Markdown/DOCX/PDF artifact transfer failures after the first materialization.

## Current State

- Published `main` is clean and local/remote equal at
  `067ee2a4373c4b938a64e1ca563b20dd1eeeccf7`; P36 is integrated with terminal
  findings and no live acceptance.
- P36 installed exact source-identical bytes, proved identity-smoke lifecycle,
  and retained runtime custody. Its only effect-capable prompt Session persisted
  desired `6 Pro`, `modelStrategy=select`, and Chat mode, then timed out waiting
  35 seconds for the selector with no conversation, output, or completed Send.
- P36's single protected-conversation artifact fetch exited normally but
  materialized Markdown only. DOCX and PDF each recorded `Promise was
  collected`; the authoritative previously recovered three-file set remains
  intact and the provider conversation was not mutated.
- Graphiti is healthy but its reviewed atlas returned no relevant AuraCall
  memory cloud. The integrated P36 plan, receipt, current source, tests, and Git
  history are authoritative. The general memory registry hit is an unrelated
  older LitScout Plan-number collision and is not used.
- This lane is provider-free. It may edit source, tests, fixtures, and docs but
  may not install AuraCall, attach to or launch a browser, inspect live DOM,
  call a provider, send a prompt, fetch the protected conversation, restart a
  service, or alter scheduler/completion/materialization controls.

## Execution Graph

Owner: primary agent. No subagents are authorized for this lane.

1. Publish this plan and P37 lane from exact current `main`.
2. Use CodeGraph to trace explicit Chat model selection and artifact candidate
   transfer/rebinding paths, then reconcile those paths with P36's persisted
   terminal evidence and existing provider-free fixtures.
3. Add or strengthen the cheapest deterministic RED fixtures that reproduce:
   - the current animated `6 Pro` Chat trigger being missed by explicit
     `modelStrategy=select`; and
   - later artifact variants inheriting a disposed or collected CDP execution
     context after the first transfer.
4. Make the smallest provider-local selector repair and reusable transfer-
   lifecycle repair. Preserve requested/desired/observed model separation,
   Chat/Work selector separation, hostile-state hard stops, per-artifact error
   recording, and independent transfer cleanup.
5. Run focused RED/GREEN tests, affected browser/CLI tests, typecheck,
   production build, scoped lint, architecture guard, CodeGraph impact
   readback, planning audits, and Git/diff hygiene.
6. Publish an integration-ready provider-free checkpoint. Installation and
   live adoption remain a separately authorized successor lane.

## Acceptance Criteria

- `SAR-R1`: an executable provider-free selector fixture fails before the fix
  and proves explicit `select` finds, clicks, and verifies the current
  composer-scoped animated `6 Pro` trigger without accepting Power, High,
  generic Pro, thinking-time, or Work surfaces.
- `SAR-R2`: selected-model evidence returns exact observed `6 Pro` and remains
  distinct from semantic `chatgpt:premium` and desired provider label.
- `SAR-R3`: an executable three-variant artifact fixture fails before the fix
  and then proves Markdown, DOCX, and PDF each start with a valid independent
  browser binding/execution context, settle success or error independently,
  and close only their own scoped resources.
- `SAR-R4`: later transfers cannot reuse a disposed session, collected Promise,
  stale remote object, or navigated execution context from an earlier variant;
  cleanup still occurs on every success/error path.
- `SAR-R5`: affected tests, typecheck, build, scoped lint, architecture guard,
  CodeGraph readback, plan/goal/lane audits, diff hygiene, and Git publication
  pass without provider or installed-runtime effects.
- `SAR-R6`: plan, lane, roadmap, runbook, journal, fixes log, and final handoff
  distinguish provider-free acceptance from still-unproven installed/live
  behavior.

## Bounds And Hard Stops

- Maximum two implementation attempts per accepted blocking finding and one
  closed-world review/rework cycle.
- No installed launcher, runtime installation, service restart, managed browser
  launch/attachment/navigation, live DOM inspection, provider request, prompt,
  Send, artifact fetch, protected-conversation mutation, or runtime control.
- Never click ChatGPT's `Answer now` button. Do not weaken CAPTCHA, identity,
  composer, Chat/Work, ownership, or post-effect uncertainty guards.
- Do not solve explicit selection by falling back to `current`, broad text
  matching, or treating a thinking/effort control as a model selector.
- Do not solve artifact settlement by retrying failed variants, sharing a live
  CDP execution object across variants, or hiding errors behind retained files.
- Preserve unrelated dirty work and the inherited P08/P16 lane-audit findings.

## Definition Of Done

SAR-R1 through SAR-R6 have executable provider-free evidence, the exact
published topic is integration-ready or a bounded terminal finding is recorded,
and every installed/live/provider action remains explicitly unspent.
