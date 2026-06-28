# Open Notebook Recoverable Run Polling | 0147-2026-06-28

State: CLOSED
Lane: P01

## Purpose

Make accepted browser-backed AuraCall response runs durable from a client point
of view, even when the provider run is still pending, recovering, or being
reattached after an interruption.

## Current State

- The Open Notebook evidence note records response
  `resp_69cc117b60d747d9a769f283f1eacc77`: AuraCall eventually recovered and
  completed the ChatGPT browser-backed run, but Open Notebook saw a transport
  disconnect while polling `/v1/responses/{response_id}` and surfaced its chat
  request as a 500.
- `/v1/chat/completions` already has a bounded synchronous wait path. When the
  wait expires, it returns a retryable `auracall_execution_pending` payload with
  the persisted `response_id` and `Retry-After`.
- Runtime response projection already exposes recoverable states such as
  `recovering` and `finalizing` through
  `metadata.executionSummary.runtimeDiagnosticsSummary`.
- HTTP readback is now route-hardened: once a run id exists, polling
  `/v1/responses/{response_id}` returns structured JSON for recoverable states
  and structured server errors for true readback faults, not a dropped socket
  or ambiguous empty response.

## Problem Statement

Open Notebook and similar clients treat a dropped polling connection as an
external service failure. That is reasonable when the server never accepted
work, but it is wrong after AuraCall has persisted a response id. Accepted runs
must remain pollable by id across browser wait, reattach, service restart, and
provider recovery windows so clients can persist the eventual assistant result
exactly once.

## Scope

- Harden `GET /v1/responses/{response_id}` so accepted run readback returns
  JSON for recoverable pending/recovering/finalizing states.
- Preserve the existing `/v1/chat/completions` sync-timeout behavior and make
  the poll path explicit in docs.
- Add focused HTTP regression tests that simulate:
  - pending chat-completions return with `response_id`;
  - polling a browser-backed recovering run;
  - polling through completion after the same response id later succeeds;
  - a true readback exception returning structured JSON with the response id.
- Update user-facing and operator docs for the client contract.

## Non-Goals

- Do not add streaming chat-completions support.
- Do not add new public endpoints.
- Do not change provider browser automation, account-mirror pacing, or
  ChatGPT recovery heuristics.
- Do not make Open Notebook client changes in this repo; client retry around a
  known `response_id` remains recommended but defensive.

## Acceptance

- [x] A chat-completions request that exceeds `chatCompletionSyncTimeoutMs`
  returns retryable JSON with `response_id`, status, retry guidance, and poll
  path guidance.
- [x] `GET /v1/responses/{response_id}` returns `200` JSON for a persisted
  browser-backed run in a recovering state.
- [x] The same `response_id` can later be read back as `completed` after the
  persisted run succeeds.
- [x] A readback exception for a known response route returns structured JSON
  with error type, message, and `response_id`; it does not leave the client with
  an empty/dropped response.
- [x] Focused HTTP tests, typecheck, scoped lint, and plan audit pass.
- [x] README or endpoint/workflow docs, `docs/dev/dev-journal.md`, and
  `docs/dev-fixes-log.md` record the final contract.

## Validation Plan

- `pnpm vitest run tests/http.responsesServer.test.ts -t "Open Notebook"`
- `pnpm vitest run tests/http.responsesServer.test.ts -t "chat completion"`
- `pnpm exec tsc --noEmit --pretty false`
- `pnpm exec biome lint src/http/responsesServer.ts tests/http.responsesServer.test.ts`
- `pnpm run plans:audit -- --keep 147`

## Closeout

- Added `response_poll_path` to retryable `auracall_execution_pending`
  chat-completions payloads.
- Wrapped `GET /v1/responses/{response_id}` readback in route-local error
  handling so true projection/readback faults return structured
  `auracall_response_readback_error` JSON with `response_id` and
  `response_poll_path`.
- Added HTTP regression coverage for:
  - Open Notebook style recovering browser-backed response polling;
  - the same response id later reading back as `completed` with assistant
    output;
  - structured response readback fault JSON.
- Updated README, agent workflow docs, OpenAI endpoint docs, roadmap, runbook,
  dev journal, and fixes log.
- Validation passed:
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "Open Notebook"`;
  - `pnpm vitest run tests/http.responsesServer.test.ts -t "chat completion"`;
  - `pnpm exec tsc --noEmit --pretty false`;
  - `pnpm exec biome lint src/http/responsesServer.ts tests/http.responsesServer.test.ts`
    exited `0` with existing warning-level non-null assertion debt in unrelated
    portions of the test file;
  - `pnpm run plans:audit -- --keep 147`.
- Broader note: `pnpm vitest run tests/http.responsesServer.test.ts` was
  interrupted after multiple quiet 30s intervals with no failure output.

## Definition Of Done

Plan 0147 closed when accepted response ids were proven pollable through
recoverable browser-backed run windows, true readback faults are structured
instead of transport-empty, and the durable docs and logs record the behavior.
