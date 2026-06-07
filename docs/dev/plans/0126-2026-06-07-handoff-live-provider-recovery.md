# Handoff Live Provider Recovery Plan | 0126-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after Plan 0125
added local API and console operator controls. The remaining gap is an explicit
operator recovery action that can take the current deterministic resume plan
and execute only the already approved target-side step.

This slice installs the live-recovery contract and operator entrypoints. The
first executor uses the existing packet-owned target adapter path, while the
replay artifact records the seam where provider-native upload/submit adapters
can be attached without weakening approval gates.

## Current State

- Plan 0124 writes deterministic `target/resume-plan.json`.
- Plan 0125 exposes packet status/resume/repair/export through local API and
  the console.
- Upload and submit already require separate, digest-bound approvals.
- No single operator command can yet take an approved resume action and execute
  it while writing a recovery artifact.

## Scope

- Add `auracall handoff recover-live <id>`.
- Add `POST /v1/handoffs/{id}/recover-live`.
- Add a console `Recover Live` action.
- Write `target/live-recovery.json` for every recovery attempt.
- Execute only `upload` or `submit` when the current resume plan already says
  that action is approved and executable.
- Preserve upload and submit approval validation in the target action services.

## Non-Goals

- Do not bypass upload or submit approval gates.
- Do not implement provider-specific browser heuristics in the handoff service.
- Do not auto-approve target upload or submit.
- Do not claim a provider-native 1:1 conversation clone.

## Definition Of Done

Plan 0126 closes as **Handoff Live Provider Recovery Installed** when operators
can run one explicit recovery action from CLI, HTTP, or console, and the action
either executes the currently approved target step or writes a blocked recovery
artifact with the missing approval/action reason.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts tests/http.handoffOperator.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, CLI, HTTP server, console,
  and tests
- `pnpm run console:build`
- `pnpm run plans:audit -- --keep 126`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Live Provider Recovery Installed**. The recovery contract is
available from CLI, local API, and console, is replayable through
`target/live-recovery.json`, and still requires existing upload/submit approval
artifacts before target mutation.
