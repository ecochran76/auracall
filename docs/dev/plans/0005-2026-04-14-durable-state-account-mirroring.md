# Durable State And Account Mirroring Plan | 0005-2026-04-14

State: CLOSED
Lane: P01

## Current State

- the durable ownership lane is now active in `ROADMAP.md`
- the adjacent runtime/history design notes have already been archived under
  `docs/dev/plans/legacy-archive/`
- the first single-runner/local-service checkpoint has shipped:
  - runtime queue projection
  - persisted local runner identity and heartbeat
  - local runner claim gating
  - bounded runtime/team inspection readback
  - configured service-account affinity projected through runner metadata,
    runtime inspection, local claim, and targeted-drain diagnostics
- the lane is not ready to widen into multi-runner scheduling or public team
  execution writes
- the validation-first checkpoint has passed:
  - one bounded isolated `api serve` smoke proved the documented
    read-only/account-affinity posture without touching live browser/API
    providers
  - the roadmap reassessment is complete:
    - this bounded single-runner/account-affinity checkpoint is closed
    - no new durable-state/account-mirroring implementation slice is active
      right now
    - only reopen this lane when a broader durable-ownership seam is selected
      explicitly

# Durable State And Account Mirroring Plan

## Purpose

Define the first bounded design checkpoint for the roadmap lane:

- durable state and account mirroring

This plan answers one practical question:

- what durable ownership model must exist before Aura-Call grows beyond the
  current single-process `serviceHost` posture into broader service/runtime
  mode

It should be read together with:

- [ROADMAP.md](/home/ecochran76/workspace.local/oracle/ROADMAP.md)
- [0001-2026-04-14-execution.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/0001-2026-04-14-execution.md)
- archived service/runtime history:
  - [0018-2026-04-14-service-runtime-execution-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0018-2026-04-14-service-runtime-execution-plan.md)
  - [0017-2026-04-14-runtime-service-host-plan.md](/home/ecochran76/workspace.local/oracle/docs/dev/plans/legacy-archive/0017-2026-04-14-runtime-service-host-plan.md)

## Why this is the next lane

The current `api serve` / `serviceHost` lane is now coherent enough for an
internal checkpoint:

- bounded startup recovery
- bounded background drain
- pause/resume control
- recovery class summaries
- recoverable-stranded distinction
- reduced-noise batch reporting
- actionable prioritization
- explicit oldest-first ordering
- bounded class-aware budgeting
- operator metrics on `/status` and startup logs

What is still missing is not more local host policy nuance. It is the durable
ownership model for broader service/runtime mode:

- queue/run/step/handoff persistence beyond one local process
- service-account/browser-affinity mirroring
- runner heartbeat and liveness ownership
- replay/debug/postmortem behavior without relying on one in-memory host

## Problem statement

Aura-Call already has durable runtime records, but they are still used in a
single-process posture:

- one local control implementation
- one local `serviceHost`
- one bounded HTTP host loop
- one local browser/account environment

If the project expands into broader service mode before durable ownership is
explicit, it risks:

- queue state that cannot be replayed cleanly
- ambiguous run ownership across processes
- browser-bearing work claimed by the wrong account or machine
- postmortems that depend on ephemeral local process context
- API/MCP/team execution surfaces growing on assumptions that do not survive
  multi-runner mode

## Design goals

The next design checkpoint should optimize for:

- durable ownership clarity
- replayability
- postmortem-friendly state
- explicit account/browser affinity
- compatibility with sequential-first execution
- minimal distributed assumptions

It should not optimize first for:

- worker-pool scale-out
- distributed scheduling cleverness
- speculative parallelism
- provider-specific routing
- cross-machine failover breadth

## Required boundaries

### Durable state owns

- queue/run identity
- step identity and lifecycle
- handoff identity and linkage
- lease ownership and heartbeat state
- replay/postmortem-ready event history
- service-account/browser-affinity claims needed to execute safely

### Runner/host owns

- active local process identity
- heartbeat updates while it is alive
- lease acquisition/release attempts
- execution side effects
- bounded recovery attempts

### Teams/agents own

- orchestration intent
- reusable instructions/policy
- task/run-spec defaults

### Browser-service/providers own

- browser mechanics
- provider DOM/request semantics
- provider-specific recovery logic

## Current baseline

The repo already has enough substrate to define this boundary concretely:

- persisted runtime bundles for:
  - runs
  - steps
  - events
  - leases
- bounded local recovery and host ownership in:
  - `src/runtime/serviceHost.ts`
- bounded HTTP host exposure in:
  - `src/http/responsesServer.ts`
- team/task/run planning seams in:
  - `src/teams/*`

What the repo does not yet have is an explicit durable model for:

- queue membership separate from “runs discovered by listRuns()” when broader
  service mode needs it
- multi-runner heartbeat ownership beyond one local process
- replay/debug guarantees across process restarts and machine boundaries

## Recommended bounded model

### 1. Durable execution state stays run-centric

Keep the current run bundle as the durable core for now:

- `run`
- `steps`
- `handoffs`
- `sharedState`
- `events`
- `leases`

Do not introduce a second queue-only object model yet if the current run bundle
can still be the durable source of truth.

### 2. Add one explicit queue/projection layer

The next durable seam should be a projection, not a replacement:

- one durable queue-ready projection derived from run state
- enough to answer:
  - runnable now
  - waiting on dependencies
  - held by active lease
  - blocked by affinity mismatch

This can remain local-storage-backed at first, but the ownership boundary
should be explicit enough to move to Redis/Postgres later.

Current checkpoint:

- the first code-facing queue-ready projection seam now exists in:
  - [src/runtime/projection.ts](/home/ecochran76/workspace.local/oracle/src/runtime/projection.ts)
- it derives from the existing inspection/dispatch model and currently exposes:
  - `queueState`
  - `claimState`
  - active lease owner/id
  - runnable/waiting/running/deferred/terminal step posture
  - one future-facing affinity evaluation hook that can report
    `blocked-mismatch`
- it remains a derived local projection, not a second durable source of truth

Additional bounded host-consumption checkpoint:

- `serviceHost` now consumes the first repair seam conservatively instead of
  blanket-expiring every expired lease by timestamp alone
- before bounded drain/recovery-summary work, host liveness now expires stale
  runner records on the persisted runner-control seam
- host lease repair then follows the current conservative rule:
  - stale or missing runner + expired lease => locally reclaimable
  - active runner + expired lease => keep `active-lease`
- this keeps bounded host recovery aligned with the durable
  lease/runner/repair model without adding reassignment or scheduler breadth

### 3. Add one explicit execution-affinity model

Browser-bearing work cannot be treated like generic local compute.

Minimum durable affinity fields should distinguish:

- service account identity
- browser-bearing vs non-browser work
- required runtime/browser profile family
- machine-local execution affinity when needed

The first durable model does not need full credential mirroring. It does need a
stable durable claim that explains why a given runner is or is not eligible to
execute a run.

Current checkpoint:

- the first explicit runtime-local affinity record/schema now exists in:
  - [src/runtime/types.ts](/home/ecochran76/workspace.local/oracle/src/runtime/types.ts)
  - [src/runtime/schema.ts](/home/ecochran76/workspace.local/oracle/src/runtime/schema.ts)
  - [src/runtime/model.ts](/home/ecochran76/workspace.local/oracle/src/runtime/model.ts)
- the queue-ready projection in
  [src/runtime/projection.ts](/home/ecochran76/workspace.local/oracle/src/runtime/projection.ts)
  can now consume that record directly while staying derived from runtime
  inspection state
- configured service identity is now projected into that same affinity model:
  - runner metadata derives `serviceAccountIds` from configured service
    identity
  - runtime inspection derives matching `requiredServiceAccountId` for the
    active step service
  - service-host local claim blocks missing-account runners with
    `blocked-affinity`
  - targeted drain preserves the stable `claim-owner-unavailable` skip taxonomy
    while carrying the actionable missing-account reason separately
- the id shape is `service-account:<service>:<identity-key>`, with identity
  key preference `email`, then `handle`, then `name`
- this remains declarative configured affinity:
  - `api serve` does not live-probe browser account state during runner
    registration
  - a matching id proves matching configured account ids, not independent proof
    of the currently logged-in browser tab

## Completed Validation Checkpoint

Before starting a broader implementation lane, the repo ran one bounded local
operator smoke for the current single-runner posture.

Acceptance criteria met:

- `auracall api serve --port 18080 --no-recover-runs-on-start` started against
  an isolated temporary `AURACALL_HOME_DIR` with a persisted local runner and
  reported it on `/status`
- `/status` included a compact local-claim summary for a seeded direct run
- the seeded direct run was inspected through
  `GET /v1/runtime-runs/inspect` with the documented queue/affinity fields
- configured service-account affinity was visible as
  `requiredServiceAccountId = service-account:<service>:<identity-key>` when
  configured identity exists
- a runner lacking that configured account id remained `blocked-affinity` with
  a stable missing service-account reason rather than silently falling back to
  the generic host owner

Non-goals:

- no public `team run` write surface
- no multi-runner scheduler or reassignment loop
- no live browser account probing during runner registration
- no Redis/Postgres migration

Decision after smoke:

- the documented posture is green
- pause the durable-state/account-affinity sub-lane
- choose the next roadmap lane explicitly before any broader service-mode work
