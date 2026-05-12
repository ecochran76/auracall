---
name: auracall-api-workflow
description: Use AuraCall as an OpenAI-compatible local service for configured agents, single responses, chat completions, response batches, attachments, and run polling.
---

# AuraCall API Workflow

Use this skill when another agent or app needs to call AuraCall as a local LLM
service. Treat `agent:<agent_id>` as the model name and prefer scoped API keys.

## Inputs To Locate

- `OPENAI_BASE_URL`, usually `http://auracall.localhost/v1`
- `OPENAI_API_KEY`, preferably scoped to the intended agent or team
- model id, usually `agent:<agent_id>`
- optional `AURACALL_STATUS_URL` and `AURACALL_BATCH_URL` from the handoff env
- optional local attachment paths
- optional batch limits:
  - `maxConcurrentRuns`
  - `maxBrowserInteractionsPerMinute`

## Golden Path

1. Check service posture:
   - `curl -s "$OPENAI_BASE_URL/../status"` when using HTTP directly, or MCP
     `api_status` when available.
2. Discover models:
   - `GET /v1/models`
   - confirm the intended `agent:<agent_id>` appears.
3. For one prompt:
   - call `POST /v1/responses` or non-streaming
     `POST /v1/chat/completions`.
4. For many independent prompts:
   - call `POST /v1/response-batches` once.
   - poll `GET /v1/response-batches/{batch_id}`.
   - read child output through `GET /v1/responses/{response_id}`.
5. Never resubmit a create request just to check status.

## Response Request Shape

```json
{
  "model": "agent:<agent_id>",
  "input": "Prompt text",
  "attachments": [
    {
      "id": "packet-1",
      "fileName": "packet.md",
      "mimeType": "text/markdown",
      "uri": "file:///absolute/path/packet.md"
    }
  ],
  "metadata": {
    "workflow": "example"
  }
}
```

## Batch Request Shape

```json
{
  "metadata": {
    "workflow": "example-batch"
  },
  "limits": {
    "maxConcurrentRuns": 1,
    "maxBrowserInteractionsPerMinute": 8
  },
  "requests": [
    {
      "model": "agent:<agent_id>",
      "input": "First job"
    },
    {
      "model": "agent:<agent_id>",
      "input": "Second job"
    }
  ]
}
```

## Polling Rules

- Keep ids returned by create calls.
- Poll status/readback endpoints by id.
- Do not navigate provider conversation URLs from the client.
- Do not call create endpoints again unless intentionally retrying a failed
  job.
- If browser/provider health looks wrong, use AuraCall status and diagnostics
  surfaces instead of probing provider pages yourself.

## Attachments

- Use local absolute paths or `file://` URIs for uploadable files.
- Include `fileName` and `mimeType` when known.
- HTTP(S) attachment URIs are metadata only until AuraCall gains remote
  materialization.

## Verification

Before a large batch, source or parse the client handoff env file, call
`GET /v1/models`, and run one small `/v1/responses` request with the scoped key.

For repo-local development:

```bash
pnpm run smoke:che447-grading-batch
```

The smoke proves the general batch pattern without live browser/provider quota
use.
