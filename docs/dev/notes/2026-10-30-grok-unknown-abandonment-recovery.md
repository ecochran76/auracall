# Approved Grok unknown-effect abandonment recovery

User explicitly approved adding and using a separate abandonment action after
being told the original connector outcome would remain unknown. Source:
805f94d44. The public file-backed registry action requires exact scope, target,
revision, explicit acknowledgement and immutable approval evidence. Only expired,
ownerless idle/lost non-live-follow custody without process binding qualifies.
It atomically releases custody and records abandonment without confirming the
provider effect. Normal release/reconciliation retain their existing semantics.

TDD: the new public-registry test first failed with missing method. Green focused
command: `pnpm vitest run tests/browser-service/tabLeaseRegistry.test.ts
tests/browser-service/tabLeaseEffectReconciliation.test.ts --maxWorkers=1`:
27/27 pass, including one concurrent CAS winner, scope/target/revision/expiry/owner
refusals, restart durability, cloned audit and subsequent admission. Local
`pnpm typecheck` passes after correcting the audit field placement; scoped Biome
lint and diff check pass. No hosted CI was requested; local Linux/Node validation
does not reproduce hosted runners. No broad review or findings phase reset.

Exact approved reservation transitioned revision3to4, state released,
effectState outcome-unknown, finalDisposition preserved. Its approval audit and
original history remain. No browser/account/grant change or target close occurs.
Private immutable approval/result: `~/.auracall/private/grok/recovery-20261030/`.
Recovery receipt SHA256:
`96c265c6074a4c0490cb2daf9893c8de60a5cbdce9d604f06cc213ae1826f59d`.

Post-recovery governed Bot-read attempt stopped before connection: the retained
Chrome PID887430 no longer exists. No replacement browser, navigation or retry
was started. Thus custody release is verified; fresh Bot/native admission is not.
The next runtime step is to qualify current managed browser generation through
normal service discovery, preserving any peers and stored account state.

Memory disposition:forbidden; no explicit user memory-write request.
