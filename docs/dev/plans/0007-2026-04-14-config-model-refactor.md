# Config Model Refactor Plan | 0007-2026-04-14

State: OPEN
Lane: P01

## Current State

- the repo-wide config architecture plan is still directly referenced from the
  roadmap and continues to govern the remaining browser/runtime/agent/team
  boundary work
- the team boundary is now canonical under:
  - `docs/dev/plans/0006-2026-04-14-team-config-boundary.md`
- the planning-compliance framework is green, so this slice is promoting the
  config-model umbrella into canonical authority without changing its
  semantics
- the live need is one stable authority path for the remaining config cluster,
  not another semantic rewrite of the transition plan

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
- [0009-2026-04-14-agent-config-boundary.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0009-2026-04-14-agent-config-boundary.md)

### 4. Team

Future grouping/orchestration object that coordinates multiple agents.

Boundary reference:
- [0006-2026-04-14-team-config-boundary.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0006-2026-04-14-team-config-boundary.md)

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

Recent execution-adjacent checkpoint:

- the first non-reporting agent seam is now live enough to prove layering:
  - `--agent <name>` resolves through:
    - `agent -> runtimeProfile -> browserProfile`
  - explicit AuraCall runtime profile selection still wins when both
    `--profile` and `--agent` are present
  - selected-agent provenance is now preserved in session metadata and surfaced
    through the main inspection/session/status commands
  - shared runtime/browser execution seams now also exist:
    - `resolveRuntimeSelection(...)`
    - `resolveSelectedBrowserProfileResolution(...)`
  - selected-agent provenance is now preserved locally through:
    - browser config
    - browser runtime metadata
    - session/status postmortem surfaces

This means the next architectural question is not whether agent selection can
compose cleanly. It is how the first team-side readiness seam should consume
that established lower-layer selection path.

Current team-ready checkpoint:

- one shared read-only resolver now exists for:
  - `team -> agent -> runtimeProfile -> browserProfile`
- one shared read-only helper now exists for:
  - team member runtime/browser activation contexts
- team inspection is now visible in:
  - `config show`
  - `profile list`

This means the next team-layer question is no longer basic composition. It is
how to define future team selection/execution semantics without collapsing them
into the later service/runners layer too early.

Current diagnostic checkpoint:

- `config doctor` now also warns when an AuraCall runtime profile still
  carries browser-owned override state such as:
  - broad launch/browser-family fields under `runtimeProfiles.<name>.browser`,
    for example:
    - `chromePath`
    - `display`
    - `wslChromePreference`
  - top-level runtime-profile `keepBrowser`
- this is a diagnostics-only checkpoint:
  - compatibility loading remains intact
  - operator guidance now pushes broad browser-owned overrides back toward the
    referenced browser profile layer unless they are intentional advanced
    escape hatches
- `config doctor` now splits service-scoped runtime browser fields into two
  advisory classes when they are still defined under
  `runtimeProfiles.<name>.browser`:
  - relocatable service fields:
    - `modelStrategy`
    - `thinkingTime`
    - `composerTool`
  - managed-profile escape hatches:
    - `manualLogin`
    - `manualLoginProfileDir`
  - current policy:
  - keep top-level root browser config out of service ownership:
    - `browser.modelStrategy`, `browser.thinkingTime`, and
      `browser.composerTool` are legacy global service defaults, not
      browser-family state
    - `browser.projectName` and `browser.projectId` are also legacy global
      service/project defaults, not browser-family state
    - `browser.conversationName` and `browser.conversationId` are also legacy
      global service/conversation defaults, not browser-family state
    - doctor should flag those keys under the top-level `browser` block as
      misplaced service/project-scoped defaults
    - `llmDefaults` remains a compatibility bridge for model/project defaults
      until that ownership seam is narrowed further
  - prefer moving relocatable service fields into
    `runtimeProfiles.<name>.services.<service>`
  - keep those service fields off browser profiles entirely:
    - browser profiles do not own service-layer defaults for
      `modelStrategy`, `thinkingTime`, or `composerTool`
    - doctor should treat those keys under a browser profile as misplaced
      service-scoped overrides, not as another redundancy-cleanup target
  - keep `manualLogin` and `manualLoginProfileDir` only as intentional escape
    hatches until their ownership boundary is narrowed further
  - current escape-hatch contract:
    - browser execution overrides still win over service fallback
    - `manualLoginProfileDir` is only meaningful when `manualLogin` is true
    - doctor should treat default-equivalent derived managed-profile paths as
      redundant config noise, not as meaningful overrides
  - `config migrate` may now move those fields automatically only when:
    - the AuraCall runtime profile declares one concrete `defaultService`
    - the destination `runtimeProfiles.<name>.services.<service>` slot is
      unambiguous
    - no conflicting service-level value already exists

Current migration checkpoint:

- `config migrate` now performs one bounded cleanup for obvious browser-owned
  runtime overrides:
  - if a runtime profile already references a real browser profile, migrate can
    hoist:
    - broad launch/browser-family fields from
      `runtimeProfiles.<name>.browser`
    - runtime-profile `keepBrowser`
    into that browser profile
- the cleanup remains conservative:
  - existing browser-profile values win
  - conflicting runtime-profile values are preserved in place rather than
    rewritten silently
  - relocatable service fields such as:
    - `modelStrategy`
    - `thinkingTime`
    - `composerTool`
    are now moved into `runtimeProfiles.<name>.services.<defaultService>`
    only when the destination is explicit and non-conflicting
  - managed-profile escape hatches:
    - `manualLogin`
    - `manualLoginProfileDir`
    remain in `runtimeProfiles.<name>.browser`
  - `config migrate` may now also remove default-equivalent
    `manualLoginProfileDir` values when they exactly match the managed profile
    path Aura-Call would derive for the same AuraCall runtime profile +
    service target
  - `config doctor` and `config migrate` may now also treat
    `runtimeProfiles.<name>.services.<service>.modelStrategy`,
    `thinkingTime`, and `composerTool` as redundant when they exactly mirror
    the already-inherited top-level `services.<service>` defaults
  - browser-profile placement for those same fields remains diagnostics-only:
    - there is no safe automatic relocation target at the browser-profile
      layer because the current resolver treats them as runtime/service
      concerns, not browser/account-family state
  - top-level root-browser placement for those same fields also remains
    diagnostics-only:
    - root browser config is still a compatibility/defaults surface
    - there is no safe automatic rewrite until the remaining `browser` versus
      `llmDefaults` ownership contract is narrowed further
    - current active root-browser service-default inventory is:
      - `browser.modelStrategy`
      - `browser.thinkingTime`
      - `browser.composerTool`
      - `browser.projectName`
      - `browser.projectId`
      - `browser.conversationName`
      - `browser.conversationId`
    - separate managed-profile escape hatches still remain:
      - `browser.manualLogin`
      - `browser.manualLoginProfileDir`
    - current live resolver precedence still gives:
      - `browser.projectName`
      - `browser.projectId`
      - `browser.conversationName`
      - `browser.conversationId`
      priority over service-scoped project/conversation defaults, so this
      remains a real active ownership seam rather than bridge-output-only
      noise
  - `llmDefaults` model/project defaults also remain diagnostics-only:
    - `llmDefaults.modelStrategy`
    - `llmDefaults.defaultProjectName`
    - `llmDefaults.defaultProjectId`
    - they are still the compatibility bridge seam for legacy model/project
      defaults
    - doctor should flag them as compatibility-only service default state, not
      as the preferred place to encode active service/project behavior
    - there is no safe automatic rewrite until the remaining
      `llmDefaults` versus `services.<service>` ownership contract is narrowed
      further
    - current compatibility-write contract also stays explicit:
      - bridge output may still backfill `llmDefaults` from root
        `model` / `browser.modelStrategy` / `browser.projectName` /
        `browser.projectId` when no explicit `llmDefaults` block exists
      - explicit `llmDefaults` values still win over that backfill path
  - empty `runtimeProfiles.<name>.services.<service>` stubs left behind by
    conservative cleanup are now pruned as residue
  - if `defaultService` is missing or the service-level value already
    conflicts, those fields remain in `runtimeProfiles.<name>.browser`
  - external managed-profile overrides still remain untouched

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
- [0009-2026-04-14-agent-config-boundary.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0009-2026-04-14-agent-config-boundary.md)
- [0031-2026-04-08-config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0031-2026-04-08-config-model-input-alias-plan.md)

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

- [0031-2026-04-08-config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0031-2026-04-08-config-model-input-alias-plan.md)

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

- [0009-2026-04-14-agent-config-boundary.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0009-2026-04-14-agent-config-boundary.md)

That document is the source of truth for:
- what agents inherit from AuraCall runtime profiles
- what agents may override
- what remains owned by browser profiles or future teams

## Team boundary note (2026-04-03)

The first team contract is now documented separately in:

- [0006-2026-04-14-team-config-boundary.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0006-2026-04-14-team-config-boundary.md)

That document is the source of truth for:
- what teams own
- what teams inherit through agents/runtime profiles
- what remains owned below the team layer
- what should remain deferred to the future service/runners layer
