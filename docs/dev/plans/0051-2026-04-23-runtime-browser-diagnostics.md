# Runtime Browser Diagnostics | 0051-2026-04-23

State: CLOSED
Lane: P01 maintenance

## Scope

Add one bounded, run-scoped browser diagnostics surface so operators and MCP/API
callers can inspect the live browser state of an active runtime run without
opening unfenced CDP access or navigating the provider page.

This supports provider-status debugging for ChatGPT, Gemini, and Grok,
especially Gemini spinner/media states where the selected browser target,
document state, and screenshot matter as much as the normalized service-state
summary.

## Current State

- Runtime inspection already exposes bounded queue/runner state and optional
  compact `serviceState`.
- Operators still need same-target browser evidence when normalized provider
  evidence is ambiguous or stale.
- Browser-service ownership is the correct boundary for target resolution and
  screenshot capture; callers should not need raw DevTools access.

## Non-Goals

- Do not expose raw JavaScript evaluation, arbitrary CDP calls, or screenshot
  capture outside Aura-Call-owned diagnostics.
- Do not navigate or refresh the provider page for diagnostics.
- Do not make diagnostics durable replay; this is a live active-run probe.
- Do not replace `serviceState`; diagnostics complements the compact status
  state with target/document/screenshot evidence.

## Implementation

- `GET /v1/runtime-runs/inspect?...&diagnostics=browser-state` returns optional
  `browserDiagnostics` for the active running step.
- `auracall api inspect-run ... --diagnostics browser-state` renders the same
  evidence for local operators.
- MCP `runtime_inspect` exposes the same optional diagnostics flag.
- The default browser diagnostics probe is restricted to browser-backed
  ChatGPT, Gemini, and Grok runtime profiles.
- The probe resolves the provider target through browser-service ownership,
  reads bounded DOM/document state, records provider evidence where available,
  captures one PNG screenshot into AuraCall diagnostics storage, and closes the
  CDP client.

## Acceptance Criteria

- [x] Runtime inspection core can attach optional browser diagnostics only for
  an actively running step.
- [x] HTTP, CLI, and MCP expose the same opt-in diagnostics switch.
- [x] Diagnostics return bounded target/document/control-count/provider
  evidence and a stored screenshot path.
- [x] Diagnostics do not expose raw CDP/JS access and do not mutate provider
  state.
- [x] User-facing docs describe the new opt-in query/tool/CLI behavior.

## Validation

- [x] `pnpm run check`
- [x] `pnpm vitest run tests/runtime.inspection.test.ts tests/http.responsesServer.test.ts tests/cli/runtimeInspectionCommand.test.ts tests/mcp.runtimeInspect.test.ts`

## Follow-Up

- Dogfood this on the next live Gemini text/media run and compare the
  screenshot plus Gemini provider evidence against normalized `serviceState`
  before changing more selectors.
