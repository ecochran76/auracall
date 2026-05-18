# Tenant-Pool Response Batches

Status: OPEN
Date: 2026-05-18
Lane: P01

## Context

Some batch workflows need more throughput than one provider account can safely
offer. AuraCall already represents account-bearing browser state as AuraCall
runtime profiles and exposes configured agents as OpenAI-compatible
`agent:<agent_id>` models. The missing abstraction is a team whose members are
independent tenant agents and whose job is dispatching independent batch
children, not running a sequential multi-agent workflow.

## Contract

A tenant-pool team is a configured team with:

```json
{
  "type": "dispatch-pool",
  "agents": ["chatgpt-tenant-a", "chatgpt-tenant-b"],
  "dispatch": {
    "mode": "next_available",
    "projectSync": "none"
  },
  "project": {
    "name": "Shared Project",
    "createIfMissing": true,
    "sync": "none"
  }
}
```

Semantics:

- `POST /v1/tenant-pool-teams/ensure` is the privileged setup helper for this
  shape. It composes one project ensure per requested member, binds the member
  agents, and creates the dispatch-pool team only when the team id is missing.
  Existing dispatch-pool teams are reported as `found` and left unchanged;
  existing non-dispatch teams block setup before provider/project mutation.
- `POST /v1/response-batches` may target the pool with
  `{ "dispatch": { "team": "<team_id>" }, "requests": [...] }` or top-level
  `{ "team": "<team_id>" }`.
- Each child request must be independent and must not pre-pin
  `auracall.agent` or an `agent:<id>` model.
- AuraCall expands each child to the next available concrete team member,
  rewriting the child to `model = "agent:<member_id>"` and filling
  `auracall.team`, `auracall.agent`, `auracall.service`, and
  `auracall.runtimeProfile`.
- Availability is based on persisted runtime evidence: active direct-run
  leases and running steps for each member agent, plus the assignments already
  made in the current batch.
- The batch record and child run metadata preserve dispatch evidence:
  selected team, mode, projectSync, member agent, and member index.
- `projectSync` is currently fixed to `none`. AuraCall may ensure equivalent
  projects per tenant during setup, but response-batch execution does not
  reconcile project instructions, files, settings, or history between tenants.
- Mixed services, mixed model bindings, and divergent project bindings are
  allowed and surfaced as info/warnings. They are not error conditions because
  cross-tenant consistency remains caller-owned until project/model syncing is
  implemented.

## Current Slice

Implemented:

- team config schema and projection support `type = "dispatch-pool"`,
  `dispatch.mode = "next_available"`, `dispatch.projectSync = "none"`, and
  optional project binding metadata.
- config diagnostics surface duplicate runtime-profile membership as a warning
  and mixed services/models/project bindings as informational risk.
- response-batch creation accepts dispatch-pool selection, expands child
  requests before authorization, and records pool/assignment metadata in the
  batch status and child run metadata.
- dispatch selection uses active runtime evidence before falling back to team
  order.
- privileged tenant-pool setup is available through
  `POST /v1/tenant-pool-teams/ensure` and MCP `tenant_pool_team_ensure`.
- MCP response-batch creation uses the same public input schema while hiding
  the internal dispatch-resolution field.

Remaining:

- add inter-service/project syncing as a later explicit plan; syncing must not
  happen implicitly during response-batch dispatch.
- add a live smoke with two non-private ChatGPT runtime profiles after the
  browser lifecycle issue is stable again.

## Acceptance Criteria

- A dispatch-pool team can dispatch a response batch across multiple tenant
  agents without creating more than one running prompt tab per child job.
- Scoped API keys authorized for the team can create pool batches; authorization
  is evaluated after expansion against the concrete member agents.
- Batch status shows which member handled each child response.
- Project-bound pools clearly state that projectSync is `none` and that
  divergent project configuration may change results.
- The setup route can create the member agents and missing dispatch-pool team
  without rewriting an existing dispatch-pool team.
- Existing sequential `/v1/team-runs` semantics remain separate from
  dispatch-pool response batches.
