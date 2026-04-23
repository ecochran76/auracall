# Workbench Capability Surfaces | 0050-2026-04-23

State: OPEN
Lane: P01

## Scope

Design and implement a provider-neutral way for Aura-Call API, MCP, CLI, and
browser-service paths to discover, describe, select, and invoke rapidly
changing chat-workbench capabilities exposed by LLM services.

Examples include Gemini and ChatGPT Deep Research, Gemini media tools,
ChatGPT composer tools, ChatGPT business-plan skills, ChatGPT apps/connectors,
and future provider add-ons that appear in the service UI before Aura-Call has
a stable first-class adapter.

## Current State

- Aura-Call already has provider-specific browser heuristics for some composer
  tools:
  - Gemini tool drawer discovery has observed `Create image`, `Create music`,
    `Create video`, `Deep research`, Canvas, and related toggles.
  - ChatGPT browser mode can select known composer add-ons such as web search,
    Canvas, and Google Drive.
- API/MCP surfaces now have a durable `media_generation` contract, but that is
  a specific media resource, not a general workbench-tool abstraction.
- Provider workbenches are changing faster than stable Aura-Call command names:
  Deep Research, apps, skills, and connectors can be account-tier dependent,
  region dependent, temporarily unavailable, or renamed by the provider.
- Current docs and tests do not define how API/MCP clients should ask:
  - what capabilities are visible on this account/profile/service
  - which capabilities are selectable before prompt submission
  - which capabilities require extra provider state, credentials, or
    human-mediated setup
  - whether a capability is stable, experimental, gated, or currently blocked
- First implementation slice now provides a static/fake-discovery report path:
  - local API: `GET /v1/workbench-capabilities`
  - MCP tool: `workbench_capabilities`
  - shared schema/service/catalog with conservative availability projection
- Gemini browser-backed discovery now maps the existing read-only
  feature-signature probe into available workbench capabilities when
  `api serve` handles `provider=gemini` reports.

## Target Contract

- [x] Add one provider-neutral `workbench capability` model with:
  - stable Aura-Call capability id
  - provider id and observed provider label(s)
  - category: `research`, `media`, `canvas`, `connector`, `skill`, `app`,
    `search`, `file`, or `other`
  - invocation mode: `pre_prompt_toggle`, `tool_drawer_selection`,
    `composer_attachment`, `provider_api`, `post_prompt_action`, or `unknown`
  - supported surfaces: CLI, local API, MCP, browser service, provider API
  - availability: `available`, `not_visible`, `account_gated`,
    `human_verification_required`, `blocked`, or `unknown`
  - stability: `stable`, `experimental`, `observed`, or `deprecated`
  - required inputs, output artifact expectations, and safety constraints
- Add a capability-discovery path before broad invocation:
  - [x] local API read/list surface
  - [x] MCP read/list tool or resource
  - [x] CLI inspection command
  - [x] Gemini browser-service discovery adapter for provider-visible tools
- Add a capability-invocation path only after discovery/readback is stable:
  - request references capability id, provider, runtime profile, and optional
    provider-specific arguments
  - response reports selected tool, observed label, availability result, and
    generated artifacts or run ids
  - provider-specific selectors stay in provider adapters
- Let media generation use the capability model as discovery evidence while
  retaining the simpler first-class `media_generation` resource for common
  image/music/video requests.

## Non-Goals

- Do not model every provider feature as a permanent Aura-Call CLI flag.
- Do not assume a capability is available just because it exists in provider
  marketing or another account tier.
- Do not auto-enable apps, connectors, skills, or account integrations that
  require user consent.
- Do not bypass browser-service dispatcher ownership for discovery or
  invocation.
- Do not merge this into scheduler or runner ownership; workbench capability
  discovery is provider/service state, while execution ownership remains with
  the existing runtime/service-host boundaries.

## Acceptance Criteria

- [x] Local API can list observed/configured workbench capabilities for at least
  ChatGPT and Gemini with explicit availability/status fields.
- [x] MCP exposes the same capability list in a bounded schema.
- [x] CLI can inspect one provider/runtime profile and report visible workbench
  capabilities without invoking them.
- Gemini media generation can map `image|music|video` requests to discovered
  `Create image|Create music|Create video` capabilities where the browser path
  is used.
- [x] Gemini feature-signature discovery maps visible `Create image`, `Create
  music`, `Create video`, Canvas, and Deep Research modes into available
  workbench capabilities.
- Deep Research is represented as a capability for ChatGPT and Gemini without
  claiming full automation until a provider-backed smoke proves request,
  completion, and artifact/readback behavior.
- ChatGPT apps/connectors and business-plan skills are represented as
  account-gated capabilities when visible, not hard-coded universal tools.
- [x] Tests cover schema normalization, provider-label aliasing, availability
  states, and one fake-provider API/MCP list path.

## Validation Plan

- [x] Unit tests for capability schema, normalization, and availability projection.
- [x] Unit/static CLI smoke for `auracall capabilities --target gemini --static --json`.
- [x] Fake-provider API/MCP tests for capability listing.
- Browser-provider tests for Gemini tool drawer labels and ChatGPT composer
  add-on/app/skill labels using captured DOM fixtures or bounded selectors.
- [x] Unit tests for Gemini feature-signature to workbench-capability mapping.
- Live discovery smoke only on signed-in managed browser profiles and never
  after a `google.com/sorry`, CAPTCHA, or similar blocking page is detected.
- Provider-backed invocation smokes stay opt-in per capability because Deep
  Research, apps, skills, and connectors can spend time, credits, or external
  account permissions.
