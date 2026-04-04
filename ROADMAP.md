# Aura-Call Roadmap

## Active Initiatives

### Current Execution Board

Status: in progress

Use [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md) as the execution owner document for the active config-model work plus any bounded browser reliability follow-ups.

### Browser Profile Family Refactor
Status: in progress

Aura-Call's browser/profile model still blends logical runtime profiles,
browser-family selection, service binding, and managed-profile path derivation
into one mutable config path. That has been a repeated source of target leakage,
operator confusion, and launch nondeterminism.

The next configuration/runtime refactor should separate:

- Aura-Call profile selection
- browser-family resolution
- service binding resolution
- immutable launch-plan resolution

Execution docs:
- Repo-wide plan: [docs/dev/browser-profile-family-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-profile-family-refactor-plan.md)

Current note:
- Phase 1 is complete enough through commit `196aad27`
- named secondary browser profiles, dual-profile live smokes, and reattach/doctor boundary fixes are now green enough that this track can remain in maintenance mode while the larger config-model refactor becomes the active architecture track

### Config Model Refactor
Status: in progress

Aura-Call now has clearer semantics in docs, but the config shape is still
transitional. Browser concerns, AuraCall runtime concerns, and future higher
layers like agents and teams should not continue to share overloaded profile
concepts.

This refactor should establish the long-term layering:

- browser profiles
- AuraCall runtime profiles
- agents
- teams

Current config-model checkpoint:
- target-shape is now the primary documented and default-written model:
  - `version: 3`
  - `browserProfiles`
  - `runtimeProfiles`
  - `defaultRuntimeProfile`
- dual-read loading is live for target and bridge shapes
- target-shape is now the default write mode for:
  - `config migrate`
  - `profile scaffold`
  - `wizard`
- inspection surfaces now expose:
  - target-vs-bridge precedence
  - selector-key presence
  - projected target model

Current note:
- the public config transition is now complete enough for a checkpoint
- the next architecture question is no longer config-shape mechanics
- the next active design/implementation track should be the agent/team-ready
  layering that composes on top of:
  - browser profiles
  - AuraCall runtime profiles
- current checkpoint:
  - reserved `agents` / `teams` are now:
    - parsed
    - projected
    - inspected
    - validated for missing references
  - one shared read-only resolver now exists for:
    - `agent -> runtimeProfile -> browserProfile`
  - current execution-adjacent checkpoint:
    - `--agent <name>` now resolves through the real config/runtime path
    - explicit `--profile` still wins over `--agent`
    - selected-agent resolution is visible in:
      - config inspection/doctor
      - session/status text
      - session/status JSON
    - stored session metadata now preserves:
      - `options.selectedAgentId`
- current runtime/browser checkpoint:
    - one shared runtime selection helper now exists for:
      - `selected agent -> runtimeProfile -> browserProfile`
    - one browser-facing helper now exists for:
      - runtime selection + browser profile resolution
    - browser config, browser runtime metadata, and session/status postmortems
      now all preserve selected-agent provenance locally
  - current team-ready checkpoint:
    - one shared read-only resolver now exists for:
      - `team -> agent -> runtimeProfile -> browserProfile`
    - one shared read-only helper now exists for:
      - team member runtime/browser activation contexts
    - resolved team inspection is now visible in:
      - `config show`
      - `profile list`
  - current semantic checkpoint:
    - the next design question is team execution boundary, not more selection
      plumbing
    - future service-mode runners and parallelism should remain a higher layer,
      not be implied by current team config alone
    - future teams are expected to become the orchestration layer for:
      - divide-and-conquer task decomposition
      - multi-turn automation across agents
      - explicit inter-agent data handoff
      while runners/parallelism remain a separate execution layer

Sequencing rule:
- do the config-model refactor before implementing agents
- do not burn time on broad code symbol renames before that refactor
- keep browser reliability in maintenance mode while this refactor becomes the
  main planning/implementation track

Execution docs:
- Repo-wide plan: [docs/dev/config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
- Target public shape: [docs/dev/config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
- Input alias policy: [docs/dev/config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-input-alias-plan.md)
- Troubleshooting: [docs/dev/config-shape-troubleshooting.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-shape-troubleshooting.md)
- Agent boundary: [docs/dev/agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)
- Team boundary: [docs/dev/team-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-config-boundary-plan.md)
- Team service execution: [docs/dev/team-service-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-service-execution-plan.md)

Next recommendation:
- pause team helper growth here
- define the first future team service-execution contract next
- then avoid implementation until runner/service work is ready

Browser reliability maintenance note:
- current ChatGPT hardening/proof checkpoint is substantially better than it
  was:
  - mutation-side persistence/verification is hardened across root/project
    CRUD surfaces
  - read-side conversation recovery has one shared surface-readiness seam plus
    bounded retry for transient read misses
  - artifact-local consistency has been tightened for:
    - image matching
    - download/spreadsheet button matching
    - canvas content resolution
  - live artifact proof on `wsl-chrome-2` now includes:
    - DOCX/download
    - spreadsheet (`.xlsx`)
    - generated image
- treat remaining ChatGPT work as maintenance/proof-planning by default
- record side findings in durable docs and only reopen coding when a concrete
  blocker is demonstrated

### Service Volatility Externalization
Status: planned

Aura-Call currently keeps too much volatile service knowledge in TypeScript: model aliases, picker labels, route patterns, selector families, feature/app fingerprints, artifact classification hints, and rate-limit knobs. That makes normal upstream service churn look like product code churn.

The next major refactor is to externalize service-specific volatility into typed, checked-in service manifests while keeping workflow logic, recovery strategy, and verification in code.

Primary goals:
- reduce hard-coded service drift in adapters and resolvers
- make model/feature/selector updates more data-driven
- keep refactors incremental, service-by-service, with regression gates
- avoid a big-bang rewrite of ChatGPT, Grok, and Gemini at the same time

Execution docs:
- Repo-wide plan: [docs/dev/service-volatility-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-refactor-plan.md)
- Inventory: [docs/dev/service-volatility-inventory.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-inventory.md)
- Per-service plan template: [docs/dev/service-volatility-service-plan-template.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-service-plan-template.md)
- First pilot plan: [docs/dev/service-volatility-chatgpt-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-chatgpt-plan.md)

Release discipline:
- no service migration starts without a service-specific plan
- no service migration lands without targeted regression coverage and the relevant acceptance bar

## Existing Long-Running Tracks

### Browser Service Hardening
See [docs/dev/browser-service-refactor-roadmap.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-refactor-roadmap.md).

Current focused reliability slice:
- [docs/dev/browser-service-reattach-reliability-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-reattach-reliability-plan.md)

### Browser Automation Drift Repairs
See [docs/dev/browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md).
