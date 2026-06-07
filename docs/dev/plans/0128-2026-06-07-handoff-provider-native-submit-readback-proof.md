# Handoff Provider-Native Submit Readback Proof Plan | 0128-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after Plan 0127
installed target adapter composition. The next useful proof is a provider-native
submit/readback adapter that can sit behind `recover-live` while the host
handoff service still owns approvals, digest guards, replay artifacts, and
packet state.

This slice wires the first provider-native submit seam through a prompt runner
contract. Native file upload remains delegated to the packet adapter until a
provider-specific file-attach slice proves a real browser upload path.

## Current State

- `recover-live` can execute the current approved resume-plan action.
- `HandoffTargetAdapter` lets a non-default adapter attach behind recovery.
- The default operator path remains `packet_target_adapter`.
- No adapter yet maps handoff primer/compact-context payloads into a
  provider-native prompt submission and readback artifact.

## Scope

- Add provider-native prompt runner input/result contracts.
- Add `createProviderNativeHandoffTargetAdapter(...)`.
- Keep upload delegated to `packet_target_adapter` for now.
- Submit the handoff primer plus compact context through the runner after the
  existing submit approval guard passes.
- Persist provider-native target conversation ref, provider message id,
  response summary, and response excerpt into `target/submission-result.json`
  and `target/readback.json`.
- Prove the adapter with fixture tests that inspect runner input and readback
  output.

## Non-Goals

- Do not automate a live browser smoke in this slice.
- Do not implement provider-native file attachment/upload.
- Do not bypass existing upload or submit approvals.
- Do not move provider-specific selectors or browser heuristics into
  `src/handoff/service.ts`.

## Definition Of Done

Plan 0128 closes as **Handoff Provider-Native Submit Readback Proof Installed**
when a provider-native prompt runner can execute the approved submit step behind
`recover-live`, the packet records provider-native conversation/message
readback evidence, and all existing approval gates remain enforced.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts tests/http.handoffOperator.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, HTTP, console, and
  tests
- `pnpm run console:build`
- `pnpm run plans:audit -- --keep 128`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Provider-Native Submit Readback Proof Installed**. The
first provider-native handoff adapter seam is installed for submit/readback,
with native upload/attachment deferred to a later provider-specific proof.
