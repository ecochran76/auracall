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
5. future service/runners orchestration

A team should coordinate multiple agents. It should not become another place
that redefines browser/account identity, and it should not prematurely absorb
runner/service concerns that belong to a later always-on execution layer.

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

- ordered or named membership
- shared metadata
- coordination instructions
- routing/delegation policy
- selection policy for which member should handle a task
- divide-and-conquer decomposition policy for complex work
- multi-turn automation policy across member agents
- explicit data handoff contracts between member agents
- shared intermediate-result routing rules
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

## Definition of done for this design seam

This seam is complete enough when:

- docs state clearly what teams own
- docs state clearly what teams inherit
- docs state clearly what teams must not own
- docs explicitly separate team config from future service/runners orchestration
- roadmap/execution docs link to this boundary before any team execution
  semantics land
