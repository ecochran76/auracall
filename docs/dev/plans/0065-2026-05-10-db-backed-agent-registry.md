# DB-Backed Agent Registry

Status: OPEN
Date: 2026-05-10

## Context

AuraCall now exposes configured agents as OpenAI-compatible `agent:<agent_id>`
model ids and lets local agents create/update agents and teams through API/MCP.
The current write path still treats `~/.auracall/config.json` as the mutable
store for `/v1/config/agents` and `/v1/config/teams`.

That is acceptable for bootstrap config and a small number of hand-authored
core agents. It is not the right long-term owner for lots of operational
agents. Agents need queryability, revision history, enablement state, ownership,
API-key grants, validation status, team membership, last-use metadata, and
eventual dashboard editing without making one large JSON file the hot write
target.

## Current State

Implemented:

- `AgentConfigSchema` and `TeamConfigSchema` define the current agent/team
  payload shape.
- `createAgentTeamConfigService(...)` backs API/MCP config entity CRUD by
  reading and rewriting the user config file.
- `createAgentRegistryStore(...)` initializes a user-scoped registry store at
  `~/.auracall/registry/agents.sqlite`, persists agent/team records with
  enablement and revision metadata, and has a JSON fallback for test/runtime
  environments where `node:sqlite` is unavailable.
- `createEffectiveAgentCatalog(...)` merges config-defined and registry-defined
  agents/teams into one deterministic read projection with source metadata,
  disabled-record filtering, and config-wins duplicate conflict reporting.
- `/v1/config/agents`, `/v1/config/teams`, MCP config listing, and
  `/v1/models` now read that effective merged catalog. Registry-backed enabled
  agents appear as `agent:<agent_id>` model ids with source/revision metadata.
- `projectConfigModel(...)` projects config-defined agents and teams for
  `/v1/models`, `/v1/config/agents`, `/v1/config/teams`, CLI config inspection,
  and runtime selection.
- Runtime execution can route a prompt through `model: "agent:<agent_id>"`.
- API-key scopes can allow-list agents, teams, services, and runtime profiles.

Remaining:

- introduce a user-scoped agent registry store outside the portable config file
- define config-vs-registry precedence and migration semantics
- make API/MCP CRUD write the registry by default
- keep config-defined bootstrap agents available as seed/overlay entries
- expose registry metadata through CLI and dashboard surfaces
- provide export/import so selected agents can still become reviewable files

## Architecture Decision

Use a user-scoped SQLite registry as the normal mutable store for agents and
teams. Keep `~/.auracall/config.json` as bootstrap/source config for runtime
profiles, browser profile bindings, API service settings, and a small optional
set of pinned/core agents.

The registry is user runtime state. It should live under `~/.auracall` and be
owned by the installed service/runtime, not committed to the repo. Config-defined
agents become `source=config` records in the projected catalog; registry-defined
agents become `source=registry` records. A config-defined id should override a
registry id only when explicitly marked as pinned/bootstrap; otherwise duplicate
ids should be reported as a config doctor issue before mutation.

## Proposed Store

Initial database target:

```text
~/.auracall/registry/agents.sqlite
```

Minimum tables:

- `agent_records`
  - `id TEXT PRIMARY KEY`
  - `config_json TEXT NOT NULL`
  - `source TEXT NOT NULL` (`registry`, `config_seed`, `import`)
  - `enabled INTEGER NOT NULL DEFAULT 1`
  - `created_at TEXT NOT NULL`
  - `updated_at TEXT NOT NULL`
  - `created_by TEXT`
  - `updated_by TEXT`
  - `revision INTEGER NOT NULL`
  - `tags_json TEXT`
  - `metadata_json TEXT`
- `team_records`
  - same owner/revision/enabled columns, with `config_json`
- `agent_revisions`
  - append-only prior revisions for audit and rollback
- `agent_usage`
  - optional last-used and aggregate execution counters, populated by runtime
    execution rather than CRUD
- `agent_grants`
  - optional normalized API-key-to-agent/team grant rows after scoped key usage
    grows beyond dotenv/config simplicity

## Public Contract

Maintain current compatibility first:

- `GET /v1/config/agents` lists config and registry agents with source metadata.
- `PUT /v1/config/agents/{id}` writes the registry by default.
- `DELETE /v1/config/agents/{id}` disables or deletes the registry record. It
  must not silently remove pinned config entries.
- `GET /v1/models` continues to list `agent:<agent_id>` for all effective
  enabled agents.
- MCP config tools keep their names, but their result object should report
  whether a mutation hit `registry`, `config`, or was blocked by a pinned config
  entry.
- CLI config inspection should show source, enabled state, and duplicate-id
  conflicts.

Add explicit registry routes only after compatibility is working:

- `GET /v1/agents`
- `GET /v1/agents/{agent_id}`
- `PUT /v1/agents/{agent_id}`
- `DELETE /v1/agents/{agent_id}`
- `GET /v1/agents/{agent_id}/revisions`
- `POST /v1/agents/{agent_id}/export`

## Migration Plan

1. Read-model foundation
   - [x] add a registry store module with SQLite schema init and JSON fallback
     only if `node:sqlite` is unavailable during tests
   - [x] add projection merger: config agents + registry agents -> effective
     agent catalog
   - [x] add tests for registry entries, duplicate ids, disabled records, and
     source metadata
   - [x] wire merged read projection into `/v1/config/agents` and `/v1/models`
     after the read model stays stable

2. API/MCP write-path migration
   - change `createAgentTeamConfigService(...)` or replace it with
     `createAgentTeamRegistryService(...)`
   - make current `/v1/config/agents` and MCP config tools write registry
     records by default
   - keep an explicit escape hatch for config-file writes only for bootstrap
     maintenance
   - include revision and source metadata in mutation responses

3. Execution/catalog integration
   - make runtime agent resolution use the effective merged catalog
   - make `/v1/models` include registry agents with useful metadata
   - make API-key scope checks use effective agent/team ids
   - update config doctor for duplicate ids, invalid registry payloads, and
     config entries that should be migrated

4. Export/import and operator ergonomics
   - add export/import snapshots for selected agents and teams
   - add CLI/MCP helpers for backup, promotion, and rollback
   - defer dashboard editing until the registry API is stable

## Non-Goals

- Do not move browser profile, runtime profile, or service identity bindings out
  of config in this slice.
- Do not make the registry portable repo state by default.
- Do not remove config-defined agents until registry dogfooding proves the
  migration.
- Do not build a full dashboard editor before the API/MCP registry contract is
  stable.

## Acceptance Criteria

- A large number of agents can be created through API/MCP without rewriting
  `~/.auracall/config.json`.
- Existing config-defined agents still resolve and execute.
- `/v1/models` and `/v1/config/agents` expose the effective merged agent set.
- Mutations are revisioned and auditable.
- Duplicate config/registry ids are deterministic and visible.
- API-key scoping works against registry-backed agents.
- Operators can export selected agents/teams to a reviewable file without
  treating the export as the hot mutable store.

## First Implementation Slice

Build the read-model foundation:

- create the registry store module and schema init - complete
- add effective catalog merge helpers - complete
- keep current config write behavior untouched until the merged read model is
  tested - complete
- update `/v1/config/agents` listing and `/v1/models` only after the merge
  helpers are stable
