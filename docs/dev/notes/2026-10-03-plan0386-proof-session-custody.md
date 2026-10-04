# Plan 0386: identity-proof session custody

## Reproduction

The installed incremental harness called getProviderSessionProof with
useProviderSession=true, then called artifact materialization with the original
options. getProviderSessionProof builds a private options copy. The adapter
retained a CDP session and its target lease on that copy; the method returned
only the proof, losing caller access to the session. The next connection tried
to reserve the same target.

Provider-free command:
`pnpm vitest run tests/browser/chatgptProofSession.test.ts`

The first full adapter replay failed at the next read with
`Provider traffic lease reservation failed: target-owned.` With identity proof,
matching target URLs, real configured traffic authority, an empty temporary
coordination store, and mocked CDP transport, the minimized reservation replay
failed in 42 ms. Closing the proof's private session made it pass. This tests
real service option construction, adapter retention and durable lease ownership;
it does not substitute a throwing provider stub for the session bug.

## Historical reconciliation

The historical lease 48749a67-e531-46bf-b3cb-ad00b59f1e81 was acquired at
2026-10-03T22:26:59.080Z, the identity proof's start. Its final disposition is
already-missing, lossReason restart-unverified, heartbeat
2026-10-03T22:29:42.077Z, after browser cleanup. The fresh-read receipt failed
in 124 ms with lastStage cdp:Runtime.enable and errorCode Error.
A target lease collision occurs after domain enablement, fitting that receipt.
The original exception was not retained, so exact historical causality is an
inference, not a recovered error. Missing authority at option construction was
ruled out by a read-only installed buildListOptions replay. A browser malfunction,
wrong URL, or host degradation is not established by the historical receipt.

## Repair boundary

getProviderSessionProof closes only a session newly retained on its private
options, on either successful or conflicting identity proof. A caller-supplied
session remains owned by the caller. The regression tests both identity verdicts,
subsequent target reservation, persisted lease release, and borrowed-session
preservation. PR 173 separately prevents failed fresh context reads from silently
falling back to cached download controls.

This is continuation of repair cycle 4/5; six historical provider probes remain
six. No new provider control or installation has run at this source checkpoint.
Scheduler remains paused, Gate D remains open, issue 165 stays open.

## Local validation

183 focused tests pass across proof custody, tab lifecycle, configured traffic
authority, context/files, recorded materialization replay and history jobs.
Typecheck, build, scoped Biome, plan audit and diff check pass.
The minimized pre-fix loop failed in 42 ms; the repaired loop also verifies
identity-conflict cleanup and preserves a caller-owned session.
