# Team Config Boundary Plan | 0006-2026-04-14

State: OPEN
Lane: P01

## Current State

- the repo still uses the team boundary as a governing architecture document
  from both the roadmap and the adjacent canonical team/task plans
- the planning-compliance framework is green, so this slice is promoting the
  team boundary into canonical authority without changing its semantics
- the live need is stable authority placement and cross-link wiring, not a
  deeper rewrite of team semantics
- the old loose path will remain searchable in the legacy archive once the
  canonical plan is wired

# Team Config Boundary Plan

## Purpose

Define the first explicit contract for future Aura-Call teams without
implementing team execution yet.

This document answers four questions:

- what a team owns
- what a team inherits through its member agents
- what a team must not own directly
- how the future service/runners layer relates to teams

## Position in the stack

The intended layering remains:

1. browser profile
2. AuraCall runtime profile
3. agent
4. team
5. task / run spec
6. future service/runners orchestration

A team should coordinate multiple agents. It should not become another place
that redefines browser/account identity, and it should not prematurely absorb
runner/service concerns that belong to a later always-on execution layer.

## Canonical role of a team

The safest canonical definition is:

- a team is a reusable orchestration template for a class of work

That means a team is richer than a plain collection of agents, but still more
general than one concrete assignment.

A team should be able to capture durable collaboration structure such as:

- member roles
- team-level coordination instructions
- pre-prompt shaping rules
- handoff and response-shape expectations
- escalation and human-input rules
- automation-policy defaults such as turn budgets or stop conditions

Important distinction:

- a team is not the concrete problem instance
- a team is not the full execution record
- a team should stay reusable across many assignments in the same problem class

Examples of the intended shape:

- a `Vibe code` team may define:
  - an orchestrator role
  - an engineer role
  - a structured work-product contract
  - allowed local host-action requests
  - stop/escalate behavior for unattended multi-turn work
- a `Proposal Writer` team may define:
  - an orchestrator role
  - specialist roles such as budgeter, narrative writer, and red-team reviewer
  - reusable delegation and review policy for proposal work

These examples are templates for repeatable collaboration, not one-off runs.

## Team vs task vs run

To avoid overloading `team`, AuraCall should separate three concepts:

1. `team`
   - reusable orchestration template
   - defines who collaborates and how collaboration should work
2. `task` / `run spec`
   - concrete assignment given to a team
   - defines the actual bundle, goal, constraints, and requested outcome
3. `run`
   - durable execution record for one attempt
   - records turns, artifacts, handoffs, local actions, and stop/failure state

Why this split is safer:

- it keeps teams reusable
- it keeps task-specific detail out of long-lived team definitions
- it prevents the first CLI/API execution surface from treating team membership
  alone as the full workflow definition

## Team inheritance contract

A team should inherit member execution context through its agents:

- each member agent references one AuraCall runtime profile
- each runtime profile references one browser profile
- service defaults and project defaults continue to come from the resolved
  runtime profile unless a higher layer later defines a safe override policy

This keeps team membership compositional:

- `team -> agent -> runtimeProfile -> browserProfile`

## Team-owned concerns

A future team may own concerns like:

- member roles
- ordered or named membership
- shared metadata
- coordination instructions
- pre-prompt policy
- routing/delegation policy
- selection policy for which member should handle a task
- divide-and-conquer decomposition policy for complex work
- multi-turn automation policy across member agents
- explicit data handoff contracts between member agents
- shared intermediate-result routing rules
- allowed host/local-action request policy
- response-shape contracts for member outputs
- default stop/escalation rules
- future execution policy hints that describe desired coordination behavior

These are orchestration concerns, not browser/account concerns.

## Team non-goals

A team should not directly own or redefine:

- browser profile selection
- source browser profile selection
- managed browser profile path/root
- cookie/bootstrap paths
- debug-port policy
- raw account identity
- service identity rewiring
- runtime profile bypass
- tab/window lifecycle policy

Those remain owned below the team layer by:

- browser profiles
- AuraCall runtime profiles
- agents

## Current CLI-era rule

During the current CLI era, teams should remain read-only and selection-oriented.

That means:

- teams may be parsed
- teams may be projected and inspected
- teams may be validated
- teams may be resolved to their member runtime/browser contexts

That does not mean:

- team execution exists
- team invocation semantics are final
- parallel execution is implied
- current internal step-builder defaults are the final product meaning of `team`

Current role-planning policy in this CLI-era checkpoint:

- explicit role `order` currently drives planned step sequencing
- when explicit role order ties, current planning stays deterministic through a
  role-id tiebreak
- `handoffToRole` is currently advisory metadata carried into planned step and
  handoff payloads
- `handoffToRole` does not currently rewrite planned dependency edges or step
  order by itself

That policy should remain explicit until a later slice deliberately chooses
behavior-facing team orchestration semantics.

## Future service/runners boundary

Aura-Call is expected to gain a service mode with runners and parallelism after
the CLI feature set is stable.

When that happens:

- teams may become an input to the service/runners layer
- teams should describe orchestration intent:
  - which agents collaborate
  - how work may be divided
  - how intermediate results may pass between agents
  - what kind of multi-turn coordination is desired
- runner assignment and parallelism policy should be modeled there, not hidden
  inside team membership alone
- team config may later describe desired coordination policy, but actual
  scheduling/execution belongs to the service/runners layer

Important rule:

- do not make today's team config imply tomorrow's runner topology by accident

Examples of concerns that belong to the future service/runners layer, not the
current team layer:

- worker pool sizing
- parallel fan-out limits
- queueing policy
- retry/backoff across members
- background service lifecycle
- long-lived runner ownership

Examples of concerns that belong to the team layer, but only once the
service/runners layer exists to execute them safely:

- divide-and-conquer task plans across multiple agents
- staged multi-turn workflows where one agent's output becomes another's input
- explicit handoff points between specialist agents
- orchestration policies for sequential vs parallel collaboration

Important separation:

- team config should express coordination intent
- task / run-spec input should express the concrete assignment and run-specific
  constraints
- the future service/runners layer should decide how to schedule and execute
  that intent

## Near-term selection policy

The next safe incremental step is read-only selection semantics only.

A future `--team <name>` selection seam should mean:

- resolve the named team
- resolve its member agents
- resolve each member's runtime profile and browser profile
- surface that result in inspection/doctor/runtime planning paths

It should not yet mean:

- execute each member
- choose a member automatically for work
- run members in parallel
- create implicit service/runners behavior
- treat declared member order as the permanent meaning of team workflow
- assume one member always maps to one prompt-shaped step in the public model

## Definition of done for this design seam

This seam is complete enough when:

- docs state clearly what teams own
- docs state clearly what teams inherit
- docs state clearly what teams must not own
- docs explicitly separate team config from future service/runners orchestration
- roadmap/execution docs link to this boundary before any team execution
  semantics land
