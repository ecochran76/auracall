# Plan0479 | First-class idle coordination reset

State: CLOSED
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

## Installed and applied closeout

Source f2970fea2b is published and installed into a scoped CLI carry generation.
Three new compiled modules match source byte-for-byte.660existing compiled files
are unchanged; the prior installed CLI entry receives only the reviewed command
import/registration. This preserves deployed browser behavior rather than
replacing it with other main-branch implementations. API/MCP services were not
restarted or redirected. Source checks above apply to the new modules; they do
not establish whole-main runtime parity.

Installed preview was eligible with0blockers, using qualified StableTime. One
installed `auracall coordination reset --yes --json` then completed successfully.
Exact before:100774989bytes across both snapshots. After:200579bytes total
(ledger200533, registry46),59retained recent interactions/176events/0warnings.
1253old lease records archived. Both backup SHA256checks match; manifest state
is applied and names both replaced files. Private installation, launcher rollback,
apply and readback receipts remain in user-scoped deployment state, outside Git.
API remains active at the same PID. No provider action or credential/browser data
change occurred. The complete source/root worktree is clean after publication;
implementation checkout retained for source integration review, not hidden implementation.

Current planning audit reports46existing findings, none for this plan. Hosted CI
was skipped under cost policy. A broad WSL clock migration, prior P478 clock fix
integration and web-client connector installation remain separate work.

The original installed-code three-reader replay against copied active state now
passes:3/3reads,70ms total,59records,200533ledger bytes. This is a bounded observed
sample after reset, not a long-term latency guarantee or broad clock migration.
