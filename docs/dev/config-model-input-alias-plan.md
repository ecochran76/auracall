# Config Model Input Alias Plan

## Purpose

Define the transition policy for eventually accepting the target public config
shape as input without creating an ambiguous compatibility surface.

This document is intentionally about policy, not implementation. Aura-Call does
not accept these target-shape keys yet.

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
`projectedModel`, but input parsing is still bridge-key-only.

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

Status: planned

Allow config loading to read both:

- `browserFamilies` and `browserProfiles`
- `profiles` and `runtimeProfiles`
- `profiles.<name>.browserFamily` and
  `runtimeProfiles.<name>.browserProfile`

But still write only bridge keys from:

- `wizard`
- `profile scaffold`
- `config migrate`

Why:
- this keeps write behavior stable while allowing carefully chosen early adopters
  to author the target shape

### Phase 2: target-write option

Status: future

Add an explicit opt-in mode for writing the target shape, likely only to:

- `config migrate`
- maybe future scaffold flags

Do not silently flip defaults until the target input shape has proven stable.

### Phase 3: target-first defaults

Status: deferred

Only after the target shape is stable in real use:

- default scaffolding may emit target keys
- docs may switch examples to target keys first
- bridge keys can become legacy aliases

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

Once dual-read exists:

- normal write paths still emit bridge keys by default
- target-write must be explicit
- no command should rewrite a user-authored target-shape config back to bridge
  keys unless the user asked for migration/normalization output in that shape

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
