# Team Run Data Model Plan

## Purpose

Define the first code-facing data model for future team execution without
starting implementation.

This plan exists so later service/runners work can share one stable vocabulary
for:

- `teamRun`
- `step`
- `handoff`
- `sharedState`

It should be read together with:

- [team-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-config-boundary-plan.md)
- [team-service-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-service-execution-plan.md)

## Design goals

The first data model should optimize for:

- debuggability
- replayability
- explicit ownership
- serializability
- compatibility with future parallel execution

It should not optimize first for:

- minimal schema size
- speculative throughput
- hidden in-memory coordination

## Core entities

The first concrete vocabulary should include four top-level entities:

1. `teamRun`
2. `step`
3. `handoff`
4. `sharedState`

## `teamRun`

`teamRun` is the durable record for one team execution attempt.

Minimum fields:

- `id`
- `teamId`
- `status`
- `createdAt`
- `updatedAt`
- `trigger`
- `requestedBy`
- `entryPrompt`
- `initialInputs`
- `sharedStateId`
- `stepIds`
- `policy`

Recommended `status` values:

- `planned`
- `running`
- `succeeded`
- `failed`
- `cancelled`

Recommended `trigger` values:

- `cli`
- `service`
- `api`
- `scheduled`
- `internal`

Recommended `policy` subfields:

- `executionMode`
- `failPolicy`
- `parallelismMode`
- `handoffRequirement`

Safe MVP defaults:

- `executionMode = sequential`
- `failPolicy = fail-fast`
- `parallelismMode = disabled`
- `handoffRequirement = explicit`

## `step`

`step` is one planned or executed unit of work inside a `teamRun`.

Each step should resolve to exactly one agent.

Minimum fields:

- `id`
- `teamRunId`
- `agentId`
- `runtimeProfileId`
- `browserProfileId`
- `service`
- `kind`
- `status`
- `order`
- `dependsOnStepIds`
- `input`
- `output`
- `startedAt`
- `completedAt`
- `failure`

Recommended `kind` values for MVP:

- `prompt`
- `analysis`
- `handoff`
- `review`
- `synthesis`

Recommended `status` values:

- `planned`
- `ready`
- `running`
- `succeeded`
- `failed`
- `blocked`
- `skipped`
- `cancelled`

Important rule:

- `agentId`, `runtimeProfileId`, and `browserProfileId` must be persisted on
  the step at planning time or execution-start time
- do not require later readers to reconstruct the execution identity from the
  raw team config alone

## `handoff`

`handoff` is the durable payload one step passes to another.

Every non-trivial inter-agent transfer should be represented as a handoff,
even if the first implementation stores it inline with step output.

Minimum fields:

- `id`
- `teamRunId`
- `fromStepId`
- `toStepId`
- `fromAgentId`
- `toAgentId`
- `summary`
- `artifacts`
- `structuredData`
- `notes`
- `status`
- `createdAt`

Recommended `status` values:

- `prepared`
- `delivered`
- `consumed`
- `failed`

Important rules:

- handoffs must be serializable
- handoffs must survive runner boundaries
- handoffs must not depend on live browser tab state
- handoffs should reference artifacts by durable ids/paths, not transient DOM
  positions

## `sharedState`

`sharedState` is the run-scoped durable state store for one `teamRun`.

It is the append-only coordination record, not an unstructured scratch object.

Minimum fields:

- `id`
- `teamRunId`
- `status`
- `artifacts`
- `structuredOutputs`
- `notes`
- `history`
- `lastUpdatedAt`

Recommended `history` event types:

- `step-planned`
- `step-started`
- `step-succeeded`
- `step-failed`
- `handoff-created`
- `handoff-consumed`
- `artifact-added`
- `note-added`

Important rules:

- history should be append-only
- later views may project summaries from history
- the raw history should remain available for postmortem and replay

## Identity and ownership rules

The data model should preserve ownership clearly.

Team-owned:

- team-level run identity
- workflow intent
- step ordering/dependencies
- handoffs
- shared run state

Agent-owned through resolved steps:

- agent identity
- runtime profile identity
- browser profile identity
- default service identity

Runner-owned:

- runner id
- lease state
- queue position
- retry counters
- concurrency decisions

Important rule:

- runner-owned fields should not be required to understand the logical team run
- they may be attached later as execution metadata

## Serialization guidance

The first implementation should choose shapes that can serialize cleanly to:

- JSON
- NDJSON event streams
- SQLite/SQL tables

That means:

- avoid cyclic references
- prefer ids over embedded backreferences
- keep timestamps explicit
- keep event types enumerable

## MVP schema relationship

Safe MVP relationship graph:

- one `teamRun`
- one `sharedState`
- many `steps`
- zero or more `handoffs`

Recommended foreign-key shape:

- `step.teamRunId -> teamRun.id`
- `handoff.teamRunId -> teamRun.id`
- `handoff.fromStepId -> step.id`
- `handoff.toStepId -> step.id`
- `sharedState.teamRunId -> teamRun.id`

## Not in scope

This plan does not define:

- queue tables
- runner lease tables
- persistence backend
- service API endpoints
- exact TypeScript file/module placement

## Definition of done for this planning seam

This seam is complete enough when:

- the four core entities are named and scoped
- minimum fields are explicit
- ownership boundaries are explicit
- serialization guidance is explicit
- roadmap/execution docs point to this plan before service implementation
  begins
