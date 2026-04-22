# Scheduler Authority Preflight | 0028-2026-04-21

State: CLOSED
Lane: P01

## Current State

- Public team-run writes are live for HTTP and MCP.
- Prebuilt flattened `taskRunSpec` input is live for HTTP and MCP.
- `ExecutionServiceHost` owns route-neutral local runner lifecycle, queued
  drain execution, recovery, and operator-control mutations.
- `/status.runnerTopology` now exposes read-only runner topology/readiness.
- Existing claim-candidate ordering is deterministic, but it is still
  inspection/evaluation support, not fleet scheduler authority.
- `api serve` remains scoped to its configured server-local `runnerId`.

## Purpose

Define the authority boundary that must exist before Aura-Call adds any
background worker loop, multi-runner scheduler, or reassignment behavior.

The core rule is:

- topology visibility is not assignment authority
- candidate ordering is not assignment authority
- a local execution host is not fleet scheduler authority

## Scheduler Authority Rules

### 1. Authority Must Be Explicit

A component may assign or reassign work only when it is explicitly operating
under a scheduler authority identity.

Required future fields or equivalents:

- `schedulerId`
- `schedulerScope`
- `schedulerMode`
- `runnerId` when executing as a local runner

The current `api serve` process has a server-local runner identity. It does not
have fleet scheduler authority.

### 2. Read-Only Evaluation Comes First

Before any scheduler mutation exists, Aura-Call should expose a route-neutral
read-only scheduler-authority evaluator.

That evaluator should return a bounded decision such as:

- `no-op`
- `claimable-by-local-runner`
- `claimable-by-other-runner`
- `reassignable-after-expired-lease`
- `blocked-active-lease`
- `blocked-affinity`
- `blocked-missing-capability`
- `blocked-human-state`
- `not-ready`

It must include the reason, selected candidate if any, and the exact mutation
that would be legal later, but it must not perform that mutation.

### 3. Fresh Active Leases Are Hard Authority

An active lease owned by an active, fresh runner blocks reassignment.

The evaluator may report the lease owner, freshness, and reason, but it must
not recommend reassignment unless the lease is expired and the owner is stale
or missing.

### 4. Expired Or Missing Owners Are Not Automatic Reassignment

An expired lease owned by a stale or missing runner may become reassignable,
but only through an explicit scheduler-authority decision.

Until that authority exists:

- service-host recovery may keep using its bounded local repair paths
- operator repair controls remain explicit
- topology and inspection surfaces remain read-only

### 5. Local Runner Claiming Stays Scoped

The server-local `api serve` runner may claim work only for itself through the
existing local claim path.

It must not promote another eligible runner just because that runner is
fresher, has broader capability, or sorts earlier in candidate ordering.

### 6. Browser Capacity Requires Dispatcher Compatibility

Any future scheduler decision that assigns browser-backed work must respect the
browser-service operation dispatcher boundary:

- one mutable CDP owner per managed browser profile/service key
- login/setup/manual-verification remain exclusive human operations
- browser execution remains exclusive mutating work

The scheduler may use browser profile and service-account capability metadata
as eligibility input, but it must not bypass the dispatcher.

### 7. Parallelism Needs Separate Orchestration Semantics

Multiple eligible runners do not imply parallel execution.

Parallel execution requires:

- explicit team/task orchestration semantics
- dispatch-plan support for more than one runnable step
- per-step lease ownership that cannot conflict with the current fail-fast and
  handoff rules

That remains out of scope for the scheduler-authority preflight.

## Next Bounded Slice

Implement a read-only scheduler-authority evaluator.

Minimum acceptance criteria:

- route-neutral evaluator lives below HTTP and CLI surfaces
- evaluator consumes:
  - runtime run queue projection
  - active lease state
  - runner topology/readiness
  - configured affinity
  - local runner identity when present
- evaluator returns one deterministic decision and reason
- evaluator never persists runs, runners, leases, or steps
- `/status` or runtime inspection can expose the evaluator result only as
  read-only diagnostics
- tests prove fresh active leases block reassignment, expired stale/missing
  owners are only classified as potentially reassignable, and alternate
  eligible runners do not become selected execution owners without scheduler
  authority

## Non-Goals

- no scheduler mutation
- no background worker loop
- no runner pool daemon
- no automatic reassignment
- no parallel dispatch
- no new public team-run write shape
- no browser dispatcher bypass

## Definition Of Done

- roadmap and runbook record the authority decision
- `0001` and `0004` point to the read-only evaluator as the next bounded
  implementation checkpoint
- deterministic plan audit passes
- no runtime or operator behavior changes are introduced in this preflight
  slice
