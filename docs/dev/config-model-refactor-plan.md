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
- `browserFamilies` and `profiles.<name>.browserFamily` exist as a useful
  bridge toward browser-profile-first config
- reserved top-level `agents` and `teams` blocks now exist in the schema as
  inert placeholders for the future refactor
- live WSL smokes are green for `default` and `wsl-chrome-2`

What is still transitional:

- `profiles` still mixes the final AuraCall runtime-profile concept with some
  browser-oriented details
- `browserFamilies` is a transitional implementation name, not necessarily
  the final public shape
- `manualLoginProfileDir` remains an escape hatch with too much conceptual
  weight

## Recommended sequencing

### Near term

- keep the current config shape stable enough for normal use
- continue small reliability and browser hardening work
- avoid broad symbol renames in code

### Next architecture track

Design and implement the config-model refactor before introducing agents.

That means:

1. make browser profiles first-class config objects
2. make AuraCall runtime profiles explicitly reference a browser profile
3. move browser-owned defaults/state fully under browser profiles
4. leave AuraCall runtime profiles with AuraCall-owned concerns only
5. introduce compatibility shims for existing config
6. only then design agent and team config on top of the cleaner base

### Deferred until that refactor

- broad code symbol renames to match the new semantics
- final public naming decision on whether `browserFamilies` remains the
  external config key or becomes `browserProfiles`
- agent/team implementation work beyond today's reserved config placeholders

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
