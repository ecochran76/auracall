# Plan0455 — Desktop transition crash recovery

State: CLOSED
Branch: fix/desktop-transition-recovery
Target: main
Owner: ecochran76
Work item: ecochran76/auracall#437 (operator-approved retrospective follow-up)
Base: dabde7cafe3ae9b0c64757b9a0f27c3e96a56a10

## Current State

Source8e7b1c28692a51d1970347d5aac3db54b65311b3 is integrated through PR438,
merge4270f8fd3c0a4993cecff2e2f2e2abd23a61ed27. All22 focused tests/4files,
full typecheck/build, scoped lint, docs listing and whitespace checks pass.
Source-only acceptance is complete. The source slice excluded runtime adoption
and CI. Subsequent operator-authorized deployment is qualified below; no live
lock removal or provider acceptance is claimed.

## Scope and acceptance

Publish complete transition identity atomically. Reclaim only a proven-dead
Linux process from the same boot; elect one recovery claimant per generation
and compare inode identity before unlinking. Retain a recovery link as evidence
and as a generation fence. A crash during recovery itself must fail closed;
do not let competing reclaimers unlink a successor. Preserve legacy empty,
malformed, foreign-boot and live-owner records. Retain all human desktop claims
and binding/token checks. No timeout-based clearance.

Use the public gate plus real child-process death as the regression seam.
Prove normal release, live contention, human preservation and competing recovery.
Run focused gate/native-CDP tests, typecheck, scoped lint, build and docs checks.
Review Standards and Spec separately. No installation or API restart is implied;
shared browser effects require a separate runtime-adoption packet.

## Execution

Single serialized track: reproduce/minimise → qualify recovery → implement
vertically → review → commit/push/integrate. Expected surfaces: gate, focused
tests and operational docs. No delegation or parallel code lane is needed.

Red command: `pnpm vitest run tests/browser/desktopTransitionRecovery.test.ts --maxWorkers=1`.
Original and minimal crash cases both fail with `Desktop control coordination
is busy.` in about2.5s. Artifact-removal and normal-release controls pass.

Ranked predictions before probing: (1) an orphaned transition blocks before
owner recovery, so removing only it restores acquisition; (2) retained desktop
owner data causes the block, disproved by the smaller no-owner case; (3) normal
release strands transitions, disproved by successful successive acquisitions.
The first prediction is confirmed. No debug logging or live instrumentation
was introduced.

The regression parks a real child at the ownership read inside an acquired
transition, kills it and waits for confirmed SIGKILL/reaping. Acquisition and
automation-release crashes recover. Human-release crashes preserve human
custody/token binding, and a contender paused before its retirement claim cannot
unlink the winning successor. Live/foreign-boot/malformed/already-claimed
identities stay blocked. A fixture IPC keepalive prevents the parked child
exiting naturally; the explicit kill signal is asserted.

Primary Standards review: no blocking findings. Primary Spec review against
this plan and the retrospective: invalid generation syntax was accepted as an
identity. Accepted as blocking; `-t 'invalid-generation'` reproduces the unsafe
acceptance before the parser fix, then the full22-test selection passes with
strict UUID validation. This is the one bounded remediation pass. Legacy empty
locks and crashes during recovery itself remain explicitly unqualified.

Historical source-only closeout: memory disposition was forbidden before
subsequent capture authorization. Retain that receipt as history.

## Operator-authorized deployment — 2026-10-25 UTC

Selected exact canonical main e1bb4dbc94c5d50dc4f210dbd783cbfb2bbd3b5a
through merged PR445. Intervening runtime source equals tested8e7b1c286;
only documentation changed. Installed into a fresh prefix and qualified the
compiled desktop route, byte-matched CLI/gate/clipboard modules and a real
child killed inside an automation-release transition. The installed gate
recovers and releases correctly without provider calls.

Adopted CLI/MCP wrappers and restarted the API with existing process-only kill
mode. Preserved all48 pre-existing browser-related process-tree roots at their
original generations, auth posture, scheduler pause and original background
drain setting. API status returns HTTP200/ok=true in5.649s and desktops returns
HTTP200. Initial3s/8s status budgets timed out; the subsequent bounded35s probe
passed. Preserve those failures; this is not status-latency qualification or
proof of a particular timeout cause. No legacy lock was deleted, browser
closed, provider action requested, CI changed or warning cleared.

Private receipts and rollback wrappers live under
`~/.local/state/auracall-plan0455-deploy-20261025/`: deployment.json,
installed-qualification.json, install.log and source-anchored memory receipts.
Current closeout memory disposition: queued to the reviewed project cloud;
queue acceptance is distinct from completed processing or retrieval.
