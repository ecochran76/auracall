# OpenAI Agent API and Semantic Model Selectors

Status: OPEN
Date: 2026-05-10

## Context

AuraCall's local OpenAI-compatible API is moving from low-level provider hints
toward configured agent entrypoints. A basic client should be able to send one
prompt to a configured AuraCall agent and receive a normal response-like result.

Provider model names drift quickly. ChatGPT, Grok, and Gemini all expose
semantic workbench modes such as auto, instant, and thinking; ChatGPT also has
standard/extended depth and normal/pro thinking modes. Agent config should
prefer semantic intent and keep exact provider-version pins as escape hatches.

## Current Slice

- `model: "agent:<agent_id>"` routes a `/v1/responses` request to a configured
  AuraCall agent by setting `auracall.agent`.
- Agents may declare:
  - `runtimeProfile`
  - `service`
  - raw `model`
  - semantic `modelSelector`
  - optional project/conversation identity
  - agent-local knowledge references
  - pre/post prompt fields
- Agent raw `model` and `projectId` now participate in browser-backed
  configured execution.
- Config projection reports only configured agent fields, avoiding null/false
  noise.
- Agents and teams can be created, updated, listed, and deleted through the
  local API and MCP config tools.
- `/v1/models` now publishes:
  - static provider model ids
  - configured AuraCall agents as `agent:<agent_id>`
  - semantic provider selectors with execution-readiness metadata
- Optional local API-key authorization now protects `/v1/*` routes and can
  scope `/v1/responses` calls by agent, team, service, and runtime profile.
- Non-streaming `/v1/chat/completions` requests now adapt OpenAI-style chat
  messages into the existing `/v1/responses` runtime path, drain one host-owned
  run synchronously, and return a standard `chat.completion` object.

## Current State

Implemented:

- config schema and projection carry configured single-agent routing intent
- direct `/v1/responses` agent routing shorthand is accepted
- raw agent `model` and `projectId` are honored by browser-backed configured
  execution
- ChatGPT semantic selectors resolve into current browser controls:
  - `chatgpt:auto` -> `Auto`
  - `chatgpt:instant` -> `Instant`
  - `chatgpt:thinking-standard` -> `Thinking` + `standard`
  - `chatgpt:thinking-extended` -> `Thinking` + `extended`
  - `chatgpt:pro-standard` -> `Pro` + `standard`
  - `chatgpt:pro-extended` -> `Pro` + `extended`
- local config writes are available at:
  - `GET|PUT|DELETE /v1/config/agents`
  - `GET|PUT|DELETE /v1/config/teams`
  - MCP tools `config_entities_list`, `config_agent_upsert`,
    `config_agent_delete`, `config_team_upsert`, and `config_team_delete`
- `/v1/models` includes configured agents and semantic selector entries for
  client-side discovery. ChatGPT semantic selectors are marked
  `executionReady=true`; Gemini/Grok selector entries are visible but remain
  `executionReady=false` until their provider adapters resolve them.
- `api.auth.required=true` with `api.auth.keys[]` enables bearer-key
  authorization for `/v1/*`. `/status` remains open for operator discovery and
  reports the active auth posture. Keys may carry `agents`, `teams`,
  `services`, and `runtimeProfiles` allow-lists for `/v1/responses`.
- `/v1/chat/completions` is implemented for non-streaming calls. It reuses the
  same execution authorization, agent shorthand, response drain, and stored-run
  readback as `/v1/responses`, but blocks for the one created run before
  returning so ordinary OpenAI-style clients receive content in the initial
  response.

Remaining:

- Grok and Gemini semantic `modelSelector` execution still needs
  provider-adapter resolution
- streaming `/v1/chat/completions` compatibility is still deferred

## Acceptance Criteria

- A client can call `/v1/responses` with `model: "agent:<agent_id>"` and the
  stored run routes through that configured agent.
- A client can call non-streaming `/v1/chat/completions` with `model:
  "agent:<agent_id>"` and receive a `chat.completion` projection from the same
  configured-agent runtime path.
- Agent config can express service, raw model, semantic selector, project,
  knowledge, and prompt intent without polluting output with unset fields.
- Provider-specific adapters resolve semantic selectors against current
  workbench UI modes before AuraCall treats them as execution-ready defaults.
  ChatGPT is the first implemented provider for this criterion.
- Agents and teams can be maintained by other local agents through the API/MCP
  control plane without hand-editing config files.
- Client apps can discover configured agent model ids and semantic selector
  readiness from `/v1/models`.
- Client apps can be required to present an API key, and scoped keys cannot
  create `/v1/responses` runs outside their configured agent/team/service/runtime
  allow-lists.

## Next Work

- Resolve Grok and Gemini `modelSelector` values through provider-specific
  browser adapters rather than feeding semantic tokens directly into raw model
  selection.
- Add streaming compatibility after non-streaming OpenAI client dogfooding proves
  the basic route and response shape.
