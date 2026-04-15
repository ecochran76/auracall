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

- queue membership separate from “runs discovered by listRuns()”
- service-account/browser-affinity ownership separate from current local
  environment assumptions
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
- current bounded affinity fields are:
  - `service`
  - `serviceAccountId`
  - `browserRequired`
  - `runtimeProfileId`
  - `browserProfileId`
  - `hostRequirement`
  - `requiredHostId`
  - `eligibilityNote`
- this is still a local durable seam for claim reasoning, not a full
  account-mirroring implementation

### 4. Separate lease ownership from process-local assumptions

The lease model already exists. The next checkpoint is to make its ownership
semantics explicit for multi-runner readiness:

- runner id
- heartbeat timestamp
- expiry timestamp
- release reason
- affinity mismatch as a non-claim reason, not an execution failure

Current checkpoint:

- the first explicit runtime-local runner identity / heartbeat seam now exists
  in:
  - [src/runtime/types.ts](/home/ecochran76/workspace.local/oracle/src/runtime/types.ts)
  - [src/runtime/schema.ts](/home/ecochran76/workspace.local/oracle/src/runtime/schema.ts)
  - [src/runtime/model.ts](/home/ecochran76/workspace.local/oracle/src/runtime/model.ts)
- the first persisted local runner-registry seam now also exists in:
  - [src/runtime/runnersStore.ts](/home/ecochran76/workspace.local/oracle/src/runtime/runnersStore.ts)
  - [src/runtime/runnersControl.ts](/home/ecochran76/workspace.local/oracle/src/runtime/runnersControl.ts)
- the derived queue-ready projection in
  [src/runtime/projection.ts](/home/ecochran76/workspace.local/oracle/src/runtime/projection.ts)
  can now also consume a bounded runner record directly for claim reasoning
- current bounded runner fields are:
  - `id`
  - `hostId`
  - `status`
  - `startedAt`
  - `lastHeartbeatAt`
  - `expiresAt`
  - `serviceIds`
  - `runtimeProfileIds`
  - `browserProfileIds`
  - `serviceAccountIds`
  - `browserCapable`
  - `eligibilityNote`
- this is still a local durable seam for ownership/liveness reasoning, not a
  full multi-runner registry or distributed scheduler
- current bounded persisted runner operations are:
  - register
  - read
  - list
  - heartbeat
  - mark stale

Current follow-on checkpoint:

- one bounded persisted claim-candidate evaluation seam now exists in:
  - [src/runtime/claims.ts](/home/ecochran76/workspace.local/oracle/src/runtime/claims.ts)
- it combines:
  - persisted run inspection
  - the derived queue-ready projection
  - explicit affinity requirements
  - persisted runner records
- current bounded candidate classes are:
  - `eligible`
  - `blocked-affinity`
  - `stale-runner`
  - `not-ready`
- it remains a local deterministic selection helper, not a scheduler or lease
  allocator

Current liveness checkpoint:

- one bounded stale-runner expiry/reconciliation sweep now exists on the same
  local runner-control seam in:
  - [src/runtime/runnersControl.ts](/home/ecochran76/workspace.local/oracle/src/runtime/runnersControl.ts)
- current bounded expiry behavior:
  - reads persisted runner records
  - marks expired `active` runners as `stale`
  - preserves fresh `active` runners
  - lets later claim-candidate evaluation reflect the new stale posture
- this is still runner-record liveness cleanup only; it does not yet reconcile
  stale runners against outstanding leases

Current reconciliation checkpoint:

- one bounded lease/runner reconciliation seam now exists in:
  - [src/runtime/reconciliation.ts](/home/ecochran76/workspace.local/oracle/src/runtime/reconciliation.ts)
- it compares:
  - active leases on persisted runs
  - persisted runner records
- current bounded statuses are:
  - `no-active-lease`
  - `active-runner`
  - `stale-runner`
  - `missing-runner`
- this remains diagnosis-first:
  - no lease mutation
  - no runner mutation
  - no scheduler behavior

Current repair-posture checkpoint:

- one bounded repair/reclaim posture seam now exists in:
  - [src/runtime/repair.ts](/home/ecochran76/workspace.local/oracle/src/runtime/repair.ts)
- it maps reconciliation outcomes into:
  - `inspect-only`
  - `locally-reclaimable`
  - `not-reclaimable`
- current bounded reclaim rule is:
  - stale or missing runner ownership is only locally reclaimable after the
    active lease itself is expired
- this remains policy-only:
  - no automatic lease mutation
  - no scheduler behavior

Current repair-action checkpoint:

- one bounded lease-repair action now exists in:
  - [src/runtime/repair.ts](/home/ecochran76/workspace.local/oracle/src/runtime/repair.ts)
- current bounded mutation rule:
  - mutate only `locally-reclaimable` cases
  - leave `inspect-only` and `not-reclaimable` cases untouched
- current first mutation path:
  - expire the active lease through the existing runtime control seam
  - preserve normal lease-expiry history and release reason semantics
- this is still conservative:
  - no reassignment
  - no scheduler behavior

### 5. Replay/postmortem must be first-class

Every next-step design should preserve:

- what was runnable
- what claimed it
- why it was skipped
- whether it was blocked by affinity
- whether it was deferred by budget

If the next durable-state design cannot explain those questions after a restart,
it is not ready for broader service mode.

## Proposed first deliverables

### Deliverable 1: Durable ownership vocabulary

Add one design-level vocabulary for:

- durable run bundle
- queue-ready projection
- runner identity
- execution affinity
- lease ownership

Acceptance:

- docs use one durable-state vocabulary
- no separate API-only or MCP-only ownership model is introduced

### Deliverable 2: Account/browser-affinity model

Define the minimum durable affinity record needed for safe execution:

- service/account id
- browser-bearing requirement
- runtime/browser profile family requirement
- host-local eligibility note

Acceptance:

- the model is explicit enough to explain why a runner may not claim a run
- it does not require a full account-mirroring implementation yet

### Deliverable 3: Multi-runner heartbeat/lease ownership rules

Define the first multi-runner-safe rules for:

- acquire
- heartbeat
- release
- expire
- affinity mismatch

Acceptance:

- still single-owner
- still sequential-first
- no distributed scheduler breadth implied yet

### Deliverable 4: Replay/postmortem guarantees

State the minimum durable evidence required after restart:

- last known queue posture
- lease owner
- affinity reason
- execution/skip/defer reason

Acceptance:

- enough information exists to debug queue behavior without relying on live
  process memory

## Explicit non-goals for this checkpoint

- full Redis/Postgres implementation
- worker-pool rollout
- new public routes
- new MCP surface
- public team execution
- auth
- streaming

## Recommended follow-on after this plan

Once this design checkpoint exists, the next implementation choice should be
one bounded substrate slice, for example:

- durable queue-ready projection
or
- explicit affinity record/schema
or
- runner identity / heartbeat record

But not all three at once.

## Acceptance bar

This plan is good enough when:

- the durable ownership boundary is explicit
- account/browser-affinity is explicit enough for safe claim decisions
- lease/heartbeat semantics are explicit enough for future multi-runner work
- replay/postmortem requirements are explicit
- the next implementation slice can be chosen without guessing at ownership

## Current checkpoint reassessment

This plan's bounded ownership checkpoint is now materially satisfied in local
code:

- queue-ready projection exists
- explicit affinity records exist
- explicit runner identity / heartbeat records exist
- persisted runner registry/control exists
- claim-candidate evaluation exists
- stale-runner expiry exists
- lease/runner reconciliation exists
- conservative repair posture and repair action exist
- `serviceHost` consumes the conservative repair seam
- operator inspection now exists on:
  - `GET /status?recovery=true`
  - `GET /status/recovery/{run_id}`

What is still missing is not more local durable vocabulary. It is live
service-host ownership of the runner record itself:

- registering the local host as a persisted runner
- heartbeating that runner while `api serve` is alive
- letting host execution consume its own durable runner identity instead of
  staying mostly process-local

## Current recommendation

Pause further durable-state surface expansion here.

The next active lane should move back to:

- service-host / runner orchestration

The next coding slice should be:

- one bounded live runner-registration / heartbeat seam for `api serve` and
  `serviceHost`

Do not continue adding more recovery-summary or detail-surface breadth until
that live runner-ownership seam is real.
