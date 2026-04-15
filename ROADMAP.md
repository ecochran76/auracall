# Aura-Call Roadmap

## P01 | Active Initiatives

### Current Execution Board

Status: in progress
Lane: P01

Current State:
- canonical active execution authority now lives under
  `docs/dev/plans/0001-2026-04-14-execution.md`
- low-signal loose execution pointers now live under
  `docs/dev/plans/legacy-archive/`
- planning-authority migration is complete and the next decision is product sequencing

Use [docs/dev/plans/0001-2026-04-14-execution.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0001-2026-04-14-execution.md) as the execution owner document for:

- the active team/service-foundation work
- any bounded config-model follow-through
- any bounded browser reliability maintenance follow-ups

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
- Repo-wide plan: [docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0008-2026-04-14-browser-profile-family-refactor.md)

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
- task / run spec

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
    - teams should be treated as reusable orchestration templates, not as
      complete one-off assignments
    - a separate task / run-spec layer should carry:
      - the concrete bundle
      - the requested outcome
      - run-specific constraints
      - temporary overrides

Sequencing rule:
- do the config-model refactor before implementing agents
- do not burn time on broad code symbol renames before that refactor
- keep browser reliability in maintenance mode while this refactor becomes the
  main planning/implementation track

Execution docs:
- Repo-wide plan: [docs/dev/plans/0007-2026-04-14-config-model-refactor.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0007-2026-04-14-config-model-refactor.md)
- Target public shape: [docs/dev/config-model-target-shape.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-target-shape.md)
- Input alias policy: [docs/dev/plans/legacy-archive/0031-2026-04-08-config-model-input-alias-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0031-2026-04-08-config-model-input-alias-plan.md)
- Troubleshooting: [docs/dev/config-shape-troubleshooting.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-shape-troubleshooting.md)
- Agent boundary: [docs/dev/plans/0009-2026-04-14-agent-config-boundary.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0009-2026-04-14-agent-config-boundary.md)
- Team boundary: [docs/dev/plans/0006-2026-04-14-team-config-boundary.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0006-2026-04-14-team-config-boundary.md)
- Team service execution: [docs/dev/plans/0004-2026-04-14-team-service-execution.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0004-2026-04-14-team-service-execution.md)
- Task / run spec: [docs/dev/plans/0002-2026-04-14-task-run-spec.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0002-2026-04-14-task-run-spec.md)
- Team run data model: [docs/dev/plans/0003-2026-04-14-team-run-data-model.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0003-2026-04-14-team-run-data-model.md)

Next recommendation:
- keep public team execution paused
- the first concrete task / run-spec shape is now defined in the canonical plan
- the concrete `teamRun` execution contract is now defined in the canonical team-run plan
- the first internal implementation slice is now live for durable `taskRunSpec` persistence plus `taskRunSpec -> teamRun -> runtime` projection
- the bounded internal inspection/readback seam for that persisted linkage is now live on existing response/recovery surfaces
- the narrow internal debug/inspection command is now live as `auracall teams inspect`
- the first bounded public read-only team inspection surface is now live as `GET /v1/team-runs/inspect`
  - current lookup keys:
    - `taskRunSpecId`
    - `teamRunId`
    - `runtimeRunId`
- the first bounded public read-only runtime queue surface is now live as `GET /v1/runtime-runs/inspect`
  - current lookup keys:
    - `runId`
    - `runtimeRunId`
    - `teamRunId`
    - `taskRunSpecId`
  - optional runner evaluation:
    - `runnerId`
- next, keep public team execution writes paused and only widen read-only runtime inspection if a concrete operator gap remains

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

### Service Mode And Runner Orchestration
Status: in progress

Aura-Call now has enough team planning structure that the next major
architecture question is not config shape. It is the service/runtime layer
underneath future team execution.

Primary goals:
- run Aura-Call as a service
- add durable runners/workers
- add heartbeats and runner liveness
- define queue/lease ownership cleanly
- keep runner/service execution separate from team orchestration intent

Execution checkpoints:
- Team semantics checkpoint
  - `team` is a reusable orchestration template
  - it owns reusable collaboration policy, not one concrete assignment
- Task / run-spec checkpoint
  - define the concrete assignment layer that binds work to a team
  - keep bundle/goal/constraints/overrides out of the long-lived team
    template
- Team-run execution checkpoint
  - bind one task / run spec to one team template
  - keep the first public execution contract conservative:
    - sequential first
    - fail-fast by default
    - no implicit parallelism from membership alone
- Handoff / host-action checkpoint
  - explicit structured handoffs
  - deterministic status fields for unattended loops
  - machine-readable local host-action requests when supported

Current checkpoint:
- read-only team execution planning is in place:
  - `teamRun`
  - `step`
  - `handoff`
  - `sharedState`
- one bounded host-backed service-ready seam now exists for:
  - step indexing
  - runnable/waiting/blocked classification
  - direct-run execution through one bounded local pass
  - request-scoped recovery/reclamation
  - team-runtime bridge dispatch through the same host
- an internal team-runtime bridge now projects team plans to persisted runtime
  records and executes local runnable steps through one bounded host pass
- `auracall api serve` now recovers stale runs at startup and reports bounded
  recovery counts

Current sequencing gate:
- do not add a public `team run` CLI/API/MCP surface until:
  - team semantics are frozen
  - the task / run-spec layer exists
  - public team execution can be stated without relying on current internal
    member-order MVP projection

Sequencing rule:
- do not expand this layer into multi-runner/background worker service mode until the
  durable state and account model are explicit enough to support replay,
  postmortem, and multi-process coordination

### Durable State And Account Mirroring
Status: planned

The future runner/service layer will need storage beyond the current
single-process/session model. That includes both orchestration state and a
better mirrored view of provider/browser account identity.

Primary goals:
- Redis/Postgres upgrade path for workers/runners
- durable queue/run/step/handoff persistence
- better DB mirroring of LLM service accounts
- preserve browser/account affinity constraints explicitly
- support replay/debug without depending only on live browser/session state

Important note:
- this is not just a database upgrade
- it is the ownership model for:
  - runs
  - steps
  - handoffs
  - service accounts
  - browser-bearing execution affinity

Execution docs:
- Durable ownership checkpoint: [docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0005-2026-04-14-durable-state-account-mirroring.md)

### External Control Surfaces
Status: planned

Aura-Call should eventually expose the same orchestration/runtime core through
multiple control surfaces instead of teaching each interface a different
execution model.

Primary goals:
- API surface
- MCP surface
- shared execution semantics under both
- shared auth/audit/replay model under both

Sequencing rule:
- do not let API or MCP invent a different team/run model from the service
  layer

### Retrieval And Search
Status: planned

Aura-Call will need both provider-side and local retrieval capabilities as the
agent/team layer grows more capable.

Primary goals:
- add LLM-side/provider-side search support
- add local lexical search over the cache/database
- add local semantic search over the cache/database
- later support routing/fusion between remote and local retrieval

Important split:
- provider-side search belongs to service/provider capabilities
- local lexical/semantic search belongs to Aura-Call's own state layer

### Provider Expansion
Status: planned

Provider coverage should continue to expand, but it should not drive the
service/runtime architecture by itself.

Primary goals:
- full Gemini implementation
- Claude implementation
- Grok image support

Current note:
- Gemini is the first recommended provider-expansion side track because it
  already has inherited Oracle support across both API and web/browser paths
- the next Gemini move should be a bounded audit/alignment plan, not a broad
  rewrite:
  - [docs/dev/plans/0013-2026-04-14-gemini-completion.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0013-2026-04-14-gemini-completion.md)

Sequencing rule:
- prefer building shared runtime/orchestration layers first, then expanding
  providers onto those layers

### Agent Orchestration And Local Actions
Status: planned

Teams are expected to become the orchestration layer for multi-agent work, but
that later track must also cover explicit handoffs, local execution, and
cross-agent coordination semantics.

Primary goals:
- agent-to-agent communication
- explicit handoff/state passing
- local actions
  - remote LLM composes local instructions
  - local machine executes them
  - Aura-Call packages results back into the run

Safety note:
- local actions need an explicit later policy for:
  - allowed execution scope
  - approval/consent
  - result packaging
  - audit trail
  - environment isolation

## P02 | Priority Buckets

### Now

- Service mode and runner orchestration
- Durable state and account mirroring
- bounded config/team-service foundation work that supports those layers

### Soon

- External control surfaces:
  - API
  - MCP
- Agent orchestration and local actions

### Later

- Retrieval and search
  - provider-side search
  - local lexical/semantic search
- Provider expansion
  - full Gemini
  - Claude
  - Grok image

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
- Repo-wide plan: [docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0012-2026-04-14-service-volatility-refactor.md)
- Inventory: [docs/dev/service-volatility-inventory.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-inventory.md)
- Per-service plan template: [docs/dev/service-volatility-service-plan-template.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-volatility-service-plan-template.md)
- First pilot plan: [docs/dev/plans/0010-2026-04-14-service-volatility-chatgpt.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0010-2026-04-14-service-volatility-chatgpt.md)

Release discipline:
- no service migration starts without a service-specific plan
- no service migration lands without targeted regression coverage and the relevant acceptance bar

## P03 | Existing Long-Running Tracks

### Browser Service Hardening
See [docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0011-2026-04-14-browser-service-refactor-roadmap.md).

Current focused reliability slice:
- [docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0014-2026-04-14-browser-service-reattach-reliability.md)

### Browser Automation Drift Repairs
See [docs/dev/browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md).
