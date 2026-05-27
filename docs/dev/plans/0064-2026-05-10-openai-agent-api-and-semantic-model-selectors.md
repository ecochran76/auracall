# OpenAI Agent API and Semantic Model Selectors

State: OPEN
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
  Keys can live in config or in the user-scoped service dotenv file at
  `~/.auracall/api.env`.
- Non-streaming `/v1/chat/completions` requests now adapt OpenAI-style chat
  messages into the existing `/v1/responses` runtime path, drain one host-owned
  run synchronously, and return a standard `chat.completion` object.
- `docs/agent-workflows.md` defines the general agent/app workflow pattern:
  privileged setup, scoped execution, durable observation, response batches,
  and skill split. The ChE grading smoke is one fixture-backed proof of that
  pattern, not a special-purpose API lane.
- API requests, chat completions, response batches, and team runs should
  produce archive-ready runtime evidence. Searchable retrieval of uploaded
  files, generated artifacts, provider conversation ids, and caller-supplied
  post-processing evidence belongs to Plan 0066 rather than to
  provider-specific model-selector work.
- `POST /v1/agent-setup-packages`/MCP `agent_setup_package_create` and the
  redacted `POST /v1/agent-setup-handoffs`/MCP
  `agent_setup_handoff_create` now compose project ensure, registry agent
  binding, scoped API-key issuance, and client env handoff into one privileged
  setup call.
- Repo-local skills now cover the two generic agent roles:
  `auracall-api-workflow` for scoped execution clients and
  `auracall-agent-setup` for privileged setup clients.

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
- local agent/team management writes are available at:
  - `GET|PUT|DELETE /v1/config/agents`
  - `GET|PUT|DELETE /v1/config/teams`
  - MCP tools `config_entities_list`, `config_agent_upsert`,
    `config_agent_delete`, `config_team_upsert`, and `config_team_delete`
  - writes target the user-scoped registry by default; config-defined overlay
    ids remain pinned and return blocked mutation results
- `/v1/models` includes configured agents and semantic selector entries for
  client-side discovery. ChatGPT semantic selectors are marked
  `executionReady=true`; Gemini/Grok selector entries are visible but remain
  `executionReady=false` until their provider adapters resolve them.
- `api.auth.required=true` with `api.auth.keys[]` enables bearer-key
  authorization for `/v1/*`. `/status` remains open for operator discovery and
  reports the active auth posture. Keys may carry `agents`, `teams`,
  `services`, and `runtimeProfiles` allow-lists for `/v1/responses`.
- `~/.auracall/api.env` is loaded by the installed user service and can define
  `AURACALL_API_KEY`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `AURACALL_MODEL`
  for local client agents without storing secrets in the repo.
- `/v1/chat/completions` is implemented for non-streaming calls. It reuses the
  same execution authorization, agent shorthand, response drain, and stored-run
  readback as `/v1/responses`, but blocks for the one created run before
  returning so ordinary OpenAI-style clients receive content in the initial
  response.
- `POST /v1/projects/ensure` and `POST /v1/response-batches` combine into the
  first documented deterministic setup plus stochastic execution workflow for
  external agents.
- `POST /v1/agent-setup-handoffs` and MCP `agent_setup_handoff_create` provide
  the preferred first-class handoff workflow for downstream clients: ensure
  provider project, bind agent, issue scoped key, write client env, and return
  only non-secret model/project/key-id/restart metadata.
- `POST /v1/agent-setup-packages` and MCP `agent_setup_package_create` remain
  available for privileged operators that explicitly need the full one-time
  secret-bearing setup response.

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
- Client apps can load the user-scoped dotenv file and call AuraCall with
  normal OpenAI-compatible `base_url`, `api_key`, and `model` settings.
- Client agents can follow a documented setup/execution split and can load
  repo-local skills that keep AuraCall endpoint choreography out of
  domain-specific workflow code.
- Privileged setup agents can create a project-bound agent setup handoff in one
  HTTP or MCP call and hand downstream clients only the generated scoped env
  path plus non-secret readiness metadata.
- Downstream clients can run a repo-provided env-only smoke that reads the
  generated scoped env, validates `/v1/models`, submits one `/v1/responses`
  request, and polls readback without operator privileges.

## Next Work

- Resolve Grok and Gemini `modelSelector` values through provider-specific
  browser adapters rather than feeding semantic tokens directly into raw model
  selection.
- Add streaming compatibility after non-streaming OpenAI client dogfooding proves
  the basic route and response shape.
- Add first-class batch retry/cancel/priority controls once response-batch
  dogfooding shows the minimal status contract is stable.
- Ensure `/v1/responses`, `/v1/chat/completions`, `/v1/response-batches`, and
  `/v1/team-runs` write enough stable metadata for the searchable run
  cache/archive lane to index uploads, generated artifacts, provider
  conversation ids, and caller evidence.
- Promote the generic AuraCall skills into the shared agent-skill source of
  truth after their repo-local versions prove useful.
