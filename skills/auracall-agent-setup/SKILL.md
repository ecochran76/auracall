---
name: auracall-agent-setup
description: Configure AuraCall agents, teams, project-bound agents, and scoped API keys through privileged API/MCP setup surfaces before execution clients run work.
---

# AuraCall Agent Setup

Use this skill for privileged setup. Do not use it for ordinary scoped
execution calls unless the caller is explicitly allowed to mutate AuraCall
configuration.

## Setup Responsibilities

- ensure provider projects when the workflow needs provider-side project state
- create or update AuraCall registry-backed agents
- create or update teams when a workflow needs multi-agent orchestration
- issue scoped API keys for execution clients
- validate diagnostics before handing credentials to another app or agent

## Project-Bound Agent Path

Use `POST /v1/projects/ensure` or MCP `project_ensure`.

Required fields:

- `service`
- `runtimeProfile`
- `projectName`

Recommended agent binding fields:

- `agentId`
- `agentModelSelector`
- `agentInstructions`
- `agentPrePrompt`
- `agentPostPrompt`
- `agentMetadata`

After success:

1. Confirm the returned project id and agent id.
2. Confirm `mutationTarget` is `registry` for a new/updated bound agent.
3. Discover `agent:<agent_id>` from `/v1/models` or MCP config listing.
4. Issue a scoped key for the agent.
5. Include `clientEnvPath` so AuraCall writes a sourceable execution handoff.
6. Restart the installed API service when the key was written to
   `~/.auracall/api.env`.
7. Give the execution client only the client env path or these values:
   - `OPENAI_BASE_URL`
   - `OPENAI_API_KEY`
   - `AURACALL_MODEL=agent:<agent_id>`
   - `AURACALL_STATUS_URL`
   - `AURACALL_BATCH_URL`

## Naming

Prefer deterministic ids:

```text
<mode>-<provider>-<identity-or-tenant>[-<project-or-domain>]
```

Examples:

```text
instant-chatgpt-ecochran76
pro-extended-chatgpt-soylei
pro-extended-chatgpt-soylei-che4470-seminar-grading
```

## Privilege Boundary

- Operator keys may setup projects, agents, teams, snapshots, diagnostics, and
  API keys.
- Execution keys should be scoped to agents/teams/services/runtime profiles.
- A domain workflow agent should not receive an operator key when it only needs
  to submit prompts.

## Diagnostics

Use:

- `GET /v1/config/agent-diagnostics`
- MCP `api_key_diagnostics`
- `GET /v1/models`
- `/status` or MCP `api_status`

Diagnostics should prove the bound agent exists, key scopes resolve, and the
runtime profile/service identity are expected before handing credentials to a
client.

## Current Limits

- Remote privileged setup needs a first-class principal/role model before it
  should be exposed beyond trusted local clients.
- Grok and Gemini semantic selectors still need provider-adapter execution
  completion before they should be used as default execution-ready selectors.
- Provider UI drift is handled inside AuraCall; setup skills should not encode
  provider DOM selectors.
