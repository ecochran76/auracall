# Open Notebook Recoverable Run Client Contract

## Context

Open Notebook sent a notebook chat request through the AuraCall Open Notebook Pro
agent and AuraCall accepted the browser-backed ChatGPT run as
`resp_69cc117b60d747d9a769f283f1eacc77`.

The run was recoverable and ultimately succeeded, but Open Notebook saw a poll
request fail with `httpx.RemoteProtocolError: Server disconnected without
sending a response.` Open Notebook then surfaced `POST /api/chat/execute` as a
500 and did not persist the assistant response. Its chat session ended with two
consecutive human messages and no assistant message after the latest attempt.

That is the wrong client-facing behavior for an accepted AuraCall run.

## Evidence

- AuraCall response id:
  `resp_69cc117b60d747d9a769f283f1eacc77`.
- Created at `2026-06-27T18:06:13Z`; completed at
  `2026-06-27T18:12:53Z`.
- Agent: `agent:open-notebook-pro-chatgpt-soylei`.
- Provider conversation:
  `https://chatgpt.com/g/g-p-6a3eecf7d640819187da29b67befeca9-open-notebook/c/6a401171-bca4-83ea-999f-b31048da6857`.
- AuraCall logs showed the browser-backed run was submitted, received SIGTERM
  while the assistant response was pending, then reattached and recovered the
  assistant response via polling fallback.
- Open Notebook logs showed the polling failure happened while calling
  `/v1/responses/{response_id}` and was classified as an external service error.

## Corrected Contract

Once AuraCall has accepted work and issued a `response_id`, every client-facing
API surface must remain durable and pollable.

Required behavior:

- `/v1/chat/completions` may complete synchronously when the assistant result is
  available within `chatCompletionSyncTimeoutMs`.
- If the assistant result is not ready, `/v1/chat/completions` must return a
  structured pending response that includes the `response_id`, current status,
  retry guidance, and the poll URL or path. It must not leave the client with a
  socket close, empty response, or ambiguous generic failure.
- `/v1/responses/{response_id}` must return structured JSON for recoverable
  states such as `queued`, `running`, `recovering`, or `pending_browser_result`.
- Browser restart, service restart, SIGTERM, provider wait, and account-mirror
  reattach windows are recoverable states when the run record exists. They
  should be exposed as pollable status, not as final failure.
- Terminal `500` responses are reserved for unrecoverable server faults, such as
  an internal exception that prevents the run from being persisted or read back.
  Even then, AuraCall should return structured JSON with an error type, message,
  and request/response id when available.
- If the runner later completes successfully, prior recoverable interruptions
  must not cause clients to lose the assistant response.

The OpenAI-compatible chat-completions shape can still use an error-shaped
pending payload if that is required for compatibility, but it must be explicit,
documented, and parseable. A dropped connection is not an API contract.

## Client Guidance

Clients that already have a `response_id` should treat transient transport
errors during polling as retryable. Open Notebook should add a retry around
`RemoteProtocolError` for known response ids.

That client retry is a defensive measure only. AuraCall remains responsible for
returning stable JSON for recoverable run states.

## Acceptance Criteria

- A chat-completions request that exceeds `chatCompletionSyncTimeoutMs` returns a
  pending JSON payload with a `response_id` and poll path.
- Polling `/v1/responses/{response_id}` while a browser-backed run is recovering
  returns JSON status instead of closing the connection.
- A simulated restart or SIGTERM after provider submission preserves the run
  record and allows the same `response_id` to poll through to `completed`.
- A recovered completed run is still visible to clients that saw an earlier
  pending or recovering status.
- A true internal server failure returns structured JSON and does not mask a
  successfully completed provider result as a failed assistant response.
- An Open Notebook style client can submit, receive pending/recovering status,
  poll to completion, and persist exactly one assistant response after the
  original human message.

## Next Implementation Slice

Harden the HTTP response server path around chat-completions sync timeout,
`/v1/responses/{response_id}` polling, and restart recovery. Add tests that
simulate the exact Open Notebook failure mode: accepted run, browser-backed
pending state, service interruption or reattach window, poll retry, completed
assistant result.
