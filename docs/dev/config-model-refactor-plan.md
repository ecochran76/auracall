# Config Model Refactor Plan

## Purpose

Refactor Aura-Call's configuration model so browser concerns, runtime concerns,
and future higher-level orchestration concepts compose cleanly instead of
sharing overloaded terminology and partially overlapping config blocks.

## Why this exists

The repo now has clearer terminology in docs:

- browser profile
- source browser profile
- managed browser profile
- AuraCall runtime profile

But the config shape is still transitional. It works, but it does not yet match
the conceptual layering we want for future work such as agents and teams.

## Target layering

### 1. Browser profile

Owns browser-service level runtime/account-family concerns:

- executable and platform/runtime selection
- WSL-vs-Windows behavior
- source browser profile selection
- source cookie/bootstrap paths
- managed browser profile root/dir policy
- debug-port policy
- tab/window cleanup defaults

Examples:
- `default`
- `wsl-chrome-2`
- `windows-chrome-test`

### 2. AuraCall runtime profile

Owns Aura-Call workflow defaults and references one browser profile.

Typical concerns:
- preferred service/provider
- preferred model / model strategy
- project defaults
- cache defaults
- service-specific identities/settings

Important rule:
- browser/account-bearing state should come from the selected browser profile,
  not be redefined ad hoc inside the AuraCall runtime profile

### 3. Agent

Future higher-level object that references an AuraCall runtime profile and adds:

- task-specific settings
- custom instructions
- persona/role behavior
- narrower policy or tooling defaults

Boundary reference:
- [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)

### 4. Team

Future grouping/orchestration object that coordinates multiple agents.

## Current state

What is already true:

- docs now define the correct semantic split
- target-shape is now the primary documented public model:
  - `browserProfiles`
  - `runtimeProfiles`
- `browserFamilies` and `profiles.<name>.browserFamily` exist as a useful
  bridge toward browser-profile-first config
- reserved top-level `agents` and `teams` blocks now exist in the schema as
  inert placeholders for the future refactor
- reserved `agents` / `teams` are now also:
  - projected
  - inspected
  - validated for missing references
- one shared read-only resolver now exists for:
  - `agent -> runtimeProfile -> browserProfile`
- live WSL smokes are green for `default` and `wsl-chrome-2`

What is still transitional:

- `profiles` still mixes the final AuraCall runtime-profile concept with some
  browser-oriented details
- `browserFamilies` is a transitional implementation name, not necessarily
  the final public shape
- `manualLoginProfileDir` remains an escape hatch with too much conceptual
  weight

## Current active checkpoint

This is now the active architecture track.

The public config transition is now complete enough for a checkpoint. The
near-term goal is no longer more key-shape migration. It is to:

1. lock the target public shape
2. keep bridge-key compatibility loading available without centering it
3. land small runtime/schema seams that move code toward the next compositional
   layer
4. defer broad renames until that target is explicit enough to rename once

See:

- [config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
- [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
- [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)

## Recommended sequencing

### Near term

- keep the dual-read config shape stable enough for troubleshooting and
  compatibility use
- continue small reliability and browser hardening work in maintenance mode
- avoid broad symbol renames in code
- move the active design pressure up to:
  - `agents`
  - `teams`
  as the next layers on top of browser profiles and AuraCall runtime profiles

### Next architecture track

Design and implement the config-model refactor before introducing agents.

That means:

1. make browser profiles first-class config objects
2. make AuraCall runtime profiles explicitly reference a browser profile
3. move browser-owned defaults/state fully under browser profiles
4. leave AuraCall runtime profiles with AuraCall-owned concerns only
5. keep compatibility shims for older/bridge config working
6. design agent and team config on top of the cleaner base
7. only then consider behavior-facing agent execution work

### Deferred until that refactor

- broad code symbol renames to match the new semantics
- final public naming decision on whether `browserFamilies` remains the
  external config key or becomes `browserProfiles`
- input acceptance of target-shape aliases until precedence/write-back policy
  is implemented deliberately
- agent/team implementation work beyond today's reserved config placeholders

## Input alias policy (2026-04-02)

The next config-model transition should not begin by accepting target-shape
input keys ad hoc.

The policy is now:

1. keep the target model read-only in inspection output first
2. document precedence and write-back rules before dual-read begins
3. when dual-read eventually begins, target-shape keys must be authoritative if
   both target and bridge keys are present
4. keep bridge-key writes as a compatibility mode, not the primary documented
   path

Source of truth:

- [config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)

## Acceptance bar for the future refactor

- browser profile selection is explicit and independent
- AuraCall runtime profiles reference browser profiles rather than duplicating
  browser state
- existing configs continue to load through compatibility migration
- managed browser profile and cache identity behavior follow the selected
  browser profile deterministically
- future agent/team config can reference runtime profiles cleanly without
  inheriting ambiguous browser semantics


## Reserved schema seam (2026-04-01)

A narrow preparatory step is now acceptable before the full refactor:
- parse reserved top-level `agents` and `teams` blocks
- document that they are placeholders only
- keep them behaviorally inert

That gives the future config model an explicit landing zone without pretending
that agent/team execution exists yet.


## Agent boundary note (2026-04-01)

The first agent contract is now documented separately in:

- [agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)

That document is the source of truth for:
- what agents inherit from AuraCall runtime profiles
- what agents may override
- what remains owned by browser profiles or future teams
