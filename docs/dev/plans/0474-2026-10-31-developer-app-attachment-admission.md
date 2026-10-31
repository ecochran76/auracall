# P474 | Developer-app attachment admission deadline

State: CLOSED
Lane: P474
Branch: fix/developer-app-attachment-admission
Target: main

## Current State

Installed provider-free gate repro refuses after100busy attempts without caller
cancellation; the same hold/release admits with a caller deadline. Live capture
records no cancellation supplied at attachment. Historical owner identity/health
remain unqualified. This is distinct from P473 native-operation diagnostics.

## Scope

Primary owns provider adapter, regression and docs. Public adapter/guarded CDP
with real sandbox gate and mocked external wire is the acceptance seam. Build
one red regression before propagating the existing stage deadline. Work is small
and serialized; no independent delegation. Do not broaden the gate wait policy.

## Non-goals

No live browser action, prompt, restart, installation, lock deletion, ownership
override or claim that the historical competing owner was faulty.

## Acceptance / Definition of Done

Attachment survives legitimate contention shorter than its10sdeadline. Caller
cancellation and stage timeout stop admission before wire dispatch, preserving
owner custody. Existing Runtime/Page timeout and adapter behavior checks pass;
local typecheck/build/scoped lint pass. Retain red/green receipts and limitations.

## Source closeout

84focused tests, typecheck, full build and scoped lint pass locally. Existing
plan-audit debt remains68findings in other files; this plan has none. No hosted
CI. Public adapter regression failed before repair, passes after repair, and
covers deadline/caller cancellation preventing late dispatch. Existing gate
policy unchanged; installed runtime intentionally remains previous build.
Historical owner health remains unqualified. No temporary production logs added.
