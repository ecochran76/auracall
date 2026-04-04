# Team Service Execution Plan

## Purpose

Define the first execution contract for future team runs once Aura-Call grows
service mode, runners, and parallelism.

This plan is intentionally one layer above the current CLI-only `--team`
planning surface. It does not authorize implementation by itself. It defines
the default assumptions the later service/runners work should follow unless a
better reason emerges.

## Position in the stack

The intended layering remains:

1. browser profile
2. AuraCall runtime profile
3. agent
4. team
5. service mode / runners / parallel execution

Important split:

- team config expresses orchestration intent
- the service/runners layer executes that intent

## North-star use cases

Future teams are expected to support:

- divide-and-conquer work across multiple agents
- multi-turn automation that moves through multiple agents in sequence
- explicit data handoff between specialist agents
- mixed sequential and parallel collaboration where the orchestration layer
  decides what should happen, and the runner layer decides how to execute it

## Default execution assumptions

Until there is a stronger product reason, the default team execution contract
should be conservative:

- default execution mode is sequential
- parallelism must be explicit, not implied by team membership
- handoff payloads must be explicit, structured, and inspectable
- one team run owns one shared run state object
- failures stop the active run by default unless a future policy explicitly
  marks a step as best-effort or non-blocking

These defaults optimize for operator clarity and debuggability before
throughput.

## Execution model

The future execution model should treat a team run as an orchestration graph
with a conservative MVP shape:

- a team run resolves to a list of member execution steps
- each step references an agent
- each agent resolves to one AuraCall runtime profile
- that runtime profile resolves to one browser profile and one default service
- the runner layer decides whether a step runs:
  - immediately
  - after another step completes
  - in parallel with another step

Safe first contract:

- ordered steps first
- optional future dependency graph later

That means the MVP service layer should start with:

- sequential step execution
- optional explicit fan-out/fan-in later

## Handoff contract

Every inter-agent handoff should be explicit.

Minimum handoff payload shape:

- `runId`
- `teamId`
- `fromAgentId`
- `toAgentId`
- `stepId`
- `taskSummary`
- `artifacts`
- `structuredData`
- `notes`
- `status`

Minimum rules:

- handoffs must be serializable
- handoffs must be storable for postmortem/debug
- handoffs must not depend on hidden browser tab state alone
- handoffs must be valid even if the receiving step runs on a different runner

## Shared run state

One future team run should own one shared state object with append-only
history.

Minimum responsibilities:

- record step start/end
- record handoffs
- record produced artifacts
- record structured outputs
- record failure reason and owning step

This shared state should be the durable source of truth for team orchestration,
not ad hoc browser/session state.

## Failure and retry ownership

Default policy:

- a step failure stops the team run
- retries belong to the service/runners layer
- retry policy is owned per step execution, not per team membership

Important split:

- teams express the intended workflow
- runners own:
  - retry/backoff
  - queueing
  - concurrency limits
  - lease/ownership
  - cancellation

Possible future exceptions, but not MVP:

- best-effort steps
- partial completion policies
- compensating rollback behavior

## Parallelism boundary

Parallelism should not be inferred from:

- multiple team members
- multiple browser profiles
- multiple agents with different runtime profiles

Parallelism should require explicit orchestration semantics plus runner support.

Safe future rule:

- team config may eventually express that a phase is parallelizable
- runner policy decides whether enough capacity exists to execute it in parallel

## Runner assignment boundary

Runner assignment belongs to the service layer.

That layer should decide:

- which runner executes a step
- whether two steps may share a runner
- whether a browser-bearing step must stay on a runner with the right browser
  profile/account state
- whether a handoff crosses runner boundaries

Team config should not directly encode:

- worker pool sizing
- runner ids
- queue shards
- runner leases
- service topology

## MVP recommendation

The first real team execution MVP should be:

- sequential only
- one team run at a time
- explicit step list
- explicit handoff payload persistence
- fail-fast by default
- no implicit parallel fan-out

Why:

- easier to debug
- easier to inspect
- easier to replay
- compatible with later parallel expansion

## Not in scope for this plan

- concrete CLI flags for team execution
- runner implementation details
- queue schema
- persistence backend choice
- service deployment layout

## Definition of done for this planning seam

This seam is complete enough when:

- team orchestration intent is clearly separated from runner execution concerns
- the default execution assumptions are explicit
- the handoff payload contract is explicit
- the shared run-state requirement is explicit
- the failure/retry ownership split is explicit
- roadmap/execution docs point to this plan before any team execution work
  begins
