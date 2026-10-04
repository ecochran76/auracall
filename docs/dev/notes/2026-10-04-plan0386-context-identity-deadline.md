# Issue165 — context identity deadline diagnosis

## Evidence and scope

The installed PR197 control aborted during conversation-context collection. Its
context-read receipt reported `lastStage=provider:chatgpt.retainScopedTarget`,
`pendingOperation=null`, one attempt, and 130079ms elapsed under a 360000ms
outer deadline. That identifies a boundary, not the particular stalled call.
The owned page answered the warning probe in 270.817ms and a passive sidebar
read in 56.54ms. Neither proves the context reader was progressing.
See `2026-10-04-plan0386-pr197-installed-test.json` for installed evidence.

## Reproduction and falsifiable hypotheses

Command: `pnpm vitest run tests/browser/chatgptContextReadDeadline.test.ts`.
The test enters the real adapter context reader with an authorized retained
conversation session, fake time, and a CDP transport that never completes its
identity evaluation. Before repair it returned `stalled beyond identity deadline`
at 20000ms instead of the expected identity timeout. The responsive missing-
identity control rejected promptly. Repeating the original test reproduced red.

Ranked predictions before repair:
1. If identity evaluation is stalled, a host deadline terminates the replay.
2. If subsequent dialog inspection is stalled, identity deadlines alone leave
   that separate failure unresolved.
3. If configured pacing explains the live delay, responsive evaluations still
   finish only after configured admission waits; this replay excludes pacing.

The first repair turned the auth-session case green. A second fault-injected
fallback-identity case then went red with the same 20000ms sentinel and turned
green after bounding that evaluation. This proves two missing deadlines on the
actual context path. It does not establish either as the live slowdown's cause.

## Resulting behavior

Both auth-session and fallback identity Runtime evaluations have a 10000ms CDP
limit plus a host-side timeout. The in-page fetch abort alone cannot bound a
frozen CDP evaluation. Named pending-operation telemetry now identifies each
identity read in an interrupted context receipt. Matching identity remains
required; inconclusive probes throw, and existing successful identity merging
and responsive retry behavior are preserved.

## Validation and review

273 provider-free tests passed across context deadline, adapter, LlmService
context, and account-mirror collector suites. Typecheck passed. Scoped Biome
lint passed without warnings after removing a test non-null assertion.
Serial standards review checked bounded waits, existing timeout conventions,
optional options compatibility, and patch scope. Specification review checked
that identity authorization remains fail-closed and no cross-tab warning scan,
provider pacing change, or successful refresh claim was introduced.

Installed acceptance of this change has not run. The remaining diagnosis gate
is a bounded installed context read with fresh pending-operation evidence.
