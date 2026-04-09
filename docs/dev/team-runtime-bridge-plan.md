# Team Runtime Bridge Plan

## Purpose

Define the first bounded execution bridge from the existing team planning model
onto the current runtime/service substrate.

This plan answers one practical question:

- what is the smallest real team-execution slice AuraCall should add now that
  team planning data exists and the runtime/service layer can already execute a
  bounded direct run

It should be read together with:

- [next-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/next-execution-plan.md)
- [team-service-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-service-execution-plan.md)
- [team-run-data-model-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/team-run-data-model-plan.md)
- [service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/service-runtime-execution-plan.md)
- [runtime-service-host-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/runtime-service-host-plan.md)

## Why this slice is next

The repo already has:

- team-run vocabulary and validation
- resolved team planning through `src/teams/*`
- runtime execution vocabulary and projection
- persisted runtime records
- dispatcher / lease / host-owned bounded execution

What is missing is the first real bridge that lets a `teamRun` become an
executable runtime run on purpose.

That gap is now higher leverage than:

- more service-host micro-polish
- more bounded `responses` host work
- more browser/provider maintenance without a blocker

## Scope

### In scope

- one thin internal bridge module from team planning to runtime execution
- sequential-only execution
- fail-fast default
- one `teamRun` projected to one runtime `ExecutionRunRecordBundle`
- one team step projected to one runtime step
- execution through the existing runtime control + service-host seams

### Out of scope

- new HTTP routes
- new MCP surfaces
- `chat/completions`
- streaming
- auth
- speculative parallelism
- richer handoff execution semantics
- worker-pool / scheduler topology

## Existing strong seams

The repo already has the right ingredients:

- team-side planning:
  - `src/teams/types.ts`
  - `src/teams/model.ts`
  - `src/teams/service.ts`
- runtime-side projection:
  - `src/runtime/model.ts`
    - `createExecutionRunRecordBundleFromTeamRun(...)`
- runtime execution substrate:
  - `src/runtime/control.ts`
  - `src/runtime/serviceHost.ts`
  - `src/runtime/runner.ts`

This means the bridge should be thin.

## Recommended code seam

Add one internal bridge/service module, likely under:

- `src/teams/runtimeBridge.ts`

Recommended responsibilities:

- build a `TeamRunServicePlan` from config or resolved team
- create a durable team-run bundle
- project it to one runtime execution bundle
- persist the runtime run through the existing control contract
- execute it through `ExecutionServiceHost.drainRunsOnce(...)`
- return both team-facing and runtime-facing ids/state needed for inspection

It should not:

- invent a second execution model
- bypass runtime persistence
- own leases/dispatch directly
- define HTTP or MCP payloads

## Safe first execution contract

The first bridge slice should do this:

1. resolve one team into a `TeamRunServicePlan`
2. create one durable `teamRun` bundle
3. project it to one runtime run bundle
4. persist the runtime run
5. invoke one bounded host drain for that run
6. read back the resulting runtime state

Safe MVP rule:

- sequential only
- fail-fast only
- explicit dependencies only
- no implicit parallel fan-out

## Handoff boundary for MVP

Do not make handoff execution the blocker for the first bridge.

For the first slice:

- preserve handoff-ready fields in the team data model
- let team step input/output/notes survive projection into runtime state
- defer richer explicit handoff delivery/consumption semantics until after the
  first team run can execute end-to-end

## Operator/runtime surface rule

The first bridge slice should not require new transport surfaces.

Acceptable for MVP:

- internal/local bridge module only
- focused tests over projected team-run execution
- optional future CLI/admin exposure later

Not required yet:

- new API routes
- new MCP tools
- public team execution server surface

## Acceptance bar

This slice is good enough when:

- one resolved team can become one persisted runtime run
- that projected run executes through the existing runtime service-host seam
- the execution remains sequential and fail-fast
- no second team-only runner model appears
- no new transport breadth is introduced

## After this slice

Only after the first team-to-runtime bridge is real should the repo consider:

- richer explicit handoff lifecycle semantics
- operator-facing team execution inspection/control
- broader background host automation if needed by real team execution
- future parallel team phases

