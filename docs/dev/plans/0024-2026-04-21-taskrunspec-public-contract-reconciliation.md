# TaskRunSpec Public Contract Reconciliation | 0024-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Bounded team execution writes are now live on both public local surfaces:
  - HTTP: `POST /v1/team-runs`
  - MCP: `auracall-mcp` tool `team_run`
- Both surfaces construct one bounded `TaskRunSpec` from compact request
  fields and execute through the existing
  `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun` chain.
- Arbitrary prebuilt `taskRunSpec` JSON remains deferred.
- The canonical design plan `0002` still describes a sectioned v1 conceptual
  shape, while the live code-facing `TaskRunSpec` model is currently a
  flatter persisted record used by CLI, HTTP, MCP, inspection, and recovery.
- Accepting caller-supplied `taskRunSpec` JSON before reconciling that
  contract would make the public API choose between stale docs and live
  storage semantics by accident.
- reconciliation decision:
  - the live flattened `TaskRunSpec` schema is the first public full-spec
    compatibility target
  - sectioned public envelopes remain deferred until a real client needs that
    shape
  - the next implementation slice should add validated prebuilt-spec
    acceptance against the live flattened schema only

## Scope

- Reconcile the documented `TaskRunSpec` contract with the live model.
- Decide the first public compatibility rule for caller-supplied
  `taskRunSpec` payloads:
  - accept only the live flattened schema,
  - accept a sectioned public envelope and normalize it internally, or
  - keep public prebuilt-spec input deferred with a concrete reason.
- Define validation, provenance, and compatibility behavior before adding any
  new write input path.
- Keep HTTP and MCP compact create requests unchanged.

## Live Contract Inventory

The live persisted `TaskRunSpec` contract is the flattened schema in
`src/teams/types.ts` / `src/teams/schema.ts`.

Top-level persisted fields:

- `id`
- `teamId`
- `title`
- `objective`
- `successCriteria`
- `requestedOutputs`
- `inputArtifacts`
- `context`
- `constraints`
- `overrides`
- `turnPolicy`
- `humanInteractionPolicy`
- `localActionPolicy`
- `requestedBy`
- `trigger`
- `createdAt`

Creation/defaulting:

- `createTaskRunSpec(...)` normalizes the flattened input and fills defaults
  for:
  - `successCriteria`
  - `requestedOutputs`
  - `inputArtifacts`
  - `context`
  - `constraints`
  - `overrides`
  - `turnPolicy`
  - `humanInteractionPolicy`
  - `localActionPolicy`
  - `requestedBy`
  - `trigger`
- compact CLI, HTTP, and MCP write surfaces call
  `buildBoundedTeamTaskRunSpec(...)`, which builds this flattened schema from
  request fields.

Storage:

- `TaskRunSpecSchema` validates the flattened schema before write/read.
- the store writes both:
  - `record.json` with revision and `persistedAt`
  - `spec.json` with the validated spec
- the runtime bridge persists the spec before creating the runtime run.

Execution projection:

- `id` becomes `teamRun.taskRunSpecId`, runtime `run.taskRunSpecId`, and
  readback/inspection lookup identity.
- `teamId` selects the reusable team template.
- `title` is copied into `teamRun.initialInputs.taskRunSpecTitle` and prompt
  context.
- `objective` becomes the team-run `entryPrompt` and prompt objective.
- `successCriteria`, `requestedOutputs`, and `inputArtifacts` are injected into
  step prompts and structured step data.
- `inputArtifacts` also become step artifact refs.
- `context`, `constraints`, `overrides`, `turnPolicy`,
  `humanInteractionPolicy`, and `localActionPolicy` are injected into
  structured step data for executor/readback behavior.
- `requestedOutputs` influences inferred step kind for simple runs.
- `overrides.agentIds` filters participating agents.
- `overrides.runtimeProfileId` and `overrides.browserProfileId` constrain
  runtime/browser selection.
- `overrides.promptAppend` is appended to the generated step prompt.
- `overrides.structuredContext` is carried as task override structured
  context.
- `constraints.allowedServices` and `constraints.blockedServices` can block
  planned steps.
- `localActionPolicy` is available in step structured data for local-action
  approval/execution behavior.
- `requestedBy` and `trigger` project into `teamRun.requestedBy` and
  `teamRun.trigger` unless the caller supplies execution-level overrides.

Inspection/readback:

- team and runtime inspection expose bounded `taskRunSpecSummary`:
  - `id`
  - `teamId`
  - `title`
  - `objective`
  - `createdAt`
  - `persistedAt`
  - requested-output count
  - input-artifact count
- response readback includes the same summary under
  `metadata.taskRunSpecSummary` for team runs.
- recovery detail includes the same summary plus the run's
  `taskRunSpecId`.

## Reconciliation Decision

The first public full-spec input contract should accept only the live
flattened `TaskRunSpec` schema.

Rationale:

- it is already the storage schema, runtime bridge input, and inspection
  source of truth
- compact HTTP/MCP writes already normalize into that schema
- accepting a sectioned public envelope now would create a second public
  vocabulary and a normalizer before there is a real client need
- multi-runner/parallel work does not require a sectioned envelope first

Public compatibility rule for the next implementation slice:

- keep compact `POST /v1/team-runs` and MCP `team_run` request fields
  unchanged
- optionally accept exactly one additional prebuilt-spec field named
  `taskRunSpec`
- when `taskRunSpec` is present:
  - validate it with `TaskRunSpecSchema`
  - require `taskRunSpec.teamId` to match the requested `teamId` when both are
    supplied
  - preserve `taskRunSpec.id`, assignment fields, constraints, overrides, and
    policies
  - preserve `trigger` / `requestedBy` unless the transport explicitly owns
    provenance replacement
  - reject simultaneous compact assignment fields that would conflict with the
    provided spec, rather than merging silently
  - execute through the same
    `TaskRunSpec -> TeamRun -> TeamRuntimeBridge -> runtimeRun` chain
- defer any sectioned public envelope such as `{ identity, assignment, inputs,
  execution, output, provenance }` until a later versioned compatibility slice.

## Non-Goals

- no public prebuilt `taskRunSpec` acceptance until this reconciliation lands
- no multi-runner scheduler
- no background worker pool
- no parallel team execution
- no provider/browser behavior changes
- no rewrite of existing persisted task-run-spec records

## Acceptance Criteria

- [x] inventory the live `TaskRunSpec` fields used by CLI, HTTP, MCP, runtime
  bridge, inspection, recovery, and readback
- [x] compare the live model against the `0002` sectioned v1 design
- [x] choose one explicit public compatibility rule for prebuilt
  `taskRunSpec` input
- [x] update `0002`, `0003`, `0004`, user-facing docs, and tests/validation
  targets to reflect the chosen rule
- [x] if prebuilt-spec acceptance is selected, define the exact validation and
  normalization boundary before implementation
- [x] keep multi-runner/background/parallel execution explicitly deferred

## Verification Target

- `pnpm run plans:audit`
- `git diff --check`
- If code or schema behavior changes in the implementation slice:
  - `pnpm run check`
  - targeted task/team/runtime tests
  - targeted HTTP and MCP tests for unchanged compact create behavior

## Definition Of Done

- [x] the public `TaskRunSpec` contract has one current source of truth
- [x] the next implementation step is unambiguous:
  - implement validated prebuilt-spec acceptance against the live flattened
    schema
- [x] roadmap, runbook, journal, and fixes log reflect the decision
