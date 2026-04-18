# Agent Config Boundary Plan | 0009-2026-04-14

State: OPEN
Lane: P01

## Current State

- the agent boundary is still referenced directly from the roadmap and from the
  canonical config umbrella plan
- the broader config architecture is now canonical under:
  - `docs/dev/plans/0007-2026-04-14-config-model-refactor.md`
- the current need is stable canonical placement for the agent boundary inside
  that config cluster, not a semantic rewrite of the boundary itself
- `config doctor` now enforces the first bounded ownership seam on
  `agents.<name>.defaults`:
  - runtime-selection bypass inside agent defaults should surface explicitly
  - browser/account-bearing overrides inside agent defaults should surface
    explicitly
  - service identity rewiring inside agent defaults should surface explicitly
- current execution semantics remain intentionally narrow:
  - `agents.<name>.defaults` is still parsed as a generic bag
  - but runtime selection and default service resolution still ignore it
  - live agent selection still flows only through:
    - `agents.<name>.runtimeProfile`
    - the referenced AuraCall runtime profile
- the old loose path will remain searchable in the legacy archive once the
  canonical plan is wired

# Agent Config Boundary Plan

## Purpose

Define the first explicit contract for future Aura-Call agents without
implementing agent behavior yet.

This document answers three questions:

- what an agent inherits from an AuraCall runtime profile
- what an agent may override directly
- what must remain owned by browser profiles or future teams

## Position in the stack

The intended layering remains:

1. browser profile
2. AuraCall runtime profile
3. agent
4. team

An agent should reference one AuraCall runtime profile and narrow or specialize
behavior on top of it. It should not become another place that redefines
browser/account identity.

## Agent inheritance contract

An agent should inherit from its referenced AuraCall runtime profile:

- default service/provider target
- default model / model strategy
- project/workspace defaults
- cache defaults
- browser profile selection, indirectly through the runtime profile
- service-specific identities/settings already attached to that runtime profile

This inheritance rule keeps browser/account-bearing state anchored below the
agent layer.

## Agent-owned concerns

An agent may add or override concerns like:

- instructions / persona text
- task or domain description
- narrower default prompt/style policy
- narrower allowed tool set or workflow policy
- bounded overrides for model behavior that remain service-level, not
  browser-level
- metadata used for selection, organization, or future orchestration

In other words: agents may specialize workflow, not browser identity.

## Agent non-goals

Agents should not directly own or redefine:

- browser executable or platform choice
- source browser profile selection
- managed browser profile path/root
- cookie/bootstrap paths
- debug-port strategy
- window/tab lifecycle policy
- raw account identity independent of the runtime profile
- cross-agent coordination policy

Those belong to:

- browser profiles
- AuraCall runtime profiles
- future teams

## Allowed override boundary

A practical first rule set:

Allowed at the agent layer:
- instructions
- description
- metadata
- service/model preference narrowing when compatible with the runtime profile
- task-specific defaults that do not mutate browser/account-bearing state

Not allowed at the agent layer:
- browser profile selection overrides
- source browser profile overrides
- managed browser profile overrides
- raw cookie/bootstrap path overrides
- service identity rewiring
- runtime profile bypass

If a future use case needs one of those, it should likely be modeled as a new
runtime profile, not an agent override.

Current doctor checkpoint:
- `config doctor` should also report when `agents.<name>.defaults` is present
  at all:
  - the generic defaults bag is still a placeholder seam
  - it does not currently imply live execution behavior by itself
- `config doctor` should warn when `agents.<name>.defaults` attempts:
  - runtime-selection bypass such as:
    - `defaults.runtimeProfile`
    - `defaults.browserProfile`
    - `defaults.browserFamily`
  - browser/account-bearing overrides such as:
    - `defaults.browser`
    - managed-profile or source-profile override paths
    - cookie/bootstrap path overrides
    - debug-port and browser lifecycle policy overrides
  - service identity rewiring such as:
    - `defaults.services.<service>.identity`
- this remains diagnostics-only:
  - agent execution semantics do not change
  - agent-owned workflow defaults remain allowed when they do not mutate
    browser/account ownership
  - the generic `defaults` bag is not yet a live typed execution contract:
    - keep future workflow-default work explicit and bounded instead of
      implying current execution semantics from placeholder keys

## Team boundary

A future team should coordinate agents, not replace them.

A team may later own:
- membership
- delegation policy
- routing / selection policy
- shared metadata
- coordination instructions

A team should not become the place that redefines browser profiles or runtime
profiles either.

## Reserved schema implication

The current reserved config placeholders should be interpreted as:

- `agents.<name>.runtimeProfile`
  - required conceptual anchor, even if not enforced yet
- `agents.<name>.instructions`
  - placeholder for future persona/instruction text
- `teams.<name>.agents`
  - placeholder membership list only

Anything beyond that is intentionally deferred.

## Definition of done for this design seam

This seam is complete enough when:

- docs state clearly what agents inherit
- docs state clearly what agents may override
- docs state clearly what agents must not own
- the config-model refactor plan and execution board link to this boundary

Implementation of agent execution remains out of scope until after the broader
config-model refactor.
