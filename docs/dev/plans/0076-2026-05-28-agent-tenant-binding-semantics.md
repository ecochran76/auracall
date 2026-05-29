# Agent Tenant Binding Semantics Plan | 0076-2026-05-28

State: CLOSED
Lane: P01

## Purpose

Make AuraCall agents tenant-centered execution contracts so downstream apps
such as `transcribe-audio` can select an agent instead of assembling
tenant/service/model/extras/project/runtime-profile choices themselves.

This plan separates durable agent identity from the current browser execution
binding:

- tenant identity: provider service plus bound account identity
- execution binding: AuraCall runtime profile plus browser profile currently
  able to operate that tenant
- agent intent: role, service, model selector, instructions, extras, and
  default project binding
- project binding: tenant-scoped provider project/workspace/Gem/Grok project
  used by the agent unless a caller explicitly overrides it

## Current State

- `agents.<id>.runtimeProfile` is the current compatibility selector for
  execution.
- Effective agent catalog readback now exposes `tenantKey`, `bindingId`,
  `bindingKey`, `runtimeProfileId`, `browserProfileId`, `service`, `model`,
  `modelSelector`, `projectId`, `projectName`, and structured
  `projectBinding`.
- Tenant identity already exists in account-mirror/status surfaces as
  `tenantKey`, and execution binding already exists as `bindingKey`. Slice 1
  projects matching semantics for agents without changing existing runtime
  selection behavior.
- Project bindings are currently plain `projectId` / `projectName` fields on
  agents or service config. Slice 1 keeps those compatibility fields and adds
  `projectBinding.source` so callers can see whether the default came from the
  agent, from service config, or is absent.

## Target Semantics

- An agent's durable identity is service plus tenant plus role. The current
  runtime profile is compatibility/execution binding, not the agent identity.
- Agents may still reference `runtimeProfile` while the config model migrates,
  but catalog readback must expose the resolved `tenantKey` and `bindingKey`.
- Tenant cache ownership remains provider plus bound identity. Moving a tenant
  to a different runtime/browser binding must not require downstream apps to
  change selected agent ids.
- Project binding belongs to the agent's tenant/service. Downstream apps should
  store `agentId` and use an explicit project override only for exceptional
  runs.
- AuraCall is responsible for up-to-date choices for service, tenant,
  execution binding, model/model selector, extras, and project options.

## Implementation Slices

### Slice 1 | Catalog Semantics

Status: complete.

- Extend the agent schema and projected catalog with compatibility-safe fields:
  `tenantKey`, `bindingId`, `bindingKey`, and structured `projectBinding`.
- Derive missing `tenantKey` from the selected service and runtime-profile
  service identity.
- Derive missing `bindingKey` from selected service, runtime profile, and
  browser profile.
- Keep `runtimeProfile` / `runtimeProfileId`, `projectId`, and `projectName`
  as compatibility fields.
- Add regression coverage for tenant-centered agent projection.

Implemented evidence:

- `AgentConfigSchema` accepts optional `tenantKey`, `bindingId`, and
  `projectBinding`.
- `projectConfigModel()` derives effective agent `tenantKey` from selected
  service plus runtime-profile service identity when the agent does not pin one.
- `projectConfigModel()` derives `bindingKey` from service/runtime/browser
  binding and defaults `bindingId` to that key unless the agent explicitly pins
  a stable binding id.
- `projectBinding` readback distinguishes `agent`, `service`, and `none`
  sources while retaining compatibility `projectId` / `projectName` fields.
- `tests/config/agentRegistryStore.test.ts` covers explicit tenant/binding
  fields and inherited runtime-profile service identity/project binding.

### Slice 2 | Choices And Validation API

Status: complete.

- Add read-only agent-choice readback for AuraCall UX and downstream apps:
  services, tenants, bindings, models/model selectors, extras, and project
  options.
- Validate that project bindings belong to the selected service/tenant and that
  the selected binding is ready or clearly not ready.
- Keep provider discovery cache-first unless an operator explicitly requests a
  refresh.

Implemented evidence:

- Added a read-only `AgentConfigChoices` projection covering services,
  runtime-profile tenant identities, execution bindings, semantic model
  selectors, provider model ids, extras, project bindings, effective agents,
  and per-agent validation.
- Added `AgentTeamConfigService.choices()` and `GET /v1/config/agent-choices`
  so the AuraCall UX and downstream apps can fetch the same cache-first
  choices contract.
- Project binding choices now show `agent`, `service`, `override-ready`, or
  `none` source posture, so inherited service defaults are visible without
  making app callers copy provider project ids.
- Validation warns when an agent lacks a resolved service/tenant/binding or
  uses an unknown or service-mismatched semantic selector.

### Slice 3 | Agent Configuration UX

Status: complete.

- Promote `/agents` from read-only runtime inspection into an agent
  configuration surface.
- Provide create/edit/duplicate/archive flows backed by the existing config
  entity or registry APIs.
- Show resolved tenant/binding/project/model health before save.
- Preserve advanced override affordances without making apps copy raw provider
  ids by default.

Implemented evidence:

- The `/agents` operator page now loads agent diagnostics, choices, and
  effective agent configs together.
- Added a bounded agent configuration editor backed by existing
  `GET /v1/config/agents`, `PUT /v1/config/agents/{id}`, and
  `DELETE /v1/config/agents/{id}` APIs.
- The editor supports load, save, duplicate, and archive flows and refreshes
  choices/diagnostics after mutations so tenant/binding/project health is
  visible before and after save.

## Acceptance Criteria

- Effective agent catalog entries show tenant identity and execution binding
  separately.
- Existing `runtimeProfile`-based agents remain valid and keep resolving to the
  same runtime/browser/service behavior.
- Downstream apps can select an `agentId` and get enough resolved metadata to
  display service, tenant, binding, model selector, and project binding.
- Project binding readback states whether it is agent-owned, inherited from
  service config, explicit override-ready, or absent.
- Runtime profile is not described as agent identity in current docs.

## Validation

- `pnpm vitest run tests/config/agentRegistryStore.test.ts tests/schema/resolver.test.ts --maxWorkers 1 --testNamePattern "agent|tenant|binding|project"`
- `pnpm vitest run tests/config/agentConfigService.test.ts --maxWorkers 1 --testNamePattern "choices|tenants|bindings|projects|agents"`
- `pnpm vitest run tests/http.responsesServer.test.ts --maxWorkers 1 --testNamePattern "agent tenant|agent choices|registry-backed agents|operator dashboard"`
- `pnpm run plans:audit -- --keep 75`
- `pnpm run typecheck`
- `git diff --check`

## Non-Goals

- Removing `runtimeProfile` from existing config in this slice.
- Live provider project refresh from the agent config page.
- Reworking response batch dispatch or tenant-pool scheduling.
- Moving app-specific prompt templates or task profiles into AuraCall agents.
