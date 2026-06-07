# Handoff ChatGPT Browser Recovery Surface Plan | 0131-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Continue Plan 0114 after Plan 0130 installed the live-capable ChatGPT browser
prompt attachment adapter. The adapter existed as an importable factory, but
normal operator surfaces still executed only the default packet adapter. This
slice makes ChatGPT browser target recovery explicitly selectable from CLI,
HTTP, and the console while keeping packet recovery as the default.

## Current State

- `recoverHandoffLive(...)` accepts an optional `HandoffTargetAdapter`.
- `createChatgptBrowserHandoffTargetAdapter(...)` can stage selected files and
  submit the approved primer, compact context JSON, and selected attachments
  through ChatGPT browser mode.
- `auracall handoff recover-live`, `POST /v1/handoffs/{id}/recover-live`, and
  the console Handoffs view did not expose an adapter selector.
- Without an explicit selector, live target-profile proof would require a
  one-off code path instead of an auditable operator action.

## Scope

- Add a `packet | chatgpt-browser` target adapter selector to
  `auracall handoff recover-live`.
- Add matching `targetAdapter` support to
  `POST /v1/handoffs/{handoff_id}/recover-live`.
- Add a console Handoffs target-adapter selector and pass it only for live
  recovery actions.
- Keep the default executor as `packet_target_adapter`.
- Fail closed when `chatgpt-browser` is selected without browser-capable
  resolved AuraCall config.
- Add focused tests proving default compatibility and explicit adapter
  dispatch.

## Non-Goals

- Do not run a live ChatGPT target-profile smoke in this slice.
- Do not bypass existing upload or submit approval gates.
- Do not add ChatGPT-specific logic to the handoff state machine.
- Do not make ChatGPT browser recovery the default.

## Definition Of Done

Plan 0131 closes as **Handoff ChatGPT Browser Recovery Surface Installed** when
operators can select the ChatGPT browser target adapter from CLI, HTTP, and the
console, default packet recovery remains unchanged, and invalid browser-adapter
requests fail closed before target mutation.

## Validation Plan

- `pnpm vitest run tests/cli/handoffCommand.test.ts tests/http.handoffOperator.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff CLI, HTTP, console, bin, and tests
- `pnpm run console:build`
- `pnpm run plans:audit -- --keep 131`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff ChatGPT Browser Recovery Surface Installed**. The next
bounded slice is a real approved ChatGPT target-profile smoke using
`--target-adapter chatgpt-browser`.
