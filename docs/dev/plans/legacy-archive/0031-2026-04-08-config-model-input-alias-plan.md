# Config Model Input Alias Plan

## Purpose

Define the transition policy for eventually accepting the target public config
shape as input without creating an ambiguous compatibility surface.

This document is intentionally policy-first. Aura-Call now accepts these
target-shape keys for config loading in a bounded dual-read phase. The target
shape is the primary documented model and the default write mode. Bridge-key
writes are now the explicit compatibility mode.

Operational troubleshooting reference:

- [config-shape-troubleshooting.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-shape-troubleshooting.md)

## Current state

Today the public bridge keys are:

- `browserFamilies`
- `profiles`
- `profiles.<name>.browserFamily`

The target model is:

- `browserProfiles`
- `runtimeProfiles`
- `runtimeProfiles.<name>.browserProfile`

The repo now exposes the target model read-only through inspection JSON via
`projectedModel`, and config loading now supports bounded dual-read input for:

- `browserProfiles`
- `runtimeProfiles`
- `runtimeProfiles.<name>.browserProfile`

Default write paths now emit target-shape unless an explicit
`--bridge-shape` mode is selected.

## Recommendation

Do not accept target-shape aliases until there is one explicit precedence and
write-back policy.

That policy should be documented first, then implemented in one bounded slice.

## Proposed alias acceptance phases

### Phase 0: read-only projection

Status: implemented

- inspection/output can show the target model
- config parsing still accepts only bridge keys
- scaffolding/migration still writes bridge keys

### Phase 1: dual-read, bridge-write

Status: implemented

Config loading now reads both:

- `browserFamilies` and `browserProfiles`
- `profiles` and `runtimeProfiles`
- `profiles.<name>.browserFamily` and
  `runtimeProfiles.<name>.browserProfile`

That earlier bridge-write-only checkpoint is complete and superseded by the
current target-write-default phase.

Current slice boundaries that remain relevant:
- dual-read is implemented in schema/model/resolver loading paths
- read-only diagnostics report mixed/conflicting bridge vs target state
- compatibility bridge writes remain available explicitly

### Phase 2: target-write defaults

Status: implemented

Current implementation:

- `auracall config migrate`
  writes:
  - `version: 3`
  - `browserProfiles`
  - `runtimeProfiles`
  - `runtimeProfiles.<name>.browserProfile`
- `auracall profile scaffold`
  writes `version: 3` and
  writes the same target-shape keys for freshly scaffolded config
- `auracall wizard`
  writes `version: 3` and
  writes the same target-shape keys for guided browser-profile onboarding
- `--target-shape` remains accepted as an explicit form of the same write mode
- `--bridge-shape` now selects compatibility bridge output explicitly
  - compatibility bridge output writes `version: 2`

### Phase 3: target-first defaults

Status: implemented

Current implementation:

- docs now switch examples to target keys first
- inspection/output now treats bridge keys as compatibility/troubleshooting
  material instead of the main model
- bridge keys are now legacy compatibility aliases, not the centered public
  shape

### Phase 4: post-transition layering work

Status: next

Next useful work is no longer more alias mechanics. It is to use the now-stable
target shape as the base for:

- `agents`
- `teams`
- future behavior-facing layering work above AuraCall runtime profiles

## Proposed precedence rules

If both bridge and target keys are present in the same config:

1. Prefer target keys for the target-shape domain.
   - `browserProfiles` wins over `browserFamilies`
   - `runtimeProfiles` wins over `profiles`
   - `runtimeProfiles.<name>.browserProfile` wins over
     `profiles.<name>.browserFamily`
2. Emit a warning in doctor/inspection output when both forms are present.
3. Never merge conflicting definitions silently.
   - exact duplicates are acceptable
   - non-identical duplicate definitions should warn or fail in strict modes

Why this precedence:
- if we accept target aliases at all, they need to be authoritative
- otherwise the config surface becomes impossible to reason about

## Proposed write-back rules

Current write-back policy:

- normal write paths emit target shape by default
- compatibility bridge output must be explicit
- no command should rewrite a user-authored target-shape config back to bridge
  keys unless the user asked for `--bridge-shape`

This avoids surprising churn in config files.

## Diagnostics policy

When dual-read begins, add read-only diagnostics for:

- both bridge and target keys present
- conflicting bridge vs target definitions
- runtime profile references missing browser profile across either shape
- mixed bridge/target references inside the same profile

Suggested doctor issue codes:

- `mixed-browser-profile-keys`
- `mixed-runtime-profile-keys`
- `conflicting-browser-profile-definitions`
- `conflicting-runtime-profile-definitions`
- `mixed-runtime-profile-browser-reference`

## Not yet recommended

Do not do these yet:

- accept target-shape aliases without diagnostics
- silently merge target and bridge maps
- flip scaffolding defaults immediately
- rename code symbols purely because input aliases exist

## Acceptance bar for future implementation

Before alias acceptance lands:

- precedence rules are documented
- diagnostics policy is documented
- write-back policy is documented
- targeted config/schema tests cover:
  - target-only input
  - bridge-only input
  - duplicate identical input
  - conflicting duplicate input
  - explicit precedence for nested browser-profile references
