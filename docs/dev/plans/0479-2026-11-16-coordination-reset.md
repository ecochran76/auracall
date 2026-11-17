# Plan0479 | First-class idle coordination reset

State: OPEN
Lane: P479
Owner: primary agent
Branch: feat/coordination-reset-20261116
Base: 6bcbb9b606e5b95a592aa6a89d5c5ca61ec637ee
Target: main

## Current State

Operator requested a simple supported reset for idle coordination. Existing
large ledger and old lease history remain intact. Implementing preview/apply,
StableTime qualification, recoverable private archives and live-owner checks.

## Scope and acceptance

`auracall coordination reset` previews; `--yes` applies after repeating checks
under the existing ledger and registry locks. Reject held locks and live fenced
lease owners; retain active profile controls unless StableTime proves expiry.
Archive both exact snapshots before replacement; persist a manifest and explicit
partial outcome if only one replacement succeeds. Preserve credentials, browser
profiles, sessions and retirement audit. No process killing or force override.

Use qualified finite StableTime UTC/earliest time for reset provenance and
retention decisions; no WSL wall-clock fallback. Retain the last24husage records
and active warnings so reset does not bypass account rate limits. Abandon orphan
pending reservations explicitly without manufacturing successful completion;
retain unknown-effect/backend identity fences and full old evidence in archives.

## Validation and terminal condition

Public service tests with real temporary files cover preview, exact backups,
private permissions, old state reduction, recent usage/warning retention,
owner/lock/symlink rejection, StableTime failure and partial replacement evidence.
CLI help/fixture invocation, focused existing storage tests, typecheck/build and
scoped lint pass locally before source delivery. No hosted CI. A real apply is
separate from source validation and must repeat current owner checks.

## Source validation

Primary local checks:65tests pass across coordinationReset, stableTime,
interactionLedger and tabLeaseRegistry (8.70s). Tests use real temporary files;
only external time and deliberate filesystem failure seams are injected. Initial
six feature tests were red before implementation. Full typecheck/build, scoped
Biome checks and CLI help pass. Shared WSL timer instability caused default5s
failures in subsecond bodies, including an unchanged ledger test; final real-file
suite used --testTimeout=30000. Production budgets are unchanged.

Real source CLI preview used authenticated qualified finite StableTime and was
eligible with0blockers:100774989bytes,25780interactions,91633events,1253leases;
retain59recent interactions,176recent events,0warnings. It performed no reset.
A first wrapper-script invocation was a pre-dispatch launcher mismatch; corrected
to the actual source CLI, then compiled CLI help verified registration.

Pending: source publication, scoped installed CLI activation preserving the current
browser runtime, installed preview and one authorized idle apply. Keep API/MCP,
browser profiles and credentials intact. This packet does not claim the previous
clock repair, broad WSL clock migration or web-client installation complete.
