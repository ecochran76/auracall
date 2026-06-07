# Handoff Provider-Native Adapter Composition Plan | 0127-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after Plan 0126
installed explicit `recover-live` execution. The remaining gap is a stable
adapter seam so provider-native upload, submit, and readback implementations can
attach behind the recovery contract without moving provider-specific browser
heuristics into the handoff state machine.

This slice installs adapter composition and proves it with an injected
provider-native fixture adapter. The default operator path still uses the
packet-owned target adapter until a provider-specific slice wires real browser
adapters for ChatGPT, Gemini, or Grok.

## Current State

- Plan 0126 can execute the current approved resume-plan action and write
  `target/live-recovery.json`.
- The default executor is packet-owned and deterministic.
- Provider-native browser services exist elsewhere in AuraCall, but they do not
  yet expose a uniform handoff upload/submit/readback adapter contract.

## Scope

- Add a `HandoffTargetAdapter` contract for target upload and submit.
- Route `recoverHandoffLive` through a selected target adapter.
- Preserve the existing packet-owned adapter as the default.
- Record the selected adapter id in `target/live-recovery.json`.
- Add tests proving injected provider-native adapters can execute behind the
  same resume-plan and approval gates.

## Non-Goals

- Do not implement provider-specific browser upload/submit heuristics in the
  handoff service.
- Do not bypass existing upload or submit approvals.
- Do not replace deterministic packet execution for CLI/HTTP/console defaults.
- Do not claim browser-native same-provider or cross-provider smoke proof yet.

## Definition Of Done

Plan 0127 closes as **Handoff Provider-Native Adapter Composition Installed**
when `recoverHandoffLive` accepts an adapter implementation, the default
packet adapter remains unchanged for operators, and tests prove a non-default
adapter can execute approved upload and submit while replay evidence records
the adapter id.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts tests/http.handoffOperator.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, HTTP, console, and
  tests
- `pnpm run console:build`
- `pnpm run plans:audit -- --keep 127`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Provider-Native Adapter Composition Installed**. Provider
adapters now have a stable injection point behind `recover-live`, with
approval-gated resume state and replay artifacts still owned by the host
handoff service.
