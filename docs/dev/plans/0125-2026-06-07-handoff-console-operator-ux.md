# Handoff Console Operator UX Plan | 0125-2026-06-07

State: CLOSED
Lane: P01

## Purpose

Execute the next bounded implementation slice under Plan 0114 after Plan 0124
installed deterministic resume, repair, and manual export packet artifacts.
The next gap is an operator-visible surface that can inspect and operate those
artifacts without requiring direct filesystem access or chat-history memory.

This slice adds local API endpoints plus a console Handoffs view. It does not
perform live provider recovery; live provider mutation remains gated by the
existing upload/submit approval contracts and a later provider-specific slice.

## Current State

- Plan 0124 writes `target/resume-plan.json`, `repair/report.json`, and
  `target/manual-handoff-export.json` from CLI commands.
- The browser console cannot read packet files directly.
- Operators need a local API bridge to read current packet state and trigger
  deterministic resume/repair/export actions.

## Scope

- Add local HTTP endpoints:
  - `GET /v1/handoffs/{id}/status`;
  - `POST /v1/handoffs/{id}/resume`;
  - `POST /v1/handoffs/{id}/repair`;
  - `POST /v1/handoffs/{id}/export`.
- Advertise handoff operator routes from `/status`.
- Add a console `Handoffs` view with handoff id, optional output directory,
  status/resume/repair/export actions, artifact summary, and raw JSON output.
- Keep all operations deterministic and packet-owned.

## Non-Goals

- Do not add live provider recovery in this slice.
- Do not bypass upload or submit approval gates.
- Do not add project-specific ChatGPT/Gemini/Grok heuristics.
- Do not add broad handoff listing/search yet.

## Work Tracks

### Track 1 | Local Handoff API

Status: completed.

- Route status/resume/repair/export to the existing handoff service functions.
- Use operator config authorization for packet file access.
- Return 404 for missing packets.

Acceptance evidence:

- focused HTTP tests create a packet and prove status/resume/repair/export
  endpoints write/read the expected artifacts.

### Track 2 | Console Handoffs View

Status: completed.

- Add `Handoffs` to primary console navigation.
- Provide packet id and optional output-directory inputs.
- Expose status, resume, repair, and export actions with summary metrics and
  raw JSON output.

Acceptance evidence:

- console build passes and includes the new view route.

## Definition Of Done

Plan 0125 closes as **Handoff Console Operator UX Installed** when the local
API and console can inspect a handoff packet and trigger deterministic
resume/repair/export actions without live provider mutation.

## Validation Plan

- `pnpm vitest run tests/http.handoffOperator.test.ts tests/cli/handoffCommand.test.ts`
- `pnpm exec tsc --noEmit --pretty false`
- focused `pnpm exec biome lint` on handoff source, HTTP server, console, and
  tests
- `pnpm run console:build`
- `pnpm run plans:audit -- --keep 125`
- `git diff --check`
- `pnpm run build`

## Exit Criteria

Closed as **Handoff Console Operator UX Installed**. Operators can use the
console and local API to inspect packet state and operate deterministic
resume/repair/export artifacts. Live provider recovery remains the next
bounded handoff automation slice.
