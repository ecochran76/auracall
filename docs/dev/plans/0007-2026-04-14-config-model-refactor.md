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
  - active `keepBrowser` precedence is now narrowed:
    - when a runtime profile references a browser profile, the referenced
      browser profile's `keepBrowser` now wins over legacy
      `runtimeProfiles.<name>.keepBrowser`
    - legacy runtime-profile `keepBrowser` remains only as fallback residue
      when no browser-profile-level value exists
  - the remaining broad browser-owned override block is still live runtime
    residue for now:
    - conflicting `runtimeProfiles.<name>.browser` values for fields such as
      `chromePath`, `display`, `managedProfileRoot`, and
      `wslChromePreference` still win in active resolution today
    - that is why doctor continues to frame them as advanced escape hatches
      rather than fully dead config
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
    - doctor should also warn when `manualLoginProfileDir` is set without
      active `manualLogin`, because that path is otherwise inert config noise
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
  - active resolution now matches that ownership tightening for
    `keepBrowser`:
    - `browserProfiles.<name>.keepBrowser` wins over legacy
      `runtimeProfiles.<name>.keepBrowser` when both exist
  - active resolution does not yet make the same rewrite for the remaining
    broad browser-owned fields:
    - conflicting runtime-profile `browser` values still override the
      referenced browser profile for now
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
    - policy decision:
      - the current active root-browser service-default inventory remains a
        supported transitional layer for now
      - it is not compatibility-only, because the live resolver still uses it
        directly
      - it is also not the preferred authoring surface; prefer
        `services.<service>` or `runtimeProfiles.<name>.services.<service>`
        for new or cleaned-up config
      - current usage audit result:
        - this layer is still exposed by real operator-facing authoring paths,
          not just by the live resolver
        - current evidence includes:
          - CLI flag mapping for:
            - `--project-id`
            - `--project-name`
            - `--conversation-id`
            - `--conversation-name`
            - `--browser-model-strategy`
            - `--browser-thinking-time`
            - `--browser-composer-tool`
          - browser-mode docs that still document legacy root-browser keys such
            as:
            - `browser.thinkingTime`
            - `browser.manualLoginProfileDir`
        - current classification:
          - the following CLI flags remain supported transitional input on the
            root `browser` block for now:
            - `--project-id`
            - `--project-name`
            - `--conversation-id`
            - `--conversation-name`
            - `--browser-model-strategy`
            - `--browser-thinking-time`
            - `--browser-composer-tool`
        - current narrowing checkpoint:
          - `--project-id` and `--project-name` now also mirror into the
            selected `runtimeProfiles.<name>.services.<defaultService>` block
            when one concrete default service exists
          - `--conversation-id` and `--conversation-name` now also mirror into
            the selected `runtimeProfiles.<name>.services.<defaultService>`
            block when one concrete default service exists
          - `--browser-model-strategy`, `--browser-thinking-time`, and
            `--browser-composer-tool` now also mirror into the selected
            `runtimeProfiles.<name>.services.<defaultService>` block when one
            concrete default service exists
          - their root-browser mapping remains in place only as transitional
            compatibility-alias input for now
        - precedence checkpoint:
          - those authoring paths are now explicitly preserved as supported
            transitional input
          - active service binding should prefer
            `services.<service>` / `runtimeProfiles.<name>.services.<service>`
            over the legacy root-browser copies when both exist
          - keep `manualLogin` / `manualLoginProfileDir` outside that rewrite;
            they remain browser-execution escape hatches
        - reassessment decision:
          - the first bounded root-browser alias reconciliation pass is now
            complete enough
          - keep this alias surface in maintenance mode for now
          - do not open deprecation/reporting churn on it unless a later slice
            explicitly chooses that scope
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
    - current active service-binding precedence should now give:
      - `services.<service>.projectName`
      - `services.<service>.projectId`
      - `services.<service>.conversationName`
      - `services.<service>.conversationId`
      - `services.<service>.modelStrategy`
      - `services.<service>.thinkingTime`
      - `services.<service>.composerTool`
      priority over legacy root-browser copies when both exist
  - `llmDefaults` model/project defaults also remain diagnostics-only:
    - `llmDefaults.model`
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
  - compatibility bridge writes now also honor the same target-first
    authority as read-time dual-read:
    - when bridge output is requested from mixed-shape input,
      `browserProfiles` must overwrite stale `browserFamilies`
    - `runtimeProfiles` must overwrite stale `profiles`
    - `runtimeProfiles.<name>.browserProfile` must overwrite stale
      `profiles.<name>.browserFamily`
    - browser-owned `keepBrowser` should stay on bridge `browserFamilies`,
      not drift back onto bridge `profiles`, when target-shaped config already
      carries it under `browserProfiles.<name>`
    - explicit bridge output should emit bridge-only keys, not preserve mixed
      target + bridge residue
  - legacy `auracallProfiles` now stays a last-resort compatibility fallback
    only:
    - keep it visible to inspection/doctor as legacy residue
    - but do not let it outrank current `profiles` / `runtimeProfiles` when
      choosing the active runtime-profile bridge
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

Current bounded follow-through at this layer:

- keep root-browser compatibility-alias work in maintenance mode unless a
  later slice explicitly chooses deprecation/reporting scope
- continue doctor/report hardening for the next compositional layers above
  runtime profiles:
  - agent boundary:
    - non-empty `agents.<name>.defaults` should surface as an explicit
      placeholder seam:
      - the bag is still execution-inert for now
      - operators should not infer live behavior from placeholder keys alone
    - `agents.<name>.defaults` should not silently attempt runtime-selection
      bypass through:
      - `defaults.runtimeProfile`
      - `defaults.browserProfile`
      - `defaults.browserFamily`
    - `agents.<name>.defaults` should not silently carry browser/account-owned
      override state such as:
      - `defaults.browser`
      - source/bootstrap/cookie path overrides
      - managed-profile overrides
      - debug-port and browser lifecycle policy overrides
    - `agents.<name>.defaults` should not silently rewire service identity
      through:
      - `defaults.services.<service>.identity`
    - this remains diagnostics-only:
      - agent workflow defaults are still allowed when they do not mutate
        browser/account ownership
      - runtime/browser selection remains anchored on
        `agents.<name>.runtimeProfile` plus the referenced AuraCall runtime
        profile
      - current positive live agent contract remains narrow:
        - `agents.<name>.runtimeProfile` is the only live agent-owned
          execution selector today
        - `agents.<name>.description`, `instructions`, and `metadata` remain
          organizational / future-workflow fields for now
        - `0007` does not currently open a typed live agent-defaults surface;
          keep the agent layer selection-only plus descriptive metadata for
          this phase
      - the generic agent defaults bag is still execution-inert for runtime
        selection, browser profile resolution, and default service resolution
  - team boundary:
    - invalid `teams.<name>.roles.<role>.agent` references should surface
      explicitly
    - invalid `teams.<name>.roles.<role>.handoffToRole` references should
      surface explicitly
    - ambiguous explicit role ordering and self-handoff should also surface
      explicitly instead of relying on silent planning tiebreaks
    - current team-role planning semantics should stay explicit:
      - explicit role `order` drives sequencing
      - duplicate order still falls back to a deterministic role-id tiebreak
      - `handoffToRole` is advisory metadata only for now
    - role-driven team planning is already real, so those references should
      not remain silent config drift

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
