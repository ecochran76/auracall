# Aura-Call Roadmap

## Active Initiatives

### Current Execution Board

Status: in progress

Use [docs/dev/next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md) as the execution owner document for the remaining browser reliability and refactor slices.

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
- Phase 1 is complete enough through commit `196aad27`; next work is Phase 2 cleanup around explicit secondary WSL browser-profile config, naming clarity, and live/manual validation.

### Config Model Refactor
Status: planned

Aura-Call now has clearer semantics in docs, but the config shape is still
transitional. Browser concerns, AuraCall runtime concerns, and future higher
layers like agents and teams should not continue to share overloaded profile
concepts.

This refactor should establish the long-term layering:

- browser profiles
- AuraCall runtime profiles
- agents
- teams

Sequencing rule:
- do the config-model refactor before implementing agents
- do not burn time on broad code symbol renames before that refactor

Execution docs:
- Repo-wide plan: [docs/dev/config-model-refactor-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/config-model-refactor-plan.md)
- Agent boundary: [docs/dev/agent-config-boundary-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/agent-config-boundary-plan.md)

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

### Browser Automation Drift Repairs
See [docs/dev/browser-service-upgrade-backlog.md](/home/ecochran76/workspace.local/oracle/docs/dev/browser-service-upgrade-backlog.md).
