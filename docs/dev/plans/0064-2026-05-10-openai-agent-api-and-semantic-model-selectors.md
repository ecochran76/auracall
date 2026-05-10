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

## Current State

Implemented:

- config schema and projection carry configured single-agent routing intent
- direct `/v1/responses` agent routing shorthand is accepted
- raw agent `model` and `projectId` are honored by browser-backed configured
  execution

Remaining:

- semantic `modelSelector` still needs provider-adapter resolution
- API key authorization is not implemented
- `/v1/chat/completions` compatibility is deferred

## Acceptance Criteria

- A client can call `/v1/responses` with `model: "agent:<agent_id>"` and the
  stored run routes through that configured agent.
- Agent config can express service, raw model, semantic selector, project,
  knowledge, and prompt intent without polluting output with unset fields.
- Provider-specific adapters resolve semantic selectors against current
  workbench UI modes before AuraCall treats them as execution-ready defaults.

## Next Work

- Resolve `modelSelector` through provider-specific browser adapters rather
  than feeding semantic tokens directly into raw model selection.
- Publish `/v1/models` entries for configured agents and semantic provider
  selectors.
- Add API key policy so client apps can be allowed to call specific agents,
  teams, services, and runtime profiles.
- Add the `/v1/chat/completions` adapter after `/v1/responses` agent routing is
  proven.
