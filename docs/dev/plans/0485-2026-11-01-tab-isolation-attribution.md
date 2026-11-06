# Plan0485 — Tab isolation attribution

State: CLOSED
Outcome: ALLOCATION_CONTRACT_QUALIFIED_STATE_ORIGIN_UNRESOLVED
Owner: primary agent
Branch: fix/developer-app-composer-refresh
Authority: operator ok go to allocation/ownership diagnosis and regression

## Current State

Fresh read-only registry evidence contradicts the earlier contention claim:
each retained failed target has targetCreations1 and its own diagnostic process
binding. No cross-process acquisition demonstrated. LitScout was in those
separate targets' before-model captures; its restoration mechanism is unproven.
The prior assertion that a shared active LitScout tab caused failure is withdrawn.

## Scope and acceptance

Trace allocation/lease ownership without provider preparations, tab changes or
new prompt. Add a public provisioner contract regression using two file-backed
registry instances with separate live owners and the same provider root/profile.
Require distinct newly created targets and unchanged first owner's claim; no
inspection/navigation/closure of that owner's tab. This is a characterization
of the suspected collision, not a claimed red/green product fix.

## Definition of done

Qualify current isolation behavior or reproduce a collision before changing it.
Reconcile retained runtime target/process provenance and preserve all shared
state. If allocation is healthy, do not invent an allocator repair. Keep page
state restoration and bootstrap interception as separate unresolved evidence
gaps. No source fix or broad review unless a trustworthy failing seam supports it.

## Attribution and validation

Retained lease records bind targets A2F634C72AE6601EAEB5B87CA578481B to process557073,
2F353A21B01AD80FA1F1E91FA05BFC3C to576364 and
64A75C1E70BEB1F4DD1CAC5E8328E632 to1126103. Each records one target creation and one
same-process adoption. The last target matches the actual bootstrap observer's
CDP target. New-conversation provisioning calls the guarded openChromeTarget path,
which uses CDP.New; cross-process acquisition is not demonstrated. Current leases
are released/restart-unverified; no ownership or unknown-effect records changed.
These records do not prove that no untracked actor could ever alter a page.

The public provisioner characterization uses two separate file-backed registry
instances, distinct live owner identities and the same root/profile. It creates
separate targets and proves the first owner's record remains unchanged. Neither
owner's target is inspected or closed by the other allocation. All38tests across
provisioner, registry and coexistence suites pass in2.19s. This test passes before
any production change; it is not a red/green collision fix. No allocator change
is justified. Scoped format and git diff --check pass; no hosted CI.

A read-only storage metadata probe stopped because the exact retained64A75target
was no longer present. It did not select another page or read storage values.
LitScout selection is present in all retained model-stage and bootstrap-stage
before/after composers. How it appeared in fresh targets remains unproven; shared
persistence/restoration is a question, not a diagnosed mechanism. Inspector-blocked
models bootstrap remains separately observed, without quota-cause attribution.
Future work must trace fresh-target composer initialization and exact admission/
cancellation provenance before choosing a repair. No native preparation, prompt,
provider request, tab navigation/closure, deployment, scheduler or policy mutation
performed in this packet. Read-only registry snapshot retained privately as
collision-leases.private.json; no personal/runtime raw data copied into Git.

Full `pnpm run typecheck` passes. Source parent466082d77; this commit changes
only the allocation contract test and governing evidence notes.
