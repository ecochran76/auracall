# ChatGPT Current Live Findings Repair | 0346-2026-09-11

State: CLOSED
Lane: P39
Operational state: INTEGRATION_READY
Branch: fix/plan0346-chatgpt-live-findings
Target: main
Integration: merge
Revision: 2 | 2026-09-11

## Stable Objective

Repair both Plan 0345 live failures provider-free: accept the current compact
`6Pro` spelling only as exact semantic `6 Pro`, and prevent a Deep Research PDF
request from admitting an old or DOCX download as a fresh PDF result.

## Current State

- Published `main` is clean and local/remote equal at `4a57abc2d`; P38 is
  integrated with its redacted terminal receipt and closed local custody.
- `modelSelection.ts` normalizes punctuation and whitespace but does not split
  compact alpha/numeric boundaries. The animated-trigger admission regex
  therefore rejects current `6Pro` even though downstream semantic scoring can
  classify it as Pro.
- Deep Research export currently waits for the lexicographically first stable
  completed file in an artifact directory. It does not snapshot pre-existing
  files or require the requested extension, so a PDF request can admit DOCX
  bytes as materialized PDF.
- CodeGraph is not initialized in this worktree. Current source, executable
  tests, Plan 0345, and its receipt are the authoritative fallback. Graphiti is
  healthy but has no reviewed AuraCall memory cloud.
- Compact alpha/numeric boundaries now normalize for semantic comparison in
  both host and injected picker logic. Provider-free fixtures admit `6Pro` as
  desired `6 Pro`, preserve the raw `6Pro` observation, and reject `6Power`,
  `Power`, generic `Pro`, and effort controls.
- Deep Research export now snapshots the destination before the provider click,
  ignores unchanged and wrong-extension files, requires one fresh stable file
  of the requested variant, and validates `%PDF-` or ZIP bytes before returning
  a materialized result. Existing files are never deleted.
- Published checkpoint `40f2cecf9` passes 25/25 focused tests, 353/353 affected
  browser/CLI/architecture tests, typecheck, production build, scoped lint,
  diff hygiene, and the 346-plan audit with zero validation errors.
- No installation, service, browser, provider, recovered-conversation, or
  runtime-control effect ran in P39. Installed/live proof remains the successor
  gate required to close the end-to-end goal.

## Execution Graph

1. Publish this plan and P39 lane from exact current `main`.
2. Add RED fixtures for compact `6Pro` trigger/option behavior and for download
   admission that rejects pre-existing or wrong-extension files.
3. Make the smallest provider-local repairs: boundary-aware model-label
   normalization plus fresh expected-variant download selection and validation.
4. Run focused and affected tests, typecheck, production build, scoped lint,
   architecture guard, planning/goal/lane audits, and diff hygiene.
5. Update operator docs and the fixes log, publish the provider-free checkpoint,
   merge it into `main`, and preserve installed/live proof for a successor lane.

## Acceptance Criteria

- `CLF-R1`: provider-free executable coverage proves `6Pro` is admitted and
  selected for desired `6 Pro`, while `Power`, generic `Pro`, thinking controls,
  Work controls, and unrelated compact labels remain rejected.
- `CLF-R2`: requested/desired/observed model identity remains distinct and the
  observed provider label is preserved rather than rewritten.
- `CLF-R3`: export download admission snapshots existing files, ignores wrong
  extensions and unchanged retained files, and returns only a fresh stable file
  matching the requested DOCX or PDF variant.
- `CLF-R4`: a wrong-variant-only result fails explicitly and cannot increment
  `materializedCount`; existing authoritative artifacts are not deleted.
- `CLF-R5`: focused/affected validation and policy audits pass with zero
  provider, browser, installed-runtime, service, recovered-conversation, or
  runtime-control effects.
- `CLF-R6`: plan, lane, roadmap, runbook, journal, fixes log, and handoff agree
  that provider-free acceptance is not installed/live acceptance.

## Bounds And Hard Stops

- At most two implementation attempts per finding and one closed-world
  remediation verification pass.
- No installation, service restart, browser launch/attachment/navigation, live
  DOM inspection, provider request, prompt, Send, artifact fetch, recovered-
  conversation mutation, or scheduler/completion/materialization control.
- Never click `Answer now`; do not weaken identity, composer, Chat/Work,
  ownership, hostile-state, or post-effect uncertainty guards.
- Do not solve the export finding by deleting retained files, accepting MIME
  metadata alone, retrying provider work, or relabeling wrong bytes.

## Definition Of Done

CLF-R1 through CLF-R6 have executable provider-free evidence, the exact topic
is integrated, and a separately bounded installed/live successor proves both
repairs before the end-to-end goal can close.
